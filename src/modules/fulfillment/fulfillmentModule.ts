// ============================================================================
// JM MAKER SPORTSWEAR — ORDER FULFILLMENT CONTROLLER MODULE
// Coordinates fulfillment KPIs, queue search/filtering, checklist toggling,
// sequential stage advancement with safeguards, and order cancel/restore.
// ============================================================================

import {
  appendAuditLog,
  getOrderChecklist,
  getSelectedOrder,
  pushNotification,
  syncCustomOrderInventory,
} from "../../store/systemStore";
import type { WorkflowStage } from "../../types/system.types";
import { handleImagePreviewClick, restoreInputFocus } from "../../utils/dom";
import {
  formatLogbookDateNow,
  formatPeso,
  formatSizeSummary,
  formatStageEcommerce,
} from "../../utils/formatters";
import type { ModuleContext } from "../moduleTypes";
import { renderActiveFulfillmentWorkspace } from "./fulfillmentStepsView";

type FulfillmentFilter =
  | "ALL"
  | "Order Received"
  | "Production"
  | "Quality Inspection"
  | "Ready for Release"
  | "Released"
  | "Cancelled";

export function initWorkflowModule(ctx: ModuleContext): { render: () => void } {
  const container = document.getElementById("workflowPageContent");
  let statusFilter: FulfillmentFilter = "ALL";
  let searchQuery = "";
  let inlineErrorMsg = "";

  function render(): void {
    if (!container) return;
    const orders = ctx.state.orders || [];
    const order = getSelectedOrder(ctx.state);

    const step1Count = orders.filter((o) => o.stage === "Order Received").length;
    const step2Count = orders.filter((o) => o.stage === "Production").length;
    const step3Count = orders.filter(
      (o) => o.stage === "Quality Inspection"
    ).length;
    const step4Count = orders.filter(
      (o) => o.stage === "Ready for Release"
    ).length;
    const fulfilledCount = orders.filter((o) => o.stage === "Released").length;
    const cancelledCount = orders.filter((o) => o.stage === "Cancelled").length;

    const kpiHtml = `
      <div class="kpi-strip">
        <div class="kpi-box">
          <span class="kpi-label">Review &amp; Prepare (Steps 1–2)</span>
          <strong class="kpi-val ${
            step1Count + step2Count > 0 ? "kpi-amber" : ""
          }">${step1Count + step2Count}</strong>
          <span class="kpi-meta">${step1Count} to review &bull; ${step2Count} preparing</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Check &amp; Complete (Steps 3–4)</span>
          <strong class="kpi-val">${step3Count + step4Count}</strong>
          <span class="kpi-meta">${step3Count} checking &bull; ${step4Count} ready to complete</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Fulfilled Orders</span>
          <strong class="kpi-val kpi-green">${fulfilledCount}</strong>
          <span class="kpi-meta">Completed &amp; released to customers</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Cancelled Orders</span>
          <strong class="kpi-val ${
            cancelledCount > 0 ? "kpi-red" : ""
          }">${cancelledCount}</strong>
          <span class="kpi-meta">Inactive / cancelled</span>
        </div>
      </div>
    `;

    if (!order || orders.length === 0) {
      container.innerHTML = `
        ${kpiHtml}
        <section class="module-card">
          <div class="module-top">
            <h2>Order Fulfillment Workspace</h2>
            <span class="module-tag tag-blue">0 Orders</span>
          </div>
          <div class="empty-state-panel">
            <p class="empty-state-title">No orders to fulfill yet</p>
            <p class="empty-state-desc">
              Create a custom order in <strong>Custom Orders &amp; POS</strong> first. It will appear here automatically so you can process it through <strong>Step 1 (Review)</strong>, <strong>Step 2 (Prepare)</strong>, <strong>Step 3 (Check)</strong>, and <strong>Step 4 (Complete Fulfillment)</strong>.
            </p>
            <button type="button" id="wfCreateFirstOrderBtn" class="btn btn-red">
              + Create Custom Order &rarr;
            </button>
          </div>
        </section>
      `;
      return;
    }

    const filteredOrders = orders.filter((o) => {
      const matchesStatus = statusFilter === "ALL" || o.stage === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        o.id.toLowerCase().includes(q) ||
        o.clientName.toLowerCase().includes(q) ||
        o.sublimationType.toLowerCase().includes(q) ||
        formatStageEcommerce(o.stage).toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });

    const queueRows =
      filteredOrders.length > 0
        ? filteredOrders
            .map((o) => {
              const bal = Math.max(0, o.totalAmount - o.amountPaid);
              const selected = o.id === order.id;
              let statusBadgeCls = "status-pending";
              if (o.stage === "Released") statusBadgeCls = "status-available";
              else if (o.stage === "Cancelled") statusBadgeCls = "status-out";
              else if (
                o.stage === "Production" ||
                o.stage === "Quality Inspection"
              ) {
                statusBadgeCls = "status-processing";
              }

              return `<tr class="${
                selected ? "selected-order-row" : ""
              }" data-pick-order="${o.id}">
                <td><strong>#${o.id}</strong><br/><small style="color:var(--text-muted);">${
                o.createdAt
              }</small></td>
                <td><strong>${o.clientName}</strong></td>
                <td>
                  <strong>${o.sublimationType}</strong><br/>
                  <small style="color:var(--text-muted);">${
                    o.totalQty
                  } pcs (${formatSizeSummary(o.sizes)})</small>
                </td>
                <td>
                  <strong>${formatPeso(o.totalAmount)}</strong><br/>
                  ${
                    bal === 0
                      ? `<span class="status-pill status-available">Paid in Full</span>`
                      : `<span class="status-pill status-out">Bal: ${formatPeso(
                          bal
                        )}</span>`
                  }
                </td>
                <td>
                  <span class="status-pill ${statusBadgeCls}">${formatStageEcommerce(
                o.stage
              )}</span>
                </td>
                <td>
                  <div class="qty-adjust-group" style="flex-wrap:wrap;">
                    <button type="button" class="btn ${
                      selected ? "btn-red" : "btn-light"
                    } btn-sm" data-select-order-btn="${o.id}">
                      ${selected ? "Active" : "Work on Order"}
                    </button>
                    ${
                      o.stage !== "Released" && o.stage !== "Cancelled"
                        ? `<button type="button" class="btn btn-danger-outline btn-sm" data-cancel-order="${o.id}">Cancel</button>`
                        : o.stage === "Cancelled"
                        ? `<button type="button" class="btn btn-light btn-sm" data-restore-order="${o.id}">Restore</button>`
                        : ""
                    }
                  </div>
                </td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:18px;">No orders match your filter or search.</td></tr>`;

    const assignedStaffName = order.assignedStaffId
      ? (ctx.state.staffMembers || []).find((s) => s.id === order.assignedStaffId)
          ?.fullName
      : undefined;

    container.innerHTML = `
      ${kpiHtml}
      ${renderActiveFulfillmentWorkspace(order, inlineErrorMsg, assignedStaffName)}

      <section class="module-card">
        <div class="module-top">
          <div>
            <h2>Order Fulfillment Queue</h2>
            <p class="module-subtitle">Click any order below to open it in the step-by-step workspace above.</p>
          </div>
          <div class="toolbar-group">
            <input
              type="search"
              id="wfSearchInput"
              class="toolbar-input"
              placeholder="Search order # or customer..."
              value="${searchQuery}"
            />
          </div>
        </div>

        <div class="toolbar-group" style="padding-bottom:4px;">
          <button type="button" class="btn ${
            statusFilter === "ALL" ? "btn-red" : "btn-light"
          } btn-sm" data-wf-filter="ALL">All (${orders.length})</button>
          <button type="button" class="btn ${
            statusFilter === "Order Received" ? "btn-red" : "btn-light"
          } btn-sm" data-wf-filter="Order Received">Step 1: Review (${step1Count})</button>
          <button type="button" class="btn ${
            statusFilter === "Production" ? "btn-red" : "btn-light"
          } btn-sm" data-wf-filter="Production">Step 2: Prepare (${step2Count})</button>
          <button type="button" class="btn ${
            statusFilter === "Quality Inspection" ? "btn-red" : "btn-light"
          } btn-sm" data-wf-filter="Quality Inspection">Step 3: Check (${step3Count})</button>
          <button type="button" class="btn ${
            statusFilter === "Ready for Release" ? "btn-red" : "btn-light"
          } btn-sm" data-wf-filter="Ready for Release">Step 4: Complete (${step4Count})</button>
          <button type="button" class="btn ${
            statusFilter === "Released" ? "btn-red" : "btn-light"
          } btn-sm" data-wf-filter="Released">Fulfilled (${fulfilledCount})</button>
          <button type="button" class="btn ${
            statusFilter === "Cancelled" ? "btn-red" : "btn-light"
          } btn-sm" data-wf-filter="Cancelled">Cancelled (${cancelledCount})</button>
        </div>

        <div class="table-scroll">
          <table class="clean-table orders-queue-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Order Details &amp; Sizes</th>
                <th>Total &amp; Payment</th>
                <th>Current Step</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${queueRows}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  container?.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "wfSearchInput") {
      searchQuery = (target as HTMLInputElement).value;
      render();
      restoreInputFocus("wfSearchInput");
    }
  });

  container?.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    const field = target.getAttribute("data-check-field");
    if (!field) return;
    const order = getSelectedOrder(ctx.state);
    if (!order) return;
    const checklist = getOrderChecklist(order);
    if (
      field === "designPrepared" ||
      field === "itemsProduced" ||
      field === "quantitiesVerified" ||
      field === "qualityChecked"
    ) {
      checklist[field] = target.checked;
      order.specsVerified =
        checklist.quantitiesVerified && checklist.qualityChecked;
      inlineErrorMsg = "";
      ctx.refreshAll();
    }
  });

  container?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    if (target.id === "wfCreateFirstOrderBtn") {
      ctx.navigateTo("pos-specs");
      return;
    }

    if (target.id === "wfOpenSalesBtn") {
      ctx.navigateTo("sales-logbook");
      return;
    }

    if (target.id === "wfGoPaymentProofsBtn") {
      ctx.navigateTo("payment-proofs", getSelectedOrder(ctx.state)?.id);
      return;
    }

    if (
      handleImagePreviewClick(
        target,
        ctx.openImagePreview,
        "Jersey Template",
        true,
        e
      )
    ) {
      return;
    }

    const filterBtn = target.closest("[data-wf-filter]") as HTMLElement | null;
    if (filterBtn) {
      statusFilter = filterBtn.getAttribute(
        "data-wf-filter"
      ) as FulfillmentFilter;
      render();
      return;
    }

    const openPosBtn = target.closest("[data-open-pos]") as HTMLElement | null;
    if (openPosBtn) {
      e.stopPropagation();
      ctx.navigateTo("pos-specs", openPosBtn.getAttribute("data-open-pos") || undefined);
      return;
    }

    // Step 1 -> Step 2
    if (target.id === "wfStep1ConfirmBtn") {
      const order = getSelectedOrder(ctx.state);
      if (!order) return;
      if (!order.clientName.trim() || order.totalQty <= 0) {
        inlineErrorMsg =
          "Order details are incomplete (missing customer name or jersey quantities). Edit the order first in Custom Orders & POS.";
        render();
        ctx.showToast(inlineErrorMsg);
        return;
      }
      const checklist = getOrderChecklist(order);
      checklist.orderReviewed = true;
      order.stage = "Production";
      inlineErrorMsg = "";
      syncCustomOrderInventory(ctx.state, order);
      appendAuditLog(
        ctx.state,
        "Fulfillment",
        `Step 1 completed: Reviewed Order #${order.id} (${order.clientName}) and moved to Step 2 – Prepare Order.`,
        { actionType: "order_update", relatedOrderId: order.id }
      );
      ctx.refreshAll();
      ctx.showToast(
        `Step 1 complete! Order #${order.id} moved to Step 2 – Prepare Order.`
      );
      return;
    }

    // Step 2 -> Step 3
    if (target.id === "wfStep2DoneBtn") {
      const order = getSelectedOrder(ctx.state);
      if (!order) return;
      const checklist = getOrderChecklist(order);
      if (!checklist.designPrepared || !checklist.itemsProduced) {
        const missing: string[] = [];
        if (!checklist.designPrepared)
          missing.push("Design Layout, Colorway & Print Setup");
        if (!checklist.itemsProduced)
          missing.push(`All ${order.totalQty} Ordered Pieces`);
        inlineErrorMsg = `Please complete all preparation tasks before checking the order. Remaining: ${missing.join(
          " and "
        )}.`;
        render();
        ctx.showToast("Complete all Step 2 preparation tasks first.");
        return;
      }
      order.stage = "Quality Inspection";
      inlineErrorMsg = "";
      syncCustomOrderInventory(ctx.state, order);
      appendAuditLog(
        ctx.state,
        "Fulfillment",
        `Step 2 completed: Prepared all ${order.totalQty} pcs for Order #${order.id} and moved to Step 3 – Check Order.`,
        { actionType: "order_update", relatedOrderId: order.id }
      );
      ctx.refreshAll();
      ctx.showToast(
        `Step 2 complete! Order #${order.id} moved to Step 3 – Check Order.`
      );
      return;
    }

    // Step 3 -> Step 4
    if (target.id === "wfStep3DoneBtn") {
      const order = getSelectedOrder(ctx.state);
      if (!order) return;
      const checklist = getOrderChecklist(order);
      if (!checklist.quantitiesVerified || !checklist.qualityChecked) {
        const missing: string[] = [];
        if (!checklist.quantitiesVerified)
          missing.push("Exact Quantities & Sizes");
        if (!checklist.qualityChecked)
          missing.push("Print Clarity, Colorway & Stitching Quality");
        inlineErrorMsg = `Please verify all required checks before proceeding to Step 4. Missing: ${missing.join(
          " and "
        )}.`;
        render();
        ctx.showToast("Complete both Step 3 verification checks first.");
        return;
      }
      order.specsVerified = true;
      order.stage = "Ready for Release";
      inlineErrorMsg = "";
      syncCustomOrderInventory(ctx.state, order);
      pushNotification(ctx.state, {
        title: `Order Ready for Release — Order #${order.id}`,
        message: `${order.clientName} (${order.totalQty} pcs) passed Quality Inspection and is ready for customer pickup/release.`,
        category: "Fulfillment",
        severity: "info",
        targetPage: "workflow",
        linkedOrderId: order.id,
      });
      appendAuditLog(
        ctx.state,
        "Fulfillment",
        `Step 3 completed: Verified quantities & quality for Order #${order.id}. Ready for Step 4 – Complete Fulfillment.`,
        { actionType: "order_update", relatedOrderId: order.id }
      );
      ctx.refreshAll();
      ctx.showToast(
        `Step 3 complete! Order #${order.id} is ready for Step 4 – Complete Fulfillment.`
      );
      return;
    }

    // Step 4 -> Fulfilled
    if (target.id === "wfConfirmReleaseBtn") {
      const order = getSelectedOrder(ctx.state);
      if (!order) return;
      const checklist = getOrderChecklist(order);
      const balance = Math.max(0, order.totalAmount - order.amountPaid);

      if (!order.clientName.trim() || order.totalQty <= 0) {
        inlineErrorMsg =
          "Cannot complete fulfillment: customer details or quantities are missing.";
        render();
        ctx.showToast(inlineErrorMsg);
        return;
      }
      if (!checklist.quantitiesVerified || !checklist.qualityChecked) {
        inlineErrorMsg =
          "Cannot complete fulfillment: Step 3 quantity and quality checks must be completed first.";
        render();
        ctx.showToast(inlineErrorMsg);
        return;
      }
      if (balance > 0) {
        inlineErrorMsg = `Cannot complete fulfillment yet: Order #${
          order.id
        } still has an unpaid balance of ${formatPeso(
          balance,
          true
        )}. Please verify buyer payment in Payment Proofs first.`;
        render();
        ctx.showToast(
          `Unpaid balance of ${formatPeso(
            balance
          )} must be verified before marking as fulfilled.`
        );
        return;
      }

      checklist.orderReviewed = true;
      order.specsVerified = true;
      order.stage = "Released";
      order.fulfilledAt = formatLogbookDateNow();
      inlineErrorMsg = "";
      syncCustomOrderInventory(ctx.state, order);

      pushNotification(ctx.state, {
        title: `Order Fulfilled — Order #${order.id}`,
        message: `${order.clientName} (${order.totalQty} pcs) completed all fulfillment steps and was released.`,
        category: "Fulfillment",
        severity: "success",
        targetPage: "workflow",
        linkedOrderId: order.id,
      });

      appendAuditLog(
        ctx.state,
        "Fulfillment",
        `Step 4 completed: Marked Order #${order.id} (${order.clientName}, ${order.totalQty} pcs) as Fulfilled.`,
        { actionType: "order_update", relatedOrderId: order.id }
      );
      ctx.refreshAll();
      ctx.showToast(
        `Success! Order #${order.id} (${order.clientName}) has been marked as Fulfilled.`
      );
      return;
    }

    const jumpBackBtn = target.closest(
      "[data-jump-back-stage]"
    ) as HTMLElement | null;
    if (jumpBackBtn) {
      const targetStage = jumpBackBtn.getAttribute(
        "data-jump-back-stage"
      ) as WorkflowStage;
      const order = getSelectedOrder(ctx.state);
      if (!order || !targetStage) return;
      order.stage = targetStage;
      inlineErrorMsg = "";
      syncCustomOrderInventory(ctx.state, order);
      ctx.refreshAll();
      ctx.showToast(
        `Returned Order #${order.id} to ${formatStageEcommerce(targetStage)}.`
      );
      return;
    }

    const cancelBtn = target.closest(
      "[data-cancel-order]"
    ) as HTMLElement | null;
    if (cancelBtn) {
      e.stopPropagation();
      const orderId = cancelBtn.getAttribute("data-cancel-order");
      const ord = ctx.state.orders.find((o) => o.id === orderId);
      if (!ord) return;
      ord.stage = "Cancelled";
      inlineErrorMsg = "";
      syncCustomOrderInventory(ctx.state, ord);
      appendAuditLog(
        ctx.state,
        "Fulfillment",
        `Cancelled Order #${ord.id} (${ord.clientName}).`,
        { actionType: "order_update", relatedOrderId: ord.id }
      );
      ctx.refreshAll();
      ctx.showToast(`Order #${ord.id} marked as Cancelled.`);
      return;
    }

    const restoreBtn = target.closest(
      "[data-restore-order]"
    ) as HTMLElement | null;
    if (restoreBtn) {
      e.stopPropagation();
      const orderId = restoreBtn.getAttribute("data-restore-order");
      const ord = ctx.state.orders.find((o) => o.id === orderId);
      if (!ord) return;
      ord.stage = "Order Received";
      inlineErrorMsg = "";
      ctx.state.selectedOrderId = ord.id;
      ctx.refreshAll();
      ctx.showToast(`Restored Order #${ord.id} to Step 1 – Review Order.`);
      return;
    }

    const pickBtn = target.closest(
      "[data-select-order-btn]"
    ) as HTMLElement | null;
    if (pickBtn) {
      e.stopPropagation();
      const id = pickBtn.getAttribute("data-select-order-btn");
      if (id) {
        ctx.state.selectedOrderId = id;
        inlineErrorMsg = "";
        ctx.refreshAll();
      }
      return;
    }

    const pickRow = target.closest("[data-pick-order]") as HTMLElement | null;
    if (pickRow) {
      const id = pickRow.getAttribute("data-pick-order");
      if (id) {
        ctx.state.selectedOrderId = id;
        inlineErrorMsg = "";
        ctx.refreshAll();
      }
    }
  });

  return { render };
}
