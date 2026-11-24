// ============================================================================
// JM MAKER SPORTSWEAR — GUIDED 4-STEP ORDER FULFILLMENT VIEW RENDERER
// Renders the sequential step progress bar and the contextual action card
// for Step 1 (Review), Step 2 (Prepare), Step 3 (Check), Step 4 (Complete),
// Fulfilled, and Cancelled order states.
// ============================================================================

import { WORKFLOW_STAGES } from "../../config/constants";
import { getOrderChecklist } from "../../store/systemStore";
import type {
  CustomOrder,
  SizeBreakdown,
  WorkflowStage,
} from "../../types/system.types";
import {
  formatPeso,
  formatSizeSummary,
  formatStageEcommerce,
} from "../../utils/formatters";

const STEP_META: Array<{
  stage: WorkflowStage;
  num: number;
  title: string;
  shortDesc: string;
}> = [
  {
    stage: "Order Received",
    num: 1,
    title: "Review Order",
    shortDesc: "Verify customer & items",
  },
  {
    stage: "Production",
    num: 2,
    title: "Prepare Order",
    shortDesc: "Track item preparation",
  },
  {
    stage: "Quality Inspection",
    num: 3,
    title: "Check Order",
    shortDesc: "Confirm qty & quality",
  },
  {
    stage: "Ready for Release",
    num: 4,
    title: "Complete Fulfillment",
    shortDesc: "Mark order fulfilled",
  },
];

function renderSizeBadges(sizes: SizeBreakdown): string {
  const entries = (Object.keys(sizes) as Array<keyof SizeBreakdown>)
    .filter((k) => Number(sizes[k]) > 0)
    .map(
      (k) =>
        `<span class="fulfill-size-chip">${k === "XXL" ? "XXL+" : k}: <strong>${
          sizes[k]
        }</strong></span>`
    );
  return entries.length > 0
    ? entries.join("")
    : `<span style="color:var(--brand-red);font-size:0.78rem;font-weight:600;">No sizes entered</span>`;
}

