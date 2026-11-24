// ============================================================================
// JM MAKER SPORTSWEAR — PAYMENT PROOF BUSINESS LOGIC SERVICE
// Separates buyer proof submission, Owner/Manager verification (approve/reject),
// and store payment instructions from UI components.
// ============================================================================

import {
  appendAuditLog,
  appendLogbookEntry,
  loadSystemState,
  pushNotification,
  saveSystemState,
} from "../store/systemStore";
import type { OwnerSession } from "../types/auth.types";
import type {
  PaymentAccountInstruction,
  PaymentProofStatus,
  PaymentProofSubmission,
  SystemState,
} from "../types/system.types";
import { formatPeso, getTodayIsoDate } from "../utils/formatters";
import type { TokenizedSubmissionPayload } from "./paymentValidation";
import {
  assertAdminVerificationAccess,
  normalizeReferenceNumber,
  validateTokenizedPaymentSubmission,
} from "./paymentValidation";

export interface ServiceResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

export function getActivePaymentAccounts(
  state?: SystemState
): PaymentAccountInstruction[] {
  const current = state || loadSystemState();
  return (current.paymentAccounts || []).filter((acc) => acc.active);
}

export function savePaymentAccountInstruction(
  state: SystemState,
  ownerSession: OwnerSession | null,
  account: PaymentAccountInstruction
): ServiceResult<PaymentAccountInstruction> {
  const authCheck = assertAdminVerificationAccess(ownerSession);
  if (!authCheck.valid) {
    return { success: false, error: authCheck.error };
  }
  if (!account.accountName.trim() || !account.accountNumber.trim()) {
    return {
      success: false,
      error: "Account name and account number are required.",
    };
  }

  if (!Array.isArray(state.paymentAccounts)) {
    state.paymentAccounts = [];
  }

  const idx = state.paymentAccounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) {
    state.paymentAccounts[idx] = { ...account };
  } else {
    state.paymentAccounts.push({
      ...account,
      id: account.id || `ACC-${Date.now().toString(36).toUpperCase()}`,
    });
  }

  appendAuditLog(
    state,
    "Payment Accounts",
    `Updated ${account.method} payment instruction (${account.accountName} — ${account.accountNumber}).`
  );
  saveSystemState(state);
  return { success: true, data: account };
}

/**
 * Buyer action (NO LOGIN REQUIRED): submits payment receipt screenshot +
 * reference number via unique token link. Always starts as "Pending Verification".
 */
