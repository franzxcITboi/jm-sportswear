// ============================================================================
// JM MAKER SPORTSWEAR — DIRECT BUYER PAYMENT VERIFICATION PAGE CONTROLLER
// Token-gated page requiring NO buyer login or account. Resolves the unique
// ?token=... link created by the Owner/Manager, lets the buyer submit a
// payment receipt screenshot and reference number, and displays live status.
// ============================================================================

import { STORAGE_KEY } from "../config/constants";
import { paymentAdapter } from "../services/paymentAdapter";
import { validateProofImageFile } from "../services/paymentValidation";
import type {
  PaymentProofSubmission,
  PaymentVerificationLink,
} from "../types/system.types";
import { formatPeso } from "../utils/formatters";
import { compressImageFile } from "../utils/imageCompressor";
import { logError } from "../utils/logger";

let activeToken = "";
let stagedImageDataUrl = "";
let stagedFileName = "";
let stagedMimeType = "";
let stagedFileSizeBytes = 0;

function showFormError(message: string): void {
  const el = document.getElementById("formErrorBanner");
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function clearStagedScreenshot(): void {
  stagedImageDataUrl = "";
  stagedFileName = "";
  stagedMimeType = "";
  stagedFileSizeBytes = 0;

  const input = document.getElementById(
    "proofFileInput"
  ) as HTMLInputElement | null;
  if (input) input.value = "";

  const emptyEl = document.getElementById("uploadEmptyState");
  const previewEl = document.getElementById("uploadPreviewState");
  if (emptyEl) emptyEl.hidden = false;
  if (previewEl) previewEl.hidden = true;
}

function openLightbox(src: string): void {
  const modal = document.getElementById("proofLightboxModal");
  const img = document.getElementById("lightboxImg") as HTMLImageElement | null;
  if (!modal || !img || !src) return;
  img.src = src;
  modal.hidden = false;
}

function closeLightbox(): void {
  const modal = document.getElementById("proofLightboxModal");
  if (modal) modal.hidden = true;
}

function showInvalidState(title: string, message: string): void {
  const invalidEl = document.getElementById("linkInvalidState");
  const formState = document.getElementById("paymentFormState");
  const confirmState = document.getElementById("submissionConfirmedState");
  const titleEl = document.getElementById("linkInvalidTitle");
  const msgEl = document.getElementById("linkInvalidMessage");

  if (formState) formState.hidden = true;
  if (confirmState) confirmState.hidden = true;
  if (invalidEl) invalidEl.hidden = false;
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
}

function showConfirmationState(
  link: PaymentVerificationLink,
  submission: PaymentProofSubmission
): void {
  const invalidEl = document.getElementById("linkInvalidState");
  const formState = document.getElementById("paymentFormState");
  const confirmState = document.getElementById("submissionConfirmedState");
  const headingEl = document.getElementById("confirmHeading");
  const messageEl = document.getElementById("confirmMessage");
  const detailsEl = document.getElementById("confirmDetailsCard");

  if (invalidEl) invalidEl.hidden = true;
  if (formState) formState.hidden = true;
  if (confirmState) confirmState.hidden = false;

  const isApproved = submission.status === "Approved";
  if (headingEl) {
    headingEl.textContent = isApproved
      ? "Payment Verified & Approved"
      : "Payment Proof Submitted";
  }
  if (messageEl) {
    messageEl.textContent = isApproved
      ? "Your payment has been verified and approved by JM Maker Sportswear. Thank you!"
      : "Your payment proof has been successfully submitted. Please wait for the owner to verify your transaction.";
  }

  if (detailsEl) {
    detailsEl.innerHTML = `
      <div class="confirm-row">
        <span>Transaction</span>
        <strong>${link.orderLabel}</strong>
      </div>
      <div class="confirm-row">
        <span>Reference Number</span>
        <strong><code>${submission.referenceNumber}</code></strong>
      </div>
      <div class="confirm-row">
        <span>Amount</span>
        <strong>${formatPeso(submission.amount, true)}</strong>
      </div>
      <div class="confirm-row">
        <span>Verification Status</span>
        <span class="status-pill ${
          isApproved ? "status-approved" : "status-pending"
        }">${submission.status}</span>
      </div>
      <div class="confirm-row">
        <span>Submitted</span>
        <strong>${submission.submittedAt}</strong>
      </div>
    `;
  }
}

async function renderTokenPage(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  activeToken = (params.get("token") || "").trim();

  const resolved = await paymentAdapter.resolveVerificationLinkAsync(activeToken);

  if (!resolved.valid || !resolved.link) {
    const titleMap: Record<string, string> = {
      missing: "Direct Verification Link Required",
      not_found: "Invalid Verification Link",
      revoked: "Link Revoked by Owner",
      expired: "Verification Link Expired",
    };
    showInvalidState(
      titleMap[resolved.reason || "missing"] || "Verification Link Unavailable",
      resolved.message ||
        "Please contact JM Maker Sportswear to request a direct payment verification link."
    );
    return;
  }

  const { link, latestSubmission } = resolved;

  // Show confirmation view if a Pending Verification or Approved proof already exists
  if (
    latestSubmission &&
    (latestSubmission.status === "Pending Verification" ||
      latestSubmission.status === "Approved")
  ) {
    showConfirmationState(link, latestSubmission);
    return;
  }

  // Show direct payment proof submission form
  const invalidEl = document.getElementById("linkInvalidState");
  const formState = document.getElementById("paymentFormState");
  const confirmState = document.getElementById("submissionConfirmedState");
  if (invalidEl) invalidEl.hidden = true;
  if (confirmState) confirmState.hidden = true;
  if (formState) formState.hidden = false;

  const stripEl = document.getElementById("transactionContextStrip");
  if (stripEl) {
    stripEl.innerHTML = `
      <div>
        <span>Transaction:</span><br />
        <strong>${link.orderLabel}</strong>
      </div>
      <div style="text-align:right;">
        <span>Amount Due:</span><br />
        <span class="tx-amount">${formatPeso(link.expectedAmount, true)}</span>
      </div>
    `;
  }

  // Show owner's rejection feedback when buyer needs to re-upload proof
  const rejectBanner = document.getElementById("rejectionNoticeBanner");
  if (rejectBanner) {
    if (latestSubmission && latestSubmission.status === "Rejected") {
      rejectBanner.innerHTML = `
        <strong>Previous submission was rejected:</strong> ${
          latestSubmission.rejectionReason ||
          "Please upload a clearer receipt and double-check your reference number."
        }
      `;
      rejectBanner.hidden = false;
    } else {
      rejectBanner.hidden = true;
    }
  }
}

function initDirectVerificationPage(): void {
  const fileInput = document.getElementById(
    "proofFileInput"
  ) as HTMLInputElement | null;

  document
    .getElementById("chooseProofBtn")
    ?.addEventListener("click", () => fileInput?.click());
  document
    .getElementById("replaceProofBtn")
    ?.addEventListener("click", () => fileInput?.click());
  document
    .getElementById("removeProofBtn")
    ?.addEventListener("click", clearStagedScreenshot);

  fileInput?.addEventListener("change", async () => {
    showFormError("");
    const file = fileInput.files?.[0];
    if (!file) return;

    const check = validateProofImageFile(file);
    if (!check.valid) {
      fileInput.value = "";
      showFormError(check.error || "Please select a valid image screenshot.");
      return;
    }

    try {
      const compressed = await compressImageFile(file, 1080, 0.82);
      stagedImageDataUrl = compressed;
      stagedFileName = file.name;
      stagedMimeType = file.type;
      stagedFileSizeBytes = file.size;

      const previewImg = document.getElementById(
        "proofPreviewImg"
      ) as HTMLImageElement | null;
      const nameEl = document.getElementById("proofFileName");
      const sizeEl = document.getElementById("proofFileSize");
      const emptyEl = document.getElementById("uploadEmptyState");
      const previewEl = document.getElementById("uploadPreviewState");

      if (previewImg) previewImg.src = compressed;
      if (nameEl) nameEl.textContent = file.name;
      if (sizeEl) {
        sizeEl.textContent = `${Math.max(1, Math.round(file.size / 1024))} KB • Ready to submit`;
      }
      if (emptyEl) emptyEl.hidden = true;
      if (previewEl) previewEl.hidden = false;
    } catch (err) {
      logError("BuyerVerification", "Failed to process receipt screenshot.", err);
      showFormError("Could not process screenshot. Please try another image.");
    }
  });

  document
    .getElementById("proofPreviewImg")
    ?.addEventListener("click", () => openLightbox(stagedImageDataUrl));
  document
    .getElementById("closeLightboxBtn")
    ?.addEventListener("click", closeLightbox);
  document
    .getElementById("proofLightboxModal")
    ?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === "proofLightboxModal") {
        closeLightbox();
      }
    });

  document
    .getElementById("paymentVerificationForm")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      showFormError("");

      const refInput = document.getElementById(
        "referenceNumberInput"
      ) as HTMLInputElement;
      const notesInput = document.getElementById(
        "additionalNotesInput"
      ) as HTMLTextAreaElement;
      const submitBtn = document.getElementById(
        "submitProofBtn"
      ) as HTMLButtonElement | null;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting Payment Proof...";
      }

      const result = await paymentAdapter.submitTokenizedProofAsync({
        token: activeToken,
        referenceNumber: refInput.value,
        buyerNotes: notesInput.value,
        proofImageDataUrl: stagedImageDataUrl,
        proofFileName: stagedFileName,
        proofMimeType: stagedMimeType,
        proofFileSizeBytes: stagedFileSizeBytes,
      });

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Payment Proof";
      }

      if (!result.success || !result.data) {
        showFormError(result.error || "Unable to submit payment proof.");
        return;
      }

      clearStagedScreenshot();
      refInput.value = "";
      notesInput.value = "";

      const resolved = await paymentAdapter.resolveVerificationLinkAsync(
        activeToken
      );
      if (resolved.link) {
        showConfirmationState(resolved.link, result.data);
      }
    });

  // Live update if the Owner/Manager approves, rejects, or revokes in another tab
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      void renderTokenPage();
    }
  });

  void renderTokenPage();
}

initDirectVerificationPage();
