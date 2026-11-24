// ============================================================================
// JM MAKER SPORTSWEAR — UNIQUE PAYMENT VERIFICATION LINK SERVICE
// Handles cryptographic token generation, 4-digit Order ID generation, link
// creation, revocation, expiry checks, and passwordless buyer resolution.
// ============================================================================

import {
  appendAuditLog,
  loadSystemState,
  saveSystemState,
} from "../store/systemStore";
import type { OwnerSession } from "../types/auth.types";
import type {
  PaymentProofSubmission,
  PaymentVerificationLink,
  SystemState,
} from "../types/system.types";
import { formatPeso } from "../utils/formatters";
import type { ServiceResult } from "./paymentProofService";
import {
  assertAdminVerificationAccess,
  isPaymentLinkExpired,
} from "./paymentValidation";

export interface CreatePaymentLinkInput {
  orderId: string;
  buyerName: string;
  expectedAmount: number;
  expiresInDays?: number;
}

export interface ResolvedVerificationLink {
  valid: boolean;
  reason?: "missing" | "not_found" | "revoked" | "expired";
  message?: string;
  link?: PaymentVerificationLink;
  latestSubmission?: PaymentProofSubmission;
}

/** Generates an unguessable, URL-safe cryptographic random token (144 bits). */
export function generateSecureVerificationToken(): string {
  const bytes = new Uint8Array(18);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let token = "jm_";
  for (let i = 0; i < bytes.length; i++) {
    token += alphabet[bytes[i] % alphabet.length];
  }
  return token;
}

/** Builds the clean shareable verification URL exposing ONLY the opaque token. */
export function buildPaymentVerificationUrl(token: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost:5173";
  return `${origin}/buyer.html?token=${encodeURIComponent(token)}`;
}

/** Generates the next unique 4-digit Order ID (starting at 1001). */
export function generateNextFourDigitOrderId(state: SystemState): string {
  const usedIds = new Set<number>();
  (state.orders || []).forEach((o) => {
    const num = Number.parseInt(String(o.id).replace(/\D/g, ""), 10);
    if (num >= 1000 && num <= 9999) usedIds.add(num);
  });
  (state.paymentVerificationLinks || []).forEach((l) => {
    const num = Number.parseInt(String(l.orderId).replace(/\D/g, ""), 10);
    if (num >= 1000 && num <= 9999) usedIds.add(num);
  });

  let candidate = usedIds.size > 0 ? Math.max(...usedIds) + 1 : 1001;
  if (candidate > 9999) candidate = 1000;
  let guard = 0;
  while (usedIds.has(candidate) && guard < 9000) {
    candidate = candidate >= 9999 ? 1000 : candidate + 1;
    guard += 1;
  }
  return String(candidate).padStart(4, "0");
}

/** Owner/Manager-only: creates a unique link tied to a buyer/order. */
export function createPaymentVerificationLink(
  state: SystemState,
  ownerSession: OwnerSession | null,
  input: CreatePaymentLinkInput
): ServiceResult<PaymentVerificationLink> {
  const authCheck = assertAdminVerificationAccess(ownerSession);
  if (!authCheck.valid) {
    return { success: false, error: authCheck.error };
  }

  const cleanedOrderId = input.orderId.trim().replace(/^#/, "");
  const buyerName = input.buyerName.trim();
  const expectedAmount = Math.max(0, Number(input.expectedAmount) || 0);
  const expiresInDays = Math.min(30, Math.max(1, Number(input.expiresInDays) || 7));

  if (!/^\d{4}$/.test(cleanedOrderId)) {
    return {
      success: false,
      error:
        "Order ID must be exactly 4 digits (e.g., 1001). Click Generate for a new ID.",
    };
  }
  if (buyerName.length < 2) {
    return { success: false, error: "Please enter the buyer or team name." };
  }
  if (expectedAmount <= 0) {
    return {
      success: false,
      error: "Expected payment amount must be greater than \u20B10.",
    };
  }

  const matchedOrder = state.orders.find((o) => o.id === cleanedOrderId);
  const orderLabel = matchedOrder
    ? `Order #${matchedOrder.id} — ${matchedOrder.clientName}`
    : `Order #${cleanedOrderId} — ${buyerName}`;

  const now = new Date();
  const expiry = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

  const link: PaymentVerificationLink = {
    id: `LNK-${Date.now().toString(36).toUpperCase()}`,
    token: generateSecureVerificationToken(),
    orderId: cleanedOrderId,
    orderLabel,
    buyerName,
    expectedAmount,
    createdAt: now.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    expiresAt: expiry.toISOString(),
    status: "Active",
  };

  if (!Array.isArray(state.paymentVerificationLinks)) {
    state.paymentVerificationLinks = [];
  }
  state.paymentVerificationLinks.unshift(link);

  appendAuditLog(
    state,
    "Payment Links",
    `Generated unique payment verification link for ${orderLabel} (${formatPeso(
      expectedAmount,
      true
    )}).`
  );
  saveSystemState(state);
  return { success: true, data: link };
}

/** Owner/Manager-only: revokes a link so it can no longer accept submissions. */
export function revokePaymentVerificationLink(
  state: SystemState,
  ownerSession: OwnerSession | null,
  linkId: string
): ServiceResult<PaymentVerificationLink> {
  const authCheck = assertAdminVerificationAccess(ownerSession);
  if (!authCheck.valid) {
    return { success: false, error: authCheck.error };
  }

  const link = (state.paymentVerificationLinks || []).find(
    (l) => l.id === linkId
  );
  if (!link) {
    return { success: false, error: "Verification link not found." };
  }

  link.status = "Revoked";
  appendAuditLog(
    state,
    "Payment Links",
    `Revoked payment verification link for ${link.orderLabel}.`
  );
  saveSystemState(state);
  return { success: true, data: link };
}

/** Resolves a buyer URL token (?token=...) without requiring any buyer account. */
export function resolvePaymentVerificationLink(
  token: string | null
): ResolvedVerificationLink {
  const cleaned = (token || "").trim();
  if (!cleaned) {
    return {
      valid: false,
      reason: "missing",
      message:
        "No payment verification token was provided. Please open the direct payment verification link sent to you by JM Maker Sportswear.",
    };
  }

  const state = loadSystemState();
  const link = (state.paymentVerificationLinks || []).find(
    (l) => l.token === cleaned
  );

  if (!link) {
    return {
      valid: false,
      reason: "not_found",
      message:
        "This payment verification link is invalid or does not exist. Please check the link sent by JM Maker Sportswear.",
    };
  }

  if (link.status === "Revoked") {
    return {
      valid: false,
      reason: "revoked",
      message:
        "This payment verification link has been revoked by JM Maker Sportswear. Please request a new link if needed.",
      link,
    };
  }

  if (link.status === "Expired" || isPaymentLinkExpired(link)) {
    return {
      valid: false,
      reason: "expired",
      message:
        "This payment verification link has expired. Please contact JM Maker Sportswear to request a fresh link.",
      link,
    };
  }

  const latestSubmission = (state.paymentProofSubmissions || []).find(
    (sub) => sub.linkToken === link.token
  );

  return {
    valid: true,
    link,
    latestSubmission,
  };
}
