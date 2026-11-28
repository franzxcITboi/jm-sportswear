// ============================================================================
// JM MAKER SPORTSWEAR — OWNER/MANAGER AUTHENTICATION SERVICE
// Handles single-operator sign-in validation, account registration, PIN-based
// password reset, session persistence, and dashboard authorization guard.
// ============================================================================

import { STORAGE_KEY } from "../config/constants";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type {
  LoginFormValues,
  OwnerAccount,
  OwnerRegistrationValues,
  OwnerSession,
  PasswordResetValues,
  ValidationResult,
} from "../types/auth.types";
import type { PageId, StaffMember } from "../types/system.types";
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
  } else if (!isSupabaseConfigured()) {
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
      role: "owner_manager",
    };
    return { authenticated: true, session };
  }

  // Check Owner-created Active staff accounts (Capstone Objective 4 RBAC)
  try {
    const rawState = localStorage.getItem(STORAGE_KEY);
    if (rawState) {
      const parsed = JSON.parse(rawState) as { staffMembers?: StaffMember[] };
      const matchedStaff = (parsed.staffMembers || []).find(
        (s) =>
          s.email &&
          s.email.trim().toLowerCase() === normalizedEmail &&
          s.loginPassword &&
          s.loginPassword === data.password
      );
      if (matchedStaff) {
        if (matchedStaff.accountStatus !== "Active") {
          return {
            authenticated: false,
            error:
              "This staff account is currently inactive. Please contact the Owner/Manager.",
          };
        }
        const session: OwnerSession = {
          staffMemberId: matchedStaff.id,
          email: matchedStaff.email || normalizedEmail,
          ownerName: matchedStaff.fullName,
          loggedInAt: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          role: matchedStaff.roleLevel,
          permissions: { ...matchedStaff.permissions },
        };
        return { authenticated: true, session };
      }
    }
  } catch (err) {
    logWarn("AuthService", "Failed reading staff login records.", err);
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
  const normalized: OwnerSession = {
    ...session,
    role: session.role || "owner_manager",
  };
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
    return { ...parsed, role: parsed.role || "owner_manager" };
  } catch (err) {
    logWarn("AuthService", "Failed to read Owner/Manager session.", err);
    return null;
  }
}

export function clearOwnerSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/** Returns true if the active session belongs to the top-level Owner/Manager. */
export function isOwnerManager(session: OwnerSession | null): boolean {
  return Boolean(
    session &&
      session.email &&
      (session.role === "owner_manager" ||
        session.role === "owner" ||
        !session.role)
  );
}

/**
 * Payment & admin verification guard: allows Owner/Manager OR authorized staff
 * explicitly granted `canVerifyPayments` permission (Objective 4 RBAC).
 */
export function isOwnerAuthorized(session: OwnerSession | null): boolean {
  if (!session || !session.email) return false;
  if (isOwnerManager(session)) return true;
  return Boolean(session.permissions?.canVerifyPayments);
}

/** Returns true if any authenticated store user (Owner/Manager or active Staff) is logged in. */
export function isSessionAuthenticated(session: OwnerSession | null): boolean {
  return Boolean(session && session.email);
}

/**
 * Enforces Role-Based Access Control (RBAC) across dashboard navigation modules
 * (Capstone Paper Objective 4 & NIST RBAC alignment).
 */
export function canAccessPage(
  session: OwnerSession | null,
  page: PageId
): boolean {
  if (!session || !session.email) return false;
  if (isOwnerManager(session)) return true;

  const perms = session.permissions;
  if (page === "overview" || page === "notifications") return true;
  if (page === "staff-monitoring") return session.role === "supervisor";
  if (!perms) return false;

  switch (page) {
    case "pos-specs":
      return Boolean(perms.canManagePOS);
    case "workflow":
      return Boolean(perms.canManageOrders);
    case "inventory":
      return Boolean(perms.canManageInventory);
    case "payment-proofs":
      return Boolean(perms.canVerifyPayments);
    case "sales-logbook":
    case "analytics":
      return Boolean(perms.canViewReports);
    default:
      return false;
  }
}

// ============================================================================
// SUPABASE-AWARE ASYNC AUTHENTICATION WRAPPERS
// Routes to Supabase Auth when VITE_SUPABASE_URL/ANON_KEY are configured, and
// falls back seamlessly to local credentials for offline/unconfigured runs.
// ============================================================================

