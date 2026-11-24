// ============================================================================
// JM MAKER SPORTSWEAR — SALES HISTORY LOGBOOK MODULE
// Displays consolidated sales transactions with search, type & date filters,
// payment proof previews, printable ledger, and walk-in stock sale entry.
// ============================================================================

import {
  appendAuditLog,
  appendLogbookEntry,
  pushNotification,
} from "../store/systemStore";
import type { LogbookPaymentType, PaymentMethod } from "../types/system.types";
import { computeStockStatus } from "../utils/calculations";
import { handleImagePreviewClick, restoreInputFocus } from "../utils/dom";
import { formatPeso, getTodayIsoDate } from "../utils/formatters";
import { compressImageFile } from "../utils/imageCompressor";
import { logError } from "../utils/logger";
import type { ModuleContext } from "./moduleTypes";

type DateFilterMode =
  | "ALL"
  | "TODAY"
  | "THIS_WEEK"
  | "THIS_MONTH"
  | "THIS_YEAR"
  | "CUSTOM";

export function initSalesLogbookModule(ctx: ModuleContext): {
  render: () => void;
} {
  const container = document.getElementById("salesLogbookPageContent");
  let filterType = "ALL";
  let dateFilter: DateFilterMode = "ALL";
  let customDateFrom = "";
  let customDateTo = "";
  let searchQuery = "";
  let selectedStockId = "";
  let walkInProofImg: string | undefined;
  let walkInProofName: string | undefined;

  function matchesDateFilter(isoDate: string): boolean {
    if (dateFilter === "ALL" || !isoDate) return true;
    const todayStr = getTodayIsoDate();
    if (dateFilter === "TODAY") return isoDate === todayStr;
    if (dateFilter === "THIS_MONTH")
      return isoDate.slice(0, 7) === todayStr.slice(0, 7);
    if (dateFilter === "THIS_YEAR")
      return isoDate.slice(0, 4) === todayStr.slice(0, 4);
    if (dateFilter === "THIS_WEEK") {
      const entryDate = new Date(`${isoDate}T00:00:00`);
      const now = new Date(`${todayStr}T00:00:00`);
      const diffDays =
        (now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 7;
    }
    if (dateFilter === "CUSTOM") {
      if (customDateFrom && isoDate < customDateFrom) return false;
      if (customDateTo && isoDate > customDateTo) return false;
      return true;
    }
    return true;
  }

  function render(): void {
    if (!container) return;

    const blankItems = ctx.state.inventory.filter(
      (i) => i.category === "Stock Apparel"
    );
    if (
      !selectedStockId ||
      !blankItems.some((i) => i.id === selectedStockId)
    ) {
      selectedStockId = blankItems[0]?.id || "";
    }
    const activeStockItem =
      blankItems.find((i) => i.id === selectedStockId) || blankItems[0];
    const activeUnitPrice = activeStockItem ? activeStockItem.unitPrice || 0 : 0;

    const filteredEntries = ctx.state.salesLogbook.filter((entry) => {
      const matchesType =
        filterType === "ALL" || entry.paymentType === filterType;
      const matchesDate = matchesDateFilter(entry.isoDate);
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        entry.particulars.toLowerCase().includes(q) ||
        entry.clientName.toLowerCase().includes(q) ||
        entry.logNo.toLowerCase().includes(q) ||
        entry.orNumber.toLowerCase().includes(q) ||
        entry.orderId.toLowerCase().includes(q) ||
        entry.dateTime.toLowerCase().includes(q) ||
        (entry.isoDate || "").toLowerCase().includes(q) ||
        (entry.referenceNumber || "").toLowerCase().includes(q);
      return matchesType && matchesDate && matchesSearch;
    });

    const filteredCollected = filteredEntries.reduce(
      (sum, e) => sum + e.amountPaid,
      0
    );
    const filteredUnits = filteredEntries.reduce((sum, e) => sum + e.qty, 0);
    const totalPendingBal = ctx.state.orders.reduce(
      (sum, o) => sum + Math.max(0, o.totalAmount - o.amountPaid),
      0
    );

    const blankStockOptions =
      blankItems.length > 0
        ? blankItems
            .map(
              (i) =>
                `<option value="${i.id}" ${
                  i.id === selectedStockId ? "selected" : ""
                }>${i.itemName} — ${formatPeso(i.unitPrice || 0)}/pc (${
                  i.qty
                } in stock)</option>`
            )
            .join("")
        : `<option value="">No inventory products yet — add in Finished Goods first</option>`;

    const logRows =
      filteredEntries.length > 0
        ? filteredEntries
            .map((entry) => {
              const badgeCls =
                entry.balanceRemaining === 0
                  ? "status-available"
                  : "status-pending";
              const method = entry.paymentMethod || "Cash";
              const refText = entry.referenceNumber
                ? `<br/><small style="color:var(--text-muted);">Ref: ${entry.referenceNumber}</small>`
                : "";
              const proofCell = entry.paymentProofImage
                ? `<button type="button" class="proof-inline-chip" data-preview-src="${entry.paymentProofImage}" data-preview-title="Payment Proof — ${entry.logNo} (${entry.clientName})">
                    <img src="${entry.paymentProofImage}" alt="Proof" />
                    <span>View Proof</span>
                  </button>`
                : `<span style="color:var(--text-muted);font-size:0.75rem;">—</span>`;

              const unitP =
                entry.unitPrice ||
                Math.round(entry.amountPaid / Math.max(1, entry.qty));

              return `<tr>
                <td style="white-space:nowrap;"><strong>${entry.logNo}</strong><br/><small style="color:var(--text-muted);">${entry.orNumber}</small></td>
                <td style="white-space:nowrap;">${entry.dateTime}<br/><small style="color:var(--text-muted);">${entry.isoDate}</small></td>
                <td><strong>${entry.particulars}</strong><br/><small style="color:var(--text-muted);">Order: ${entry.orderId}</small></td>
                <td><strong>${entry.clientName}</strong></td>
                <td><strong>${entry.qty} pcs</strong></td>
                <td>${formatPeso(unitP, true)}</td>
                <td><strong style="color:var(--green-text);">${formatPeso(
                  entry.amountPaid,
                  true
                )}</strong></td>
                <td><span class="status-pill ${badgeCls}">${entry.paymentType}</span></td>
                <td><strong>${method}</strong>${refText}</td>
                <td>${proofCell}</td>
                <td>${
                  entry.balanceRemaining === 0
                    ? `<span style="color:var(--green-text);font-weight:600;">Paid</span>`
                    : `<strong style="color:var(--brand-red);">${formatPeso(
                        entry.balanceRemaining,
                        true
                      )}</strong>`
                }</td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:18px;">${
            ctx.state.salesLogbook.length === 0
              ? "No sales transactions recorded yet."
              : "No sales records match your search or date filter."
          }</td></tr>`;

    container.innerHTML = `
      <div class="kpi-strip">
        <div class="kpi-box">
          <span class="kpi-label">Matching Transactions</span>
          <strong class="kpi-val">${filteredEntries.length}</strong>
          <span class="kpi-meta">Consolidated sales records</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Total Units Sold</span>
          <strong class="kpi-val">${filteredUnits} pcs</strong>
          <span class="kpi-meta">In selected period</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Total Sales Amount</span>
          <strong class="kpi-val kpi-green">${formatPeso(
            filteredCollected,
            true
          )}</strong>
          <span class="kpi-meta">Cash, GCash &amp; Bank</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Pending Order Balances</span>
          <strong class="kpi-val ${
            totalPendingBal > 0 ? "kpi-red" : ""
          }">${formatPeso(totalPendingBal, true)}</strong>
          <span class="kpi-meta">Receivable upon pickup</span>
        </div>
      </div>

      <section class="module-card">
        <div class="module-top">
          <h2>Record Finished Goods Sale (Single Consolidated Record)</h2>
          <span class="module-tag tag-green">Auto-Calculates Qty &times; Unit Price</span>
        </div>
        <form id="logbookNewEntryForm" novalidate>
          <div class="form-grid-5">
            <div class="field">
              <label for="lbBuyerInput">Customer Name</label>
              <input type="text" id="lbBuyerInput" placeholder="Enter customer name" required />
            </div>
            <div class="field">
              <label for="lbStockSelect">Finished Goods Product</label>
              <select id="lbStockSelect" ${
                blankItems.length === 0 ? "disabled" : ""
              }>${blankStockOptions}</select>
            </div>
            <div class="field">
              <label for="lbQtyInput">Quantity Sold (pcs)</label>
              <input type="number" id="lbQtyInput" min="1" value="1" ${
                blankItems.length === 0 ? "disabled" : ""
              } required />
            </div>
            <div class="field">
              <label for="lbUnitPriceInput">Unit Selling Price (\u20B1)</label>
              <input type="number" id="lbUnitPriceInput" value="${activeUnitPrice}" readonly />
            </div>
            <div class="field">
              <label for="lbAmountInput">Total Amount (\u20B1)</label>
              <input type="number" id="lbAmountInput" min="1" value="${activeUnitPrice}" readonly />
            </div>
          </div>

          <div class="form-grid-3">
            <div class="field">
              <label for="lbMethodSelect">Payment Method</label>
              <select id="lbMethodSelect">
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
            <div class="field">
              <label for="lbRefInput">Reference No. (Optional)</label>
              <input type="text" id="lbRefInput" placeholder="Enter payment reference number" />
            </div>
            <div style="display:flex;align-items:end;justify-content:space-between;flex-wrap:wrap;gap:8px;padding-bottom:10px;">
              <div>
                <input type="file" id="lbProofFileInput" accept="image/*" hidden />
                <button type="button" id="lbTriggerProofBtn" class="btn btn-light btn-sm" ${
                  blankItems.length === 0 ? "disabled" : ""
                }>
                  ${
                    walkInProofImg
                      ? `\u2713 ${walkInProofName || "Proof Attached"}`
                      : "+ Upload Payment Proof"
                  }
                </button>
              </div>
              <div class="module-footer-actions">
                <button type="button" id="lbPrintLogbookBtn" class="btn btn-light">
                  Print Sales History
                </button>
                <button type="submit" class="btn btn-red" ${
                  blankItems.length === 0 ? "disabled" : ""
                }>
                  + Record Consolidated Sale
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>

      <section class="module-card">
        <div class="module-top">
          <h2>Sales History Ledger</h2>
          <div class="toolbar-group">
            <input
              type="search"
              id="lbSearchInput"
              class="toolbar-input"
              style="min-width:250px;"
              placeholder="Search product, transaction ID, date, or customer..."
              value="${searchQuery}"
            />
            <select id="lbFilterSelect" class="toolbar-select">
              <option value="ALL" ${
                filterType === "ALL" ? "selected" : ""
              }>All Transaction Types</option>
              <option value="Walk-In Stock Sale" ${
                filterType === "Walk-In Stock Sale" ? "selected" : ""
              }>Finished Goods Sales</option>
              <option value="Full Payment" ${
                filterType === "Full Payment" ? "selected" : ""
              }>Full Order Payments</option>
              <option value="Downpayment" ${
                filterType === "Downpayment" ? "selected" : ""
              }>Order Deposits</option>
              <option value="Balance Settlement" ${
                filterType === "Balance Settlement" ? "selected" : ""
              }>Balance Settlements</option>
            </select>
          </div>
        </div>

        <div class="toolbar-group" style="justify-content:space-between;padding-bottom:4px;">
          <div class="toolbar-group">
            <span style="font-size:0.76rem;font-weight:600;color:var(--text-secondary);">Period:</span>
            <button type="button" class="btn ${
              dateFilter === "ALL" ? "btn-red" : "btn-light"
            } btn-sm" data-date-filter="ALL">All Dates</button>
            <button type="button" class="btn ${
              dateFilter === "TODAY" ? "btn-red" : "btn-light"
            } btn-sm" data-date-filter="TODAY">Today</button>
            <button type="button" class="btn ${
              dateFilter === "THIS_WEEK" ? "btn-red" : "btn-light"
            } btn-sm" data-date-filter="THIS_WEEK">This Week</button>
            <button type="button" class="btn ${
              dateFilter === "THIS_MONTH" ? "btn-red" : "btn-light"
            } btn-sm" data-date-filter="THIS_MONTH">This Month</button>
            <button type="button" class="btn ${
              dateFilter === "THIS_YEAR" ? "btn-red" : "btn-light"
            } btn-sm" data-date-filter="THIS_YEAR">This Year</button>
            <button type="button" class="btn ${
              dateFilter === "CUSTOM" ? "btn-red" : "btn-light"
            } btn-sm" data-date-filter="CUSTOM">Custom Date Range</button>
          </div>

          ${
            dateFilter === "CUSTOM"
              ? `<div class="toolbar-group">
                  <label for="lbDateFrom">From:</label>
                  <input type="date" id="lbDateFrom" class="toolbar-input" value="${customDateFrom}" />
                  <label for="lbDateTo">To:</label>
                  <input type="date" id="lbDateTo" class="toolbar-input" value="${customDateTo}" />
                </div>`
              : ""
          }
        </div>

        <div class="table-scroll">
          <table class="clean-table logbook-table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Transaction Date</th>
                <th>Product / Item</th>
                <th>Customer</th>
                <th>Qty Sold</th>
                <th>Unit Price</th>
                <th>Total Amount</th>
                <th>Type</th>
                <th>Method &amp; Ref #</th>
                <th>Proof</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>${logRows}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  container?.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "lbQtyInput") {
      const qty = Math.max(
        1,
        Number((target as HTMLInputElement).value) || 1
      );
      const unitPriceInput = document.getElementById(
        "lbUnitPriceInput"
      ) as HTMLInputElement | null;
      const amtInput = document.getElementById(
        "lbAmountInput"
      ) as HTMLInputElement | null;
      const unitP = Number(unitPriceInput?.value) || 350;
      if (amtInput) amtInput.value = String(qty * unitP);
    } else if (target.id === "lbSearchInput") {
      searchQuery = (target as HTMLInputElement).value;
      render();
      restoreInputFocus("lbSearchInput");
    }
  });

  container?.addEventListener("change", async (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "lbStockSelect") {
      selectedStockId = (target as HTMLSelectElement).value;
      render();
    } else if (target.id === "lbFilterSelect") {
      filterType = (target as HTMLSelectElement).value;
      render();
    } else if (target.id === "lbDateFrom") {
      customDateFrom = (target as HTMLInputElement).value;
      render();
    } else if (target.id === "lbDateTo") {
      customDateTo = (target as HTMLInputElement).value;
      render();
    } else if (target.id === "lbProofFileInput") {
      const file = (target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        walkInProofImg = await compressImageFile(file, 900, 0.8);
        walkInProofName = file.name;
        render();
        ctx.showToast(`Attached payment proof "${file.name}".`);
      } catch (err) {
        logError("SalesLogbookModule", "Failed to compress walk-in proof image.", err);
        ctx.showToast("Could not read payment screenshot.");
      }
    }
  });

  container?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    if (handleImagePreviewClick(target, ctx.openImagePreview, "Payment Proof")) {
      return;
    }

    const dateBtn = target.closest("[data-date-filter]") as HTMLElement | null;
    if (dateBtn) {
      dateFilter = dateBtn.getAttribute("data-date-filter") as DateFilterMode;
      render();
      return;
    }

    if (target.id === "lbTriggerProofBtn") {
      (
        document.getElementById("lbProofFileInput") as HTMLInputElement | null
      )?.click();
      return;
    }

    if (target.id === "lbPrintLogbookBtn") {
      if (ctx.state.salesLogbook.length === 0) {
        ctx.showToast("No sales history records available to print yet.");
        return;
      }
      const rows = ctx.state.salesLogbook
        .map((entry) => {
          const unitP =
            entry.unitPrice ||
            Math.round(entry.amountPaid / Math.max(1, entry.qty));
          return `<tr>
            <td>${entry.logNo}<br/><small>${entry.orNumber}</small></td>
            <td>${entry.dateTime}</td>
            <td>${entry.particulars}</td>
            <td>${entry.clientName}</td>
            <td>${entry.qty} pcs</td>
            <td>${formatPeso(unitP, true)}</td>
            <td>${formatPeso(entry.amountPaid, true)}</td>
          </tr>`;
        })
        .join("");

      ctx.printHtml(`
        <div class="print-box">
          <div class="print-header">
            <h2>JM MAKER SPORTSWEAR — CONSOLIDATED SALES HISTORY</h2>
            <p>Printed: ${new Date().toLocaleString()}</p>
          </div>
          <table class="print-table">
            <thead>
              <tr>
                <th>Txn ID</th>
                <th>Date &amp; Time</th>
                <th>Product / Item</th>
                <th>Customer</th>
                <th>Qty Sold</th>
                <th>Unit Price</th>
                <th>Total Amount</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `);
    }
  });

  container?.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (form.id !== "logbookNewEntryForm") return;
    e.preventDefault();

    const buyer = (
      document.getElementById("lbBuyerInput") as HTMLInputElement
    ).value.trim();
    const stockId = (
      document.getElementById("lbStockSelect") as HTMLSelectElement
    ).value;
    const qty = Math.max(
      1,
      Number(
        (document.getElementById("lbQtyInput") as HTMLInputElement).value
      ) || 1
    );
    const method = (
      document.getElementById("lbMethodSelect") as HTMLSelectElement
    ).value as PaymentMethod;
    const refNo = (
      document.getElementById("lbRefInput") as HTMLInputElement
    ).value.trim();

    if (!buyer) {
      ctx.showToast("Please enter the customer name.");
      return;
    }

    const stockItem = ctx.state.inventory.find((i) => i.id === stockId);
    if (!stockItem) {
      ctx.showToast("Please select a valid product.");
      return;
    }
    if (stockItem.qty <= 0) {
      ctx.showToast(
        `"${stockItem.itemName}" is Out of Stock (0 pcs available).`
      );
      return;
    }
    if (stockItem.qty < qty) {
      ctx.showToast(
        `Insufficient stock for "${stockItem.itemName}" (Only ${stockItem.qty} pcs left).`
      );
      return;
    }

    const unitPrice = stockItem.unitPrice || 350;
    const amountPaid = qty * unitPrice;

    stockItem.qty -= qty;
    stockItem.status = computeStockStatus(
      stockItem.qty,
      stockItem.lowStockThreshold || 10
    );

    const entry = appendLogbookEntry(ctx.state, {
      orderId: "WALK-IN",
      clientName: buyer,
      particulars: stockItem.itemName,
      productId: stockItem.id,
      qty,
      unitPrice,
      paymentType: "Walk-In Stock Sale" as LogbookPaymentType,
      paymentMethod: method,
      referenceNumber: refNo || undefined,
      paymentProofImage: walkInProofImg,
      amountPaid,
      balanceRemaining: 0,
      remarks: `${qty} pcs × ${formatPeso(unitPrice)} (${stockItem.status})`,
    });

    walkInProofImg = undefined;
    walkInProofName = undefined;

    if (stockItem.qty === 0) {
      pushNotification(ctx.state, {
        title: `Out of Stock — ${stockItem.itemName}`,
        message: `${stockItem.itemName} has 0 pcs remaining after transaction ${entry.logNo}.`,
        category: "Inventory",
        severity: "urgent",
        targetPage: "inventory",
      });
    } else {
      pushNotification(ctx.state, {
        title: `Sale Recorded (${entry.logNo})`,
        message: `${buyer} purchased ${qty} pcs of ${
          stockItem.itemName
        } (${formatPeso(amountPaid, true)}).`,
        category: "Orders & Payments",
        severity: "success",
        targetPage: "sales-logbook",
      });
    }

    appendAuditLog(
      ctx.state,
      "Sales",
      `Recorded consolidated sale ${entry.logNo} (${buyer}) — ${qty} pcs ${
        stockItem.itemName
      } @ ${formatPeso(unitPrice)} = ${formatPeso(amountPaid, true)}.`
    );

    ctx.refreshAll();
    ctx.showToast(
      `Recorded consolidated sale ${entry.logNo}: ${qty} pcs × ${formatPeso(
        unitPrice
      )} = ${formatPeso(amountPaid, true)}.`
    );
  });

  return { render };
}
