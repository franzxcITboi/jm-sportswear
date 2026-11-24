// ============================================================================
// JM MAKER SPORTSWEAR — SALES REPORTS, BACKUP & LOCAL RESET MODULE
// Renders Monthly, Annual, Past Sales Logbook, and Custom Date-Range reports,
// product charts, JSON snapshot backup, recent activity log, and local reset.
// ============================================================================

import {
  appendAuditLog,
  pushNotification,
  resetSystemState,
} from "../../store/systemStore";
import type { SalesLogbookEntry } from "../../types/system.types";
import { computeSalesRevenueBreakdown } from "../../utils/calculations";
import { restoreInputFocus } from "../../utils/dom";
import {
  formatPeso,
  formatTimeNow,
  getTodayIsoDate,
} from "../../utils/formatters";
import type { ModuleContext } from "../moduleTypes";
import {
  aggregateProductSales,
  buildMonthlySeries,
  buildPrintableSalesReportHtml,
  buildYearMonths,
} from "./salesReportMetrics";

type ReportViewMode = "MONTHLY" | "ANNUAL" | "LOGBOOK" | "CUSTOM";

export function initAnalyticsUtilitiesModule(ctx: ModuleContext): {
  render: () => void;
} {
  const container = document.getElementById("analyticsPageContent");
  const currentYear = new Date().getFullYear();
  const todayIso = getTodayIsoDate();
  const monthsCurrentYear = buildYearMonths(currentYear);

  let viewMode: ReportViewMode = "MONTHLY";
  let selectedMonthKey = todayIso.slice(0, 7);
  let customFrom = `${todayIso.slice(0, 7)}-01`;
  let customTo = todayIso;
  let logbookSearch = "";
  let confirmClearLocalData = false;

  function render(): void {
    if (!container) return;

    const allEntries = ctx.state.salesLogbook || [];
    const monthlySeries = buildMonthlySeries(allEntries, currentYear);

    let activeEntries: SalesLogbookEntry[] = allEntries;
    let activePeriodLabel = `All Recorded Sales (${currentYear})`;

    if (viewMode === "MONTHLY") {
      const monthObj =
        monthsCurrentYear.find((m) => m.key === selectedMonthKey) ||
        monthsCurrentYear[new Date().getMonth()];
      activeEntries = allEntries.filter(
        (e) => (e.isoDate || "").slice(0, 7) === selectedMonthKey
      );
      activePeriodLabel = monthObj.full;
    } else if (viewMode === "ANNUAL") {
      activeEntries = allEntries.filter((e) =>
        (e.isoDate || "").startsWith(String(currentYear))
      );
      activePeriodLabel = `Full Year ${currentYear} (Actual Recorded Sales)`;
    } else if (viewMode === "CUSTOM") {
      activeEntries = allEntries.filter((e) => {
        const d = e.isoDate || "";
        if (customFrom && d < customFrom) return false;
        if (customTo && d > customTo) return false;
        return true;
      });
      activePeriodLabel = `Custom Range (${customFrom} to ${customTo})`;
    } else if (viewMode === "LOGBOOK") {
      const q = logbookSearch.trim().toLowerCase();
      activeEntries = allEntries.filter((e) => {
        if (!q) return true;
        return (
          e.logNo.toLowerCase().includes(q) ||
          e.orNumber.toLowerCase().includes(q) ||
          e.clientName.toLowerCase().includes(q) ||
          e.particulars.toLowerCase().includes(q) ||
          e.paymentType.toLowerCase().includes(q) ||
          (e.isoDate || "").toLowerCase().includes(q)
        );
      });
      activePeriodLabel = "Past Sales Logbook Ledger";
    }

    const revBreakdown = computeSalesRevenueBreakdown(activeEntries);
    const productBreakdown = aggregateProductSales(activeEntries);
    const topProduct = productBreakdown[0] || {
      productName: "No sales in selected period",
      categoryLabel: "—",
      qtySold: 0,
      revenue: 0,
      transactions: 0,
    };

    const highestMonth = monthlySeries.reduce(
      (best, m) => (m.revenue > best.revenue ? m : best),
      monthlySeries[new Date().getMonth()] || monthlySeries[0]
    );

    const subnavHtml = `
      <div class="subnav-bar">
        <div class="subnav-tabs">
          <button type="button" class="subnav-btn ${
            viewMode === "MONTHLY" ? "active" : ""
          }" data-report-mode="MONTHLY">Monthly Sales Overview</button>
          <button type="button" class="subnav-btn ${
            viewMode === "ANNUAL" ? "active" : ""
          }" data-report-mode="ANNUAL">Annual Sales Overview (${currentYear})</button>
          <button type="button" class="subnav-btn ${
            viewMode === "LOGBOOK" ? "active" : ""
          }" data-report-mode="LOGBOOK">Past Sales Logbook (${allEntries.length})</button>
          <button type="button" class="subnav-btn ${
            viewMode === "CUSTOM" ? "active" : ""
          }" data-report-mode="CUSTOM">Custom Date-Range Report</button>
        </div>

        <div class="toolbar-group">
          ${
            viewMode === "MONTHLY"
              ? `<label for="repMonthSelect" style="font-size:0.76rem;font-weight:700;color:var(--text-secondary);">Month:</label>
                 <select id="repMonthSelect" class="toolbar-input" style="width:auto;">
                   ${monthsCurrentYear
                     .map(
                       (m) =>
                         `<option value="${m.key}" ${
                           m.key === selectedMonthKey ? "selected" : ""
                         }>${m.full}</option>`
                     )
                     .join("")}
                 </select>`
              : viewMode === "CUSTOM"
              ? `<label for="repDateFrom" style="font-size:0.76rem;font-weight:700;">From:</label>
                 <input type="date" id="repDateFrom" class="toolbar-input" value="${customFrom}" />
                 <label for="repDateTo" style="font-size:0.76rem;font-weight:700;">To:</label>
                 <input type="date" id="repDateTo" class="toolbar-input" value="${customTo}" />`
              : ""
          }
          <button type="button" id="anExportPdfBtn" class="btn btn-red btn-sm">
            Print / Export Sales Report
          </button>
        </div>
      </div>
    `;

    if (viewMode === "LOGBOOK") {
      const logbookRowsHtml =
        activeEntries.length > 0
          ? activeEntries
              .map((entry) => {
                const unitPrice =
                  entry.unitPrice ||
                  Math.round(
                    (Number(entry.amountPaid) || 0) /
                      Math.max(1, Number(entry.qty) || 1)
                  );
                const isStockSale =
                  entry.paymentType === "Walk-In Stock Sale" ||
                  entry.orderId === "STOCK";

                return `<tr>
                  <td><strong>${entry.logNo}</strong><br/><small style="color:var(--text-muted);">${entry.orNumber}</small></td>
                  <td><strong>${entry.isoDate || todayIso}</strong><br/><small style="color:var(--text-muted);">${entry.dateTime}</small></td>
                  <td>
                    <strong>${entry.clientName}</strong><br/>
                    <span class="module-tag ${
                      isStockSale ? "tag-green" : "tag-blue"
                    }" style="font-size:0.66rem;padding:1px 6px;">
                      ${
                        isStockSale
                          ? "Finished Goods Stock"
                          : `Order #${entry.orderId}`
                      }
                    </span>
                  </td>
                  <td><strong>${entry.particulars}</strong><br/><small style="color:var(--text-muted);">${
                  entry.remarks || ""
                }</small></td>
                  <td><strong>${entry.qty} pcs</strong></td>
                  <td>${formatPeso(unitPrice)}</td>
                  <td>
                    <span class="status-pill status-available">${
                      entry.paymentMethod || "Cash"
                    }</span><br/>
                    <small style="color:var(--text-muted);">${
                      entry.paymentType
                    }</small>
                  </td>
                  <td><strong style="color:var(--green-text);font-size:0.94rem;">+${formatPeso(
                    entry.amountPaid,
                    true
                  )}</strong></td>
                </tr>`;
              })
              .join("")
          : `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">No past sales logbook records match your search.</td></tr>`;

      container.innerHTML = `
        ${subnavHtml}

        <div class="kpi-strip">
          <div class="kpi-box">
            <span class="kpi-label">Total Logbook Revenue</span>
            <strong class="kpi-val kpi-green">${formatPeso(
              revBreakdown.totalRevenue,
              true
            )}</strong>
            <span class="kpi-meta">Exact sum of ${activeEntries.length} logbook entries</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Custom Orders Revenue</span>
            <strong class="kpi-val">${formatPeso(
              revBreakdown.customOrdersRevenue,
              true
            )}</strong>
            <span class="kpi-meta">${revBreakdown.customOrdersTxns} custom order payment(s)</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Finished Goods Stock Revenue</span>
            <strong class="kpi-val">${formatPeso(
              revBreakdown.stockSalesRevenue,
              true
            )}</strong>
            <span class="kpi-meta">${revBreakdown.stockSalesTxns} walk-in stock sale(s)</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Total Units Sold</span>
            <strong class="kpi-val">${revBreakdown.totalUnitsSold} pcs</strong>
            <span class="kpi-meta">Across all recorded transactions</span>
          </div>
        </div>

        <section class="module-card">
          <div class="module-top">
            <div>
              <h2>Past Sales Logbook — Complete Transaction Ledger</h2>
              <p class="module-subtitle">
                Every sale recorded in Custom Orders &amp; POS or Finished Goods Inventory appears here and directly totals into your Sales Revenue.
              </p>
            </div>
            <div class="toolbar-group">
              <input
                type="search"
                id="repLogbookSearchInput"
                class="toolbar-input"
                placeholder="Search OR #, customer, product, date..."
                value="${logbookSearch}"
              />
              <button type="button" class="btn btn-light btn-sm" id="repOpenFullLogbookBtn">
                Record New Walk-In Sale &rarr;
              </button>
            </div>
          </div>

          <div class="table-scroll">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>Log / OR No.</th>
                  <th>Transaction Date</th>
                  <th>Customer / Source</th>
                  <th>Item / Particulars</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Payment Method</th>
                  <th>Amount Paid (Revenue)</th>
                </tr>
              </thead>
              <tbody>${logbookRowsHtml}</tbody>
            </table>
          </div>
        </section>
      `;
      return;
    }

    const totalProductRev = Math.max(
      1,
      productBreakdown.reduce((s, p) => s + p.revenue, 0)
    );
    const maxProductRev = Math.max(
      1,
      ...productBreakdown.map((p) => p.revenue)
    );

    const productRowsHtml =
      productBreakdown.length > 0
        ? productBreakdown
            .map((p) => {
              const sharePct = Math.round((p.revenue / totalProductRev) * 100);
              return `<tr>
                <td><strong>${p.productName}</strong></td>
                <td><span class="module-tag ${
                  p.categoryLabel.includes("Stock") ? "tag-green" : "tag-blue"
                }">${p.categoryLabel}</span></td>
                <td>${p.transactions} txn(s)</td>
                <td><strong>${p.qtySold} pcs</strong></td>
                <td><strong style="color:var(--green-text);">${formatPeso(
                  p.revenue,
                  true
                )}</strong></td>
                <td><span class="status-pill status-available">${sharePct}% of revenue</span></td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:16px;">No recorded sales in ${activePeriodLabel}.</td></tr>`;

    const itemizedTransactionRowsHtml =
      activeEntries.length > 0
        ? activeEntries
            .map((e) => {
              const isStock =
                e.paymentType === "Walk-In Stock Sale" || e.orderId === "STOCK";
              return `<tr>
                <td><strong>${e.logNo}</strong> <small style="color:var(--text-muted);">(${
                e.orNumber
              })</small></td>
                <td>${e.isoDate || todayIso}</td>
                <td><strong>${e.clientName}</strong></td>
                <td>${e.particulars}</td>
                <td>
                  <span class="module-tag ${
                    isStock ? "tag-green" : "tag-blue"
                  }">
                    ${isStock ? "Finished Goods Stock" : e.paymentType}
                  </span>
                </td>
                <td>${e.paymentMethod || "Cash"}</td>
                <td><strong>${e.qty} pcs</strong></td>
                <td><strong style="color:var(--green-text);">+${formatPeso(
                  e.amountPaid,
                  true
                )}</strong></td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:16px;">No transactions recorded for ${activePeriodLabel}.</td></tr>`;

    const productComparisonBarsHtml =
      productBreakdown.length > 0
        ? productBreakdown
            .slice(0, 6)
            .map((p) => {
              const widthPct = Math.max(
                8,
                Math.round((p.revenue / maxProductRev) * 100)
              );
              return `<div class="horiz-chart-item">
                <div class="horiz-chart-head">
                  <strong>${p.productName}</strong>
                  <span><strong>${formatPeso(
                    p.revenue,
                    true
                  )}</strong> (${p.qtySold} pcs)</span>
                </div>
                <div class="horiz-chart-track">
                  <div class="horiz-chart-fill" style="width:${widthPct}%;"></div>
                </div>
              </div>`;
            })
            .join("")
        : `<p style="color:var(--text-muted);font-size:0.82rem;padding:12px 0;">No product sales recorded in ${activePeriodLabel} yet.</p>`;

    const barChartData =
      viewMode === "ANNUAL"
        ? monthlySeries.map((m) => ({
            label: m.monthShort,
            value: m.revenue,
            sub: `${m.transactions} txns (${m.unitsSold} pcs)`,
            isPeak: m.revenue > 0 && m.monthKey === highestMonth.monthKey,
          }))
        : activeEntries
            .slice()
            .reverse()
            .map((e) => ({
              label: e.logNo.replace(`TXN-${currentYear}-`, "#"),
              value: Number(e.amountPaid) || 0,
              sub: `${e.clientName} (${e.qty} pcs)`,
              isPeak: false,
            }));

    const maxBarVal = Math.max(1, ...barChartData.map((d) => d.value));
    const verticalBarsHtml =
      barChartData.length > 0
        ? barChartData
            .map((d) => {
              const heightPct =
                d.value > 0
                  ? Math.max(12, Math.round((d.value / maxBarVal) * 100))
                  : 4;
              return `<div class="chart-bar-col" title="${d.label}: ${formatPeso(
                d.value,
                true
              )} — ${d.sub}">
                <span class="chart-bar-val">${
                  d.value > 0 ? formatPeso(d.value) : "\u20B10"
                }</span>
                <div class="chart-bar-fill ${
                  d.isPeak ? "bar-peak" : ""
                }" style="height:${heightPct}%;opacity:${
                d.value > 0 ? "1" : "0.25"
              };"></div>
                <span class="chart-bar-label">${d.label}</span>
              </div>`;
            })
            .join("")
        : `<p style="color:var(--text-muted);font-size:0.82rem;margin:auto;">No recorded transactions in this period.</p>`;

    const monthsWithSales = monthlySeries.filter((m) => m.transactions > 0);
    const annualMonthlyRowsHtml =
      monthsWithSales.length > 0
        ? monthsWithSales
            .map(
              (m) => `<tr>
                <td><strong>${m.monthFull}</strong> ${
                m.revenue > 0 && m.monthKey === highestMonth.monthKey
                  ? `<span class="status-pill status-available">Top Month</span>`
                  : ""
              }</td>
                <td>${m.transactions} recorded transaction(s)</td>
                <td><strong>${m.unitsSold} pcs</strong></td>
                <td><strong style="color:var(--green-text);">${formatPeso(
                  m.revenue,
                  true
                )}</strong></td>
              </tr>`
            )
            .join("")
        : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:16px;">No recorded sales in ${currentYear} yet.</td></tr>`;

    const auditRows =
      ctx.state.auditLogs.length > 0
        ? ctx.state.auditLogs
            .slice(0, 8)
            .map(
              (log) => `<tr>
              <td style="white-space:nowrap;"><strong>${log.timestamp}</strong></td>
              <td><span class="module-tag tag-red">${log.module}</span></td>
              <td>${log.action}</td>
            </tr>`
            )
            .join("")
        : `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:16px;">No system activity recorded yet.</td></tr>`;

    container.innerHTML = `
      ${subnavHtml}

      <div class="kpi-strip">
        <div class="kpi-box">
          <span class="kpi-label">${
            viewMode === "ANNUAL"
              ? `Total Annual Revenue (${currentYear})`
              : viewMode === "MONTHLY"
              ? `Monthly Revenue (${activePeriodLabel})`
              : "Selected Range Revenue"
          }</span>
          <strong class="kpi-val kpi-green">${formatPeso(
            revBreakdown.totalRevenue,
            true
          )}</strong>
          <span class="kpi-meta">From ${
            revBreakdown.totalTransactions
          } actual logbook transaction(s)</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Custom Team Orders Revenue</span>
          <strong class="kpi-val">${formatPeso(
            revBreakdown.customOrdersRevenue,
            true
          )}</strong>
          <span class="kpi-meta">${
            revBreakdown.customOrdersTxns
          } order payment(s) &bull; ${revBreakdown.customOrdersUnits} pcs</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Finished Goods Stock Revenue</span>
          <strong class="kpi-val">${formatPeso(
            revBreakdown.stockSalesRevenue,
            true
          )}</strong>
          <span class="kpi-meta">${
            revBreakdown.stockSalesTxns
          } stock sale(s) &bull; ${revBreakdown.stockSalesUnits} pcs</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Total Products Sold</span>
          <strong class="kpi-val">${revBreakdown.totalUnitsSold} pcs</strong>
          <span class="kpi-meta">Top: ${topProduct.productName}</span>
        </div>
      </div>

      <section class="module-card">
        <div class="module-top">
          <div>
            <h2>Sales Revenue Breakdown (${activePeriodLabel})</h2>
            <p class="module-subtitle">
              Exact calculation showing how your ${formatPeso(
                revBreakdown.totalRevenue,
                true
              )} revenue is computed from recorded transactions
            </p>
          </div>
          <button type="button" class="btn btn-light btn-sm" data-report-mode="LOGBOOK">
            View Past Sales Logbook &rarr;
          </button>
        </div>

        <div class="form-grid-3">
          <div class="revenue-block">
            <span class="billing-caption">1. Custom Team Orders (POS)</span>
            <strong class="revenue-figure" style="font-size:1.1rem;">${formatPeso(
              revBreakdown.customOrdersRevenue,
              true
            )}</strong>
            <small style="display:block;color:var(--text-muted);margin-top:3px;">
              ${
                revBreakdown.customOrdersTxns
              } payment(s) recorded (Downpayments, Balances &amp; Full Payments)
            </small>
          </div>
          <div class="revenue-block">
            <span class="billing-caption">2. Finished Goods Stock Sales</span>
            <strong class="revenue-figure" style="font-size:1.1rem;">${formatPeso(
              revBreakdown.stockSalesRevenue,
              true
            )}</strong>
            <small style="display:block;color:var(--text-muted);margin-top:3px;">
              ${
                revBreakdown.stockSalesTxns
              } walk-in ready-made stock sale(s) (${revBreakdown.stockSalesUnits} pcs)
            </small>
          </div>
          <div class="revenue-block">
            <span class="billing-caption">3. Breakdown by Payment Method</span>
            <div style="font-size:0.81rem;display:flex;flex-direction:column;gap:3px;margin-top:4px;">
              <div style="display:flex;justify-content:space-between;">
                <span>Cash Payments:</span>
                <strong>${formatPeso(revBreakdown.cashTotal, true)}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span>GCash Transfers:</span>
                <strong>${formatPeso(revBreakdown.gcashTotal, true)}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span>Bank Transfers:</span>
                <strong>${formatPeso(revBreakdown.bankTotal, true)}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="control-grid">
        <section class="module-card">
          <div class="module-top">
            <div>
              <h2>${
                viewMode === "ANNUAL"
                  ? `Annual Sales Chart (Jan – Dec ${currentYear} Actual Logbook Totals)`
                  : "Recorded Transactions Chart"
              }</h2>
              <p class="module-subtitle">
                ${
                  viewMode === "ANNUAL"
                    ? "Only months with actual recorded sales in your logbook show revenue above \u20B10"
                    : "Each bar represents an actual recorded transaction in this period"
                }
              </p>
            </div>
            <span class="module-tag tag-green">${formatPeso(
              revBreakdown.totalRevenue,
              true
            )}</span>
          </div>
          <div class="chart-bars-wrap">${verticalBarsHtml}</div>
        </section>

        <section class="module-card">
          <div class="module-top">
            <div>
              <h2>Revenue by Product / Apparel Package</h2>
              <p class="module-subtitle">Calculated directly from recorded sales transactions</p>
            </div>
            <span class="module-tag tag-red">${productBreakdown.length} Product Type(s)</span>
          </div>
          <div class="horiz-chart-list">${productComparisonBarsHtml}</div>
        </section>
      </div>

      <section class="module-card">
        <div class="module-top">
          <div>
            <h2>Itemized Transactions Included in This Revenue (${
              activeEntries.length
            } Records)</h2>
            <p class="module-subtitle">
              Every transaction listed below adds up to the ${formatPeso(
                revBreakdown.totalRevenue,
                true
              )} total shown above
            </p>
          </div>
          <span class="module-tag tag-green">Total = ${formatPeso(
            revBreakdown.totalRevenue,
            true
          )}</span>
        </div>
        <div class="table-scroll">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Log / OR No.</th>
                <th>Date</th>
                <th>Customer / Team</th>
                <th>Product / Particulars</th>
                <th>Category / Type</th>
                <th>Method</th>
                <th>Qty</th>
                <th>Amount Paid</th>
              </tr>
            </thead>
            <tbody>${itemizedTransactionRowsHtml}</tbody>
          </table>
        </div>
      </section>

      <section class="module-card">
        <div class="module-top">
          <h2>Product Sales Summary Breakdown</h2>
          <span class="module-tag tag-blue">Grouped by Product</span>
        </div>
        <div class="table-scroll">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Transactions</th>
                <th>Quantity Sold</th>
                <th>Total Revenue</th>
                <th>Revenue Share</th>
              </tr>
            </thead>
            <tbody>${productRowsHtml}</tbody>
          </table>
        </div>
      </section>

      ${
        viewMode === "ANNUAL"
          ? `<section class="module-card">
              <div class="module-top">
                <h2>Monthly Ledger Summary (${currentYear})</h2>
                <span class="module-tag tag-green">Actual Logbook Totals</span>
              </div>
              <div class="table-scroll">
                <table class="clean-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Recorded Transactions</th>
                      <th>Products Sold</th>
                      <th>Monthly Revenue</th>
                    </tr>
                  </thead>
                  <tbody>${annualMonthlyRowsHtml}</tbody>
                </table>
              </div>
            </section>`
          : ""
      }

      <div class="control-grid">
        <section class="module-card">
          <div class="module-top">
            <h2>Local Data Backup &amp; Reset</h2>
            <span class="module-tag tag-green">Last: ${
              ctx.state.lastBackupTime
            }</span>
          </div>
          <p class="module-subtitle">
            Frontend testing data is stored locally in your browser. Download a JSON snapshot or clear all temporary test records back to a clean empty state.
          </p>
          <div class="utilities-btn-grid">
            <button type="button" id="anBackupJsonBtn" class="btn btn-utility">
              Download Backup (.JSON)
            </button>
            <button type="button" id="anClearLocalDataBtn" class="btn ${
              confirmClearLocalData ? "btn-red" : "btn-danger-outline"
            }">
              ${
                confirmClearLocalData
                  ? "Click Again to Confirm Clear All"
                  : "Clear Local Test Data"
              }
            </button>
          </div>
        </section>

        <section class="module-card">
          <div class="module-top">
            <h2>Recent System Activity</h2>
            <span class="module-tag tag-red">${ctx.state.auditLogs.length}</span>
          </div>
          <div class="table-scroll">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Module</th>
                  <th>Activity</th>
                </tr>
              </thead>
              <tbody>${auditRows}</tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  }

  container?.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "repLogbookSearchInput") {
      logbookSearch = (target as HTMLInputElement).value;
      render();
      restoreInputFocus("repLogbookSearchInput");
    }
  });

  container?.addEventListener("change", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "repMonthSelect") {
      selectedMonthKey = (target as HTMLSelectElement).value;
      render();
    } else if (target.id === "repDateFrom") {
      customFrom = (target as HTMLInputElement).value;
      render();
    } else if (target.id === "repDateTo") {
      customTo = (target as HTMLInputElement).value;
      render();
    }
  });

  container?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    const modeBtn = target.closest(
      "[data-report-mode]"
    ) as HTMLElement | null;
    if (modeBtn) {
      viewMode = modeBtn.getAttribute("data-report-mode") as ReportViewMode;
      render();
      return;
    }

    if (target.id === "repOpenFullLogbookBtn") {
      ctx.navigateTo("sales-logbook");
      return;
    }

    if (target.id === "anBackupJsonBtn") {
      ctx.state.lastBackupTime = formatTimeNow();
      appendAuditLog(
        ctx.state,
        "Backup",
        `Downloaded store data backup (.JSON) at ${ctx.state.lastBackupTime}.`
      );
      pushNotification(ctx.state, {
        title: "Store Backup Downloaded",
        message: `Saved store backup at ${ctx.state.lastBackupTime}.`,
        category: "Store",
        severity: "success",
        targetPage: "analytics",
      });
      ctx.refreshAll();

      const blob = new Blob([JSON.stringify(ctx.state, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jm-maker-sportswear-backup-${getTodayIsoDate()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      ctx.showToast(`Backup downloaded (${ctx.state.lastBackupTime}).`);
      return;
    }

    if (target.id === "anClearLocalDataBtn") {
      if (!confirmClearLocalData) {
        confirmClearLocalData = true;
        render();
        ctx.showToast(
          "Click 'Click Again to Confirm Clear All' to reset all local test records back to an empty state."
        );
        return;
      }
      confirmClearLocalData = false;
      const fresh = resetSystemState();
      Object.assign(ctx.state, fresh);
      ctx.refreshAll();
      ctx.showToast(
        "Cleared all local test records. System restored to clean empty initial state."
      );
      return;
    }

    if (target.id === "anExportPdfBtn") {
      appendAuditLog(
        ctx.state,
        "Reports",
        `Exported ${viewMode} PDF Sales Report.`
      );
      ctx.refreshAll();
      ctx.printHtml(buildPrintableSalesReportHtml(ctx.state.salesLogbook));
    }
  });

  return { render };
}