export function renderActiveFulfillmentWorkspace(
  order: CustomOrder,
  inlineErrorMsg: string
): string {
  const checklist = getOrderChecklist(order);
  const balance = Math.max(0, order.totalAmount - order.amountPaid);
  const isReleased = order.stage === "Released";
  const isCancelled = order.stage === "Cancelled";
  const stageIdx = isReleased
    ? WORKFLOW_STAGES.length
    : WORKFLOW_STAGES.indexOf(order.stage);

  const hasValidCustomer = order.clientName.trim().length >= 2;
  const hasValidItems = order.totalQty > 0 && order.totalAmount > 0;
  const prepDoneCount =
    (checklist.designPrepared ? 1 : 0) + (checklist.itemsProduced ? 1 : 0);
  const checkDoneCount =
    (checklist.quantitiesVerified ? 1 : 0) + (checklist.qualityChecked ? 1 : 0);

  const stepperHtml = STEP_META.map((step, idx) => {
    let stateClass = "fstep-pending";
    let statusBadge = "Pending";
    if (!isCancelled && idx < stageIdx) {
      stateClass = "fstep-done";
      statusBadge = "\u2713 Done";
    } else if (!isCancelled && idx === stageIdx && !isReleased) {
      stateClass = "fstep-current";
      statusBadge = "Current Step";
    }
    const canJumpBack = !isCancelled && !isReleased && idx < stageIdx;
    return `
      <button
        type="button"
        class="fstep-item ${stateClass}"
        ${canJumpBack ? `data-jump-back-stage="${step.stage}"` : "disabled"}
        title="${
          canJumpBack
            ? `Return to Step ${step.num}: ${step.title}`
            : `Step ${step.num}: ${step.title}`
        }"
      >
        <span class="fstep-num">${
          !isCancelled && idx < stageIdx ? "\u2713" : step.num
        }</span>
        <span class="fstep-copy">
          <strong>Step ${step.num} &ndash; ${step.title}</strong>
          <small>${step.shortDesc}</small>
        </span>
        <span class="fstep-pill">${statusBadge}</span>
      </button>
    `;
  }).join("");

  const errorBannerHtml = inlineErrorMsg
    ? `<div class="fulfill-alert fulfill-alert-error" role="alert">${inlineErrorMsg}</div>`
    : "";

  let stepBodyHtml = "";

  if (isCancelled) {
    stepBodyHtml = `
      <div class="fulfill-step-card">
        <div class="fulfill-alert fulfill-alert-error">
          <strong>Order #${order.id} (${order.clientName}) is Cancelled.</strong>
          Fulfillment actions are paused for cancelled orders. Restore this order to resume from Step 1.
        </div>
        <div class="fulfill-action-bar">
          <span class="fulfill-next-hint">Restoring sets the order back to <strong>Step 1 – Review Order</strong>.</span>
          <button type="button" class="btn btn-red btn-sm" data-restore-order="${order.id}">
            Restore to Step 1 (Review Order)
          </button>
        </div>
      </div>
    `;
  } else if (isReleased) {
    stepBodyHtml = `
      <div class="fulfill-step-card fulfill-complete-card">
        <div class="fulfill-success-banner">
          <span class="fulfill-success-icon" aria-hidden="true">&#10003;</span>
          <div>
            <h3>Fulfillment Completed — Order #${order.id} (${order.clientName})</h3>
            <p>
              All 4 steps are complete. ${order.totalQty} pcs of <strong>${
      order.sublimationType
    }</strong> have been verified, marked as fulfilled, and cleared from pending release inventory.${
      order.fulfilledAt ? ` Completed on ${order.fulfilledAt}.` : ""
    }
            </p>
          </div>
        </div>

        <div class="fulfill-info-grid">
          <div class="fulfill-info-cell">
            <span>Customer / Team</span>
            <strong>${order.clientName}</strong>
          </div>
          <div class="fulfill-info-cell">
            <span>Ordered Items</span>
            <strong>${order.sublimationType} (${order.totalQty} pcs)</strong>
          </div>
          <div class="fulfill-info-cell">
            <span>Size Breakdown</span>
            <div class="fulfill-size-row">${renderSizeBadges(order.sizes)}</div>
          </div>
          <div class="fulfill-info-cell">
            <span>Payment Status</span>
            <strong style="color:var(--green-text);">&#10003; Paid in Full (${formatPeso(
              order.totalAmount,
              true
            )})</strong>
          </div>
        </div>

        <div class="fulfill-action-bar">
          <span class="fulfill-next-hint">This order is now logged in Sales History and Sales Reports.</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-light btn-sm" data-open-pos="${order.id}">
              View Order Invoice &rarr;
            </button>
            <button type="button" class="btn btn-red btn-sm" id="wfOpenSalesBtn">
              View Sales History &rarr;
            </button>
          </div>
        </div>
      </div>
    `;
  } else if (order.stage === "Order Received") {
    stepBodyHtml = `
      <div class="fulfill-step-card">
        <div class="fulfill-step-head">
          <div>
            <span class="fulfill-step-kicker">STEP 1 OF 4 &bull; NEXT TASK</span>
            <h3>Review Order Details &amp; Requirements</h3>
            <p>Check the customer details, ordered items, sizes, design specifications, and payment status before starting preparation.</p>
          </div>
          <button type="button" class="btn btn-light btn-sm" data-open-pos="${order.id}">
            Edit Order Details
          </button>
        </div>

        ${errorBannerHtml}

        <div class="fulfill-info-grid">
          <div class="fulfill-info-cell">
            <span>Customer / Team Name</span>
            <strong>${
              hasValidCustomer
                ? order.clientName
                : `<span style="color:var(--brand-red);">Missing customer name</span>`
            }</strong>
          </div>
          <div class="fulfill-info-cell">
            <span>Apparel Package &amp; Quantity</span>
            <strong>${order.sublimationType} &bull; ${order.totalQty} pcs</strong>
          </div>
          <div class="fulfill-info-cell">
            <span>Colorway &amp; Print Specs</span>
            <strong>${order.colorway}</strong>
            <small style="color:var(--text-muted);display:block;">${order.printingOption}</small>
          </div>
          <div class="fulfill-info-cell">
            <span>Payment Status</span>
            <strong style="color:${
              balance === 0 ? "var(--green-text)" : "var(--brand-red)"
            };">${
      balance === 0
        ? `\u2713 Paid in Full (${formatPeso(order.totalAmount, true)})`
        : `Paid ${formatPeso(order.amountPaid)} of ${formatPeso(
            order.totalAmount
          )} (Bal: ${formatPeso(balance)})`
    }</strong>
          </div>
        </div>

        <div class="fulfill-info-grid" style="margin-top:8px;">
          <div class="fulfill-info-cell">
            <span>Ordered Size Breakdown (${order.totalQty} pcs total)</span>
            <div class="fulfill-size-row">${renderSizeBadges(order.sizes)}</div>
          </div>
          <div class="fulfill-info-cell">
            <span>Jersey Design Template</span>
            ${
              order.jerseyTemplateImage
                ? `<button type="button" class="proof-inline-chip" data-preview-src="${order.jerseyTemplateImage}" data-preview-title="Jersey Template — Order #${order.id}">
                    <img src="${order.jerseyTemplateImage}" alt="Template" />
                    <span>Preview Uploaded Template</span>
                  </button>`
                : `<span style="color:var(--text-muted);font-size:0.8rem;">No template image attached (optional — can be added in Custom Orders &amp; POS)</span>`
            }
          </div>
        </div>

        <div class="fulfill-action-bar">
          <span class="fulfill-next-hint">
            <strong>What happens next:</strong> Order moves to <strong>Step 2 – Prepare Order</strong> to track item preparation.
          </span>
          <button type="button" id="wfStep1ConfirmBtn" class="btn btn-red">
            &#10003; Confirm Review &amp; Start Preparing &rarr;
          </button>
        </div>
      </div>
    `;
  } else if (order.stage === "Production") {
    stepBodyHtml = `
      <div class="fulfill-step-card">
        <div class="fulfill-step-head">
          <div>
            <span class="fulfill-step-kicker">STEP 2 OF 4 &bull; NEXT TASK</span>
            <h3>Prepare Ordered Items (${order.totalQty} pcs)</h3>
            <p>Check off each preparation task below as you complete layout, printing, cutting, and sewing. Incomplete items remain clearly highlighted.</p>
          </div>
          <span class="module-tag ${
            prepDoneCount === 2 ? "tag-green" : "tag-amber"
          }">${prepDoneCount} / 2 Tasks Done</span>
        </div>

        ${errorBannerHtml}

        <div class="fulfill-items-summary">
          <div>
            <strong>Items to Prepare:</strong> ${order.sublimationType} (${
      order.colorway
    } &bull; ${order.printingOption})
          </div>
          <div class="fulfill-size-row">${renderSizeBadges(order.sizes)}</div>
        </div>

        <div class="fulfill-task-list">
          <label class="fulfill-task-item ${
            checklist.designPrepared ? "task-done" : "task-pending"
          }">
            <input type="checkbox" data-check-field="designPrepared" ${
              checklist.designPrepared ? "checked" : ""
            } />
            <div class="fulfill-task-text">
              <strong>Prepare Design Layout, Colorway &amp; Print Setup</strong>
              <span>Confirm ${order.colorway} &bull; ${order.printingOption}${
      order.jerseyTemplateImage ? " (using attached jersey template)" : ""
    }</span>
            </div>
            <span class="status-pill ${
              checklist.designPrepared ? "status-available" : "status-pending"
            }">${checklist.designPrepared ? "\u2713 Done" : "Pending"}</span>
          </label>

          <label class="fulfill-task-item ${
            checklist.itemsProduced ? "task-done" : "task-pending"
          }">
            <input type="checkbox" data-check-field="itemsProduced" ${
              checklist.itemsProduced ? "checked" : ""
            } />
            <div class="fulfill-task-text">
              <strong>Prepare All ${order.totalQty} Ordered Pieces</strong>
              <span>Sublimation printing, heat press, cutting, and sewing for sizes: ${formatSizeSummary(
                order.sizes
              )}</span>
            </div>
            <span class="status-pill ${
              checklist.itemsProduced ? "status-available" : "status-pending"
            }">${checklist.itemsProduced ? "\u2713 Done" : "Pending"}</span>
          </label>
        </div>

        <div class="fulfill-action-bar">
          <span class="fulfill-next-hint">
            <strong>What happens next:</strong> Order advances to <strong>Step 3 – Check Order</strong> for quantity &amp; quality inspection.
          </span>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-light btn-sm" data-jump-back-stage="Order Received">
              &larr; Back to Step 1
            </button>
            <button type="button" id="wfStep2DoneBtn" class="btn btn-red">
              &#10003; Preparation Done &mdash; Check Order &rarr;
            </button>
          </div>
        </div>
      </div>
    `;
  } else if (order.stage === "Quality Inspection") {
    stepBodyHtml = `
      <div class="fulfill-step-card">
        <div class="fulfill-step-head">
          <div>
            <span class="fulfill-step-kicker">STEP 3 OF 4 &bull; NEXT TASK</span>
            <h3>Check Prepared Items, Quantities &amp; Payment</h3>
            <p>Confirm every required check before marking this order ready for completion. Accidental advancement is blocked while checks are incomplete.</p>
          </div>
          <span class="module-tag ${
            checkDoneCount === 2 ? "tag-green" : "tag-amber"
          }">${checkDoneCount} / 2 Checks Verified</span>
        </div>

        ${errorBannerHtml}

        <div class="fulfill-task-list">
          <label class="fulfill-task-item ${
            checklist.quantitiesVerified ? "task-done" : "task-pending"
          }">
            <input type="checkbox" data-check-field="quantitiesVerified" ${
              checklist.quantitiesVerified ? "checked" : ""
            } />
            <div class="fulfill-task-text">
              <strong>Verify Exact Quantities &amp; Sizes (${order.totalQty} pcs)</strong>
              <span>Counted and matched size breakdown: ${formatSizeSummary(
                order.sizes
              )}</span>
            </div>
            <span class="status-pill ${
              checklist.quantitiesVerified
                ? "status-available"
                : "status-pending"
            }">${
      checklist.quantitiesVerified ? "\u2713 Verified" : "Pending"
    }</span>
          </label>

          <label class="fulfill-task-item ${
            checklist.qualityChecked ? "task-done" : "task-pending"
          }">
            <input type="checkbox" data-check-field="qualityChecked" ${
              checklist.qualityChecked ? "checked" : ""
            } />
            <div class="fulfill-task-text">
              <strong>Inspect Print Clarity, Colorway &amp; Stitching Quality</strong>
              <span>Verified ${order.sublimationType} (${order.colorway}) with no print defects or missing names/numbers</span>
            </div>
            <span class="status-pill ${
              checklist.qualityChecked ? "status-available" : "status-pending"
            }">${
      checklist.qualityChecked ? "\u2713 Verified" : "Pending"
    }</span>
          </label>

          <div class="fulfill-task-item ${
            balance === 0 ? "task-done" : "task-warn"
          }" style="cursor:default;">
            <div class="fulfill-task-text">
              <strong>Payment Verification Status</strong>
              <span>${
                balance === 0
                  ? `Order is fully paid (${formatPeso(
                      order.totalAmount,
                      true
                    )}) and cleared for final release.`
                  : `Remaining unpaid balance: ${formatPeso(
                      balance,
                      true
                    )}. Full payment must be verified before completing Step 4.`
              }</span>
            </div>
            ${
              balance === 0
                ? `<span class="status-pill status-available">&#10003; Paid in Full</span>`
                : `<button type="button" id="wfGoPaymentProofsBtn" class="btn btn-light btn-sm">Verify Payment &rarr;</button>`
            }
          </div>
        </div>

        <div class="fulfill-action-bar">
          <span class="fulfill-next-hint">
            <strong>What happens next:</strong> Order moves to <strong>Step 4 – Complete Fulfillment</strong> (Ready for Pickup).
          </span>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-light btn-sm" data-jump-back-stage="Production">
              &larr; Back to Step 2
            </button>
            <button type="button" id="wfStep3DoneBtn" class="btn btn-red">
              &#10003; Order Checked &mdash; Ready to Complete &rarr;
            </button>
          </div>
        </div>
      </div>
    `;
  } else {
    const allChecksReady =
      hasValidCustomer &&
      hasValidItems &&
      checklist.quantitiesVerified &&
      checklist.qualityChecked &&
      balance === 0;

    stepBodyHtml = `
      <div class="fulfill-step-card">
        <div class="fulfill-step-head">
          <div>
            <span class="fulfill-step-kicker">STEP 4 OF 4 &bull; FINAL ACTION</span>
            <h3>Complete &amp; Release Order #${order.id}</h3>
            <p>Review the final checklist below. When handed over to the customer, click <strong>Mark Order as Fulfilled</strong>.</p>
          </div>
          <span class="module-tag ${
            allChecksReady ? "tag-green" : "tag-red"
          }">${allChecksReady ? "Ready to Fulfill" : "Action Needed"}</span>
        </div>

        ${errorBannerHtml}

        <div class="fulfill-final-checklist">
          <div class="fulfill-final-pill ${
            checklist.orderReviewed ? "verify-ok" : "verify-warn"
          }">${
      checklist.orderReviewed ? "\u2713" : "!"
    } Step 1: Order Reviewed</div>
          <div class="fulfill-final-pill ${
            checklist.designPrepared && checklist.itemsProduced
              ? "verify-ok"
              : "verify-warn"
          }">${
      checklist.designPrepared && checklist.itemsProduced ? "\u2713" : "!"
    } Step 2: Items Prepared (${order.totalQty} pcs)</div>
          <div class="fulfill-final-pill ${
            checklist.quantitiesVerified && checklist.qualityChecked
              ? "verify-ok"
              : "verify-warn"
          }">${
      checklist.quantitiesVerified && checklist.qualityChecked ? "\u2713" : "!"
    } Step 3: Quantities &amp; Quality Checked</div>
          <div class="fulfill-final-pill ${
            balance === 0 ? "verify-ok" : "verify-warn"
          }">${
      balance === 0
        ? "\u2713 Payment: Paid in Full"
        : `! Payment Pending: Bal ${formatPeso(balance)}`
    }</div>
        </div>

        ${
          balance > 0
            ? `<div class="fulfill-alert fulfill-alert-error" style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <span><strong>Cannot complete fulfillment yet:</strong> Order #${
                  order.id
                } still has an unpaid balance of <strong>${formatPeso(
                balance,
                true
              )}</strong>. Verify buyer payment first.</span>
                <button type="button" id="wfGoPaymentProofsBtn" class="btn btn-red btn-sm">
                  Open Payment Proofs &rarr;
                </button>
              </div>`
            : ""
        }

        <div class="fulfill-action-bar">
          <span class="fulfill-next-hint">
            <strong>What happens next:</strong> Order status updates to <strong>Fulfilled</strong> and pending release stock is cleared.
          </span>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-light btn-sm" data-jump-back-stage="Quality Inspection">
              &larr; Back to Step 3
            </button>
            <button type="button" id="wfConfirmReleaseBtn" class="btn btn-red">
              &#10003; Mark Order as Fulfilled
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <section class="module-card">
      <div class="module-top">
        <div>
          <h2>Guided Fulfillment &mdash; Order #${order.id} (${
    order.clientName
  })</h2>
          <p class="module-subtitle">
            Follow Steps 1 to 4 in order. Complete the highlighted task below to advance this order.
          </p>
        </div>
        <span class="status-pill ${
          isReleased
            ? "status-available"
            : isCancelled
            ? "status-out"
            : "status-pending"
        }">Status: ${formatStageEcommerce(order.stage)}</span>
      </div>

      <div class="fulfill-stepper">${stepperHtml}</div>
      ${stepBodyHtml}
    </section>
  `;
}
