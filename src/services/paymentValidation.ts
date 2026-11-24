// ============================================================================
// JM MAKER SPORTSWEAR — PAYMENT VALIDATION & SECURITY GUARDS
// Validates uploaded receipt screenshots, reference numbers, link tokens,
// duplicate prevention, and single-operator Owner/Manager authorization.
// ============================================================================

import type { OwnerSession } from "../types/auth.types";
import type {
  PaymentProofSubmission,
  PaymentVerificationLink,
} from "../types/system.types";
import { isOwnerAuthorized } from "./authService";

export const ALLOWED_PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_PROOF_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
export const MAX_PROOF_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB ceiling

export interface TokenizedSubmissionPayload {
  token: string;
  referenceNumber: string;
  buyerNotes?: string;
  proofImageDataUrl: string;
  proofFileName: string;
  proofMimeType: string;
  proofFileSizeBytes: number;
}

export interface ValidationOutcome {
  valid: boolean;
  error?: string;
}

/** Validates an uploaded payment screenshot BEFORE reading/compressing. */
export function validateProofImageFile(file: File): ValidationOutcome {
  if (!file) {
    return {
      valid: false,
      error: "Please upload your payment receipt screenshot.",
    };
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExt = ALLOWED_PROOF_EXTENSIONS.some((ext) =>
    lowerName.endsWith(ext)
  );
  const hasAllowedMime = (ALLOWED_PROOF_MIME_TYPES as readonly string[]).includes(
    file.type
  );

  if (!hasAllowedExt || !hasAllowedMime) {
    return {
      valid: false,
      error:
        "Invalid file type. Only JPG, JPEG, PNG, and WEBP screenshots are allowed.",
    };
  }

  if (file.size <= 0) {
    return { valid: false, error: "The selected image file is empty." };
  }

  if (file.size > MAX_PROOF_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: "File is too large. Please upload a screenshot smaller than 5 MB.",
    };
  }

  return { valid: true };
}

/** Sanitizes and normalizes transaction reference numbers for duplicate checks. */
export function normalizeReferenceNumber(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-_]/g, "")
    .toUpperCase();
}

/** Checks whether a payment verification link is past its expiry timestamp. */
export function isPaymentLinkExpired(link: PaymentVerificationLink): boolean {
  const expiryMs = Date.parse(link.expiresAt);
  if (Number.isNaN(expiryMs)) return false;
  return Date.now() > expiryMs;
}

/**
 * Validates a buyer's tokenized payment proof submission:
 * - Verifies link is valid, active, not revoked, not expired, and not already pending/approved.
 * - Verifies screenshot data URI and transaction reference number.
 * - Blocks duplicate active transaction reference numbers.
 */
export function validateTokenizedPaymentSubmission(
  payload: TokenizedSubmissionPayload,
  link: PaymentVerificationLink | null,
  existingSubmissions: PaymentProofSubmission[]
): ValidationOutcome {
  if (!link) {
    return {
      valid: false,
      error:
        "Invalid payment verification link. Please request a valid link from JM Maker.",
    };
  }

  if (link.status === "Revoked") {
    return {
      valid: false,
      error:
        "This payment verification link has been revoked by JM Maker and can no longer be used.",
    };
  }

  if (link.status === "Expired" || isPaymentLinkExpired(link)) {
    return {
      valid: false,
      error:
        "This payment verification link has expired. Please contact JM Maker for a new link.",
    };
  }

  const activeSubmissionForLink = existingSubmissions.find(
    (s) => s.linkToken === link.token && s.status !== "Rejected"
  );
  if (activeSubmissionForLink) {
    return {
      valid: false,
      error:
        activeSubmissionForLink.status === "Approved"
          ? "This payment has already been verified and approved by JM Maker."
          : "A payment proof for this link has already been submitted and is pending owner verification.",
    };
  }

  if (
    !payload.proofImageDataUrl ||
    !payload.proofImageDataUrl.startsWith("data:image/")
  ) {
    return {
      valid: false,
      error: "Please upload your payment receipt or transaction screenshot.",
    };
  }

  const normalizedRef = normalizeReferenceNumber(payload.referenceNumber);
  if (normalizedRef.length < 4) {
    return {
      valid: false,
      error:
        "Please enter a valid transaction reference number (at least 4 characters).",
    };
  }

  const duplicateRef = existingSubmissions.find(
    (s) =>
      s.status !== "Rejected" &&
      normalizeReferenceNumber(s.referenceNumber) === normalizedRef
  );
  if (duplicateRef) {
    return {
      valid: false,
      error: `Transaction reference number "${normalizedRef}" has already been submitted (${duplicateRef.status}).`,
    };
  }

  return { valid: true };
}

/** Ensures only the authenticated Owner/Manager can perform admin actions. */
export function assertAdminVerificationAccess(
  session: OwnerSession | null
): ValidationOutcome {
  if (!isOwnerAuthorized(session)) {
    return {
      valid: false,
      error:
        "Unauthorized: Only the authenticated Owner/Manager can perform this action.",
    };
  }
  return { valid: true };
}
