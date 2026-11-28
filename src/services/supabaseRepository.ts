// ============================================================================
// JM MAKER SPORTSWEAR — SUPABASE POSTGRESQL REPOSITORY & REALTIME SYNC
// Bridges the normalized Supabase PostgreSQL schema with the dashboard and
// buyer portal while preserving fast optimistic UX and strict RLS security.
// ============================================================================

import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { createEmptySystemState } from "../store/systemStore";
import type {
  AuditLogRow,
  CustomOrderRow,
  InventoryItemRow,
  NotificationRow,
  OrderFulfillmentChecklistRow,
  OrderSizeItemRow,
  OwnerProfileRow,
  PaymentAccountRow,
  PaymentProofSubmissionRow,
  PaymentVerificationLinkRow,
  SalesLogbookRow,
  StaffMemberRow,
  StaffTaskRow,
} from "../types/database.types";
import type {
  OwnerAvatarConfig,
  PaymentProofSubmission,
  PaymentVerificationLink,
  StockCondition,
  SystemState,
} from "../types/system.types";
import { logError, logWarn } from "../utils/logger";
import type { ResolvedVerificationLink } from "./paymentLinkService";
import type { ServiceResult } from "./paymentProofService";
import type { TokenizedSubmissionPayload } from "./paymentValidation";
import {
  isUuid,
  mapAuditLogRowToDomain,
  mapBreakdownToSizeInserts,
  mapInventoryRowToDomain,
  mapNotificationRowToDomain,
  mapOrderRowToDomain,
  mapOwnerProfileToAvatarConfig,
  mapPaymentAccountRowToDomain,
  mapPaymentLinkRowToDomain,
  mapPaymentProofRowToDomain,
  mapSalesLogbookRowToDomain,
  mapStaffMemberRowToDomain,
  mapStaffTaskRowToDomain,
} from "./supabaseMappers";

export interface HydratedOwnerBundle {
  state: SystemState;
  profile: OwnerProfileRow | null;
  avatarConfig: OwnerAvatarConfig | null;
}

/**
 * Loads the complete authenticated Owner/Manager workspace from Supabase
 * PostgreSQL across all 11 normalized tables in parallel.
 */
