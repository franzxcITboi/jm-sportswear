// ============================================================================
// JM MAKER SPORTSWEAR — AUTHENTICATION & ACCESS CONTROL TYPES
// Supports Owner/Manager full administration plus Owner-managed Staff accounts
// with Role-Based Access Control (RBAC) module permissions (Capstone Obj. 4).
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

export interface SessionModulePermissions {
  canManagePOS: boolean;
  canManageOrders: boolean;
  canManageInventory: boolean;
  canVerifyPayments: boolean;
  canViewReports: boolean;
}

export interface OwnerSession {
  userId?: string;
  staffMemberId?: string;
  email: string;
  ownerName: string;
  loggedInAt: string;
  role?: "owner_manager" | "owner" | "supervisor" | "staff";
  permissions?: SessionModulePermissions;
}
