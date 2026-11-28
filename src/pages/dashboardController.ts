// ============================================================================
// JM MAKER SPORTSWEAR — OWNER/MANAGER DASHBOARD WORKSPACE SHELL
// Single-operator workspace controller managing route/view switching, auth
// protection, theme preference, print lightbox, cross-tab sync, and all
// business feature modules.
// ============================================================================

import {
  getOwnerAvatar,
  saveOwnerAvatarConfig,
} from "../components/avatarBuilder";
import { initAvatarCustomizationModal } from "../components/avatarModal";
import { STORAGE_KEY, THEME_STORAGE_KEY } from "../config/constants";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { initWorkflowModule } from "../modules/fulfillment/fulfillmentModule";
import { initInventoryModule } from "../modules/inventoryModule";
import type { ModuleContext } from "../modules/moduleTypes";
import { initNotificationsModule } from "../modules/notificationsModule";
import { initOverviewModule } from "../modules/overviewModule";
import { initPaymentVerificationModule } from "../modules/paymentVerificationModule";
import { initPosSpecsModule } from "../modules/posSpecsModule";
import { initAnalyticsUtilitiesModule } from "../modules/reports/salesReportsModule";
import { initSalesLogbookModule } from "../modules/salesLogbookModule";
import { initStaffMonitoringModule } from "../modules/staff/staffMonitoringModule";
import {
  canAccessPage,
  getOwnerSession,
  hydrateOwnerSessionAsync,
  isSessionAuthenticated,
  signOutOwnerAsync,
} from "../services/authService";
import {
  fetchFullSystemStateFromSupabase,
  queueSupabaseStateSync,
  subscribeToRealtimeStoreChanges,
  updateOwnerProfileInSupabase,
} from "../services/supabaseRepository";
import {
  appendAuditLog,
  getSelectedOrder,
  loadSystemState,
  saveSystemState,
} from "../store/systemStore";
import type { PageId, SystemState } from "../types/system.types";

/** Page header titles and descriptions indexed by module route ID. */
const PAGE_META: Record<PageId, { title: string; desc: string }> = {
  overview: {
    title: "Dashboard Overview",
    desc: "Summary of active custom orders, finished goods inventory, verified sales revenue, and store alerts.",
  },
  inventory: {
    title: "Finished Goods Inventory",
    desc: "Manage ready-made apparel stock, upload product images, set selling prices, and monitor stock levels.",
  },
  "pos-specs": {
    title: "Custom Orders & POS",
    desc: "Create or customize team sublimation orders, upload jersey templates, and auto-calculate totals.",
  },
  workflow: {
    title: "Order Fulfillment",
    desc: "Process custom orders step by step: Review Order, Prepare Order, Check Order, and Complete Fulfillment.",
  },
  "payment-proofs": {
    title: "Payment Proof Verification",
    desc: "Generate unique buyer payment links, inspect submitted receipt screenshots, and approve or reject payments.",
  },
  "sales-logbook": {
    title: "Sales History",
    desc: "Consolidated transaction logbook with multi-unit sales calculation, search, and date range filtering.",
  },
  analytics: {
    title: "Sales Analytics & Reports",
    desc: "Analyze daily, weekly, monthly, and annual revenue trends, order volume, inventory movement, CSV/PDF exports, and database backup & recovery.",
  },
  "staff-monitoring": {
    title: "Staff Monitoring & Audit Trail",
    desc: "Manage staff profiles and RBAC permissions, assign and track operational tasks, and review the immutable activity and login audit trail.",
  },
  notifications: {
    title: "Notifications & Store Alerts",
    desc: "Review real-time alerts for buyer payment proofs, low/out-of-stock products, orders, and fulfillment updates.",
  },
};

const state: SystemState = loadSystemState();
let currentPage: PageId = "overview";
let activeOwnerUserId: string | undefined;
let isHydratingFromRemote = false;
let toastTimer: number | undefined;

function showToast(message: string): void {
  const toastEl = document.getElementById("dashboardToast");
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 4200);
}

function printHtml(htmlContent: string): void {
  const printArea = document.getElementById("printableArea");
  if (!printArea) return;
  printArea.innerHTML = htmlContent;
  window.print();
}

function openImagePreview(src: string, title: string): void {
  const modal = document.getElementById("imagePreviewModal");
  const img = document.getElementById(
    "imagePreviewImg"
  ) as HTMLImageElement | null;
  const titleEl = document.getElementById("imagePreviewTitle");
  if (!modal || !img) return;
  img.src = src;
  if (titleEl) titleEl.textContent = title;
  modal.hidden = false;
}

function closeImagePreview(): void {
  const modal = document.getElementById("imagePreviewModal");
  if (modal) modal.hidden = true;
}

function closeMobileSidebar(): void {
  const root = document.getElementById("appLayoutRoot");
  const backdrop = document.getElementById("sidebarBackdrop");
  root?.classList.remove("sidebar-open");
  if (backdrop) backdrop.hidden = true;
}