function formatLoginTimeNow(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function signInOwnerAsync(data: LoginFormValues): Promise<{
  authenticated: boolean;
  session?: OwnerSession;
  error?: string;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return verifyOwnerCredentials(data);
  }

  const normalizedEmail = data.email.trim().toLowerCase();
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: data.password,
  });

  if (error || !authData.user) {
    return {
      authenticated: false,
      error: error?.message || "Incorrect email or password. Please try again.",
    };
  }

  const { data: profile } = await supabase
    .from("owner_profiles")
    .select("owner_name")
    .eq("id", authData.user.id)
    .maybeSingle();

  const ownerName =
    profile?.owner_name ||
    (authData.user.user_metadata?.owner_name as string | undefined) ||
    DEFAULT_OWNER_CREDENTIALS.ownerName;

  const session: OwnerSession = {
    userId: authData.user.id,
    email: authData.user.email || normalizedEmail,
    ownerName,
    loggedInAt: formatLoginTimeNow(),
    role: "owner_manager",
  };
  saveOwnerSession(session);
  return { authenticated: true, session };
}

export async function registerOwnerAsync(
  data: OwnerRegistrationValues
): Promise<{
  success: boolean;
  session?: OwnerSession;
  error?: string;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: true, session: registerOwnerAccount(data) };
  }

  const normalizedEmail = data.email.trim().toLowerCase();
  const ownerName = data.ownerName.trim();

  const { data: authData, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: data.password,
    options: {
      data: { owner_name: ownerName, role: "owner_manager" },
    },
  });

  if (error || !authData.user) {
    return {
      success: false,
      error: error?.message || "Unable to create owner account in Supabase.",
    };
  }

  const session: OwnerSession = {
    userId: authData.user.id,
    email: authData.user.email || normalizedEmail,
    ownerName,
    loggedInAt: formatLoginTimeNow(),
    role: "owner_manager",
  };
  saveOwnerSession(session);
  return { success: true, session };
}

export async function resetOwnerPasswordAsync(
  data: PasswordResetValues
): Promise<{
  success: boolean;
  message?: string;
  errorFields?: {
    email?: string;
    ownerPin?: string;
    newPassword?: string;
  };
}> {
  if (!isSupabaseConfigured() || !supabase) {
    const localRes = resetOwnerPassword(data);
    return {
      ...localRes,
      message: localRes.success
        ? "Owner password updated successfully! You can now close this window and sign in."
        : undefined,
    };
  }

  const normalizedEmail = data.email.trim().toLowerCase();
  const errorFields: { email?: string; ownerPin?: string } = {};

  if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
    errorFields.email = "Please enter a valid registered email address.";
  }
  if (data.ownerPin.trim() !== OWNER_SECURITY_PIN) {
    errorFields.ownerPin = "Invalid Owner Security PIN (use 07122022).";
  }
  if (Object.keys(errorFields).length > 0) {
    return { success: false, errorFields };
  }

  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/index.html`
      : undefined;

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo,
  });

  if (error) {
    return { success: false, errorFields: { email: error.message } };
  }

  return {
    success: true,
    message:
      "Password reset link sent to your registered email via Supabase Auth.",
  };
}

export async function hydrateOwnerSessionAsync(): Promise<OwnerSession | null> {
  if (!isSupabaseConfigured() || !supabase) {
    return getOwnerSession();
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) {
    clearOwnerSession();
    return null;
  }

  const user = data.session.user;
  const { data: profile } = await supabase
    .from("owner_profiles")
    .select("owner_name")
    .eq("id", user.id)
    .maybeSingle();

  const session: OwnerSession = {
    userId: user.id,
    email: user.email || "",
    ownerName:
      profile?.owner_name ||
      (user.user_metadata?.owner_name as string | undefined) ||
      DEFAULT_OWNER_CREDENTIALS.ownerName,
    loggedInAt: formatLoginTimeNow(),
    role: "owner_manager",
  };
  saveOwnerSession(session);
  return session;
}

export async function signOutOwnerAsync(): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    await supabase.auth.signOut();
  }
  clearOwnerSession();
}
