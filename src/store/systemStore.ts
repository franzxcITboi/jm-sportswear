// ============================================================================
// JM MAKER SPORTSWEAR — CENTRAL FRONTEND SYSTEM STORE
// Manages local state initialization, persistence, order selection, logbook
// entries, notifications, audit logs, and custom-order inventory sync.
// ============================================================================

import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  LEGACY_STORAGE_KEYS,
  STORAGE_KEY,
} from "../config/constants";
import type {
  AuditActionType,
  CustomOrder,
  FulfillmentChecklist,
  InventoryItem,
  OwnerNotification,
  SalesLogbookEntry,
  StaffMember,
  StaffTask,
  StockCondition,
  SystemState,
} from "../types/system.types";
import { computeStockStatus } from "../utils/calculations";
import {
  formatLogbookDateNow,
  formatTimeNow,
  getTodayIsoDate,
  inferIsoDateFromDisplay,
} from "../utils/formatters";
import { logError } from "../utils/logger";

/** Creates a blank 4-step fulfillment checklist for a new custom order. */
export function createEmptyFulfillmentChecklist(): FulfillmentChecklist {
  return {
    orderReviewed: false,
    designPrepared: false,
    itemsProduced: false,
    quantitiesVerified: false,
    qualityChecked: false,
  };
}

/** Ensures a CustomOrder always has an initialized fulfillmentChecklist object. */
export function getOrderChecklist(order: CustomOrder): FulfillmentChecklist {
  if (!order.fulfillmentChecklist) {
    order.fulfillmentChecklist = createEmptyFulfillmentChecklist();
  }
  return order.fulfillmentChecklist;
}

/**
 * Clean, empty initial state — zero preloaded demo customers, orders,
 * inventory items, transactions, notifications, or fake logs.
 */
export function createEmptySystemState(): SystemState {
  return {
    selectedOrderId: "",
    baseMonthlyRevenue: 0,
    lastBackupTime: "Not yet backed up",
    historicalMonthlySales: [],
    paymentAccounts: [],
    paymentVerificationLinks: [],
    paymentProofSubmissions: [],
    staffMembers: [],
    staffTasks: [],
    orders: [],
    inventory: [],
    salesLogbook: [],
    notifications: [],
    auditLogs: [],
  };
}

