// ============================================================================
// JM MAKER SPORTSWEAR — PAYMENT VERIFICATION ADAPTER BOUNDARY
// Unifies Supabase PostgreSQL RPCs (when configured) with localStorage fallback
// so UI modules and buyer.html work identically in both modes without rewrites.
// ============================================================================

import { getDataStorageMode, isSupabaseConfigured } from "../lib/supabaseClient";
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
import {
  resolveVerificationLinkFromSupabase,
  submitTokenizedProofToSupabase,
} from "./supabaseRepository";

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
  resolveVerificationLinkAsync(
    token: string | null
  ): Promise<ResolvedVerificationLink>;
  buildVerificationUrl(token: string): string;
  submitTokenizedProof(
    payload: TokenizedSubmissionPayload
  ): ServiceResult<PaymentProofSubmission>;
  submitTokenizedProofAsync(
    payload: TokenizedSubmissionPayload
  ): Promise<ServiceResult<PaymentProofSubmission>>;
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

/** Dual-mode adapter: routes to Supabase RPCs when configured, else localStorage. */
export const paymentAdapter: IPaymentDataAdapter = {
  get mode() {
    return getDataStorageMode();
  },

  createVerificationLink(state, ownerSession, input) {
    return createPaymentVerificationLink(state, ownerSession, input);
  },

  revokeVerificationLink(state, ownerSession, linkId) {
    return revokePaymentVerificationLink(state, ownerSession, linkId);
  },

  resolveVerificationLink(token) {
    return resolvePaymentVerificationLink(token);
  },

  async resolveVerificationLinkAsync(token) {
    if (isSupabaseConfigured()) {
      return resolveVerificationLinkFromSupabase(token);
    }
    return resolvePaymentVerificationLink(token);
  },

  buildVerificationUrl(token) {
    return buildPaymentVerificationUrl(token);
  },

  submitTokenizedProof(payload) {
    return submitTokenizedPaymentProof(payload);
  },

  async submitTokenizedProofAsync(payload) {
    if (isSupabaseConfigured()) {
      return submitTokenizedProofToSupabase(payload);
    }
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