export function submitTokenizedPaymentProof(
  payload: TokenizedSubmissionPayload
): ServiceResult<PaymentProofSubmission> {
  const state = loadSystemState();
  const existingSubmissions = state.paymentProofSubmissions || [];
  const link =
    (state.paymentVerificationLinks || []).find(
      (l) => l.token === payload.token.trim()
    ) || null;

  const check = validateTokenizedPaymentSubmission(
    payload,
    link,
    existingSubmissions
  );
  if (!check.valid || !link) {
    return { success: false, error: check.error };
  }

  const nextSeq = existingSubmissions.length + 1;
  const submissionCode = `PAY-${new Date().getFullYear()}-${String(
    nextSeq
  ).padStart(4, "0")}`;
  const normalizedRef = normalizeReferenceNumber(payload.referenceNumber);

  const submission: PaymentProofSubmission = {
    id: `SUB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    submissionCode,
    linkToken: link.token,
    orderId: link.orderId,
    orderLabel: link.orderLabel,
    buyerName: link.buyerName,
    buyerEmail: "",
    paymentMethod: "GCash",
    referenceNumber: normalizedRef,
    amount: link.expectedAmount,
    paymentDate: getTodayIsoDate(),
    proofImageDataUrl: payload.proofImageDataUrl,
    proofFileName: payload.proofFileName,
    proofMimeType: payload.proofMimeType,
    proofFileSizeBytes: payload.proofFileSizeBytes,
    buyerNotes: (payload.buyerNotes || "").trim(),
    status: "Pending Verification",
    submittedAt: new Date().toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  state.paymentProofSubmissions = [submission, ...existingSubmissions];
  link.status = "Submitted";
  link.submissionId = submission.id;

  pushNotification(state, {
    title: `New Payment Proof Submitted — ${submissionCode}`,
    message: `${submission.buyerName} uploaded a payment screenshot (Ref: ${
      submission.referenceNumber
    }, ${formatPeso(submission.amount, true)}) for ${submission.orderLabel}.`,
    category: "Orders & Payments",
    severity: "urgent",
    targetPage: "payment-proofs",
    linkedOrderId: link.orderId,
  });

  appendAuditLog(
    state,
    "Payment Proofs",
    `Received payment proof ${submissionCode} via link for ${submission.orderLabel} (Ref: ${submission.referenceNumber}).`
  );

  saveSystemState(state);
  return { success: true, data: submission };
}

/**
 * Owner/Manager-only: approves or rejects a submitted payment proof.
 * - Rejecting requires a clear reason and re-activates the link for resubmission.
 * - Approving credits the linked order balance and logs a Sales History entry.
 */
export function verifyPaymentProofSubmission(
  state: SystemState,
  ownerSession: OwnerSession | null,
  submissionId: string,
  decision: Extract<PaymentProofStatus, "Approved" | "Rejected">,
  rejectionReason = ""
): ServiceResult<PaymentProofSubmission> {
  const authCheck = assertAdminVerificationAccess(ownerSession);
  if (!authCheck.valid) {
    return { success: false, error: authCheck.error };
  }

  const submission = (state.paymentProofSubmissions || []).find(
    (s) => s.id === submissionId
  );
  if (!submission) {
    return { success: false, error: "Payment submission record not found." };
  }

  if (submission.status === "Approved") {
    return {
      success: false,
      error: "This payment proof has already been approved and credited.",
    };
  }

  if (decision === "Rejected" && rejectionReason.trim().length < 5) {
    return {
      success: false,
      error:
        "Please provide a clear rejection reason (at least 5 characters).",
    };
  }

  const nowStamp = new Date().toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  submission.status = decision;
  submission.verifiedAt = nowStamp;
  submission.verifiedBy = ownerSession?.ownerName || "JM Maker Owner/Manager";

  const associatedLink = (state.paymentVerificationLinks || []).find(
    (l) => l.token === submission.linkToken
  );

  if (decision === "Rejected") {
    submission.rejectionReason = rejectionReason.trim();
    if (associatedLink && associatedLink.status !== "Revoked") {
      associatedLink.status = "Active";
    }

    pushNotification(state, {
      title: `Payment Proof Rejected — ${submission.submissionCode}`,
      message: `Rejected payment proof from ${submission.buyerName} (${submission.orderLabel}). Reason: ${submission.rejectionReason}`,
      category: "Orders & Payments",
      severity: "warning",
      targetPage: "payment-proofs",
      linkedOrderId: submission.orderId,
    });
    appendAuditLog(
      state,
      "Payment Verification",
      `Rejected payment proof ${submission.submissionCode} (${submission.orderLabel}). Reason: ${submission.rejectionReason}`
    );
  } else {
    submission.rejectionReason = undefined;
    if (associatedLink) {
      associatedLink.status = "Submitted";
    }

    const linkedOrder = state.orders.find((o) => o.id === submission.orderId);
    let balanceRemaining = 0;
    let qty = 1;
    let unitPrice = submission.amount;
    let particulars = `Verified Buyer Payment — Order #${submission.orderId}`;
    let paymentType: "Downpayment" | "Balance Settlement" | "Full Payment" =
      "Full Payment";

    if (linkedOrder) {
      const previousPaid = Number(linkedOrder.amountPaid) || 0;
      linkedOrder.amountPaid = Math.min(
        linkedOrder.totalAmount,
        previousPaid + submission.amount
      );
      balanceRemaining = Math.max(
        0,
        linkedOrder.totalAmount - linkedOrder.amountPaid
      );
      qty = linkedOrder.totalQty || 1;
      unitPrice = linkedOrder.unitPrice || Math.round(submission.amount / qty);
      particulars = `${linkedOrder.sublimationType} (Verified Proof ${submission.submissionCode})`;
      paymentType =
        balanceRemaining === 0
          ? previousPaid === 0
            ? "Full Payment"
            : "Balance Settlement"
          : "Downpayment";
    }

    const alreadyLogged = state.salesLogbook.some((entry) =>
      entry.remarks.includes(submission.submissionCode)
    );
    if (!alreadyLogged) {
      appendLogbookEntry(state, {
        orderId: `#${submission.orderId}`,
        clientName: linkedOrder ? linkedOrder.clientName : submission.buyerName,
        particulars,
        qty,
        unitPrice,
        paymentType,
        paymentMethod: submission.paymentMethod,
        referenceNumber: submission.referenceNumber,
        paymentProofImage: submission.proofImageDataUrl,
        amountPaid: submission.amount,
        balanceRemaining,
        isoDate: submission.paymentDate,
        remarks: `Approved payment proof ${submission.submissionCode} by ${submission.verifiedBy}`,
      });
    }

    pushNotification(state, {
      title: `Payment Approved — ${submission.submissionCode}`,
      message: `Approved ${formatPeso(submission.amount, true)} from ${
        submission.buyerName
      } (${submission.orderLabel}) and recorded to Sales History.`,
      category: "Orders & Payments",
      severity: "success",
      targetPage: "sales-logbook",
      linkedOrderId: linkedOrder?.id,
    });

    appendAuditLog(
      state,
      "Payment Verification",
      `Approved payment proof ${submission.submissionCode} (${formatPeso(
        submission.amount,
        true
      )}, Ref: ${submission.referenceNumber}) for ${submission.orderLabel}.`
    );
  }

  saveSystemState(state);
  return { success: true, data: submission };
}
