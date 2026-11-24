// ============================================================================
// JM MAKER SPORTSWEAR — FRONTEND PAYMENT VERIFICATION ADAPTER BOUNDARY
// Clean interface isolating UI modules from temporary localStorage so Phase 2
// Supabase backend services (Postgres, Storage, Edge Functions, RLS) plug in
// without rewriting any UI components.
// ============================================================================

import type { OwnerSession } from "../types/auth.types";
import type {
  PaymentAccountInstruction,
  PaymentProofStatus,
  PaymentProofSubmission,
  PaymentVerificationLink,
  SystemState,
} from "../types/system.types";
import type {
  CreatePaymentLinkInput,
  ResolvedVerificationLink,
} from "./paymentLinkService";
import {
  buildPaymentVerificationUrl,
  createPaymentVerificationLink,
  resolvePaymentVerificationLink,
  revokePaymentVerificationLink,
} from "./paymentLinkService";
import type { ServiceResult } from "./paymentProofService";
import {
  getActivePaymentAccounts,
  savePaymentAccountInstruction,
  submitTokenizedPaymentProof,
  verifyPaymentProofSubmission,
} from "./paymentProofService";
import type { TokenizedSubmissionPayload } from "./paymentValidation";

export interface IPaymentDataAdapter {
  readonly mode: "frontend-local" | "supabase";
  createVerificationLink(
    state: SystemState,
    ownerSession: OwnerSession | null,
    input: CreatePaymentLinkInput
  ): ServiceResult<PaymentVerificationLink>;
  revokeVerificationLink(
    state: SystemState,
    ownerSession: OwnerSession | null,
    linkId: string
  ): ServiceResult<PaymentVerificationLink>;
  resolveVerificationLink(token: string | null): ResolvedVerificationLink;
  buildVerificationUrl(token: string): string;
  submitTokenizedProof(
    payload: TokenizedSubmissionPayload
  ): ServiceResult<PaymentProofSubmission>;
  verifySubmission(
    state: SystemState,
    ownerSession: OwnerSession | null,
    submissionId: string,
    decision: Extract<PaymentProofStatus, "Approved" | "Rejected">,
    rejectionReason?: string
  ): ServiceResult<PaymentProofSubmission>;
  getPaymentAccounts(state?: SystemState): PaymentAccountInstruction[];
  savePaymentAccount(
    state: SystemState,
    ownerSession: OwnerSession | null,
    account: PaymentAccountInstruction
  ): ServiceResult<PaymentAccountInstruction>;
}

/** Frontend-only local state adapter (Phase 1 — Supabase ready for Phase 2). */
export const paymentAdapter: IPaymentDataAdapter = {
  mode: "frontend-local",

  createVerificationLink(state, ownerSession, input) {
    return createPaymentVerificationLink(state, ownerSession, input);
  },

  revokeVerificationLink(state, ownerSession, linkId) {
    return revokePaymentVerificationLink(state, ownerSession, linkId);
  },

  resolveVerificationLink(token) {
    return resolvePaymentVerificationLink(token);
  },

  buildVerificationUrl(token) {
    return buildPaymentVerificationUrl(token);
  },

  submitTokenizedProof(payload) {
    return submitTokenizedPaymentProof(payload);
  },

  verifySubmission(
    state,
    ownerSession,
    submissionId,
    decision,
    rejectionReason = ""
  ) {
    return verifyPaymentProofSubmission(
      state,
      ownerSession,
      submissionId,
      decision,
      rejectionReason
    );
  },

  getPaymentAccounts(state?: SystemState) {
    return getActivePaymentAccounts(state);
  },

  savePaymentAccount(state, ownerSession, account) {
    return savePaymentAccountInstruction(state, ownerSession, account);
  },
};
