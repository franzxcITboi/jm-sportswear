// ============================================================================
// JM MAKER SPORTSWEAR — OWNER/MANAGER LOGIN & ACCOUNT CONTROLLER
// Manages Sign-In, Owner/Manager Account Setup, Caps Lock warnings, failed
// login lockout protection, and PIN-verified password reset modal.
// ============================================================================

import {
  evaluatePasswordStrength,
  getRememberedEmail,
  registerOwnerAccount,
  resetOwnerPassword,
  saveOwnerSession,
  saveRememberedEmail,
  validateLoginForm,
  validateOwnerRegistration,
  verifyOwnerCredentials,
} from "../services/authService";
import type {
  LoginFormValues,
  OwnerRegistrationValues,
  OwnerSession,
} from "../types/auth.types";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15;

export interface LoginControllerCallbacks {
  onAuthenticated: (session: OwnerSession) => void;
}

export interface LoginControllerAPI {
  resetToSignInMode: () => void;
  showStatusMessage: (message: string, type: "error" | "success") => void;
}

/** Wires a password field to its Show/Hide toggle button. */
function bindPasswordToggle(
  inputEl: HTMLInputElement | null,
  btnEl: HTMLButtonElement | null
): void {
  if (!inputEl || !btnEl) return;
  btnEl.addEventListener("click", () => {
    const isPassword = inputEl.type === "password";
    inputEl.type = isPassword ? "text" : "password";
    btnEl.textContent = isPassword ? "Hide" : "Show";
    btnEl.setAttribute(
      "aria-label",
      isPassword ? "Hide password" : "Show password"
    );
  });
}

