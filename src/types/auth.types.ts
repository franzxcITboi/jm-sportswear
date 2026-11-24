// ============================================================================
// JM MAKER SPORTSWEAR — AUTHENTICATION TYPES
// Single-operator (Owner/Manager) authentication data models.
// ============================================================================

export interface LoginFormValues {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface OwnerRegistrationValues {
  ownerName: string;
  email: string;
  password: string;
  confirmPassword: string;
  ownerPin: string;
}

export interface PasswordResetValues {
  email: string;
  ownerPin: string;
  newPassword: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: {
    ownerName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    ownerPin?: string;
    auth?: string;
  };
}

export interface OwnerAccount {
  ownerName: string;
  email: string;
  password: string;
  createdAt: string;
}

export interface OwnerSession {
  email: string;
  ownerName: string;
  loggedInAt: string;
  role?: "owner_manager" | "owner";
}