/** Loads and normalizes the current system state from localStorage. */
export function loadSystemState(): SystemState {
  try {
    // Clear legacy storage keys that previously contained preloaded demo records
    LEGACY_STORAGE_KEYS.forEach((oldKey) => {
      if (localStorage.getItem(oldKey) !== null) {
        localStorage.removeItem(oldKey);
      }
    });

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = createEmptySystemState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }

    const parsed = JSON.parse(raw) as Partial<SystemState>;
    const empty = createEmptySystemState();

    const inventory: InventoryItem[] = Array.isArray(parsed.inventory)
      ? parsed.inventory.map((item) => {
          const safeQty = Math.max(0, Number(item.qty) || 0);
          const threshold =
            Number(item.lowStockThreshold) || DEFAULT_LOW_STOCK_THRESHOLD;
          const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
          const status: StockCondition =
            item.category === "Completed Custom"
              ? "Pending Release"
              : computeStockStatus(safeQty, threshold);
          return {
            ...item,
            qty: safeQty,
            unitPrice,
            lowStockThreshold: threshold,
            status,
          };
        })
      : [];

    const orders: CustomOrder[] = Array.isArray(parsed.orders)
      ? parsed.orders.map((o) => ({
          ...o,
          fulfillmentChecklist:
            o.fulfillmentChecklist || createEmptyFulfillmentChecklist(),
        }))
      : [];

    const salesLogbook: SalesLogbookEntry[] = Array.isArray(parsed.salesLogbook)
      ? parsed.salesLogbook.map((e) => {
          const qty = Math.max(1, Number(e.qty) || 1);
          const isoDate = e.isoDate || inferIsoDateFromDisplay(e.dateTime);
          const unitPrice =
            typeof e.unitPrice === "number" && e.unitPrice > 0
              ? e.unitPrice
              : Math.round((Number(e.amountPaid) || 0) / qty);
          return {
            ...e,
            qty,
            isoDate,
            unitPrice,
            paymentMethod: e.paymentMethod || "Cash",
          };
        })
      : [];

    const selectedOrderId =
      parsed.selectedOrderId &&
      orders.some((o) => o.id === parsed.selectedOrderId)
        ? parsed.selectedOrderId
        : orders[0]?.id || "";

    const staffMembers: StaffMember[] = Array.isArray(parsed.staffMembers)
      ? parsed.staffMembers.map((s) => ({
          ...s,
          contactNumber: s.contactNumber || "",
          roleLevel: s.roleLevel || "staff",
          availabilityStatus: s.availabilityStatus || "On Duty",
          accountStatus: s.accountStatus || "Active",
          shiftSchedule: s.shiftSchedule || "Mon–Sat 8:00 AM – 5:00 PM",
          permissions: {
            canManagePOS: Boolean(s.permissions?.canManagePOS ?? true),
            canManageOrders: Boolean(s.permissions?.canManageOrders ?? true),
            canManageInventory: Boolean(s.permissions?.canManageInventory ?? true),
            canVerifyPayments: Boolean(s.permissions?.canVerifyPayments ?? false),
            canViewReports: Boolean(s.permissions?.canViewReports ?? false),
          },
        }))
      : [];

    const staffTasks: StaffTask[] = Array.isArray(parsed.staffTasks)
      ? parsed.staffTasks.map((t) => ({
          ...t,
          description: t.description || "",
          taskType: t.taskType || "Order Production",
          priority: t.priority || "Normal",
          status: t.status || "Pending",
        }))
      : [];

    return {
      ...empty,
      selectedOrderId,
      orders,
      inventory,
      salesLogbook,
      staffMembers,
      staffTasks,
      paymentAccounts: Array.isArray(parsed.paymentAccounts)
        ? parsed.paymentAccounts
        : [],
      paymentVerificationLinks: Array.isArray(parsed.paymentVerificationLinks)
        ? parsed.paymentVerificationLinks
        : [],
      paymentProofSubmissions: Array.isArray(parsed.paymentProofSubmissions)
        ? parsed.paymentProofSubmissions
        : [],
      historicalMonthlySales: [],
      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications
        : [],
      baseMonthlyRevenue: 0,
      lastBackupTime: parsed.lastBackupTime || "Not yet backed up",
      auditLogs: Array.isArray(parsed.auditLogs)
        ? parsed.auditLogs.map((a) => ({
            ...a,
            actorName: a.actorName || "JM Maker Owner/Manager",
            actorRole: a.actorRole || "owner_manager",
            actionType: a.actionType || inferAuditActionType(a.module, a.action),
          }))
        : [],
    };
  } catch (err) {
    logError(
      "SystemStore",
      "Failed to parse stored system state; falling back to clean empty state.",
      err
    );
    return createEmptySystemState();
  }
}