export function initLoginController(
  callbacks: LoginControllerCallbacks
): LoginControllerAPI {
  // ---------------- Sign-In Form Elements ----------------
  const loginCard = document.querySelector<HTMLDivElement>(".login-card");
  const form = document.querySelector<HTMLFormElement>("#loginForm");
  const emailInput = document.querySelector<HTMLInputElement>("#email");
  const passwordInput = document.querySelector<HTMLInputElement>("#password");
  const rememberMeCheckbox =
    document.querySelector<HTMLInputElement>("#rememberMe");
  const togglePasswordBtn =
    document.querySelector<HTMLButtonElement>("#togglePasswordBtn");
  const capsLockWarning =
    document.querySelector<HTMLSpanElement>("#capsLockWarning");
  const loginBtn = document.querySelector<HTMLButtonElement>("#loginBtn");
  const loginBtnText = loginBtn?.querySelector<HTMLSpanElement>(".btn-text");
  const emailError = document.querySelector<HTMLSpanElement>("#emailError");
  const passwordError =
    document.querySelector<HTMLSpanElement>("#passwordError");
  const statusBanner = document.querySelector<HTMLDivElement>("#statusBanner");

  // ---------------- Registration Form Elements ----------------
  const registerOwnerForm =
    document.querySelector<HTMLFormElement>("#registerOwnerForm");
  const regOwnerNameInput =
    document.querySelector<HTMLInputElement>("#regOwnerName");
  const regEmailInput = document.querySelector<HTMLInputElement>("#regEmail");
  const regPasswordInput =
    document.querySelector<HTMLInputElement>("#regPassword");
  const toggleRegPasswordBtn = document.querySelector<HTMLButtonElement>(
    "#toggleRegPasswordBtn"
  );
  const passwordStrengthBox = document.querySelector<HTMLDivElement>(
    "#passwordStrengthBox"
  );
  const passwordStrengthText = document.querySelector<HTMLSpanElement>(
    "#passwordStrengthText"
  );
  const regConfirmPasswordInput = document.querySelector<HTMLInputElement>(
    "#regConfirmPassword"
  );
  const regOwnerPinInput =
    document.querySelector<HTMLInputElement>("#regOwnerPin");
  const regOwnerNameError =
    document.querySelector<HTMLSpanElement>("#regOwnerNameError");
  const regEmailError =
    document.querySelector<HTMLSpanElement>("#regEmailError");
  const regPasswordError =
    document.querySelector<HTMLSpanElement>("#regPasswordError");
  const regConfirmPasswordError = document.querySelector<HTMLSpanElement>(
    "#regConfirmPasswordError"
  );
  const regOwnerPinError =
    document.querySelector<HTMLSpanElement>("#regOwnerPinError");
  const registerOwnerBtn =
    document.querySelector<HTMLButtonElement>("#registerOwnerBtn");
  const registerOwnerBtnText =
    registerOwnerBtn?.querySelector<HTMLSpanElement>(".btn-text");
  const authSwitchPrompt =
    document.querySelector<HTMLSpanElement>("#authSwitchPrompt");
  const toggleAuthModeLink = document.querySelector<HTMLAnchorElement>(
    "#toggleAuthModeLink"
  );

  // ---------------- Forgot Password Modal Elements ----------------
  const forgotPasswordLink = document.querySelector<HTMLAnchorElement>(
    "#forgotPasswordLink"
  );
  const forgotModal = document.querySelector<HTMLDivElement>("#forgotModal");
  const closeForgotModalBtn = document.querySelector<HTMLButtonElement>(
    "#closeForgotModalBtn"
  );
  const cancelForgotBtn =
    document.querySelector<HTMLButtonElement>("#cancelForgotBtn");
  const forgotForm = document.querySelector<HTMLFormElement>("#forgotForm");
  const recoveryEmailInput =
    document.querySelector<HTMLInputElement>("#recoveryEmail");
  const recoveryPinInput =
    document.querySelector<HTMLInputElement>("#recoveryPin");
  const recoveryNewPasswordInput = document.querySelector<HTMLInputElement>(
    "#recoveryNewPassword"
  );
  const toggleRecoveryPasswordBtn = document.querySelector<HTMLButtonElement>(
    "#toggleRecoveryPasswordBtn"
  );
  const recoveryError =
    document.querySelector<HTMLSpanElement>("#recoveryError");
  const recoveryPinError =
    document.querySelector<HTMLSpanElement>("#recoveryPinError");
  const recoveryNewPasswordError = document.querySelector<HTMLSpanElement>(
    "#recoveryNewPasswordError"
  );
  const recoverySuccess =
    document.querySelector<HTMLDivElement>("#recoverySuccess");
  const sendRecoveryBtn =
    document.querySelector<HTMLButtonElement>("#sendRecoveryBtn");
  const sendRecoveryBtnText =
    sendRecoveryBtn?.querySelector<HTMLSpanElement>(".btn-text");

  if (
    !form ||
    !emailInput ||
    !passwordInput ||
    !rememberMeCheckbox ||
    !togglePasswordBtn ||
    !loginBtn ||
    !loginBtnText ||
    !emailError ||
    !passwordError ||
    !statusBanner
  ) {
    throw new Error("Missing required login form elements in index.html.");
  }

  let failedAttempts = 0;
  let isLockedOut = false;
  let isAuthenticating = false;
  let isRegisterMode = false;

  // Restore remembered owner email on load
  const savedEmail = getRememberedEmail();
  if (savedEmail) {
    emailInput.value = savedEmail;
    rememberMeCheckbox.checked = true;
  }

  function showStatusMessage(message: string, type: "error" | "success"): void {
    statusBanner!.textContent = message;
    statusBanner!.className = `status-banner status-${type}`;
    statusBanner!.hidden = false;
  }

  function triggerErrorShake(): void {
    if (!loginCard) return;
    loginCard.classList.remove("shake-error");
    void loginCard.offsetWidth;
    loginCard.classList.add("shake-error");
  }

  function setButtonLoading(loading: boolean): void {
    isAuthenticating = loading;
    loginBtn!.disabled = loading;
    loginBtn!.classList.toggle("is-loading", loading);
    loginBtnText!.textContent = loading ? "Signing In..." : "Sign In";
  }

  function triggerLockout(): void {
    isLockedOut = true;
    let remaining = LOCKOUT_SECONDS;
    loginBtn!.disabled = true;
    loginBtn!.classList.remove("is-loading");

    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(timer);
        isLockedOut = false;
        failedAttempts = 0;
        loginBtn!.disabled = false;
        loginBtnText!.textContent = "Sign In";
        statusBanner!.hidden = true;
      } else {
        loginBtnText!.textContent = `Locked (${remaining}s)`;
        showStatusMessage(
          `Too many failed attempts. Please wait ${remaining}s before trying again.`,
          "error"
        );
      }
    }, 1000);
  }

  function clearAllFieldErrors(): void {
    emailError!.textContent = "";
    passwordError!.textContent = "";
    if (regOwnerNameError) regOwnerNameError.textContent = "";
    if (regEmailError) regEmailError.textContent = "";
    if (regPasswordError) regPasswordError.textContent = "";
    if (regConfirmPasswordError) regConfirmPasswordError.textContent = "";
    if (regOwnerPinError) regOwnerPinError.textContent = "";
  }

  function setAuthMode(registerMode: boolean): void {
    if (!registerOwnerForm || !authSwitchPrompt || !toggleAuthModeLink) return;
    isRegisterMode = registerMode;
    statusBanner!.hidden = true;
    clearAllFieldErrors();

    form!.hidden = isRegisterMode;
    registerOwnerForm.hidden = !isRegisterMode;

    if (isRegisterMode) {
      authSwitchPrompt.textContent = "Already have an owner/manager account?";
      toggleAuthModeLink.textContent = "Back to Sign In";
      regOwnerNameInput?.focus();
    } else {
      authSwitchPrompt.textContent = "Setting up your owner/manager login?";
      toggleAuthModeLink.textContent = "Create Account";
      emailInput!.focus();
    }
  }

  toggleAuthModeLink?.addEventListener("click", (event: MouseEvent) => {
    event.preventDefault();
    setAuthMode(!isRegisterMode);
  });

  bindPasswordToggle(passwordInput, togglePasswordBtn);
  bindPasswordToggle(regPasswordInput, toggleRegPasswordBtn);
  bindPasswordToggle(recoveryNewPasswordInput, toggleRecoveryPasswordBtn);

  // Clear inline errors on user typing
  emailInput.addEventListener("input", () => {
    emailError.textContent = "";
    statusBanner.hidden = true;
  });

  passwordInput.addEventListener("input", () => {
    passwordError.textContent = "";
    statusBanner.hidden = true;
  });

  regOwnerNameInput?.addEventListener("input", () => {
    if (regOwnerNameError) regOwnerNameError.textContent = "";
  });
  regEmailInput?.addEventListener("input", () => {
    if (regEmailError) regEmailError.textContent = "";
  });
  regPasswordInput?.addEventListener("input", () => {
    if (regPasswordError) regPasswordError.textContent = "";
    if (!passwordStrengthBox || !passwordStrengthText) return;
    const strength = evaluatePasswordStrength(regPasswordInput.value);
    if (strength.level === "empty") {
      passwordStrengthBox.hidden = true;
    } else {
      passwordStrengthBox.hidden = false;
      passwordStrengthBox.className = `strength-box strength-${strength.level}`;
      passwordStrengthText.textContent = strength.label;
    }
  });
  regConfirmPasswordInput?.addEventListener("input", () => {
    if (regConfirmPasswordError) regConfirmPasswordError.textContent = "";
  });
  regOwnerPinInput?.addEventListener("input", () => {
    if (regOwnerPinError) regOwnerPinError.textContent = "";
  });

  // Caps Lock Detection on Sign-In Password Field
  function updateCapsLockState(event: KeyboardEvent | MouseEvent): void {
    if (!capsLockWarning) return;
    const isCapsOn = Boolean(
      event.getModifierState && event.getModifierState("CapsLock")
    );
    capsLockWarning.hidden = !isCapsOn;
  }

  passwordInput.addEventListener("keydown", updateCapsLockState);
  passwordInput.addEventListener("keyup", updateCapsLockState);
  passwordInput.addEventListener("click", updateCapsLockState);
  passwordInput.addEventListener("blur", () => {
    if (capsLockWarning) capsLockWarning.hidden = true;
  });

  // ---------------- Sign-In Submission ----------------
  form.addEventListener("submit", (event: SubmitEvent) => {
    event.preventDefault();
    if (isLockedOut || isAuthenticating) return;

    emailError.textContent = "";
    passwordError.textContent = "";
    statusBanner.hidden = true;

    const formData: LoginFormValues = {
      email: emailInput.value,
      password: passwordInput.value,
      rememberMe: rememberMeCheckbox.checked,
    };

    const validation = validateLoginForm(formData);
    if (!validation.isValid) {
      if (validation.errors.email) {
        emailError.textContent = validation.errors.email;
      }
      if (validation.errors.password) {
        passwordError.textContent = validation.errors.password;
      }
      triggerErrorShake();
      return;
    }

    setButtonLoading(true);

    window.setTimeout(() => {
      setButtonLoading(false);
      const authResult = verifyOwnerCredentials(formData);

      if (!authResult.authenticated || !authResult.session) {
        failedAttempts += 1;
        triggerErrorShake();
        if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
          triggerLockout();
        } else {
          const remainingTries = MAX_FAILED_ATTEMPTS - failedAttempts;
          showStatusMessage(
            `${authResult.error} (${remainingTries} attempt${
              remainingTries === 1 ? "" : "s"
            } left)`,
            "error"
          );
        }
        return;
      }

      failedAttempts = 0;
      saveRememberedEmail(formData.email, Boolean(formData.rememberMe));
      saveOwnerSession(authResult.session);
      passwordInput.value = "";
      callbacks.onAuthenticated(authResult.session);
    }, 650);
  });

  // ---------------- Account Creation Submission ----------------
  registerOwnerForm?.addEventListener("submit", (event: SubmitEvent) => {
    event.preventDefault();
    if (
      !regOwnerNameInput ||
      !regEmailInput ||
      !regPasswordInput ||
      !regConfirmPasswordInput ||
      !regOwnerPinInput ||
      !regOwnerNameError ||
      !regEmailError ||
      !regPasswordError ||
      !regConfirmPasswordError ||
      !regOwnerPinError ||
      !registerOwnerBtn ||
      !registerOwnerBtnText
    ) {
      return;
    }

    clearAllFieldErrors();

    const regValues: OwnerRegistrationValues = {
      ownerName: regOwnerNameInput.value,
      email: regEmailInput.value,
      password: regPasswordInput.value,
      confirmPassword: regConfirmPasswordInput.value,
      ownerPin: regOwnerPinInput.value,
    };

    const validation = validateOwnerRegistration(regValues);
    if (!validation.isValid) {
      if (validation.errors.ownerName) {
        regOwnerNameError.textContent = validation.errors.ownerName;
      }
      if (validation.errors.email) {
        regEmailError.textContent = validation.errors.email;
      }
      if (validation.errors.password) {
        regPasswordError.textContent = validation.errors.password;
      }
      if (validation.errors.confirmPassword) {
        regConfirmPasswordError.textContent = validation.errors.confirmPassword;
      }
      if (validation.errors.ownerPin) {
        regOwnerPinError.textContent = validation.errors.ownerPin;
      }
      triggerErrorShake();
      return;
    }

    registerOwnerBtn.disabled = true;
    registerOwnerBtn.classList.add("is-loading");
    registerOwnerBtnText.textContent = "Creating Account...";

    window.setTimeout(() => {
      registerOwnerBtn.disabled = false;
      registerOwnerBtn.classList.remove("is-loading");
      registerOwnerBtnText.textContent = "Create Owner/Manager Account";

      const newSession = registerOwnerAccount(regValues);
      saveRememberedEmail(regValues.email, true);
      emailInput.value = regValues.email.trim();
      regOwnerNameInput.value = "";
      regEmailInput.value = "";
      regPasswordInput.value = "";
      regConfirmPasswordInput.value = "";
      regOwnerPinInput.value = "";
      if (passwordStrengthBox) passwordStrengthBox.hidden = true;

      setAuthMode(false);
      showStatusMessage(
        `Owner/Manager account created for ${newSession.ownerName} (${newSession.email}). You can now sign in.`,
        "success"
      );
    }, 700);
  });

  // ---------------- Forgot Password Modal ----------------
  function closeForgotModal(): void {
    if (!forgotModal || !recoveryError || !recoverySuccess) return;
    forgotModal.hidden = true;
    recoveryError.textContent = "";
    if (recoveryPinError) recoveryPinError.textContent = "";
    if (recoveryNewPasswordError) recoveryNewPasswordError.textContent = "";
    recoverySuccess.hidden = true;
  }

  forgotPasswordLink?.addEventListener("click", (event: MouseEvent) => {
    event.preventDefault();
    if (!forgotModal || !recoveryEmailInput) return;
    recoveryEmailInput.value = emailInput.value.trim();
    if (recoveryPinInput) recoveryPinInput.value = "";
    if (recoveryNewPasswordInput) recoveryNewPasswordInput.value = "";
    forgotModal.hidden = false;
    recoveryEmailInput.focus();
  });

  closeForgotModalBtn?.addEventListener("click", closeForgotModal);
  cancelForgotBtn?.addEventListener("click", closeForgotModal);

  forgotModal?.addEventListener("click", (event: MouseEvent) => {
    if (event.target === forgotModal) closeForgotModal();
  });

  forgotForm?.addEventListener("submit", (event: SubmitEvent) => {
    event.preventDefault();
    if (
      !recoveryEmailInput ||
      !recoveryPinInput ||
      !recoveryNewPasswordInput ||
      !recoveryError ||
      !recoveryPinError ||
      !recoveryNewPasswordError ||
      !recoverySuccess ||
      !sendRecoveryBtn ||
      !sendRecoveryBtnText
    ) {
      return;
    }

    recoveryError.textContent = "";
    recoveryPinError.textContent = "";
    recoveryNewPasswordError.textContent = "";
    recoverySuccess.hidden = true;

    const resetResult = resetOwnerPassword({
      email: recoveryEmailInput.value,
      ownerPin: recoveryPinInput.value,
      newPassword: recoveryNewPasswordInput.value,
    });

    if (!resetResult.success) {
      if (resetResult.errorFields?.email) {
        recoveryError.textContent = resetResult.errorFields.email;
      }
      if (resetResult.errorFields?.ownerPin) {
        recoveryPinError.textContent = resetResult.errorFields.ownerPin;
      }
      if (resetResult.errorFields?.newPassword) {
        recoveryNewPasswordError.textContent =
          resetResult.errorFields.newPassword;
      }
      return;
    }

    sendRecoveryBtn.disabled = true;
    sendRecoveryBtn.classList.add("is-loading");
    sendRecoveryBtnText.textContent = "Updating...";

    window.setTimeout(() => {
      sendRecoveryBtn.disabled = false;
      sendRecoveryBtn.classList.remove("is-loading");
      sendRecoveryBtnText.textContent = "Update Password";
      recoverySuccess.textContent =
        "Owner password updated successfully! You can now close this window and sign in.";
      recoverySuccess.hidden = false;
      recoveryPinInput.value = "";
      recoveryNewPasswordInput.value = "";
    }, 650);
  });

  return {
    resetToSignInMode: () => setAuthMode(false),
    showStatusMessage,
  };
}
