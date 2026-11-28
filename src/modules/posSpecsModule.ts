// ============================================================================
// JM MAKER SPORTSWEAR — CUSTOM ORDERS & POS MODULE
// Creates and customizes team sublimation orders with live auto-computed
// totals (+₱50 per XXL+), jersey template upload, invoice printing, and
// direct sync with Payment Proofs verification links.
// ============================================================================

import {
  ORDER_PACKAGE_OPTIONS,
  SUBLIMATION_PRICES,
  XXL_SURCHARGE_PER_PIECE,
} from "../config/constants";
import { getOwnerSession } from "../services/authService";
import { paymentAdapter } from "../services/paymentAdapter";
import { generateNextFourDigitOrderId } from "../services/paymentLinkService";
import { isPaymentLinkExpired } from "../services/paymentValidation";
import {
  appendAuditLog,
  appendLogbookEntry,
  createEmptyFulfillmentChecklist,
  getSelectedOrder,
  pushNotification,
  syncCustomOrderInventory,
} from "../store/systemStore";
import type { CustomOrder, SizeBreakdown } from "../types/system.types";
import { computeOrderTotals } from "../utils/calculations";
import { copyToClipboard, handleImagePreviewClick } from "../utils/dom";
import {
  formatPeso,
  formatSizeSummary,
  formatStageEcommerce,
} from "../utils/formatters";
import { compressImageFile } from "../utils/imageCompressor";
import { logError } from "../utils/logger";
import type { ModuleContext } from "./moduleTypes";

const LIVE_CALC_INPUT_IDS = new Set([
  "pSizeXS",
  "pSizeS",
  "pSizeM",
  "pSizeL",
  "pSizeXL",
  "pSizeXXL",
  "posSublimationSelect",
  "posDiscountInput",
  "posInitialPaidInput",
]);