const ctx: ModuleContext = {
  state,
  navigateTo: (page: PageId, orderId?: string) => {
    const activeSession = getOwnerSession();
    if (!canAccessPage(activeSession, page)) {
      showToast("Access restricted: Your account does not have permission for that module.");
      return;
    }
    if (orderId) {
      state.selectedOrderId = orderId;
    }
    currentPage = page;
    closeMobileSidebar();
    updatePageVisibility();
    refreshAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },
  refreshAll,
  showToast,
  printHtml,
  openImagePreview,
};

// Register all 9 separated dashboard modules
const modules = [
  initOverviewModule(ctx),
  initPosSpecsModule(ctx),
  initWorkflowModule(ctx),
  initInventoryModule(ctx),
  initPaymentVerificationModule(ctx),
  initSalesLogbookModule(ctx),
  initAnalyticsUtilitiesModule(ctx),
  initStaffMonitoringModule(ctx),
  initNotificationsModule(ctx),
];

function renderGlobalOrderSelector(): void {
  const selectEl = document.getElementById(
    "globalOrderSelect"
  ) as HTMLSelectElement | null;
  if (!selectEl) return;

  const active = getSelectedOrder(state);
  if (!active || state.orders.length === 0) {
    selectEl.innerHTML = `<option value="">No orders yet</option>`;
    selectEl.disabled = true;
    return;
  }

  selectEl.disabled = false;
  selectEl.innerHTML = state.orders
    .map(
      (o) =>
        `<option value="${o.id}" ${
          o.id === active.id ? "selected" : ""
        }>#${o.id} — ${o.clientName}</option>`
    )
    .join("");
}

function updatePageVisibility(): void {
  const meta = PAGE_META[currentPage] || PAGE_META.overview;

  const titleEl = document.getElementById("pageHeaderTitle");
  if (titleEl) titleEl.textContent = meta.title;

  const descEl = document.getElementById("pageHeaderDesc");
  if (descEl) descEl.textContent = meta.desc;

  const breadcrumbSep = document.getElementById("breadcrumbSep");
  const breadcrumbCurrent = document.getElementById("breadcrumbCurrent");
  const backBtn = document.getElementById("backToDashboardBtn");

  const isHome = currentPage === "overview";
  if (breadcrumbSep) breadcrumbSep.hidden = isHome;
  if (breadcrumbCurrent) {
    breadcrumbCurrent.hidden = isHome;
    breadcrumbCurrent.textContent = meta.title;
  }
  if (backBtn) backBtn.hidden = isHome;

  document
    .querySelectorAll<HTMLElement>("[data-page-view]")
    .forEach((viewEl) => {
      const pageId = viewEl.getAttribute("data-page-view");
      viewEl.hidden = pageId !== currentPage;
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-nav-page]")
    .forEach((btn) => {
      const pageId = btn.getAttribute("data-nav-page");
      btn.classList.toggle("active", pageId === currentPage);
    });
}

function refreshAll(): void {
  saveSystemState(state);
  renderGlobalOrderSelector();
  modules.forEach((mod) => mod.render());
  if (!isHydratingFromRemote && activeOwnerUserId && isSupabaseConfigured()) {
    void queueSupabaseStateSync(activeOwnerUserId, state);
  }
}

/**
 * Synchronizes the Owner/Manager dashboard whenever a buyer submits a payment
 * proof in another browser tab (buyer.html).
 */
function syncFromExternalStorage(): void {
  const latest = loadSystemState();
  Object.assign(state, latest);
  renderGlobalOrderSelector();
  modules.forEach((mod) => mod.render());
}

function applyTheme(theme: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  const iconEl = document.getElementById("themeToggleIcon");
  const textEl = document.getElementById("themeToggleText");
  if (iconEl) iconEl.textContent = theme === "dark" ? "\u2600" : "\u263E";
  if (textEl) textEl.textContent = theme === "dark" ? "Light" : "Dark";
}

function initSidebarControls(): void {
  const root = document.getElementById("appLayoutRoot");
  const backdrop = document.getElementById("sidebarBackdrop");
  const sidebarNav = document.getElementById("sidebarNav");

  document
    .getElementById("sidebarToggleBtn")
    ?.addEventListener("click", () => {
      const isOpen = root?.classList.toggle("sidebar-open");
      if (backdrop) backdrop.hidden = !isOpen;
    });

  backdrop?.addEventListener("click", closeMobileSidebar);

  sidebarNav?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(
      "[data-nav-page]"
    ) as HTMLButtonElement | null;
    if (!btn) return;
    const page = btn.getAttribute("data-nav-page") as PageId | null;
    if (page) ctx.navigateTo(page);
  });
}

