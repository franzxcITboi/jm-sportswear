// ============================================================================
// JM MAKER SPORTSWEAR — DASHBOARD OVERVIEW MODULE
// Displays live KPIs, selected custom order summary, fulfillment progress,
// finished goods preview, and transparent sales revenue breakdown.
// ============================================================================

import { WORKFLOW_STAGES } from "../config/constants";
import { getSelectedOrder } from "../store/systemStore";
import type { PageId } from "../types/system.types";
import {
  computeMonthlyRevenue,
  computeSalesRevenueBreakdown,
  computeStockStatus,
} from "../utils/calculations";
import { handleImagePreviewClick } from "../utils/dom";
import {
  formatPeso,
  formatSizeSummary,
  formatStageEcommerce,
} from "../utils/formatters";
import type { ModuleContext } from "./moduleTypes";

const STEP_LABELS = ["1. Review", "2. Prepare", "3. Check", "4. Complete"];

export function initOverviewModule(ctx: ModuleContext): { render: () => void } {
  const container = document.getElementById("overviewPageContent");

  function render(): void {
    if (!container) return;
    const order = getSelectedOrder(ctx.state);
    const balance = order
      ? Math.max(0, order.totalAmount - order.amountPaid)
      : 0;
    const monthlyRev = computeMonthlyRevenue(ctx.state);
    const revBreakdown = computeSalesRevenueBreakdown(ctx.state.salesLogbook);
    const unreadNotifs = ctx.state.notifications.filter((n) => !n.read).length;
    const activeOrdersCount = ctx.state.orders.filter(
      (o) => o.stage !== "Released" && o.stage !== "Cancelled"
    ).length;

    const stockApparel = ctx.state.inventory.filter(
      (i) => i.category === "Stock Apparel"
    );
    const outOfStockCount = stockApparel.filter((i) => i.qty <= 0).length;
    const lowStockCount = stockApparel.filter(
      (i) => i.qty > 0 && i.qty <= (i.lowStockThreshold || 10)
    ).length;

    const stageIdx = !order
      ? -1
      : order.stage === "Released"
      ? WORKFLOW_STAGES.length
      : WORKFLOW_STAGES.indexOf(order.stage);

    const stepsHtml = STEP_LABELS.map((label, idx) => {
      let cls = "workflow-step";
      let icon = "\u2022";
      if (order && order.stage !== "Cancelled" && idx < stageIdx) {
        cls += " step-done";
        icon = "\u2713";
      } else if (
        order &&
        idx === stageIdx &&
        order.stage !== "Released" &&
        order.stage !== "Cancelled"
      ) {
        cls += " step-active";
        icon = "\u25CF";
      }
      return `<div class="${cls}" style="cursor:default;">
        <span class="step-name">${label}</span>
        <span class="step-icon">${icon}</span>
      </div>`;
    }).join("");

    const topInventoryRows =
      stockApparel.length > 0
        ? stockApparel
            .slice(0, 4)
            .map((item) => {
              const condition = computeStockStatus(
                item.qty,
                item.lowStockThreshold || 10
              );
              const pillClass =
                condition === "Out of Stock"
                  ? "status-out"
                  : condition === "Low Stock"
                  ? "status-low-warn"
                  : "status-available";

              return `<tr>
                <td><strong>${item.itemName}</strong></td>
                <td>${formatPeso(item.unitPrice || 0)}</td>
                <td><strong>${item.qty} pcs</strong></td>
                <td><span class="status-pill ${pillClass}">${condition}</span></td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:18px;">No finished goods products added yet.</td></tr>`;

    const templatePreviewHtml =
      order && order.jerseyTemplateImage
        ? `<button type="button" class="proof-inline-chip" data-preview-src="${
            order.jerseyTemplateImage
          }" data-preview-title="Jersey Template — Order #${order.id} (${
            order.clientName
          })">
            <img src="${order.jerseyTemplateImage}" alt="Jersey Template" />
            <span>View Jersey Template</span>
          </button>`
        : "";

    let stockSummaryMeta = "No products added yet";
    if (stockApparel.length > 0) {
      if (outOfStockCount > 0 && lowStockCount > 0) {
        stockSummaryMeta = `${outOfStockCount} Out of Stock • ${lowStockCount} Low Stock`;
      } else if (outOfStockCount > 0) {
        stockSummaryMeta = `${outOfStockCount} product(s) Out of Stock`;
      } else if (lowStockCount > 0) {
        stockSummaryMeta = `${lowStockCount} product(s) Low on Stock`;
      } else {
        stockSummaryMeta = "All products sufficiently stocked";
      }
    }

    const pendingPaymentProofs = (
      ctx.state.paymentProofSubmissions || []
    ).filter((s) => s.status === "Pending Verification").length;

    const pendingProofsBannerHtml =
      pendingPaymentProofs > 0
        ? `<div class="pending-proofs-banner">
            <div>
              <strong>${pendingPaymentProofs} Buyer Payment Proof${
            pendingPaymentProofs === 1 ? "" : "s"
          } Awaiting Verification</strong><br/>
              <span>Review uploaded receipt screenshots and approve or reject buyer payments.</span>
            </div>
            <button type="button" class="btn btn-red btn-sm" data-goto="payment-proofs">
              Review Payment Proofs &rarr;
            </button>
          </div>`
        : "";

    const orderSummaryCardHtml = order
      ? `<section class="module-card">
          <div class="module-top">
            <h2>Selected Custom Order Summary</h2>
            <span class="module-tag tag-red">Order #${order.id}</span>
          </div>
          <div class="spec-body">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <p class="spec-client">Customer: <strong>${order.clientName}</strong></p>
              ${templatePreviewHtml}
            </div>
            <p class="spec-detail">${order.sublimationType} &bull; ${
          order.totalQty
        } pcs (${formatSizeSummary(order.sizes)})</p>
            <div class="pos-billing-box">
              <div>
                <span class="billing-caption">Order Total &amp; Payment Status</span>
                <div class="billing-figures">
                  <strong class="total-figure">${formatPeso(
                    order.totalAmount
                  )}</strong>
                  <span class="balance-figure ${
                    balance === 0 ? "paid-clear" : ""
                  }">${
          balance === 0 ? "Paid in Full" : `Balance Due: ${formatPeso(balance)}`
        }</span>
                </div>
              </div>
              <button type="button" class="btn btn-red btn-sm" data-goto="pos-specs">
                Manage Order &rarr;
              </button>
            </div>
          </div>
        </section>`
      : `<section class="module-card">
          <div class="module-top">
            <h2>Selected Custom Order Summary</h2>
            <span class="module-tag tag-blue">No Orders Yet</span>
          </div>
          <div class="empty-state-panel">
            <p class="empty-state-title">No custom orders recorded yet</p>
            <p class="empty-state-desc">Create your first custom team order in Custom Orders &amp; POS to track sizes, totals, payments, and fulfillment.</p>
            <button type="button" class="btn btn-red btn-sm" data-goto="pos-specs">
              + Create Custom Order &rarr;
            </button>
          </div>
        </section>`;

    const fulfillmentCardHtml = order
      ? `<section class="module-card">
          <div class="module-top">
            <h2>Order Fulfillment Status</h2>
            <span class="module-tag ${
              order.stage === "Released"
                ? "tag-green"
                : order.stage === "Cancelled"
                ? "tag-red"
                : "tag-blue"
            }">${formatStageEcommerce(order.stage)}</span>
          </div>
          <div class="workflow-track">${stepsHtml}</div>
          <p class="workflow-status-line">
            Order #${order.id} (${order.clientName}) &bull; Current Step: <strong>${formatStageEcommerce(
          order.stage
        )}</strong>
          </p>
          <div class="module-footer-actions">
            <button type="button" class="btn btn-light btn-sm" data-goto="workflow">
              Open Order Fulfillment &rarr;
            </button>
          </div>
        </section>`
      : `<section class="module-card">
          <div class="module-top">
            <h2>Order Fulfillment Status</h2>
            <span class="module-tag tag-blue">Idle</span>
          </div>
          <div class="workflow-track">${stepsHtml}</div>
          <p class="workflow-status-line" style="color:var(--text-muted);">
            No active order selected. Once an order is created, progress through Steps 1 to 4 appears here.
          </p>
          <div class="module-footer-actions">
            <button type="button" class="btn btn-light btn-sm" data-goto="workflow">
              Open Order Fulfillment &rarr;
            </button>
          </div>
        </section>`;

    container.innerHTML = `
      ${pendingProofsBannerHtml}
      <div class="kpi-strip">
        <div class="kpi-box">
          <span class="kpi-label">Active Custom Orders</span>
          <strong class="kpi-val">${activeOrdersCount}</strong>
          <span class="kpi-meta">${
            order
              ? `Order #${order.id} currently selected`
              : "No custom orders created yet"
          }</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Recorded Sales Revenue</span>
          <strong class="kpi-val">${formatPeso(monthlyRev, true)}</strong>
          <span class="kpi-meta">Orders: ${formatPeso(
            revBreakdown.customOrdersRevenue
          )} &bull; Stock: ${formatPeso(revBreakdown.stockSalesRevenue)}</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Finished Goods Inventory</span>
          <strong class="kpi-val ${
            outOfStockCount > 0
              ? "kpi-red"
              : lowStockCount > 0
              ? "kpi-amber"
              : ""
          }">${stockApparel.length} Products</strong>
          <span class="kpi-meta">${stockSummaryMeta}</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Unread Alerts</span>
          <strong class="kpi-val ${unreadNotifs > 0 ? "kpi-red" : ""}">${unreadNotifs}</strong>
          <span class="kpi-meta">Last backup: ${ctx.state.lastBackupTime}</span>
        </div>
      </div>

      <div class="control-grid">
        ${orderSummaryCardHtml}
        ${fulfillmentCardHtml}

        <section class="module-card">
          <div class="module-top">
            <h2>Finished Goods Inventory</h2>
            <button type="button" class="btn btn-light btn-sm" data-goto="inventory">
              Manage Inventory &rarr;
            </button>
          </div>
          <div class="table-scroll">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${topInventoryRows}</tbody>
            </table>
          </div>
        </section>

        <section class="module-card">
          <div class="module-top">
            <div>
              <h2>Sales Revenue &amp; Breakdown</h2>
              <p class="module-subtitle">Exact sum of all ${revBreakdown.totalTransactions} recorded transaction(s) in Sales History</p>
            </div>
            <span class="module-tag tag-green">${revBreakdown.totalUnitsSold} pcs sold</span>
          </div>

          <div class="analytics-top-row">
            <div class="revenue-block">
              <span class="billing-caption">Total Recorded Sales Revenue</span>
              <strong class="revenue-figure">${formatPeso(
                monthlyRev,
                true
              )}</strong>
              <small style="display:block;color:var(--text-muted);font-size:0.73rem;margin-top:2px;">
                Cash: ${formatPeso(revBreakdown.cashTotal)} &bull; GCash: ${formatPeso(
      revBreakdown.gcashTotal
    )} &bull; Bank: ${formatPeso(revBreakdown.bankTotal)}
              </small>
            </div>
            <div class="backup-block">
              <span class="billing-caption">Revenue Source Breakdown</span>
              <div style="font-size:0.79rem;display:flex;flex-direction:column;gap:4px;margin-top:4px;">
                <div style="display:flex;justify-content:space-between;">
                  <span style="color:var(--text-secondary);">Custom Team Orders (${
                    revBreakdown.customOrdersTxns
                  } txns):</span>
                  <strong>${formatPeso(
                    revBreakdown.customOrdersRevenue,
                    true
                  )}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span style="color:var(--text-secondary);">Ready-Made Stock (${
                    revBreakdown.stockSalesTxns
                  } txns):</span>
                  <strong>${formatPeso(
                    revBreakdown.stockSalesRevenue,
                    true
                  )}</strong>
                </div>
              </div>
            </div>
          </div>

          <div class="utilities-btn-grid">
            <button type="button" class="btn btn-utility" data-goto="sales-logbook">
              Open Sales History &rarr;
            </button>
            <button type="button" class="btn btn-utility" data-goto="analytics">
              Full Revenue Reports &rarr;
            </button>
          </div>
        </section>
      </div>

      <section class="module-card" style="margin-top:2px;">
        <div class="module-top">
          <div>
            <h2>Staff Monitoring &amp; Operational Accountability</h2>
            <p class="module-subtitle">Live snapshot of shop personnel, assigned operational tasks, and immutable activity logs</p>
          </div>
          <button type="button" class="btn btn-light btn-sm" data-goto="staff-monitoring">
            Open Staff Monitoring &rarr;
          </button>
        </div>
        <div class="form-grid-4">
          <div class="revenue-block">
            <span class="billing-caption">Active Staff</span>
            <strong class="revenue-figure">${
              (ctx.state.staffMembers || []).filter(
                (s) => s.accountStatus === "Active"
              ).length
            }</strong>
            <small style="display:block;color:var(--text-muted);">${
              (ctx.state.staffMembers || []).filter(
                (s) =>
                  s.accountStatus === "Active" &&
                  s.availabilityStatus === "On Duty"
              ).length
            } On Duty</small>
          </div>
          <div class="revenue-block">
            <span class="billing-caption">Open Staff Tasks</span>
            <strong class="revenue-figure">${
              (ctx.state.staffTasks || []).filter(
                (t) => t.status === "Pending" || t.status === "In Progress"
              ).length
            }</strong>
            <small style="display:block;color:var(--text-muted);">Pending or In Progress</small>
          </div>
          <div class="revenue-block">
            <span class="billing-caption">Completed Tasks</span>
            <strong class="revenue-figure" style="color:var(--green-text);">${
              (ctx.state.staffTasks || []).filter(
                (t) => t.status === "Completed"
              ).length
            }</strong>
            <small style="display:block;color:var(--text-muted);">Tracked accomplishments</small>
          </div>
          <div class="revenue-block">
            <span class="billing-caption">Immutable Audit Trail</span>
            <strong class="revenue-figure">${ctx.state.auditLogs.length}</strong>
            <small style="display:block;color:var(--text-muted);">${
              ctx.state.auditLogs[0]
                ? `Last: ${ctx.state.auditLogs[0].module}`
                : "No actions logged yet"
            }</small>
          </div>
        </div>
      </section>
    `;
  }

  container?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (
      handleImagePreviewClick(target, ctx.openImagePreview, "Jersey Template")
    ) {
      return;
    }

    const navBtn = target.closest("[data-goto]") as HTMLElement | null;
    const targetPage = navBtn?.getAttribute("data-goto") as PageId | null;
    if (targetPage) ctx.navigateTo(targetPage);
  });

  return { render };
}
