// ============================================================================
// JM MAKER SPORTSWEAR — OWNER/MANAGER LOGIN PAGE ENTRY POINT
// Initializes the login, registration, and password reset controller.
// ============================================================================

import { initLoginController } from "./loginController";

initLoginController({
  onAuthenticated: () => {
    window.location.href = "./dashboard.html";
  },
});