export async function fetchFullSystemStateFromSupabase(
  ownerId: string
): Promise<HydratedOwnerBundle | null> {
  if (!supabase || !ownerId) return null;

  const [
    profileRes,
    staffRes,
    ordersRes,
    sizesRes,
    checklistsRes,
    inventoryRes,
    tasksRes,
    accountsRes,
    linksRes,
    proofsRes,
    logbookRes,
    notifsRes,
    auditsRes,
  ] = await Promise.all([
    supabase
      .from("owner_profiles")
      .select("*")
      .eq("id", ownerId)
      .maybeSingle(),
    supabase
      .from("staff_members")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("custom_orders")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("order_size_items")
      .select("*")
      .eq("owner_id", ownerId),
    supabase
      .from("order_fulfillment_checklists")
      .select("*")
      .eq("owner_id", ownerId),
    supabase
      .from("inventory_items")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("staff_tasks")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("payment_accounts")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("payment_verification_links")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("payment_proof_submissions")
      .select("*")
      .eq("owner_id", ownerId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("sales_logbook")
      .select("*")
      .eq("owner_id", ownerId)
      .order("recorded_at", { ascending: false }),
    supabase
      .from("notifications")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("audit_logs")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const errors = [
    profileRes.error,
    staffRes.error,
    ordersRes.error,
    sizesRes.error,
    checklistsRes.error,
    inventoryRes.error,
    tasksRes.error,
    accountsRes.error,
    linksRes.error,
    proofsRes.error,
    logbookRes.error,
    notifsRes.error,
    auditsRes.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    logError("SupabaseRepo", "Failed to hydrate state from Supabase.", errors);
    return null;
  }

  const profile = (profileRes.data as OwnerProfileRow | null) || null;
  const staffRows = (staffRes.data || []) as StaffMemberRow[];
  const orderRows = (ordersRes.data || []) as CustomOrderRow[];
  const sizeRows = (sizesRes.data || []) as OrderSizeItemRow[];
  const checklistRows = (checklistsRes.data || []) as OrderFulfillmentChecklistRow[];
  const inventoryRows = (inventoryRes.data || []) as InventoryItemRow[];
  const taskRows = (tasksRes.data || []) as StaffTaskRow[];
  const accountRows = (accountsRes.data || []) as PaymentAccountRow[];
  const linkRows = (linksRes.data || []) as PaymentVerificationLinkRow[];
  const proofRows = (proofsRes.data || []) as PaymentProofSubmissionRow[];
  const logbookRows = (logbookRes.data || []) as SalesLogbookRow[];
  const notifRows = (notifsRes.data || []) as NotificationRow[];
  const auditRows = (auditsRes.data || []) as AuditLogRow[];

  const staffUuidToCode = new Map<string, string>();
  const staffMembers = staffRows.map((row) => {
    staffUuidToCode.set(row.id, row.staff_code);
    return mapStaffMemberRowToDomain(row);
  });

  const sizesByOrderId = new Map<string, OrderSizeItemRow[]>();
  for (const s of sizeRows) {
    const arr = sizesByOrderId.get(s.order_id) || [];
    arr.push(s);
    sizesByOrderId.set(s.order_id, arr);
  }

  const checklistByOrderId = new Map<string, OrderFulfillmentChecklistRow>();
  for (const c of checklistRows) {
    checklistByOrderId.set(c.order_id, c);
  }

  const orderUuidToCode = new Map<string, string>();
  const orders = orderRows.map((row) => {
    orderUuidToCode.set(row.id, row.order_code);
    return mapOrderRowToDomain(
      row,
      sizesByOrderId.get(row.id) || [],
      checklistByOrderId.get(row.id),
      staffUuidToCode
    );
  });

  const invUuidToSku = new Map<string, string>();
  const inventory = inventoryRows.map((row) => {
    invUuidToSku.set(row.id, row.sku_code);
    return mapInventoryRowToDomain(row, orderUuidToCode);
  });

  const taskUuidToCode = new Map<string, string>();
  const staffTasks = taskRows.map((row) => {
    taskUuidToCode.set(row.id, row.task_code);
    return mapStaffTaskRowToDomain(
      row,
      staffUuidToCode,
      orderUuidToCode,
      invUuidToSku
    );
  });

  const linkIdToToken = new Map<string, string>();
  for (const l of linkRows) {
    linkIdToToken.set(l.id, l.token);
  }

  const latestSubByLinkId = new Map<string, string>();
  for (const p of proofRows) {
    if (!latestSubByLinkId.has(p.verification_link_id)) {
      latestSubByLinkId.set(p.verification_link_id, p.id);
    }
  }

  const paymentVerificationLinks = linkRows.map((row) =>
    mapPaymentLinkRowToDomain(row, latestSubByLinkId.get(row.id))
  );
  const paymentProofSubmissions = proofRows.map((row) =>
    mapPaymentProofRowToDomain(row, linkIdToToken)
  );
  const paymentAccounts = accountRows.map(mapPaymentAccountRowToDomain);
  const salesLogbook = logbookRows.map((row) =>
    mapSalesLogbookRowToDomain(row, invUuidToSku)
  );
  const notifications = notifRows.map((row) =>
    mapNotificationRowToDomain(row, orderUuidToCode)
  );
  const auditLogs = auditRows.map((row) =>
    mapAuditLogRowToDomain(row, staffUuidToCode, orderUuidToCode, taskUuidToCode)
  );

  const empty = createEmptySystemState();
  const state: SystemState = {
    ...empty,
    selectedOrderId: orders[0]?.id || "",
    orders,
    inventory,
    staffMembers,
    staffTasks,
    paymentAccounts,
    paymentVerificationLinks,
    paymentProofSubmissions,
    salesLogbook,
    notifications,
    auditLogs,
    lastBackupTime: profile?.last_backup_at
      ? new Date(profile.last_backup_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Not yet backed up",
  };

  return {
    state,
    profile,
    avatarConfig: profile ? mapOwnerProfileToAvatarConfig(profile) : null,
  };
}

// Serialized sync queue so rapid UI clicks never execute out of order
let syncQueue: Promise<void> = Promise.resolve();

/**
 * Persists the current in-memory SystemState cleanly to all normalized
 * Supabase PostgreSQL tables while respecting FK dependency ordering.
 */
export function queueSupabaseStateSync(
  ownerId: string,
  state: SystemState
): Promise<void> {
  if (!isSupabaseConfigured() || !ownerId) return Promise.resolve();
  syncQueue = syncQueue
    .then(() => syncSystemStateToSupabase(ownerId, state))
    .catch((err) => {
      logError("SupabaseSync", "Background sync encountered an error.", err);
    });
  return syncQueue;
}

function parseDisplayDateToIso(display?: string): string | null {
  if (!display) return null;
  const cleaned = display.replace(/\s*\u2022\s*/g, " ").trim();
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function syncSystemStateToSupabase(
  ownerId: string,
  state: SystemState
): Promise<void> {
  if (!supabase || !ownerId) return;

  // 0. Upsert staff_members first so custom_orders, staff_tasks, and audit_logs can reference UUIDs
  const staffCodeToUuid = new Map<string, string>();
  if (state.staffMembers.length > 0) {
    const staffPayloads = state.staffMembers.map((s) => ({
      owner_id: ownerId,
      auth_user_id: null,
      staff_code: s.staffCode || s.id,
      full_name: s.fullName,
      email: s.email?.trim() ? s.email.trim().toLowerCase() : null,
      contact_number: s.contactNumber || "",
      position_title: s.positionTitle,
      role_level: s.roleLevel,
      availability_status: s.availabilityStatus,
      account_status: s.accountStatus,
      shift_schedule: s.shiftSchedule || "Mon–Sat 8:00 AM – 5:00 PM",
      perm_pos: Boolean(s.permissions.canManagePOS),
      perm_orders: Boolean(s.permissions.canManageOrders),
      perm_inventory: Boolean(s.permissions.canManageInventory),
      perm_payments: Boolean(s.permissions.canVerifyPayments),
      perm_reports: Boolean(s.permissions.canViewReports),
      last_login_at: parseDisplayDateToIso(s.lastLoginAt),
    }));

    const { data: upsertedStaff, error: staffErr } = await supabase
      .from("staff_members")
      .upsert(staffPayloads, { onConflict: "owner_id,staff_code" })
      .select("id, staff_code");

    if (staffErr) {
      logWarn("SupabaseSync", "Failed syncing staff_members.", staffErr);
    } else {
      for (const row of upsertedStaff || []) {
        staffCodeToUuid.set(row.staff_code, row.id);
      }
      state.staffMembers.forEach((s) => {
        const uid = staffCodeToUuid.get(s.staffCode || s.id);
        if (uid) s.dbId = uid;
      });
    }
  }

  // Reconcile removed staff records
  const activeStaffCodes = new Set(
    state.staffMembers.map((s) => s.staffCode || s.id)
  );
  const { data: existingStaffRows } = await supabase
    .from("staff_members")
    .select("id, staff_code")
    .eq("owner_id", ownerId);
  const staffIdsToDelete = (existingStaffRows || [])
    .filter((r) => !activeStaffCodes.has(r.staff_code))
    .map((r) => r.id);
  if (staffIdsToDelete.length > 0) {
    await supabase.from("staff_members").delete().in("id", staffIdsToDelete);
  }

  // 1. Upsert custom_orders and capture authoritative UUIDs by order_code
  const orderCodeToUuid = new Map<string, string>();
  if (state.orders.length > 0) {
    const orderPayloads = state.orders.map((o) => ({
      owner_id: ownerId,
      order_code: o.id,
      client_name: o.clientName,
      client_contact: o.clientContact || "",
      sublimation_type: o.sublimationType,
      colorway: o.colorway || "Standard Colorway",
      printing_option: o.printingOption || "Full Sublimation",
      unit_price: Math.max(1, Number(o.unitPrice) || 800),
      total_qty: Math.max(0, Number(o.totalQty) || 0),
      discount_amount: Math.max(0, Number(o.discountAmount) || 0),
      total_amount: Math.max(0, Number(o.totalAmount) || 0),
      amount_paid: Math.min(
        Math.max(0, Number(o.totalAmount) || 0),
        Math.max(0, Number(o.amountPaid) || 0)
      ),
      stage: o.stage,
      specs_verified: Boolean(o.specsVerified),
      assigned_staff_id: o.assignedStaffId
        ? staffCodeToUuid.get(o.assignedStaffId) || null
        : null,
      jersey_template_url: o.jerseyTemplateImage || null,
      jersey_template_name: o.jerseyTemplateName || null,
      order_date: o.createdAt || new Date().toISOString().slice(0, 10),
      fulfilled_at:
        o.stage === "Released"
          ? parseDisplayDateToIso(o.fulfilledAt) || new Date().toISOString()
          : null,
    }));

    const { data: upsertedOrders, error: ordersErr } = await supabase
      .from("custom_orders")
      .upsert(orderPayloads, { onConflict: "owner_id,order_code" })
      .select("id, order_code");

    if (ordersErr) {
      logError("SupabaseSync", "Failed syncing custom_orders.", ordersErr);
      return;
    }

    for (const row of upsertedOrders || []) {
      orderCodeToUuid.set(row.order_code, row.id);
    }

    // 2. Sync normalized 1:N order_size_items & 1:1 order_fulfillment_checklists
    const sizeUpserts: Array<{
      order_id: string;
      owner_id: string;
      size_code: "XS" | "S" | "M" | "L" | "XL" | "XXL";
      quantity: number;
      surcharge_per_piece: number;
    }> = [];

    const checklistUpserts: Array<{
      order_id: string;
      owner_id: string;
      order_reviewed: boolean;
      design_prepared: boolean;
      items_produced: boolean;
      quantities_verified: boolean;
      quality_checked: boolean;
    }> = [];

    for (const order of state.orders) {
      const orderUuid = orderCodeToUuid.get(order.id);
      if (!orderUuid) continue;
      order.dbId = orderUuid;

      sizeUpserts.push(...mapBreakdownToSizeInserts(orderUuid, ownerId, order.sizes));

      const chk = order.fulfillmentChecklist;
      checklistUpserts.push({
        order_id: orderUuid,
        owner_id: ownerId,
        order_reviewed: Boolean(chk?.orderReviewed),
        design_prepared: Boolean(chk?.designPrepared),
        items_produced: Boolean(chk?.itemsProduced),
        quantities_verified: Boolean(chk?.quantitiesVerified),
        quality_checked: Boolean(chk?.qualityChecked),
      });
    }

    if (sizeUpserts.length > 0) {
      const { error: sizeErr } = await supabase
        .from("order_size_items")
        .upsert(sizeUpserts, { onConflict: "order_id,size_code" });
      if (sizeErr) logWarn("SupabaseSync", "Failed syncing order_size_items.", sizeErr);
    }

    if (checklistUpserts.length > 0) {
      const { error: chkErr } = await supabase
        .from("order_fulfillment_checklists")
        .upsert(checklistUpserts, { onConflict: "order_id" });
      if (chkErr) {
        logWarn("SupabaseSync", "Failed syncing order_fulfillment_checklists.", chkErr);
      }
    }
  }

  // 3. Sync inventory_items (and delete Completed Custom staging rows removed on release/cancel)
  const skuToUuid = new Map<string, string>();
  const validInventoryPayloads = state.inventory
    .map((item) => {
      const linkedOrderUuid =
        item.category === "Completed Custom" && item.linkedOrderId
          ? orderCodeToUuid.get(item.linkedOrderId) || null
          : null;
      if (item.category === "Completed Custom" && !linkedOrderUuid) return null;

      const normalizedStatus: StockCondition =
        item.status === "Available" ? "In Stock" : item.status;

      return {
        owner_id: ownerId,
        sku_code: item.id,
        item_name: item.itemName,
        category: item.category,
        linked_order_id: linkedOrderUuid,
        qty: Math.max(0, Number(item.qty) || 0),
        unit_price: Math.max(0, Number(item.unitPrice) || 0),
        low_stock_threshold: Math.max(0, Number(item.lowStockThreshold) || 10),
        status: normalizedStatus,
        image_url: item.imageUrl || null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (validInventoryPayloads.length > 0) {
    const { data: upsertedInv, error: invErr } = await supabase
      .from("inventory_items")
      .upsert(validInventoryPayloads, { onConflict: "owner_id,sku_code" })
      .select("id, sku_code");

    if (invErr) {
      logWarn("SupabaseSync", "Failed syncing inventory_items.", invErr);
    } else {
      for (const row of upsertedInv || []) {
        skuToUuid.set(row.sku_code, row.id);
      }
    }
  }

  // Reconcile removed inventory rows (e.g. deleted product or cleared Completed Custom staging)
  const activeSkus = new Set(validInventoryPayloads.map((i) => i.sku_code));
  const { data: existingInvRows } = await supabase
    .from("inventory_items")
    .select("id, sku_code")
    .eq("owner_id", ownerId);

  const invIdsToDelete = (existingInvRows || [])
    .filter((r) => !activeSkus.has(r.sku_code))
    .map((r) => r.id);

  if (invIdsToDelete.length > 0) {
    await supabase.from("inventory_items").delete().in("id", invIdsToDelete);
  }

  // 3a. Sync staff_tasks (after staff_members, custom_orders & inventory_items exist)
  const taskCodeToUuid = new Map<string, string>();
  if (state.staffTasks.length > 0) {
    const taskPayloads = state.staffTasks
      .map((t) => {
        const staffUuid = staffCodeToUuid.get(t.staffMemberId);
        if (!staffUuid) return null;
        return {
          owner_id: ownerId,
          staff_member_id: staffUuid,
          linked_order_id: t.linkedOrderId
            ? orderCodeToUuid.get(t.linkedOrderId) || null
            : null,
          linked_inventory_item_id: t.linkedInventoryItemId
            ? skuToUuid.get(t.linkedInventoryItemId) || null
            : null,
          task_code: t.taskCode || t.id,
          title: t.title,
          description: t.description || "",
          task_type: t.taskType,
          priority: t.priority,
          status: t.status,
          due_date: t.dueDate || null,
          completed_at:
            t.status === "Completed"
              ? parseDisplayDateToIso(t.completedAt) || new Date().toISOString()
              : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (taskPayloads.length > 0) {
      const { data: upsertedTasks, error: taskErr } = await supabase
        .from("staff_tasks")
        .upsert(taskPayloads, { onConflict: "owner_id,task_code" })
        .select("id, task_code");

      if (taskErr) {
        logWarn("SupabaseSync", "Failed syncing staff_tasks.", taskErr);
      } else {
        for (const row of upsertedTasks || []) {
          taskCodeToUuid.set(row.task_code, row.id);
        }
      }
    }
  }

  // Reconcile deleted staff tasks
  const activeTaskCodes = new Set(
    state.staffTasks.map((t) => t.taskCode || t.id)
  );
  const { data: existingTaskRows } = await supabase
    .from("staff_tasks")
    .select("id, task_code")
    .eq("owner_id", ownerId);
  const taskIdsToDelete = (existingTaskRows || [])
    .filter((r) => !activeTaskCodes.has(r.task_code))
    .map((r) => r.id);
  if (taskIdsToDelete.length > 0) {
    await supabase.from("staff_tasks").delete().in("id", taskIdsToDelete);
  }

  // 3b. Sync payment_accounts (official store GCash / Bank / Maya receiving accounts)
  if (state.paymentAccounts.length > 0) {
    const accountPayloads = state.paymentAccounts.map((acc) => ({
      owner_id: ownerId,
      method: acc.method,
      provider_name: acc.providerName,
      account_name: acc.accountName,
      account_number: acc.accountNumber,
      instructions: acc.instructions || "",
      is_active: Boolean(acc.active),
    }));
    const { error: accErr } = await supabase
      .from("payment_accounts")
      .upsert(accountPayloads, { onConflict: "owner_id,method,account_number" });
    if (accErr) logWarn("SupabaseSync", "Failed syncing payment_accounts.", accErr);
  }

  // 4. Sync payment_verification_links
  const tokenToLinkUuid = new Map<string, string>();
  if (state.paymentVerificationLinks.length > 0) {
    const linkPayloads = state.paymentVerificationLinks.map((lnk) => ({
      owner_id: ownerId,
      order_id: orderCodeToUuid.get(lnk.orderId) || null,
      token: lnk.token,
      order_code: lnk.orderId,
      order_label: lnk.orderLabel,
      buyer_name: lnk.buyerName,
      expected_amount: Math.max(0.01, Number(lnk.expectedAmount) || 1),
      status: lnk.status,
      expires_at: lnk.expiresAt,
    }));

    const { data: upsertedLinks, error: linkErr } = await supabase
      .from("payment_verification_links")
      .upsert(linkPayloads, { onConflict: "token" })
      .select("id, token");

    if (linkErr) {
      logWarn("SupabaseSync", "Failed syncing payment_verification_links.", linkErr);
    } else {
      for (const row of upsertedLinks || []) {
        tokenToLinkUuid.set(row.token, row.id);
      }
    }
  }

  // 5. Sync payment_proof_submissions (owner status updates)
  const subCodeToUuid = new Map<string, string>();
  if (state.paymentProofSubmissions.length > 0) {
    const proofPayloads = state.paymentProofSubmissions
      .map((sub) => {
        const linkUuid = sub.linkToken
          ? tokenToLinkUuid.get(sub.linkToken)
          : undefined;
        if (!linkUuid) return null;
        return {
          owner_id: ownerId,
          verification_link_id: linkUuid,
          order_id: orderCodeToUuid.get(sub.orderId) || null,
          submission_code: sub.submissionCode,
          order_code: sub.orderId,
          order_label: sub.orderLabel,
          buyer_name: sub.buyerName,
          buyer_email: sub.buyerEmail || "",
          payment_method: sub.paymentMethod,
          reference_number: sub.referenceNumber,
          amount: Math.max(0.01, Number(sub.amount) || 1),
          payment_date: sub.paymentDate || new Date().toISOString().slice(0, 10),
          proof_image_url: sub.proofImageDataUrl,
          proof_file_name: sub.proofFileName || "receipt.png",
          proof_mime_type: (sub.proofMimeType as "image/jpeg" | "image/png" | "image/webp") || "image/png",
          proof_file_size_bytes: Math.min(
            5242880,
            Math.max(1, Number(sub.proofFileSizeBytes) || 1024)
          ),
          buyer_notes: sub.buyerNotes || "",
          status: sub.status,
          rejection_reason: sub.status === "Rejected" ? sub.rejectionReason || "Rejected by owner" : null,
          verified_by_id: sub.status !== "Pending Verification" ? ownerId : null,
          verified_by_name: sub.verifiedBy || null,
          verified_at:
            sub.status !== "Pending Verification"
              ? parseDisplayDateToIso(sub.verifiedAt) || new Date().toISOString()
              : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (proofPayloads.length > 0) {
      const { data: upsertedProofs, error: proofErr } = await supabase
        .from("payment_proof_submissions")
        .upsert(proofPayloads, { onConflict: "owner_id,submission_code" })
        .select("id, submission_code");

      if (proofErr) {
        logWarn("SupabaseSync", "Failed syncing payment_proof_submissions.", proofErr);
      } else {
        for (const row of upsertedProofs || []) {
          subCodeToUuid.set(row.submission_code, row.id);
        }
      }
    }
  }

  // 6. Sync sales_logbook
  if (state.salesLogbook.length > 0) {
    const logPayloads = state.salesLogbook.map((entry) => {
      const cleanedCode = entry.orderId.replace(/^#/, "");
      const linkedOrderUuid =
        entry.paymentType !== "Walk-In Stock Sale"
          ? orderCodeToUuid.get(cleanedCode) || null
          : null;
      const linkedInvUuid = entry.productId
        ? skuToUuid.get(entry.productId) || null
        : null;

      // Match optional payment proof code from remarks (e.g., PAY-2026-0001)
      const codeMatch = entry.remarks.match(/PAY-\d{4}-\d{4}/);
      const linkedProofUuid = codeMatch
        ? subCodeToUuid.get(codeMatch[0]) || null
        : null;

      return {
        owner_id: ownerId,
        order_id: linkedOrderUuid,
        inventory_item_id: linkedInvUuid,
        payment_proof_id: linkedProofUuid,
        log_no: entry.logNo,
        or_number: entry.orNumber,
        order_reference: entry.orderId,
        transaction_date: entry.isoDate || new Date().toISOString().slice(0, 10),
        client_name: entry.clientName,
        particulars: entry.particulars,
        qty: Math.max(1, Number(entry.qty) || 1),
        unit_price: Math.max(0, Number(entry.unitPrice) || 0),
        payment_type: entry.paymentType,
        payment_method: entry.paymentMethod || "Cash",
        reference_number: entry.referenceNumber || null,
        payment_proof_image_url: entry.paymentProofImage || null,
        amount_paid: Math.max(0, Number(entry.amountPaid) || 0),
        balance_remaining: Math.max(0, Number(entry.balanceRemaining) || 0),
        remarks: entry.remarks || "",
      };
    });

    const { error: logErr } = await supabase
      .from("sales_logbook")
      .upsert(logPayloads, { onConflict: "owner_id,log_no" });
    if (logErr) logWarn("SupabaseSync", "Failed syncing sales_logbook.", logErr);
  }

  // 7. Sync notifications (insert newly created client notifications + sync is_read flags)
  for (const notif of state.notifications) {
    if (isUuid(notif.id)) {
      await supabase
        .from("notifications")
        .update({ is_read: notif.read })
        .eq("id", notif.id)
        .eq("owner_id", ownerId);
    } else {
      const validCat = (
        ["Orders & Payments", "Fulfillment", "Inventory", "Store"] as const
      ).includes(notif.category as "Orders & Payments")
        ? (notif.category as
            | "Orders & Payments"
            | "Fulfillment"
            | "Inventory"
            | "Store")
        : "Store";

      const { data: insertedNotif } = await supabase
        .from("notifications")
        .insert({
          owner_id: ownerId,
          linked_order_id: notif.linkedOrderId
            ? orderCodeToUuid.get(notif.linkedOrderId) || null
            : null,
          linked_inventory_item_id: null,
          linked_payment_proof_id: null,
          title: notif.title,
          message: notif.message,
          category: validCat,
          severity: notif.severity,
          is_read: notif.read,
          target_page: notif.targetPage,
        })
        .select("id")
        .single();

      if (insertedNotif?.id) {
        notif.id = insertedNotif.id;
      }
    }
  }

  // 8. Append new audit_logs (strictly immutable append-only with actor attribution)
  const newAudits = state.auditLogs.filter((a) => !isUuid(a.id));
  if (newAudits.length > 0) {
    const { data: insertedAudits } = await supabase
      .from("audit_logs")
      .insert(
        newAudits.map((a) => ({
          owner_id: ownerId,
          related_order_id: a.relatedOrderId
            ? orderCodeToUuid.get(a.relatedOrderId) || null
            : null,
          staff_member_id: a.staffMemberId
            ? staffCodeToUuid.get(a.staffMemberId) || null
            : null,
          related_task_id: a.relatedTaskId
            ? taskCodeToUuid.get(a.relatedTaskId) || null
            : null,
          actor_name: a.actorName || "JM Maker Owner/Manager",
          actor_role: a.actorRole || "owner_manager",
          action_type: a.actionType || "system",
          module: a.module,
          action: a.action,
        }))
      )
      .select("id");

    if (insertedAudits) {
      insertedAudits.forEach((row, idx) => {
        if (newAudits[idx]) newAudits[idx].id = row.id;
      });
    }
  }
}

/** Updates owner profile preferences (avatar config, theme, backup time) in Supabase. */
export async function updateOwnerProfileInSupabase(
  ownerId: string,
  patch: Partial<{
    themePreference: "light" | "dark";
    avatarConfig: OwnerAvatarConfig;
    lastBackupAt: string;
  }>
): Promise<void> {
  if (!supabase || !ownerId) return;

  const updatePayload: Partial<OwnerProfileRow> = {};
  if (patch.themePreference) {
    updatePayload.theme_preference = patch.themePreference;
  }
  if (patch.lastBackupAt) {
    updatePayload.last_backup_at = patch.lastBackupAt;
  }
  if (patch.avatarConfig) {
    updatePayload.avatar_mode = patch.avatarConfig.mode;
    updatePayload.avatar_url = patch.avatarConfig.uploadedDataUrl || null;
    updatePayload.avatar_bg_color = patch.avatarConfig.bgColor;
    if (patch.avatarConfig.skinColor) {
      updatePayload.avatar_skin_color = patch.avatarConfig.skinColor;
    }
    if (patch.avatarConfig.hairStyle) {
      updatePayload.avatar_hair_style = patch.avatarConfig.hairStyle;
    }
    if (patch.avatarConfig.hairColor) {
      updatePayload.avatar_hair_color = patch.avatarConfig.hairColor;
    }
    if (patch.avatarConfig.jerseyColor) {
      updatePayload.avatar_jersey_color = patch.avatarConfig.jerseyColor;
    }
    if (patch.avatarConfig.accessory) {
      updatePayload.avatar_accessory = patch.avatarConfig.accessory;
    }
  }

  if (Object.keys(updatePayload).length === 0) return;
  const { error } = await supabase
    .from("owner_profiles")
    .update(updatePayload)
    .eq("id", ownerId);

  if (error) {
    logWarn("SupabaseProfile", "Could not persist owner profile update.", error);
  }
}

/** Resets all store records for the authenticated owner inside PostgreSQL. */
export async function resetOwnerDataInSupabase(): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("reset_owner_store_data");
  if (error) {
    logError("SupabaseRepo", "Failed to reset owner store data.", error);
    return false;
  }
  return true;
}

// ============================================================================
// TOKEN-GATED BUYER PORTAL RPC CALLS (NO LOGIN REQUIRED — USES `anon` ROLE)
// ============================================================================

export async function resolveVerificationLinkFromSupabase(
  token: string | null
): Promise<ResolvedVerificationLink> {
  if (!supabase) {
    return {
      valid: false,
      reason: "not_found",
      message: "Supabase client is not configured.",
    };
  }

  const { data, error } = await supabase.rpc(
    "resolve_payment_verification_link",
    { p_token: (token || "").trim() }
  );

  if (error || !data || typeof data !== "object") {
    logError("BuyerRPC", "Failed to resolve payment verification link.", error);
    return {
      valid: false,
      reason: "not_found",
      message: "Unable to verify payment link right now. Please try again.",
    };
  }

  const res = data as unknown as {
    valid: boolean;
    reason?: ResolvedVerificationLink["reason"];
    message?: string;
    link?: PaymentVerificationLink;
    latestSubmission?: PaymentProofSubmission | null;
  };

  return {
    valid: Boolean(res.valid),
    reason: res.reason,
    message: res.message,
    link: res.link,
    latestSubmission: res.latestSubmission || undefined,
  };
}

export async function submitTokenizedProofToSupabase(
  payload: TokenizedSubmissionPayload
): Promise<ServiceResult<PaymentProofSubmission>> {
  if (!supabase) {
    return { success: false, error: "Supabase client is not configured." };
  }

  const { data, error } = await supabase.rpc("submit_tokenized_payment_proof", {
    p_token: payload.token.trim(),
    p_reference_number: payload.referenceNumber,
    p_proof_image_url: payload.proofImageDataUrl,
    p_proof_file_name: payload.proofFileName,
    p_proof_mime_type: payload.proofMimeType,
    p_proof_file_size_bytes: payload.proofFileSizeBytes,
    p_buyer_notes: payload.buyerNotes || "",
  });

  if (error || !data || typeof data !== "object") {
    logError("BuyerRPC", "Failed submitting payment proof.", error);
    return {
      success: false,
      error: "Unable to submit payment proof right now. Please try again.",
    };
  }

  const parsed = data as unknown as {
    success: boolean;
    data?: PaymentProofSubmission;
    error?: string;
  };

  return parsed;
}

// ============================================================================
// OWNER/MANAGER TRANSACTIONAL RPC WRAPPERS (authenticated role)
// ============================================================================

export async function approvePaymentProofInSupabase(
  submissionId: string
): Promise<ServiceResult<{ submissionId: string; submissionCode: string; amount: number }>> {
  if (!supabase) {
    return { success: false, error: "Supabase client is not configured." };
  }
  const { data, error } = await supabase.rpc("approve_payment_proof", {
    p_submission_id: submissionId,
  });
  if (error || !data || typeof data !== "object") {
    logError("OwnerRPC", "Failed approving payment proof.", error);
    return { success: false, error: error?.message || "Approval failed." };
  }
  const res = data as unknown as {
    success: boolean;
    submissionId?: string;
    submissionCode?: string;
    amount?: number;
    error?: string;
  };
  return res.success && res.submissionId && res.submissionCode
    ? {
        success: true,
        data: {
          submissionId: res.submissionId,
          submissionCode: res.submissionCode,
          amount: Number(res.amount) || 0,
        },
      }
    : { success: false, error: res.error || "Unable to approve payment proof." };
}

export async function rejectPaymentProofInSupabase(
  submissionId: string,
  reason: string
): Promise<ServiceResult<{ submissionId: string; submissionCode: string }>> {
  if (!supabase) {
    return { success: false, error: "Supabase client is not configured." };
  }
  const { data, error } = await supabase.rpc("reject_payment_proof", {
    p_submission_id: submissionId,
    p_reason: reason,
  });
  if (error || !data || typeof data !== "object") {
    logError("OwnerRPC", "Failed rejecting payment proof.", error);
    return { success: false, error: error?.message || "Rejection failed." };
  }
  const res = data as unknown as {
    success: boolean;
    submissionId?: string;
    submissionCode?: string;
    error?: string;
  };
  return res.success && res.submissionId && res.submissionCode
    ? {
        success: true,
        data: {
          submissionId: res.submissionId,
          submissionCode: res.submissionCode,
        },
      }
    : { success: false, error: res.error || "Unable to reject payment proof." };
}

export async function recordWalkInStockSaleInSupabase(params: {
  inventoryItemId: string;
  clientName: string;
  qty: number;
  paymentMethod?: string;
  referenceNumber?: string | null;
  paymentProofImageUrl?: string | null;
}): Promise<ServiceResult<{ entryId: string; logNo: string; totalAmount: number }>> {
  if (!supabase) {
    return { success: false, error: "Supabase client is not configured." };
  }
  const { data, error } = await supabase.rpc("record_walk_in_stock_sale", {
    p_inventory_item_id: params.inventoryItemId,
    p_client_name: params.clientName,
    p_qty: params.qty,
    p_payment_method: params.paymentMethod || "Cash",
    p_reference_number: params.referenceNumber || null,
    p_payment_proof_image_url: params.paymentProofImageUrl || null,
  });
  if (error || !data || typeof data !== "object") {
    logError("OwnerRPC", "Failed recording walk-in stock sale.", error);
    return { success: false, error: error?.message || "Stock sale failed." };
  }
  const res = data as unknown as {
    success: boolean;
    entryId?: string;
    logNo?: string;
    totalAmount?: number;
    error?: string;
  };
  return res.success && res.entryId && res.logNo
    ? {
        success: true,
        data: {
          entryId: res.entryId,
          logNo: res.logNo,
          totalAmount: Number(res.totalAmount) || 0,
        },
      }
    : { success: false, error: res.error || "Unable to record stock sale." };
}

/**
 * Subscribes to live PostgreSQL changes so buyer proof submissions from any
 * device appear immediately in the Owner/Manager dashboard.
 */
export function subscribeToRealtimeStoreChanges(
  ownerId: string,
  onRemoteUpdate: () => void
): () => void {
  if (!supabase || !ownerId) return () => {};

  const channel = supabase
    .channel(`jm-store-${ownerId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "payment_proof_submissions",
        filter: `owner_id=eq.${ownerId}`,
      },
      onRemoteUpdate
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `owner_id=eq.${ownerId}`,
      },
      onRemoteUpdate
    )
    .subscribe();

  return () => {
    void supabase?.removeChannel(channel);
  };
}