async function hydrateFromSupabase(ownerId: string): Promise<void> {
  if (!isSupabaseConfigured() || !ownerId) return;
  const bundle = await fetchFullSystemStateFromSupabase(ownerId);
  if (!bundle) return;

  isHydratingFromRemote = true;
  Object.assign(state, bundle.state);
  saveSystemState(state);

  if (bundle.profile?.theme_preference) {
    applyTheme(bundle.profile.theme_preference);
  }
  if (bundle.avatarConfig) {
    saveOwnerAvatarConfig(bundle.avatarConfig);
    const avatarImg = document.getElementById(
      "ownerAvatarImg"
    ) as HTMLImageElement | null;
    if (avatarImg) avatarImg.src = getOwnerAvatar();
  }

  renderGlobalOrderSelector();
  modules.forEach((mod) => mod.render());
  isHydratingFromRemote = false;
}

async function initDashboardShell(): Promise<void> {
  // Enforce authentication guard (Owner/Manager or active RBAC Staff account)
  const session = await hydrateOwnerSessionAsync();
  if (!isSessionAuthenticated(session)) {
    window.location.replace("./index.html");
    return;
  }
  activeOwnerUserId = session?.userId;

  // Apply RBAC visibility on sidebar navigation buttons
  document
    .querySelectorAll<HTMLButtonElement>("[data-nav-page]")
    .forEach((btn) => {
      const pageId = btn.getAttribute("data-nav-page") as PageId | null;
      if (pageId && !canAccessPage(session, pageId)) {
        btn.hidden = true;
      }
    });

  const savedTheme =
    localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  applyTheme(savedTheme);

  const ownerDisplay = document.getElementById("ownerDisplayName");
  const modalOwnerName = document.getElementById("avatarModalOwnerName");
  const roleHintEl = document.querySelector(".owner-photo-hint");
  if (session) {
    if (ownerDisplay) ownerDisplay.textContent = session.ownerName;
    if (modalOwnerName) modalOwnerName.textContent = session.ownerName;
    if (roleHintEl) {
      const roleLabel =
        session.role === "staff"
          ? "Staff Account"
          : session.role === "supervisor"
          ? "Supervisor"
          : "Owner/Manager";
      roleHintEl.textContent = `${roleLabel} \u2022 Avatar`;
    }
  }

  const avatarImg = document.getElementById(
    "ownerAvatarImg"
  ) as HTMLImageElement | null;
  if (avatarImg) {
    avatarImg.src = getOwnerAvatar();
  }

  initSidebarControls();
  initAvatarCustomizationModal(showToast);

  // Image Preview Lightbox Modal close handlers
  document
    .getElementById("closeImagePreviewBtn")
    ?.addEventListener("click", closeImagePreview);
  document
    .getElementById("imagePreviewModal")
    ?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === "imagePreviewModal") {
        closeImagePreview();
      }
    });

  // Theme Toggle Button
  document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
    const current =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "light";
    const nextTheme = current === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    if (activeOwnerUserId && isSupabaseConfigured()) {
      void updateOwnerProfileInSupabase(activeOwnerUserId, {
        themePreference: nextTheme,
      });
    }
  });

  // Home / Overview navigation shortcuts
  document
    .getElementById("brandHomeBtn")
    ?.addEventListener("click", () => ctx.navigateTo("overview"));
  document
    .getElementById("breadcrumbHomeLink")
    ?.addEventListener("click", () => ctx.navigateTo("overview"));
  document
    .getElementById("backToDashboardBtn")
    ?.addEventListener("click", () => ctx.navigateTo("overview"));

  // Topbar Active Order switcher
  document
    .getElementById("globalOrderSelect")
    ?.addEventListener("change", (e) => {
      state.selectedOrderId = (e.target as HTMLSelectElement).value;
      refreshAll();
    });

  // Topbar Notification Alerts shortcut
  document
    .getElementById("topbarNotifBtn")
    ?.addEventListener("click", () => ctx.navigateTo("notifications"));

  // Sign Out button (records immutable logout entry before ending session)
  document
    .getElementById("signOutBtn")
    ?.addEventListener("click", async () => {
      const currentSession = getOwnerSession();
      appendAuditLog(
        state,
        "Authentication",
        `${currentSession?.ownerName || "User"} signed out of JM Maker Sportswear.`,
        {
          actionType: "logout",
          actorName: currentSession?.ownerName,
          actorRole: currentSession?.role,
          staffMemberId: currentSession?.staffMemberId,
        }
      );
      saveSystemState(state);
      if (activeOwnerUserId && isSupabaseConfigured()) {
        await queueSupabaseStateSync(activeOwnerUserId, state);
      }
      await signOutOwnerAsync();
      window.location.href = "./index.html";
    });

  // Cross-tab localStorage sync (when running locally in the same browser)
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      syncFromExternalStorage();
    }
  });

  updatePageVisibility();

  // Hydrate authoritative data from Supabase PostgreSQL and subscribe to Realtime
  if (activeOwnerUserId && isSupabaseConfigured()) {
    await hydrateFromSupabase(activeOwnerUserId);
    subscribeToRealtimeStoreChanges(activeOwnerUserId, () => {
      if (activeOwnerUserId) {
        void hydrateFromSupabase(activeOwnerUserId);
      }
    });
  } else {
    refreshAll();
  }
}

void initDashboardShell();