/** Saves the current SystemState snapshot into localStorage. */
export function saveSystemState(state: SystemState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Clears all local records and restores the clean empty initial state. */
export function resetSystemState(): SystemState {
  const empty = createEmptySystemState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
  return empty;
}

/** Returns the currently selected custom order, or null if no orders exist. */
export function getSelectedOrder(state: SystemState): CustomOrder | null {
  if (!state.orders || state.orders.length === 0) return null;
  return (
    state.orders.find((o) => o.id === state.selectedOrderId) ||
    state.orders[0] ||
    null
  );
}

function readActiveActorFromSession(): {
  actorName: string;
  actorRole: string;
  staffMemberId?: string;
} {
  try {
    const raw =
      (typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem("jm_owner_session")) ||
      (typeof localStorage !== "undefined" &&
        localStorage.getItem("jm_owner_session"));
    if (raw) {
      const parsed = JSON.parse(raw) as {
        ownerName?: string;
        role?: string;
        staffMemberId?: string;
      };
      if (parsed?.ownerName) {
        return {
          actorName: parsed.ownerName,
          actorRole: parsed.role || "owner_manager",
          staffMemberId: parsed.staffMemberId,
        };
      }
    }
  } catch {
    // Fallback to default Owner/Manager label
  }
  return { actorName: "JM Maker Owner/Manager", actorRole: "owner_manager" };
}

function inferAuditActionType(
  moduleName: string,
  action: string
): AuditActionType {
  const m = moduleName.toLowerCase();
  const a = action.toLowerCase();
  if (a.includes("signed in") || a.includes("logged in")) return "login";
  if (a.includes("signed out") || a.includes("logged out")) return "logout";
  if (a.includes("selling price") || a.includes("price of")) return "price_change";
  if (m.includes("inventory")) return "inventory_update";
  if (m.includes("task") || a.includes("task ")) return "task_update";
  if (m.includes("staff")) return "staff_admin";
  if (m.includes("payment") || m.includes("checkout") || m.includes("sales")) {
    return "payment";
  }
  if (m.includes("backup") || a.includes("backup") || a.includes("restored")) {
    return "backup";
  }
  if (m.includes("order") || m.includes("fulfillment")) return "order_update";
  return "system";
}

/** Appends a timestamped, actor-attributed record to the immutable audit trail. */
export function appendAuditLog(
  state: SystemState,
  moduleName: string,
  action: string,
  meta?: {
    actionType?: AuditActionType;
    actorName?: string;
    actorRole?: string;
    staffMemberId?: string;
    relatedOrderId?: string;
    relatedTaskId?: string;
  }
): void {
  const activeActor = readActiveActorFromSession();
  state.auditLogs.unshift({
    id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: formatTimeNow(),
    module: moduleName,
    action,
    actorName: meta?.actorName || activeActor.actorName,
    actorRole: meta?.actorRole || activeActor.actorRole,
    staffMemberId: meta?.staffMemberId || activeActor.staffMemberId,
    actionType: meta?.actionType || inferAuditActionType(moduleName, action),
    relatedOrderId: meta?.relatedOrderId,
    relatedTaskId: meta?.relatedTaskId,
  });
}

/** Appends a numbered transaction record to the consolidated Sales Logbook. */
export function appendLogbookEntry(
  state: SystemState,
  entry: Omit<SalesLogbookEntry, "logNo" | "dateTime" | "orNumber" | "isoDate"> & {
    isoDate?: string;
  }
): SalesLogbookEntry {
  const nextNum = state.salesLogbook.length + 1;
  const padded = String(nextNum).padStart(3, "0");
  const year = new Date().getFullYear();
  const fullEntry: SalesLogbookEntry = {
    logNo: `TXN-${year}-${padded}`,
    dateTime: formatLogbookDateNow(),
    isoDate: entry.isoDate || getTodayIsoDate(),
    orNumber: `INV-${entry.orderId.replace("#", "")}-${padded}`,
    ...entry,
  };
  state.salesLogbook.unshift(fullEntry);
  return fullEntry;
}

/** Adds an unread alert to the Owner/Manager Notifications feed. */
export function pushNotification(
  state: SystemState,
  notif: Omit<OwnerNotification, "id" | "timestamp" | "read">
): void {
  state.notifications.unshift({
    id: `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: formatTimeNow(),
    read: false,
    ...notif,
  });
}

/**
 * Keeps Finished Goods "Completed Custom Orders Ready for Pickup" in sync
 * with a custom order's fulfillment stage.
 */
export function syncCustomOrderInventory(
  state: SystemState,
  order: CustomOrder
): void {
  const invId = `INV-C-${order.id}`;
  const existingIdx = state.inventory.findIndex((item) => item.id === invId);

  if (
    order.stage === "Quality Inspection" ||
    order.stage === "Ready for Release"
  ) {
    const itemData: InventoryItem = {
      id: invId,
      itemName: `${order.clientName} Custom Set`,
      category: "Completed Custom",
      linkedOrderId: order.id,
      qty: order.totalQty,
      unitPrice: order.unitPrice,
      status: "Pending Release",
    };
    if (existingIdx >= 0) {
      state.inventory[existingIdx] = itemData;
    } else {
      state.inventory.push(itemData);
    }
  } else if (existingIdx >= 0) {
    state.inventory.splice(existingIdx, 1);
  }
}
