// ============================================================================
// JM MAKER SPORTSWEAR — OWNER/MANAGER PAYMENT VERIFICATION & LINK MODULE
// Generates unique tokenized payment verification links (4-digit Order IDs),
// copies/revokes links, inspects uploaded screenshots, and approves or rejects
// buyer payment proof submissions.
// ============================================================================

import { getOwnerSession, isOwnerAuthorized } from "../services/authService";
import { paymentAdapter } from "../services/paymentAdapter";
import { generateNextFourDigitOrderId } from "../services/paymentLinkService";
import { isPaymentLinkExpired } from "../services/paymentValidation";
import type {
  PaymentProofStatus,
  PaymentProofSubmission,
  PaymentVerificationLink,
} from "../types/system.types";
import {
  copyToClipboard,
  handleImagePreviewClick,
  restoreInputFocus,
} from "../utils/dom";
import { formatPeso } from "../utils/formatters";
import type { ModuleContext } from "./moduleTypes";

type StatusFilter = "ALL" | PaymentProofStatus;

export function initPaymentVerificationModule(ctx: ModuleContext): {
  render: () => void;
} {
  const container = document.getElementById("paymentProofsPageContent");
  let statusFilter: StatusFilter = "ALL";
  let searchQuery = "";
  let rejectingSubmissionId: string | null = null;
  let lastGeneratedLinkId: string | null = null;
  let linkOrderSelection = "";
  let lastSyncedGlobalOrderId = "";
  let customOrderIdDraft = "";

  function updateSidebarBadge(pendingCount: number): void {
    const badge = document.getElementById("navPaymentsBadge");
    if (!badge) return;
    badge.textContent = String(pendingCount);
    badge.hidden = pendingCount === 0;
  }

  function render(): void {
    const submissions: PaymentProofSubmission[] =
      ctx.state.paymentProofSubmissions || [];
    const links: PaymentVerificationLink[] =
      ctx.state.paymentVerificationLinks || [];

    const pendingCount = submissions.filter(
      (s) => s.status === "Pending Verification"
    ).length;
    updateSidebarBadge(pendingCount);

    if (!container) return;

    const ownerSession = getOwnerSession();
    if (!isOwnerAuthorized(ownerSession)) {
      container.innerHTML = `
        <section class="module-card" style="text-align:center;padding:36px 20px;">
          <span class="module-tag tag-red" style="align-self:center;margin-bottom:8px;">OWNER/MANAGER LOGIN REQUIRED</span>
          <h2 style="font-size:1.08rem;margin-bottom:6px;">Payment Verification Is Restricted to the Owner/Manager</h2>
          <p style="color:var(--text-muted);font-size:0.86rem;max-width:520px;margin:0 auto 16px;">
            Please sign in with the authorized Owner/Manager account to generate payment links or approve/reject submissions.
          </p>
          <div style="display:flex;justify-content:center;gap:10px;">
            <a href="./index.html" class="btn btn-red" style="text-decoration:none;">Sign In as Owner/Manager</a>
          </div>
        </section>
      `;
      return;
    }

    const activeLinksCount = links.filter(
      (l) => l.status === "Active" && !isPaymentLinkExpired(l)
    ).length;
    const approvedCount = submissions.filter((s) => s.status === "Approved").length;
    const rejectedCount = submissions.filter((s) => s.status === "Rejected").length;

    const activeOrders = ctx.state.orders.filter((o) => o.stage !== "Cancelled");
    const globalOrderId = ctx.state.selectedOrderId;
    if (
      globalOrderId &&
      globalOrderId !== lastSyncedGlobalOrderId &&
      activeOrders.some((o) => o.id === globalOrderId)
    ) {
      linkOrderSelection = globalOrderId;
      lastSyncedGlobalOrderId = globalOrderId;
    } else if (
      (!linkOrderSelection ||
        (linkOrderSelection !== "__CUSTOM__" &&
          !activeOrders.some((o) => o.id === linkOrderSelection))) &&
      activeOrders.length > 0
    ) {
      linkOrderSelection = activeOrders[0].id;
      lastSyncedGlobalOrderId = activeOrders[0].id;
    } else if (activeOrders.length === 0) {
      linkOrderSelection = "__CUSTOM__";
      if (!customOrderIdDraft) {
        customOrderIdDraft = generateNextFourDigitOrderId(ctx.state);
      }
    }

    const selectedOrder = activeOrders.find((o) => o.id === linkOrderSelection);
    const isCustomLinkTarget = linkOrderSelection === "__CUSTOM__";

    const defaultBuyerName = selectedOrder ? selectedOrder.clientName : "";
    const defaultExpectedAmount = selectedOrder
      ? Math.max(0, selectedOrder.totalAmount - selectedOrder.amountPaid) ||
        selectedOrder.totalAmount
      : 0;

    const orderOptionsHtml =
      activeOrders
        .map((o) => {
          const bal = Math.max(0, o.totalAmount - o.amountPaid);
          return `<option value="${o.id}" ${
            o.id === linkOrderSelection ? "selected" : ""
          }>Order #${o.id} — ${o.clientName} (${
            bal > 0
              ? `Bal: ${formatPeso(bal)}`
              : `Total: ${formatPeso(o.totalAmount)}`
          })</option>`;
        })
        .join("") +
      `<option value="__CUSTOM__" ${
        isCustomLinkTarget ? "selected" : ""
      }>Custom Buyer / Walk-In Transaction</option>`;

    const latestLink = lastGeneratedLinkId
      ? links.find((l) => l.id === lastGeneratedLinkId) || null
      : null;
    const latestLinkUrl = latestLink
      ? paymentAdapter.buildVerificationUrl(latestLink.token)
      : "";

    const generatedLinkBannerHtml = latestLink
      ? `<div class="generated-link-box" style="margin-top:12px;padding:12px 14px;border:1px solid var(--brand-red-border);background:var(--brand-red-soft);border-radius:10px;display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
            <strong style="font-size:0.84rem;color:var(--brand-red);">Unique Payment Verification Link Ready (${latestLink.orderLabel})</strong>
            <span class="status-pill status-available">Active Link</span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <input
              type="text"
              readonly
              value="${latestLinkUrl}"
              class="toolbar-input"
              style="flex:1;min-width:240px;background:#ffffff;font-family:monospace;font-size:0.78rem;"
            />
            <button type="button" class="btn btn-red btn-sm" data-copy-link-token="${latestLink.token}">
              Copy Link
            </button>
            <a
              href="${latestLinkUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-light btn-sm"
              style="text-decoration:none;"
            >
              Open Buyer Page &#8599;
            </a>
          </div>
          <small style="color:var(--text-muted);font-size:0.74rem;">
            Send this link to the buyer via Messenger, SMS, or Email. No login or account is required.
          </small>
        </div>`
      : "";

    const linksRowsHtml =
      links.length > 0
        ? links
            .map((lnk) => {
              const expired =
                lnk.status !== "Revoked" &&
                lnk.status !== "Submitted" &&
                isPaymentLinkExpired(lnk);
              const displayStatus = expired ? "Expired" : lnk.status;
              const statusCls =
                displayStatus === "Active"
                  ? "status-available"
                  : displayStatus === "Submitted"
                  ? "status-pending"
                  : "status-out";
              const url = paymentAdapter.buildVerificationUrl(lnk.token);
              const shortToken = `${lnk.token.slice(0, 7)}••••${lnk.token.slice(
                -4
              )}`;
              const expiryDateLabel = new Date(
                lnk.expiresAt
              ).toLocaleDateString("en-US", {
                month: "short",
                day: "2-digit",
                year: "numeric",
              });

              return `
                <tr>
                  <td>
                    <button
                      type="button"
                      class="breadcrumb-link"
                      data-open-pos-order="${lnk.orderId}"
                      title="Open in Custom Orders & POS"
                      style="font-size:0.84rem;text-align:left;"
                    >
                      ${lnk.orderLabel}
                    </button><br/>
                    <small style="color:var(--text-muted);">Buyer: ${lnk.buyerName}</small>
                  </td>
                  <td><strong>${formatPeso(lnk.expectedAmount, true)}</strong></td>
                  <td>
                    <code style="font-size:0.78rem;">${shortToken}</code><br/>
                    <small style="color:var(--text-muted);">Expires: ${expiryDateLabel}</small>
                  </td>
                  <td><span class="status-pill ${statusCls}">${displayStatus}</span></td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      <button
                        type="button"
                        class="btn btn-light btn-sm"
                        data-copy-link-token="${lnk.token}"
                        ${
                          displayStatus === "Revoked" ||
                          displayStatus === "Expired"
                            ? "disabled"
                            : ""
                        }
                      >
                        Copy Link
                      </button>
                      ${
                        displayStatus !== "Revoked" &&
                        displayStatus !== "Expired"
                          ? `<a
                              href="${url}"
                              target="_blank"
                              rel="noopener noreferrer"
                              class="btn btn-light btn-sm"
                              style="text-decoration:none;"
                            >
                              Open &#8599;
                            </a>
                            <button
                              type="button"
                              class="btn btn-danger-outline btn-sm"
                              data-revoke-link="${lnk.id}"
                            >
                              Revoke
                            </button>`
                          : ""
                      }
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:18px;">No payment verification links generated yet. Create one above to send to a buyer.</td></tr>`;

    const filteredSubmissions = submissions.filter((sub) => {
      const matchesStatus =
        statusFilter === "ALL" || sub.status === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        sub.submissionCode.toLowerCase().includes(q) ||
        sub.orderId.toLowerCase().includes(q) ||
        sub.buyerName.toLowerCase().includes(q) ||
        sub.referenceNumber.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });

    const proofRowsHtml =
      filteredSubmissions.length > 0
        ? filteredSubmissions
            .map((sub) => {
              const statusCls =
                sub.status === "Approved"
                  ? "status-available"
                  : sub.status === "Rejected"
                  ? "status-out"
                  : "status-pending";
              const isRejecting = rejectingSubmissionId === sub.id;
              const sizeKb = Math.max(
                1,
                Math.round((sub.proofFileSizeBytes || 1024) / 1024)
              );

              return `
                <tr>
                  <td>
                    <strong>${sub.submissionCode}</strong><br/>
                    <small style="color:var(--text-muted);">${sub.submittedAt}</small>
                  </td>
                  <td>
                    <strong>${sub.buyerName}</strong><br/>
                    <button
                      type="button"
                      class="module-tag tag-blue"
                      data-open-pos-order="${sub.orderId}"
                      title="View Order #${sub.orderId} in Custom Orders & POS"
                      style="margin-top:3px;display:inline-block;cursor:pointer;border:1px solid var(--border-strong);"
                    >
                      ${sub.orderLabel} &rarr;
                    </button>
                  </td>
                  <td>
                    <strong style="font-size:0.94rem;color:var(--green-text);">${formatPeso(
                      sub.amount,
                      true
                    )}</strong><br/>
                    <small style="color:var(--text-secondary);">Ref #: <code>${
                      sub.referenceNumber
                    }</code></small>
                    ${
                      sub.buyerNotes
                        ? `<br/><small style="color:var(--text-muted);font-style:italic;">Notes: "${sub.buyerNotes}"</small>`
                        : ""
                    }
                  </td>
                  <td>
                    <button
                      type="button"
                      class="proof-inline-chip"
                      data-preview-src="${sub.proofImageDataUrl}"
                      data-preview-title="Payment Proof ${sub.submissionCode} — ${sub.buyerName}"
                    >
                      <img src="${sub.proofImageDataUrl}" alt="Payment receipt" />
                      <span>Inspect Proof</span>
                    </button><br/>
                    <small style="color:var(--text-muted);font-size:0.7rem;">${
                      sub.proofFileName
                    } (${sizeKb} KB)</small>
                  </td>
                  <td>
                    <span class="status-pill ${statusCls}">${sub.status}</span>
                    ${
                      sub.verifiedAt
                        ? `<br/><small style="color:var(--text-muted);font-size:0.72rem;">By ${
                            sub.verifiedBy || "Owner/Manager"
                          } &bull; ${sub.verifiedAt}</small>`
                        : `<br/><small style="color:var(--amber-text);font-size:0.72rem;">Waiting for Owner/Manager review</small>`
                    }
                    ${
                      sub.rejectionReason
                        ? `<div class="rejection-note-box"><strong>Rejection Reason:</strong> ${sub.rejectionReason}</div>`
                        : ""
                    }
                  </td>
                  <td>
                    ${
                      sub.status === "Approved"
                        ? `<span style="font-size:0.76rem;font-weight:600;color:var(--green-text);">&#10003; Approved &amp; Logged</span>`
                        : isRejecting
                        ? `<div class="inline-reject-box">
                            <input
                              type="text"
                              id="rejectReasonInput_${sub.id}"
                              placeholder="Enter rejection reason..."
                              class="toolbar-input"
                              style="width:100%;margin-bottom:6px;"
                            />
                            <div style="display:flex;gap:6px;">
                              <button type="button" class="btn btn-red btn-sm" data-confirm-reject="${sub.id}">
                                Confirm Reject
                              </button>
                              <button type="button" class="btn btn-light btn-sm" data-cancel-reject="${sub.id}">
                                Cancel
                              </button>
                            </div>
                          </div>`
                        : `<div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <button type="button" class="btn btn-red btn-sm" data-approve-proof="${sub.id}">
                              &#10003; Approve
                            </button>
                            <button type="button" class="btn btn-danger-outline btn-sm" data-start-reject="${sub.id}">
                              &#10005; Reject
                            </button>
                          </div>`
                    }
                  </td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">
            ${
              submissions.length === 0
                ? "No payment proofs submitted yet. Generate a unique Payment Verification Link above and send it to your buyer."
                : "No submitted payment proofs match your search or status filter."
            }
          </td></tr>`;

    container.innerHTML = `
      <div class="kpi-strip">
        <div class="kpi-box">
          <span class="kpi-label">Active Verification Links</span>
          <strong class="kpi-val">${activeLinksCount}</strong>
          <span class="kpi-meta">${links.length} total link(s) created</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Pending Verification</span>
          <strong class="kpi-val ${pendingCount > 0 ? "kpi-amber" : ""}">${pendingCount}</strong>
          <span class="kpi-meta">Submitted proofs awaiting review</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Approved Payments</span>
          <strong class="kpi-val kpi-green">${approvedCount}</strong>
          <span class="kpi-meta">Verified &amp; credited to Sales History</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">Rejected Submissions</span>
          <strong class="kpi-val ${rejectedCount > 0 ? "kpi-red" : ""}">${rejectedCount}</strong>
          <span class="kpi-meta">Returned with feedback</span>
        </div>
      </div>

      <div class="control-grid">
        <section class="module-card">
          <div class="module-top">
            <div>
              <h2>Generate Payment Verification Link</h2>
              <p class="module-subtitle">
                Create a unique, direct link for a buyer to upload their payment screenshot without logging in
              </p>
            </div>
            <span class="module-tag tag-red">No Buyer Login</span>
          </div>

          <form id="generatePaymentLinkForm" novalidate>
            <div class="field">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <label for="linkOrderSelect">Associate with Order / Transaction</label>
                ${
                  selectedOrder
                    ? `<button type="button" class="breadcrumb-link" data-open-pos-order="${selectedOrder.id}" style="font-size:0.74rem;">
                        View Order #${selectedOrder.id} in Custom Orders &amp; POS &rarr;
                      </button>`
                    : ""
                }
              </div>
              <select id="linkOrderSelect">${orderOptionsHtml}</select>
            </div>

            <div class="form-grid-2">
              ${
                isCustomLinkTarget
                  ? `<div class="field">
                      <label for="linkCustomOrderId">Order ID (4 Digits)</label>
                      <div style="display:flex;gap:6px;align-items:center;">
                        <input
                          type="text"
                          id="linkCustomOrderId"
                          maxlength="4"
                          inputmode="numeric"
                          pattern="[0-9]{4}"
                          placeholder="4-digit ID (e.g., 1001)"
                          value="${customOrderIdDraft}"
                          style="flex:1;min-width:0;letter-spacing:0.08em;font-weight:700;"
                          required
                        />
                        <button
                          type="button"
                          id="generateOrderIdBtn"
                          class="btn btn-light btn-sm"
                          title="Auto-generate a unique 4-digit Order ID"
                          style="white-space:nowrap;height:36px;"
                        >
                          Generate ID
                        </button>
                      </div>
                    </div>`
                  : ""
              }
              <div class="field">
                <label for="linkBuyerNameInput">Buyer / Team Name</label>
                <input
                  type="text"
                  id="linkBuyerNameInput"
                  placeholder="Enter buyer or team name"
                  value="${defaultBuyerName}"
                  required
                />
              </div>
              <div class="field">
                <label for="linkExpectedAmountInput">Expected Payment Amount (\u20B1)</label>
                <input
                  type="number"
                  id="linkExpectedAmountInput"
                  min="1"
                  step="1"
                  value="${defaultExpectedAmount || ""}"
                  placeholder="Enter amount"
                  required
                />
              </div>
              <div class="field">
                <label for="linkExpiryDaysSelect">Link Expiration</label>
                <select id="linkExpiryDaysSelect">
                  <option value="3">Expires in 3 Days</option>
                  <option value="7" selected>Expires in 7 Days</option>
                  <option value="14">Expires in 14 Days</option>
                </select>
              </div>
            </div>

            <div class="module-footer-actions">
              <button type="submit" class="btn btn-red">
                + Generate Payment Verification Link
              </button>
            </div>
          </form>

          ${generatedLinkBannerHtml}
        </section>

        <section class="module-card">
          <div class="module-top">
            <div>
              <h2>Generated Payment Links</h2>
              <p class="module-subtitle">Copy links to send via Messenger/SMS/Email, or revoke links anytime</p>
            </div>
            <span class="module-tag tag-blue">${links.length} Link(s)</span>
          </div>

          <div class="table-scroll">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>Associated Buyer / Order</th>
                  <th>Amount</th>
                  <th>Token &amp; Expiry</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>${linksRowsHtml}</tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="module-card">
        <div class="module-top">
          <div>
            <h2>Submitted Payment Proofs &amp; Verification Status</h2>
            <p class="module-subtitle">
              Inspect buyer payment screenshots, verify reference numbers, and approve or reject payments
            </p>
          </div>
          <div class="toolbar-group">
            <input
              type="search"
              id="payProofSearchInput"
              class="toolbar-input"
              placeholder="Search buyer, order #, ref #..."
              value="${searchQuery}"
            />
          </div>
        </div>

        <div class="toolbar-group" style="padding-bottom:6px;">
          <button type="button" class="btn ${
            statusFilter === "ALL" ? "btn-red" : "btn-light"
          } btn-sm" data-proof-filter="ALL">All (${submissions.length})</button>
          <button type="button" class="btn ${
            statusFilter === "Pending Verification" ? "btn-red" : "btn-light"
          } btn-sm" data-proof-filter="Pending Verification">Pending Verification (${pendingCount})</button>
          <button type="button" class="btn ${
            statusFilter === "Approved" ? "btn-red" : "btn-light"
          } btn-sm" data-proof-filter="Approved">Approved (${approvedCount})</button>
          <button type="button" class="btn ${
            statusFilter === "Rejected" ? "btn-red" : "btn-light"
          } btn-sm" data-proof-filter="Rejected">Rejected (${rejectedCount})</button>
        </div>

        <div class="table-scroll">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Submission ID</th>
                <th>Buyer &amp; Transaction</th>
                <th>Amount &amp; Reference #</th>
                <th>Payment Screenshot</th>
                <th>Verification Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${proofRowsHtml}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  container?.addEventListener("change", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "linkOrderSelect") {
      linkOrderSelection = (target as HTMLSelectElement).value;
      if (linkOrderSelection === "__CUSTOM__") {
        if (!customOrderIdDraft) {
          customOrderIdDraft = generateNextFourDigitOrderId(ctx.state);
        }
        render();
      } else {
        ctx.state.selectedOrderId = linkOrderSelection;
        lastSyncedGlobalOrderId = linkOrderSelection;
        ctx.refreshAll();
      }
    }
  });

  container?.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "linkCustomOrderId") {
      const input = target as HTMLInputElement;
      const digitsOnly = input.value.replace(/\D/g, "").slice(0, 4);
      input.value = digitsOnly;
      customOrderIdDraft = digitsOnly;
      return;
    }

    if (target.id === "payProofSearchInput") {
      searchQuery = (target as HTMLInputElement).value;
      render();
      restoreInputFocus("payProofSearchInput");
    }
  });

  container?.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (form.id !== "generatePaymentLinkForm") return;
    e.preventDefault();

    const orderSelect = document.getElementById(
      "linkOrderSelect"
    ) as HTMLSelectElement;
    const customOrderInput = document.getElementById(
      "linkCustomOrderId"
    ) as HTMLInputElement | null;
    const buyerNameInput = document.getElementById(
      "linkBuyerNameInput"
    ) as HTMLInputElement;
    const amountInput = document.getElementById(
      "linkExpectedAmountInput"
    ) as HTMLInputElement;
    const expirySelect = document.getElementById(
      "linkExpiryDaysSelect"
    ) as HTMLSelectElement;

    const orderId =
      orderSelect.value === "__CUSTOM__"
        ? (customOrderInput?.value || "").trim()
        : orderSelect.value;

    const result = paymentAdapter.createVerificationLink(
      ctx.state,
      getOwnerSession(),
      {
        orderId,
        buyerName: buyerNameInput.value,
        expectedAmount: Number(amountInput.value),
        expiresInDays: Number(expirySelect.value) || 7,
      }
    );

    if (!result.success || !result.data) {
      ctx.showToast(result.error || "Could not generate payment link.");
      return;
    }

    lastGeneratedLinkId = result.data.id;
    if (orderSelect.value === "__CUSTOM__") {
      customOrderIdDraft = generateNextFourDigitOrderId(ctx.state);
    }
    ctx.refreshAll();
    ctx.showToast(
      `Generated unique verification link for ${result.data.orderLabel}. Click "Copy Link" to send it to the buyer.`
    );
  });

  container?.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;

    const openPosBtn = target.closest(
      "[data-open-pos-order]"
    ) as HTMLElement | null;
    if (openPosBtn) {
      const orderId = openPosBtn.getAttribute("data-open-pos-order") || "";
      const matched = ctx.state.orders.find((o) => o.id === orderId);
      if (matched) {
        ctx.navigateTo("pos-specs", matched.id);
      } else {
        ctx.showToast(
          `Order #${orderId} is a walk-in transaction not listed in Custom Orders.`
        );
      }
      return;
    }

    if (target.id === "generateOrderIdBtn") {
      customOrderIdDraft = generateNextFourDigitOrderId(ctx.state);
      const idInput = document.getElementById(
        "linkCustomOrderId"
      ) as HTMLInputElement | null;
      if (idInput) idInput.value = customOrderIdDraft;
      ctx.showToast(`Generated 4-digit Order ID #${customOrderIdDraft}.`);
      return;
    }

    if (handleImagePreviewClick(target, ctx.openImagePreview, "Payment Proof")) {
      return;
    }

    const copyBtn = target.closest(
      "[data-copy-link-token]"
    ) as HTMLElement | null;
    if (copyBtn) {
      const token = copyBtn.getAttribute("data-copy-link-token") || "";
      if (!token) return;
      const url = paymentAdapter.buildVerificationUrl(token);
      const copied = await copyToClipboard(url);
      ctx.showToast(
        copied
          ? "Payment verification link copied to clipboard!"
          : `Link ready to copy: ${url}`
      );
      return;
    }

    const revokeBtn = target.closest(
      "[data-revoke-link]"
    ) as HTMLElement | null;
    if (revokeBtn) {
      const linkId = revokeBtn.getAttribute("data-revoke-link");
      if (!linkId) return;
      const res = paymentAdapter.revokeVerificationLink(
        ctx.state,
        getOwnerSession(),
        linkId
      );
      if (!res.success) {
        ctx.showToast(res.error || "Could not revoke link.");
        return;
      }
      if (lastGeneratedLinkId === linkId) lastGeneratedLinkId = null;
      ctx.refreshAll();
      ctx.showToast("Payment verification link revoked.");
      return;
    }

    const filterBtn = target.closest(
      "[data-proof-filter]"
    ) as HTMLElement | null;
    if (filterBtn) {
      statusFilter = filterBtn.getAttribute("data-proof-filter") as StatusFilter;
      render();
      return;
    }

    const approveBtn = target.closest(
      "[data-approve-proof]"
    ) as HTMLElement | null;
    if (approveBtn) {
      const subId = approveBtn.getAttribute("data-approve-proof");
      if (!subId) return;
      const result = paymentAdapter.verifySubmission(
        ctx.state,
        getOwnerSession(),
        subId,
        "Approved"
      );
      if (!result.success) {
        ctx.showToast(result.error || "Failed to approve payment.");
        return;
      }
      rejectingSubmissionId = null;
      ctx.refreshAll();
      ctx.showToast(
        `Approved ${result.data?.submissionCode} and recorded ${formatPeso(
          result.data?.amount || 0,
          true
        )} to Sales History.`
      );
      return;
    }

    const startRejectBtn = target.closest(
      "[data-start-reject]"
    ) as HTMLElement | null;
    if (startRejectBtn) {
      rejectingSubmissionId = startRejectBtn.getAttribute("data-start-reject");
      render();
      const reasonInput = document.getElementById(
        `rejectReasonInput_${rejectingSubmissionId}`
      ) as HTMLInputElement | null;
      reasonInput?.focus();
      return;
    }

    if (target.closest("[data-cancel-reject]")) {
      rejectingSubmissionId = null;
      render();
      return;
    }

    const confirmRejectBtn = target.closest(
      "[data-confirm-reject]"
    ) as HTMLElement | null;
    if (confirmRejectBtn) {
      const subId = confirmRejectBtn.getAttribute("data-confirm-reject");
      if (!subId) return;
      const reasonInput = document.getElementById(
        `rejectReasonInput_${subId}`
      ) as HTMLInputElement | null;
      const result = paymentAdapter.verifySubmission(
        ctx.state,
        getOwnerSession(),
        subId,
        "Rejected",
        reasonInput?.value || ""
      );
      if (!result.success) {
        ctx.showToast(
          result.error || "Please provide a clear rejection reason."
        );
        return;
      }
      rejectingSubmissionId = null;
      ctx.refreshAll();
      ctx.showToast(
        `Rejected ${result.data?.submissionCode}. The buyer can reopen their link to view the reason and resubmit.`
      );
    }
  });

  return { render };
}