export function initPosSpecsModule(ctx: ModuleContext): { render: () => void } {
  const container = document.getElementById("posSpecsPageContent");
  let formMode: "edit" | "create" = "create";
  let draftNewTemplateImg: string | undefined;
  let draftNewTemplateName: string | undefined;

  function render(): void {
    if (!container) return;
    const activeOrder = getSelectedOrder(ctx.state);
    if (!activeOrder) formMode = "create";

    const balance = activeOrder
      ? Math.max(0, activeOrder.totalAmount - activeOrder.amountPaid)
      : 0;

    const orderOptions =
      ctx.state.orders.length > 0
        ? ctx.state.orders
            .map(
              (o) =>
                `<option value="${o.id}" ${
                  activeOrder && o.id === activeOrder.id ? "selected" : ""
                }>Order #${o.id} — ${o.clientName} (${formatStageEcommerce(
                  o.stage
                )})</option>`
            )
            .join("")
        : `<option value="">No custom orders yet</option>`;

    const packageList = [...ORDER_PACKAGE_OPTIONS];
    if (
      formMode === "edit" &&
      activeOrder &&
      !packageList.some((p) => p.label === activeOrder.sublimationType)
    ) {
      packageList.unshift({
        label: activeOrder.sublimationType,
        price: activeOrder.unitPrice,
      });
    }

    const subOptions = packageList
      .map(({ label, price }) => {
        const selected =
          formMode === "edit" &&
          activeOrder &&
          activeOrder.sublimationType === label
            ? "selected"
            : "";
        return `<option value="${label}" ${selected}>${label} — ${formatPeso(
          price
        )}/pc</option>`;
      })
      .join("");

    const s: SizeBreakdown =
      formMode === "create" || !activeOrder
        ? { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 }
        : activeOrder.sizes;

    const currentUnitPrice =
      formMode === "create" || !activeOrder
        ? ORDER_PACKAGE_OPTIONS[0].price
        : SUBLIMATION_PRICES[activeOrder.sublimationType] ||
          activeOrder.unitPrice;
    const currentDiscount =
      formMode === "create" || !activeOrder
        ? 0
        : Math.max(0, Number(activeOrder.discountAmount) || 0);
    const computed = computeOrderTotals(s, currentUnitPrice, currentDiscount);

    const activeStaffList = (ctx.state.staffMembers || []).filter(
      (st) => st.accountStatus === "Active"
    );
    const assignedStaffObj = activeOrder?.assignedStaffId
      ? (ctx.state.staffMembers || []).find(
          (st) => st.id === activeOrder.assignedStaffId
        )
      : undefined;
    const staffAssignOptions = activeStaffList
      .map((st) => {
        const selected =
          formMode === "edit" && activeOrder?.assignedStaffId === st.id
            ? "selected"
            : "";
        return `<option value="${st.id}" ${selected}>${st.fullName} — ${st.positionTitle}</option>`;
      })
      .join("");

    const currentTemplateImg =
      formMode === "create" || !activeOrder
        ? draftNewTemplateImg
        : activeOrder.jerseyTemplateImage;
    const currentTemplateName =
      formMode === "create" || !activeOrder
        ? draftNewTemplateName
        : activeOrder.jerseyTemplateName;

    const latestOrderPayment = activeOrder
      ? ctx.state.salesLogbook.find(
          (entry) => entry.orderId === `#${activeOrder.id}`
        )
      : undefined;
    const activeOrderLink = activeOrder
      ? (ctx.state.paymentVerificationLinks || []).find(
          (l) =>
            l.orderId === activeOrder.id &&
            l.status !== "Revoked" &&
            !isPaymentLinkExpired(l)
        )
      : undefined;
    const pendingProofForOrder = activeOrder
      ? (ctx.state.paymentProofSubmissions || []).find(
          (sub) =>
            sub.orderId === activeOrder.id &&
            sub.status === "Pending Verification"
        )
      : undefined;

    const displayAutoTotal = computed.totalAmount;
    const displayPaid =
      formMode === "create" || !activeOrder ? 0 : activeOrder.amountPaid;
    const displayProjectedBalance = Math.max(0, displayAutoTotal - displayPaid);
    const xxlSurcharge = s.XXL * XXL_SURCHARGE_PER_PIECE;
    const liveFormulaText = `${computed.totalQty} pcs \u00D7 ${formatPeso(
      currentUnitPrice
    )}${
      xxlSurcharge > 0 ? ` + ${s.XXL} XXL+ (${formatPeso(xxlSurcharge)})` : ""
    }${
      computed.discountAmount > 0
        ? ` \u2212 Discount (${formatPeso(computed.discountAmount)})`
        : ""
    } = ${formatPeso(displayAutoTotal, true)}`;

    const rightPanelHtml = activeOrder
      ? `<section class="module-card">
          <div class="module-top">
            <h2>Checkout &amp; Payment Confirmation</h2>
            <span class="module-tag ${
              balance === 0 ? "tag-green" : "tag-red"
            }">${balance === 0 ? "Paid in Full" : "Balance Due"}</span>
          </div>

          <div class="spec-body">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <p class="spec-client">Order <strong>#${activeOrder.id} — ${
          activeOrder.clientName
        }</strong></p>
              ${
                activeOrder.jerseyTemplateImage
                  ? `<button type="button" class="proof-inline-chip" data-preview-src="${activeOrder.jerseyTemplateImage}" data-preview-title="Jersey Template — Order #${activeOrder.id}">
                      <img src="${activeOrder.jerseyTemplateImage}" alt="Template" />
                      <span>Jersey Template</span>
                    </button>`
                  : ""
              }
            </div>
            <p class="spec-detail">${activeOrder.sublimationType} &bull; ${
          activeOrder.totalQty
        } pcs (${formatSizeSummary(activeOrder.sizes)})</p>
            <p class="spec-subdetail">${activeOrder.colorway} &bull; ${
          activeOrder.printingOption
        }${
          activeOrder.clientContact
            ? ` &bull; Contact: <strong>${activeOrder.clientContact}</strong>`
            : ""
        }${
          assignedStaffObj
            ? ` &bull; Assigned: <strong>${assignedStaffObj.fullName}</strong>`
            : ""
        }</p>

            <div class="pos-billing-box">
              <div>
                <span class="billing-caption">Order Total &amp; Remaining Balance</span>
                <div class="billing-figures">
                  <strong class="total-figure">${formatPeso(
                    activeOrder.totalAmount
                  )}</strong>
                  <span class="balance-figure ${
                    balance === 0 ? "paid-clear" : ""
                  }">
                    ${
                      balance === 0
                        ? "Paid in Full"
                        : `Balance: ${formatPeso(balance)}`
                    }
                  </span>
                </div>
                <span style="font-size:0.77rem;color:var(--text-secondary);">Paid so far: <strong>${formatPeso(
                  activeOrder.amountPaid
                )}</strong>${
          (activeOrder.discountAmount || 0) > 0
            ? ` &bull; Discount applied: <strong>${formatPeso(
                activeOrder.discountAmount || 0
              )}</strong>`
            : ""
        }</span>
              </div>
              <button type="button" id="posPrintReceiptBtn" class="btn btn-receipt">
                Print Invoice
              </button>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 12px;margin-bottom:12px;border-radius:8px;background:var(--bg-card);border:1px solid ${
              pendingProofForOrder
                ? "var(--brand-red-border)"
                : "var(--border-color)"
            };font-size:0.79rem;">
              <div style="display:flex;flex-direction:column;gap:2px;">
                <strong style="color:var(--text-primary);">Buyer Payment Verification Link</strong>
                <span style="color:var(--text-muted);font-size:0.75rem;">
                  ${
                    pendingProofForOrder
                      ? `<span style="color:var(--brand-red);font-weight:700;">Pending Proof ${pendingProofForOrder.submissionCode}</span> (Ref: ${pendingProofForOrder.referenceNumber}) awaiting your approval`
                      : activeOrderLink
                      ? `Active direct link ready for <strong>${
                          activeOrder.clientName
                        }</strong> (${formatPeso(
                          activeOrderLink.expectedAmount,
                          true
                        )})`
                      : balance > 0
                      ? `Generate a direct upload link for <strong>${activeOrder.clientName}</strong> (no buyer login needed)`
                      : "Order is paid in full — manage payment proofs in Payment Proofs"
                  }
                </span>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${
                  pendingProofForOrder
                    ? `<button type="button" id="posGoPaymentProofsBtn" class="btn btn-red btn-sm">Review &amp; Approve &rarr;</button>`
                    : activeOrderLink
                    ? `<button type="button" id="posQuickCopyLinkBtn" data-copy-order-token="${activeOrderLink.token}" class="btn btn-red btn-sm">Copy Buyer Link</button>
                       <button type="button" id="posGoPaymentProofsBtn" class="btn btn-light btn-sm">Payment Proofs &rarr;</button>`
                    : balance > 0
                    ? `<button type="button" id="posQuickGenerateLinkBtn" class="btn btn-red btn-sm">+ Send Proof Link</button>
                       <button type="button" id="posGoPaymentProofsBtn" class="btn btn-light btn-sm">Payment Proofs &rarr;</button>`
                    : `<button type="button" id="posGoPaymentProofsBtn" class="btn btn-light btn-sm">Payment Proofs &rarr;</button>`
                }
              </div>
            </div>

            ${
              latestOrderPayment
                ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 12px;margin-bottom:10px;background:var(--bg-subtle);border:1px solid var(--border-color);border-radius:8px;font-size:0.79rem;">
                    <span>Latest Payment: <strong>${formatPeso(
                      latestOrderPayment.amountPaid,
                      true
                    )}</strong> via <strong>${
                    latestOrderPayment.paymentMethod || "Cash"
                  }</strong>${
                    latestOrderPayment.referenceNumber
                      ? ` (Ref: <code>${latestOrderPayment.referenceNumber}</code>)`
                      : ""
                  }</span>
                    ${
                      latestOrderPayment.paymentProofImage
                        ? `<button type="button" class="proof-inline-chip" data-preview-src="${latestOrderPayment.paymentProofImage}" data-preview-title="Payment Proof — ${latestOrderPayment.logNo}">
                            <img src="${latestOrderPayment.paymentProofImage}" alt="Proof" />
                            <span>View Proof</span>
                          </button>`
                        : ""
                    }
                  </div>`
                : `<p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;">
                    No payment recorded yet for Order #${activeOrder.id}. Send a Payment Verification Link above or review proofs in <strong>Payment Proofs</strong>.
                  </p>`
            }

            <div class="module-footer-actions">
              <button type="button" class="btn btn-light btn-sm" id="posOpenFulfillmentBtn">
                Open Order Fulfillment &rarr;
              </button>
              <button type="button" class="btn btn-light btn-sm" id="posOpenLogbookBtn">
                Sales History &rarr;
              </button>
            </div>
          </div>
        </section>`
      : `<section class="module-card">
          <div class="module-top">
            <h2>Checkout &amp; Order Summary</h2>
            <span class="module-tag tag-blue">No Active Order</span>
          </div>
          <div class="empty-state-panel">
            <p class="empty-state-title">No custom order selected yet</p>
            <p class="empty-state-desc">
              Fill out the form on the left with customer details and jersey sizes, then click <strong>Place Custom Order</strong>. Once created, you can print the invoice, send a buyer payment verification link, and track fulfillment.
            </p>
          </div>
        </section>`;

    container.innerHTML = `
      <div class="page-toolbar">
        <div class="toolbar-group">
          <label for="posOrderPicker">Active Order:</label>
          <select id="posOrderPicker" class="toolbar-select" ${
            ctx.state.orders.length === 0 ? "disabled" : ""
          }>${orderOptions}</select>
        </div>
        <div class="toolbar-group">
          ${
            activeOrder
              ? `<button type="button" id="posSwitchEditBtn" class="btn ${
                  formMode === "edit" ? "btn-red" : "btn-light"
                } btn-sm">
                  Edit Order #${activeOrder.id}
                </button>`
              : ""
          }
          <button type="button" id="posSwitchCreateBtn" class="btn ${
            formMode === "create" ? "btn-red" : "btn-light"
          } btn-sm">
            + New Custom Order
          </button>
        </div>
      </div>

      <div class="control-grid">
        <section class="module-card">
          <div class="module-top">
            <h2>${
              formMode === "create" || !activeOrder
                ? "Create Custom Jersey Order"
                : `Customize Order #${activeOrder.id}`
            }</h2>
            <span class="module-tag tag-red">${
              formMode === "create" || !activeOrder
                ? "New Order"
                : activeOrder.clientName
            }</span>
          </div>

          <form id="posSpecsEditorForm" novalidate>
            <div class="form-grid-2">
              <div class="field">
                <label for="posClientInput">Customer / Team Name</label>
                <input type="text" id="posClientInput" value="${
                  formMode === "create" || !activeOrder
                    ? ""
                    : activeOrder.clientName
                }" placeholder="Enter customer or team name" required />
              </div>
              <div class="field">
                <label for="posClientContactInput">Customer Contact (Phone / Messenger)</label>
                <input type="text" id="posClientContactInput" value="${
                  formMode === "create" || !activeOrder
                    ? ""
                    : activeOrder.clientContact || ""
                }" placeholder="e.g., 0917-123-4567 or FB Name" />
              </div>
            </div>

            <div class="form-grid-2">
              <div class="field">
                <label for="posSublimationSelect">Apparel Package</label>
                <select id="posSublimationSelect">${subOptions}</select>
              </div>
              <div class="field">
                <label for="posAssignedStaffSelect">Assigned Staff (Optional)</label>
                <select id="posAssignedStaffSelect">
                  <option value="">— Owner / Unassigned —</option>
                  ${staffAssignOptions}
                </select>
              </div>
            </div>

            <div class="form-grid-2">
              <div class="field">
                <label for="posColorwayInput">Colorway / Design Theme</label>
                <input type="text" id="posColorwayInput" value="${
                  formMode === "create" || !activeOrder
                    ? ""
                    : activeOrder.colorway
                }" placeholder="e.g., Red / Black" />
              </div>
              <div class="field">
                <label for="posPrintingInput">Print &amp; Personalization</label>
                <input type="text" id="posPrintingInput" value="${
                  formMode === "create" || !activeOrder
                    ? ""
                    : activeOrder.printingOption
                }" placeholder="e.g., Team Logo + Name &amp; Number" />
              </div>
            </div>

            <input type="file" id="posTemplateFileInput" accept="image/*" hidden />
            <div class="upload-box">
              <div class="upload-box-info">
                ${
                  currentTemplateImg
                    ? `<img src="${currentTemplateImg}" alt="Jersey Template" class="upload-thumb" data-preview-src="${currentTemplateImg}" data-preview-title="Jersey Design Template — ${
                        formMode === "create" || !activeOrder
                          ? "New Order"
                          : `Order #${activeOrder.id}`
                      }" />`
                    : `<div class="upload-placeholder-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path>
                        </svg>
                      </div>`
                }
                <div class="upload-meta">
                  <span class="upload-title">Jersey Design Template</span>
                  <span class="upload-sub">${
                    currentTemplateImg
                      ? currentTemplateName || "Jersey template attached"
                      : "Upload client's jersey layout or mockup image"
                  }</span>
                </div>
              </div>
              <div class="upload-actions">
                ${
                  currentTemplateImg
                    ? `<button type="button" class="btn btn-light btn-sm" data-preview-src="${currentTemplateImg}" data-preview-title="Jersey Design Template">View</button>
                       <button type="button" class="btn btn-light btn-sm" id="posTriggerTemplateBtn">Replace</button>
                       <button type="button" class="btn btn-danger-outline btn-sm" id="posRemoveTemplateBtn">Remove</button>`
                    : `<button type="button" class="btn btn-light btn-sm" id="posTriggerTemplateBtn">+ Upload Template</button>`
                }
              </div>
            </div>

            <div class="size-matrix-box">
              <span class="matrix-title">Size Breakdown (XS – XXL+)</span>
              <div class="size-grid">
                <div class="field"><label>XS</label><input type="number" id="pSizeXS" min="0" value="${s.XS}" /></div>
                <div class="field"><label>S</label><input type="number" id="pSizeS" min="0" value="${s.S}" /></div>
                <div class="field"><label>M</label><input type="number" id="pSizeM" min="0" value="${s.M}" /></div>
                <div class="field"><label>L</label><input type="number" id="pSizeL" min="0" value="${s.L}" /></div>
                <div class="field"><label>XL</label><input type="number" id="pSizeXL" min="0" value="${s.XL}" /></div>
                <div class="field"><label>XXL+ (+\u20B150)</label><input type="number" id="pSizeXXL" min="0" value="${s.XXL}" /></div>
              </div>
            </div>

            <div class="form-grid-3">
              <div class="field">
                <label for="posDiscountInput">Discount (\u20B1)</label>
                <input type="number" id="posDiscountInput" min="0" step="10" value="${currentDiscount}" placeholder="0" />
              </div>
              <div class="field">
                <label for="posAutoTotalInput">Net Order Total (\u20B1)</label>
                <input type="number" id="posAutoTotalInput" value="${displayAutoTotal}" readonly style="font-weight:700;color:var(--brand-red);" />
              </div>
              <div class="field">
                <label for="posInitialPaidInput">${
                  formMode === "create" || !activeOrder
                    ? "Initial Cash Deposit (\u20B1)"
                    : "Amount Paid (\u20B1)"
                }</label>
                <input type="number" id="posInitialPaidInput" min="0" value="${displayPaid}" ${
      formMode === "edit" && activeOrder ? "readonly" : ""
    } />
              </div>
            </div>

            <div
              id="posLiveCalcSummary"
              style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:9px 12px;margin-bottom:12px;border-radius:8px;background:var(--bg-subtle);border:1px solid var(--border-color);font-size:0.79rem;"
            >
              <span>
                <strong>Auto-Calculation:</strong>
                <span id="posLiveFormulaText" style="color:var(--text-secondary);">${liveFormulaText}</span>
              </span>
              <span id="posLiveBalanceText" style="font-weight:700;color:${
                displayAutoTotal > 0 && displayProjectedBalance === 0
                  ? "var(--green-text)"
                  : "var(--brand-red)"
              };">
                ${
                  displayAutoTotal === 0
                    ? "Enter sizes to calculate"
                    : displayProjectedBalance === 0
                    ? "Paid in Full"
                    : `Remaining Balance: ${formatPeso(
                        displayProjectedBalance,
                        true
                      )}`
                }
              </span>
            </div>

            <div class="module-footer-actions">
              <button type="submit" class="btn btn-red">
                ${
                  formMode === "create" || !activeOrder
                    ? "Place Custom Order"
                    : "Save Order Changes"
                }
              </button>
            </div>
          </form>
        </section>

        ${rightPanelHtml}
      </div>
    `;
  }

  function readSizeInputs(): SizeBreakdown {
    const num = (id: string) =>
      Math.max(
        0,
        Number(
          (document.getElementById(id) as HTMLInputElement | null)?.value
        ) || 0
      );
    return {
      XS: num("pSizeXS"),
      S: num("pSizeS"),
      M: num("pSizeM"),
      L: num("pSizeL"),
      XL: num("pSizeXL"),
      XXL: num("pSizeXXL"),
    };
  }

  function updateLiveOrderComputation(): void {
    const subSelect = document.getElementById(
      "posSublimationSelect"
    ) as HTMLSelectElement | null;
    const discountInput = document.getElementById(
      "posDiscountInput"
    ) as HTMLInputElement | null;
    const totalInput = document.getElementById(
      "posAutoTotalInput"
    ) as HTMLInputElement | null;
    const paidInput = document.getElementById(
      "posInitialPaidInput"
    ) as HTMLInputElement | null;
    const formulaEl = document.getElementById("posLiveFormulaText");
    const balanceEl = document.getElementById("posLiveBalanceText");
    if (!subSelect || !totalInput) return;

    const sizes = readSizeInputs();
    const unitPrice = SUBLIMATION_PRICES[subSelect.value] || 800;
    const rawDiscount = Math.max(0, Number(discountInput?.value) || 0);
    const { totalQty, discountAmount, totalAmount } = computeOrderTotals(
      sizes,
      unitPrice,
      rawDiscount
    );
    totalInput.value = String(totalAmount);

    const paid = Math.max(0, Number(paidInput?.value) || 0);
    const projectedBalance = Math.max(0, totalAmount - paid);
    const xxlExtra = sizes.XXL * XXL_SURCHARGE_PER_PIECE;

    if (formulaEl) {
      formulaEl.textContent = `${totalQty} pcs \u00D7 ${formatPeso(
        unitPrice
      )}${
        xxlExtra > 0 ? ` + ${sizes.XXL} XXL+ (${formatPeso(xxlExtra)})` : ""
      }${
        discountAmount > 0
          ? ` \u2212 Discount (${formatPeso(discountAmount)})`
          : ""
      } = ${formatPeso(totalAmount, true)}`;
    }
    if (balanceEl) {
      if (totalAmount === 0) {
        balanceEl.textContent = "Enter sizes to calculate";
        balanceEl.style.color = "var(--text-muted)";
      } else {
        balanceEl.textContent =
          projectedBalance === 0
            ? "Paid in Full"
            : `Remaining Balance: ${formatPeso(projectedBalance, true)}`;
        balanceEl.style.color =
          projectedBalance === 0 ? "var(--green-text)" : "var(--brand-red)";
      }
    }
  }

  container?.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (LIVE_CALC_INPUT_IDS.has(target.id)) {
      updateLiveOrderComputation();
    }
  });

  container?.addEventListener("change", async (e) => {
    const target = e.target as HTMLElement;
    if (LIVE_CALC_INPUT_IDS.has(target.id)) {
      updateLiveOrderComputation();
      return;
    }

    if (target.id === "posOrderPicker") {
      ctx.state.selectedOrderId = (target as HTMLSelectElement).value;
      formMode = "edit";
      ctx.refreshAll();
      return;
    }

    if (target.id === "posTemplateFileInput") {
      const file = (target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const compressed = await compressImageFile(file, 900, 0.8);
        const order = getSelectedOrder(ctx.state);
        if (formMode === "create" || !order) {
          draftNewTemplateImg = compressed;
          draftNewTemplateName = file.name;
          render();
          ctx.showToast(`Attached jersey template "${file.name}".`);
        } else {
          order.jerseyTemplateImage = compressed;
          order.jerseyTemplateName = file.name;
          appendAuditLog(
            ctx.state,
            "Orders",
            `Uploaded jersey design template "${file.name}" for Order #${order.id}.`
          );
          ctx.refreshAll();
          ctx.showToast(
            `Uploaded jersey template for Order #${order.id} (${order.clientName}).`
          );
        }
      } catch (err) {
        logError("PosSpecsModule", "Failed to compress jersey template image.", err);
        ctx.showToast("Could not process image file. Please try another photo.");
      }
    }
  });

  container?.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;

    if (handleImagePreviewClick(target, ctx.openImagePreview)) return;

    if (target.id === "posTriggerTemplateBtn") {
      (
        document.getElementById("posTemplateFileInput") as HTMLInputElement | null
      )?.click();
      return;
    }

    if (target.id === "posRemoveTemplateBtn") {
      const order = getSelectedOrder(ctx.state);
      if (formMode === "create" || !order) {
        draftNewTemplateImg = undefined;
        draftNewTemplateName = undefined;
        render();
      } else {
        order.jerseyTemplateImage = undefined;
        order.jerseyTemplateName = undefined;
        ctx.refreshAll();
        ctx.showToast(`Removed jersey template from Order #${order.id}.`);
      }
      return;
    }

    if (target.id === "posGoPaymentProofsBtn") {
      ctx.navigateTo("payment-proofs", getSelectedOrder(ctx.state)?.id);
      return;
    }

    if (target.id === "posOpenFulfillmentBtn") {
      ctx.navigateTo("workflow", getSelectedOrder(ctx.state)?.id);
      return;
    }

    if (target.id === "posQuickGenerateLinkBtn") {
      const order = getSelectedOrder(ctx.state);
      if (!order) return;
      const remaining = Math.max(0, order.totalAmount - order.amountPaid);
      const res = paymentAdapter.createVerificationLink(
        ctx.state,
        getOwnerSession(),
        {
          orderId: order.id,
          buyerName: order.clientName,
          expectedAmount: remaining > 0 ? remaining : order.totalAmount,
          expiresInDays: 7,
        }
      );
      if (!res.success || !res.data) {
        ctx.showToast(res.error || "Could not generate payment link.");
        return;
      }
      const shareUrl = paymentAdapter.buildVerificationUrl(res.data.token);
      await copyToClipboard(shareUrl);
      ctx.refreshAll();
      ctx.showToast(
        `Generated & copied buyer payment link for Order #${order.id} (${order.clientName})!`
      );
      return;
    }

    const quickCopyBtn = target.closest(
      "[data-copy-order-token]"
    ) as HTMLElement | null;
    if (quickCopyBtn) {
      const token = quickCopyBtn.getAttribute("data-copy-order-token") || "";
      if (token) {
        await copyToClipboard(paymentAdapter.buildVerificationUrl(token));
        ctx.showToast("Buyer payment verification link copied to clipboard!");
      }
      return;
    }

    if (target.id === "posSwitchEditBtn") {
      if (getSelectedOrder(ctx.state)) {
        formMode = "edit";
        render();
      }
    } else if (target.id === "posSwitchCreateBtn") {
      formMode = "create";
      render();
    } else if (target.id === "posOpenLogbookBtn") {
      ctx.navigateTo("sales-logbook");
    } else if (target.id === "posPrintReceiptBtn") {
      const order = getSelectedOrder(ctx.state);
      if (!order) return;
      const bal = Math.max(0, order.totalAmount - order.amountPaid);
      const disc = Math.max(0, Number(order.discountAmount) || 0);
      const grossSubtotal = order.totalAmount + disc;
      appendAuditLog(
        ctx.state,
        "Checkout",
        `Printed order invoice for Order #${order.id} (${order.clientName}).`,
        { actionType: "payment", relatedOrderId: order.id }
      );
      ctx.refreshAll();
      ctx.printHtml(`
        <div class="print-box">
          <div class="print-header">
            <h2>JM MAKER SPORTSWEAR</h2>
            <p>Official Order Invoice &amp; Payment Receipt</p>
          </div>
          <p><strong>Order ID:</strong> #${order.id}</p>
          <p><strong>Customer:</strong> ${order.clientName}</p>
          ${
            order.clientContact
              ? `<p><strong>Contact Info:</strong> ${order.clientContact}</p>`
              : ""
          }
          <p><strong>Date Issued:</strong> ${new Date().toLocaleString()}</p>
          <table class="print-table">
            <thead>
              <tr><th>Item &amp; Customization</th><th>Sizes</th><th>Qty</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>${order.sublimationType}<br/><small>${order.colorway} &bull; ${
        order.printingOption
      }</small></td>
                <td>${formatSizeSummary(order.sizes)}</td>
                <td>${order.totalQty} pcs</td>
                <td>${formatPeso(grossSubtotal, true)}</td>
              </tr>
            </tbody>
          </table>
          ${
            disc > 0
              ? `<p><strong>Discount Applied:</strong> &minus;${formatPeso(
                  disc,
                  true
                )}</p>`
              : ""
          }
          <p><strong>Net Order Total:</strong> ${formatPeso(
            order.totalAmount,
            true
          )}</p>
          <p><strong>Amount Paid:</strong> ${formatPeso(
            order.amountPaid,
            true
          )}</p>
          <p><strong>Balance Due:</strong> ${formatPeso(bal, true)}</p>
        </div>
      `);
    }
  });

  container?.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (form.id !== "posSpecsEditorForm") return;
    e.preventDefault();

    const clientName = (
      document.getElementById("posClientInput") as HTMLInputElement
    ).value.trim();
    const clientContact = (
      (document.getElementById("posClientContactInput") as HTMLInputElement | null)
        ?.value || ""
    ).trim();
    const sublimationType = (
      document.getElementById("posSublimationSelect") as HTMLSelectElement
    ).value;
    const assignedStaffId =
      (document.getElementById("posAssignedStaffSelect") as HTMLSelectElement | null)
        ?.value || undefined;
    const colorway =
      (
        document.getElementById("posColorwayInput") as HTMLInputElement
      ).value.trim() || "Standard Colorway";
    const printingOption =
      (
        document.getElementById("posPrintingInput") as HTMLInputElement
      ).value.trim() || "Full Sublimation";
    const rawDiscount = Math.max(
      0,
      Number(
        (document.getElementById("posDiscountInput") as HTMLInputElement | null)
          ?.value
      ) || 0
    );
    const sizes = readSizeInputs();
    const unitPrice = SUBLIMATION_PRICES[sublimationType] || 800;
    const computed = computeOrderTotals(sizes, unitPrice, rawDiscount);

    if (!clientName || computed.totalQty <= 0) {
      ctx.showToast(
        "Please enter a Customer / Team Name and at least 1 jersey size."
      );
      return;
    }

    const activeOrder = getSelectedOrder(ctx.state);
    if (formMode === "create" || !activeOrder) {
      const nextId = generateNextFourDigitOrderId(ctx.state);
      const downpayment = Math.min(
        computed.totalAmount,
        Math.max(
          0,
          Number(
            (
              document.getElementById(
                "posInitialPaidInput"
              ) as HTMLInputElement
            ).value
          ) || 0
        )
      );
      const newOrder: CustomOrder = {
        id: nextId,
        clientName,
        clientContact,
        sublimationType,
        colorway,
        printingOption,
        unitPrice,
        sizes,
        totalQty: computed.totalQty,
        discountAmount: computed.discountAmount,
        totalAmount: computed.totalAmount,
        amountPaid: downpayment,
        stage: "Order Received",
        specsVerified: false,
        fulfillmentChecklist: createEmptyFulfillmentChecklist(),
        assignedStaffId,
        createdAt: new Date().toISOString().slice(0, 10),
        jerseyTemplateImage: draftNewTemplateImg,
        jerseyTemplateName: draftNewTemplateName,
      };
      ctx.state.orders.unshift(newOrder);
      ctx.state.selectedOrderId = newOrder.id;
      draftNewTemplateImg = undefined;
      draftNewTemplateName = undefined;

      if (downpayment > 0) {
        const bal = Math.max(0, newOrder.totalAmount - downpayment);
        appendLogbookEntry(ctx.state, {
          orderId: `#${newOrder.id}`,
          clientName: newOrder.clientName,
          particulars: `${newOrder.sublimationType} (${formatSizeSummary(
            newOrder.sizes
          )})`,
          qty: newOrder.totalQty,
          unitPrice: newOrder.unitPrice,
          paymentType: bal === 0 ? "Full Payment" : "Downpayment",
          paymentMethod: "Cash",
          amountPaid: downpayment,
          balanceRemaining: bal,
          remarks:
            computed.discountAmount > 0
              ? `Initial cash deposit (Discount: ${formatPeso(
                  computed.discountAmount
                )})`
              : "Initial cash deposit on order creation",
        });
      }

      pushNotification(ctx.state, {
        title: `New Order Placed — Order #${newOrder.id}`,
        message: `${newOrder.clientName} (${newOrder.totalQty} pcs) is ready for Step 1: Review Order.`,
        category: "Orders & Payments",
        severity: "info",
        targetPage: "workflow",
        linkedOrderId: newOrder.id,
      });

      appendAuditLog(
        ctx.state,
        "Orders",
        `Created Order #${newOrder.id} (${newOrder.clientName}) — ${
          newOrder.totalQty
        } pcs, Net Total: ${formatPeso(newOrder.totalAmount, true)}${
          computed.discountAmount > 0
            ? ` (Discount: ${formatPeso(computed.discountAmount)})`
            : ""
        }.`,
        {
          actionType: "order_update",
          relatedOrderId: newOrder.id,
          staffMemberId: assignedStaffId,
        }
      );
      formMode = "edit";
      ctx.refreshAll();
      ctx.showToast(
        `Order #${newOrder.id} (${newOrder.clientName}) placed successfully.`
      );
    } else {
      activeOrder.clientName = clientName;
      activeOrder.clientContact = clientContact;
      activeOrder.sublimationType = sublimationType;
      activeOrder.colorway = colorway;
      activeOrder.printingOption = printingOption;
      activeOrder.unitPrice = unitPrice;
      activeOrder.sizes = sizes;
      activeOrder.totalQty = computed.totalQty;
      activeOrder.discountAmount = computed.discountAmount;
      activeOrder.totalAmount = computed.totalAmount;
      activeOrder.assignedStaffId = assignedStaffId;

      const newBal = Math.max(
        0,
        activeOrder.totalAmount - activeOrder.amountPaid
      );
      (ctx.state.paymentVerificationLinks || []).forEach((lnk) => {
        if (lnk.orderId === activeOrder.id && lnk.status === "Active") {
          lnk.buyerName = activeOrder.clientName;
          lnk.orderLabel = `Order #${activeOrder.id} — ${activeOrder.clientName}`;
          lnk.expectedAmount = newBal > 0 ? newBal : activeOrder.totalAmount;
        }
      });

      syncCustomOrderInventory(ctx.state, activeOrder);
      appendAuditLog(
        ctx.state,
        "Orders",
        `Updated customization details for Order #${activeOrder.id} (${
          activeOrder.clientName
        }) — Net Total: ${formatPeso(activeOrder.totalAmount, true)}${
          computed.discountAmount > 0
            ? ` (Discount: ${formatPeso(computed.discountAmount)})`
            : ""
        }.`,
        {
          actionType: "order_update",
          relatedOrderId: activeOrder.id,
          staffMemberId: assignedStaffId,
        }
      );
      ctx.refreshAll();
      ctx.showToast(
        `Saved changes for Order #${activeOrder.id} (${formatPeso(
          activeOrder.totalAmount,
          true
        )}).`
      );
    }
  });

  return { render };
}
