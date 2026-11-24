// ============================================================================
// JM MAKER SPORTSWEAR — OWNER/MANAGER AUTHENTICATION SERVICE
// Handles single-operator sign-in validation, account registration, PIN-based
// password reset, session persistence, and dashboard authorization guard.
// ============================================================================

import type {
  LoginFormValues,
  OwnerAccount,
  OwnerRegistrationValues,
  OwnerSession,
  PasswordResetValues,
  ValidationResult,
} from "../types/auth.types";
import { logWarn } from "../utils/logger";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_OWNER_CREDENTIALS = {
  emails: ["jmmakersportswear@gmail.com", "owner@jmsportswear.com"],
  password: "jmowner2022",
  ownerName: "JM Maker Owner/Manager",
};

// Shop founding date security PIN: July 12, 2022 (07122022)
const OWNER_SECURITY_PIN = "07122022";

const REMEMBER_EMAIL_KEY = "jm_owner_remembered_email";
const SESSION_STORAGE_KEY = "jm_owner_session";
const OWNER_ACCOUNTS_KEY = "jm_owner_registered_accounts";
const DEFAULT_PASSWORD_OVERRIDE_KEY = "jm_owner_default_pw_override";

export function getRegisteredOwnerAccounts(): OwnerAccount[] {
  try {
    const raw = localStorage.getItem(OWNER_ACCOUNTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OwnerAccount[];
  } catch (err) {
    logWarn("AuthService", "Failed to read registered owner accounts.", err);
    return [];
  }
}

export function evaluatePasswordStrength(password: string): {
  level: "empty" | "weak" | "fair" | "strong";
  label: string;
} {
  if (!password) {
    return { level: "empty", label: "" };
  }
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { level: "weak", label: "Weak password" };
  if (score <= 2) return { level: "fair", label: "Fair password" };
  return { level: "strong", label: "Strong password" };
}

export function validateLoginForm(data: LoginFormValues): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  if (!data.email.trim()) {
    errors.email = "Please enter your email address.";
  } else if (!EMAIL_PATTERN.test(data.email.trim())) {
    errors.email = "Please enter a valid email address (e.g., name@gmail.com).";
  }

  if (!data.password) {
    errors.password = "Please enter your password.";
  } else if (data.password.length < 6) {
    errors.password = "Password must be at least 6 characters long.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateOwnerRegistration(
  data: OwnerRegistrationValues
): ValidationResult {
  const errors: ValidationResult["errors"] = {};
  const normalizedEmail = data.email.trim().toLowerCase();

  if (!data.ownerName.trim()) {
    errors.ownerName = "Please enter the owner's full name.";
  } else if (data.ownerName.trim().length < 2) {
    errors.ownerName = "Owner name must be at least 2 characters.";
  }

  if (!normalizedEmail) {
    errors.email = "Please enter your Gmail address.";
  } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
    errors.email = "Please enter a valid Gmail address (e.g., name@gmail.com).";
  } else {
    const existing = getRegisteredOwnerAccounts().some(
      (acc) => acc.email.toLowerCase() === normalizedEmail
    );
    if (
      existing ||
      DEFAULT_OWNER_CREDENTIALS.emails.includes(normalizedEmail)
    ) {
      errors.email = "This owner email is already registered.";
    }
  }

  if (!data.password) {
    errors.password = "Please create a password.";
  } else if (data.password.length < 6) {
    errors.password = "Password must be at least 6 characters long.";
  }

  if (!data.confirmPassword) {
    errors.confirmPassword = "Please confirm your password.";
  } else if (data.password !== data.confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  if (!data.ownerPin.trim()) {
    errors.ownerPin = "Owner Security PIN is required.";
  } else if (data.ownerPin.trim() !== OWNER_SECURITY_PIN) {
    errors.ownerPin = "Invalid Owner Security PIN (use 07122022).";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function registerOwnerAccount(
  data: OwnerRegistrationValues
): OwnerSession {
  const accounts = getRegisteredOwnerAccounts();
  const normalizedEmail = data.email.trim().toLowerCase();
  const newAccount: OwnerAccount = {
    ownerName: data.ownerName.trim(),
    email: normalizedEmail,
    password: data.password,
    createdAt: new Date().toISOString(),
  };

  accounts.push(newAccount);
  localStorage.setItem(OWNER_ACCOUNTS_KEY, JSON.stringify(accounts));

  const session: OwnerSession = {
    email: newAccount.email,
    ownerName: newAccount.ownerName,
    loggedInAt: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  saveOwnerSession(session);
  return session;
}

export function resetOwnerPassword(data: PasswordResetValues): {
  success: boolean;
  errorFields?: {
    email?: string;
    ownerPin?: string;
    newPassword?: string;
  };
} {
  const errorFields: {
    email?: string;
    ownerPin?: string;
    newPassword?: string;
  } = {};
  const normalizedEmail = data.email.trim().toLowerCase();

  if (!normalizedEmail) {
    errorFields.email = "Please enter your registered Gmail address.";
  } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
    errorFields.email = "Please enter a valid Gmail address (e.g., name@gmail.com).";
  }

  if (!data.ownerPin.trim()) {
    errorFields.ownerPin = "Owner Security PIN is required.";
  } else if (data.ownerPin.trim() !== OWNER_SECURITY_PIN) {
    errorFields.ownerPin = "Invalid Owner Security PIN (use 07122022).";
  }

  if (!data.newPassword) {
    errorFields.newPassword = "Please enter a new password.";
  } else if (data.newPassword.length < 6) {
    errorFields.newPassword = "New password must be at least 6 characters long.";
  }

  if (Object.keys(errorFields).length > 0) {
    return { success: false, errorFields };
  }

  const accounts = getRegisteredOwnerAccounts();
  const accIndex = accounts.findIndex(
    (acc) => acc.email.toLowerCase() === normalizedEmail
  );

  if (accIndex !== -1) {
    accounts[accIndex].password = data.newPassword;
    localStorage.setItem(OWNER_ACCOUNTS_KEY, JSON.stringify(accounts));
    return { success: true };
  }

  if (DEFAULT_OWNER_CREDENTIALS.emails.includes(normalizedEmail)) {
    localStorage.setItem(DEFAULT_PASSWORD_OVERRIDE_KEY, data.newPassword);
    return { success: true };
  }

  return {
    success: false,
    errorFields: {
      email: "No registered owner account found for this Gmail address.",
    },
  };
}

export function verifyOwnerCredentials(data: LoginFormValues): {
  authenticated: boolean;
  session?: OwnerSession;
  error?: string;
} {
  const normalizedEmail = data.email.trim().toLowerCase();

  const registeredMatch = getRegisteredOwnerAccounts().find(
    (acc) =>
      acc.email.toLowerCase() === normalizedEmail &&
      acc.password === data.password
  );

  if (registeredMatch) {
    const session: OwnerSession = {
      email: registeredMatch.email,
      ownerName: registeredMatch.ownerName,
      loggedInAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    return { authenticated: true, session };
  }

  const expectedDefaultPassword =
    localStorage.getItem(DEFAULT_PASSWORD_OVERRIDE_KEY) ||
    DEFAULT_OWNER_CREDENTIALS.password;

  if (
    DEFAULT_OWNER_CREDENTIALS.emails.includes(normalizedEmail) &&
    data.password === expectedDefaultPassword
  ) {
    const session: OwnerSession = {
      email: normalizedEmail,
      ownerName: DEFAULT_OWNER_CREDENTIALS.ownerName,
      loggedInAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    return { authenticated: true, session };
  }

  return {
    authenticated: false,
    error: "Incorrect email or password. Please try again.",
  };
}

export function saveRememberedEmail(email: string, remember: boolean): void {
  if (remember) {
    localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
  } else {
    localStorage.removeItem(REMEMBER_EMAIL_KEY);
  }
}

export function getRememberedEmail(): string {
  return localStorage.getItem(REMEMBER_EMAIL_KEY) ?? "";
}

export function saveOwnerSession(session: OwnerSession): void {
  const normalized: OwnerSession = { ...session, role: "owner_manager" };
  const serialized = JSON.stringify(normalized);
  sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
  localStorage.setItem(SESSION_STORAGE_KEY, serialized);
}

export function getOwnerSession(): OwnerSession | null {
  try {
    const raw =
      sessionStorage.getItem(SESSION_STORAGE_KEY) ||
      localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OwnerSession;
    if (!parsed || !parsed.email) return null;
    return { ...parsed, role: "owner_manager" };
  } catch (err) {
    logWarn("AuthService", "Failed to read Owner/Manager session.", err);
    return null;
  }
}

export function clearOwnerSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Single-operator guard: ensures only the authenticated Owner/Manager can
 * access the dashboard or administrative operations.
 */
export function isOwnerAuthorized(session: OwnerSession | null): boolean {
  return Boolean(
    session &&
      session.email &&
      (session.role === "owner_manager" ||
        session.role === "owner" ||
        !session.role)
  );
}
