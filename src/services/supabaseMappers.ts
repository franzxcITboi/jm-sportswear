// ============================================================================
// JM MAKER SPORTSWEAR — SUPABASE <-> DOMAIN MODEL MAPPERS
// Pure bidirectional transformations between normalized PostgreSQL tables and
// the frontend SystemState models (Orders, Sizes, Checklists, Inventory,
// Payments, Sales Logbook, Notifications, Audit Logs, and Owner Profile).
// ============================================================================

import {
  DEFAULT_LOGO_PATH,
  XXL_SURCHARGE_PER_PIECE,
} from "../config/constants";
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
  AuditLogEntry,
  CustomOrder,
  FulfillmentChecklist,
  InventoryItem,
  NotificationCategory,
  OwnerAvatarConfig,
  OwnerNotification,
  PaymentAccountInstruction,
  PaymentProofSubmission,
  PaymentVerificationLink,
  SalesLogbookEntry,
  SizeBreakdown,
  StaffMember,
  StaffTask,
  StockCondition,
} from "../types/system.types";

const SIZE_KEYS: Array<keyof SizeBreakdown> = ["XS", "S", "M", "L", "XL", "XXL"];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value?: string | null): value is string {
  return Boolean(value && UUID_REGEX.test(value));
}

function formatDbTimestamp(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDbLogbookTimestamp(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} \u2022 ${timePart}`;
}

export function mapSizeRowsToBreakdown(rows: OrderSizeItemRow[]): SizeBreakdown {
  const sizes: SizeBreakdown = { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
  for (const row of rows) {
    if (row.size_code in sizes) {
      sizes[row.size_code] = Math.max(0, Number(row.quantity) || 0);
    }
  }
  return sizes;
}

export function mapBreakdownToSizeInserts(
  orderUuid: string,
  ownerId: string,
  sizes: SizeBreakdown
): Array<{
  order_id: string;
  owner_id: string;
  size_code: keyof SizeBreakdown;
  quantity: number;
  surcharge_per_piece: number;
}> {
  return SIZE_KEYS.map((code) => ({
    order_id: orderUuid,
    owner_id: ownerId,
    size_code: code,
    quantity: Math.max(0, Number(sizes[code]) || 0),
    surcharge_per_piece: code === "XXL" ? XXL_SURCHARGE_PER_PIECE : 0,
  }));
}

export function mapChecklistRowToDomain(
  row?: OrderFulfillmentChecklistRow | null
): FulfillmentChecklist {
  return {
    orderReviewed: Boolean(row?.order_reviewed),
    designPrepared: Boolean(row?.design_prepared),
    itemsProduced: Boolean(row?.items_produced),
    quantitiesVerified: Boolean(row?.quantities_verified),
    qualityChecked: Boolean(row?.quality_checked),
  };
}

export function mapOrderRowToDomain(
  row: CustomOrderRow,
  sizeRows: OrderSizeItemRow[],
  checklistRow?: OrderFulfillmentChecklistRow | null,
  staffUuidToCode?: Map<string, string>
): CustomOrder {
  return {
    id: row.order_code,
    dbId: row.id,
    clientName: row.client_name,
    clientContact: row.client_contact || "",
    sublimationType: row.sublimation_type,
    colorway: row.colorway,
    printingOption: row.printing_option,
    unitPrice: Number(row.unit_price),
    sizes: mapSizeRowsToBreakdown(sizeRows),
    totalQty: Number(row.total_qty),
    discountAmount: Number(row.discount_amount) || 0,
    totalAmount: Number(row.total_amount),
    amountPaid: Number(row.amount_paid),
    stage: row.stage,
    specsVerified: Boolean(row.specs_verified),
    fulfillmentChecklist: mapChecklistRowToDomain(checklistRow),
    assignedStaffId:
      row.assigned_staff_id && staffUuidToCode
        ? staffUuidToCode.get(row.assigned_staff_id)
        : undefined,
    fulfilledAt: row.fulfilled_at
      ? formatDbLogbookTimestamp(row.fulfilled_at)
      : undefined,
    createdAt: row.order_date,
    jerseyTemplateImage: row.jersey_template_url || undefined,
    jerseyTemplateName: row.jersey_template_name || undefined,
  };
}

export function mapInventoryRowToDomain(
  row: InventoryItemRow,
  orderUuidToCode: Map<string, string>
): InventoryItem {
  return {
    id: row.sku_code,
    dbId: row.id,
    itemName: row.item_name,
    category: row.category,
    linkedOrderId: row.linked_order_id
      ? orderUuidToCode.get(row.linked_order_id)
      : undefined,
    qty: Number(row.qty),
    unitPrice: Number(row.unit_price),
    imageUrl: row.image_url || undefined,
    lowStockThreshold: Number(row.low_stock_threshold),
    status: row.status as StockCondition,
  };
}

export function mapPaymentAccountRowToDomain(
  row: PaymentAccountRow
): PaymentAccountInstruction {
  return {
    id: row.id,
    method: row.method,
    providerName: row.provider_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    instructions: row.instructions,
    active: row.is_active,
  };
}

export function mapPaymentLinkRowToDomain(
  row: PaymentVerificationLinkRow,
  latestSubmissionId?: string
): PaymentVerificationLink {
  return {
    id: row.id,
    token: row.token,
    orderId: row.order_code,
    orderLabel: row.order_label,
    buyerName: row.buyer_name,
    expectedAmount: Number(row.expected_amount),
    createdAt: formatDbTimestamp(row.created_at),
    expiresAt: row.expires_at,
    status: row.status,
    submissionId: latestSubmissionId,
  };
}

export function mapPaymentProofRowToDomain(
  row: PaymentProofSubmissionRow,
  linkIdToToken: Map<string, string>
): PaymentProofSubmission {
  return {
    id: row.id,
    submissionCode: row.submission_code,
    linkToken: linkIdToToken.get(row.verification_link_id),
    orderId: row.order_code,
    orderLabel: row.order_label,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    paymentMethod: row.payment_method,
    referenceNumber: row.reference_number,
    amount: Number(row.amount),
    paymentDate: row.payment_date,
    proofImageDataUrl: row.proof_image_url,
    proofFileName: row.proof_file_name,
    proofMimeType: row.proof_mime_type,
    proofFileSizeBytes: Number(row.proof_file_size_bytes),
    buyerNotes: row.buyer_notes,
    status: row.status,
    rejectionReason: row.rejection_reason || undefined,
    submittedAt: formatDbTimestamp(row.submitted_at),
    verifiedAt: row.verified_at ? formatDbTimestamp(row.verified_at) : undefined,
    verifiedBy: row.verified_by_name || undefined,
  };
}

export function mapSalesLogbookRowToDomain(
  row: SalesLogbookRow,
  invUuidToSku: Map<string, string>
): SalesLogbookEntry {
  return {
    dbId: row.id,
    logNo: row.log_no,
    dateTime: formatDbLogbookTimestamp(row.recorded_at),
    isoDate: row.transaction_date,
    orNumber: row.or_number,
    orderId: row.order_reference,
    clientName: row.client_name,
    particulars: row.particulars,
    productId: row.inventory_item_id
      ? invUuidToSku.get(row.inventory_item_id)
      : undefined,
    qty: Number(row.qty),
    unitPrice: Number(row.unit_price),
    paymentType: row.payment_type,
    paymentMethod: row.payment_method,
    referenceNumber: row.reference_number || undefined,
    paymentProofImage: row.payment_proof_image_url || undefined,
    amountPaid: Number(row.amount_paid),
    balanceRemaining: Number(row.balance_remaining),
    remarks: row.remarks,
  };
}

export function mapNotificationRowToDomain(
  row: NotificationRow,
  orderUuidToCode: Map<string, string>
): OwnerNotification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    category: row.category as NotificationCategory,
    severity: row.severity,
    timestamp: formatDbTimestamp(row.created_at),
    read: row.is_read,
    targetPage: row.target_page,
    linkedOrderId: row.linked_order_id
      ? orderUuidToCode.get(row.linked_order_id)
      : undefined,
  };
}

export function mapAuditLogRowToDomain(
  row: AuditLogRow,
  staffUuidToCode?: Map<string, string>,
  orderUuidToCode?: Map<string, string>,
  taskUuidToCode?: Map<string, string>
): AuditLogEntry {
  return {
    id: row.id,
    timestamp: formatDbTimestamp(row.created_at),
    module: row.module,
    action: row.action,
    actorName: row.actor_name || "JM Maker Owner/Manager",
    actorRole: row.actor_role || "owner_manager",
    actionType: row.action_type || "system",
    staffMemberId:
      row.staff_member_id && staffUuidToCode
        ? staffUuidToCode.get(row.staff_member_id)
        : undefined,
    relatedOrderId:
      row.related_order_id && orderUuidToCode
        ? orderUuidToCode.get(row.related_order_id)
        : undefined,
    relatedTaskId:
      row.related_task_id && taskUuidToCode
        ? taskUuidToCode.get(row.related_task_id)
        : undefined,
  };
}

export function mapStaffMemberRowToDomain(row: StaffMemberRow): StaffMember {
  return {
    id: row.staff_code,
    dbId: row.id,
    staffCode: row.staff_code,
    fullName: row.full_name,
    email: row.email || undefined,
    contactNumber: row.contact_number || "",
    positionTitle: row.position_title,
    roleLevel: row.role_level,
    availabilityStatus: row.availability_status,
    accountStatus: row.account_status,
    shiftSchedule: row.shift_schedule,
    permissions: {
      canManagePOS: Boolean(row.perm_pos),
      canManageOrders: Boolean(row.perm_orders),
      canManageInventory: Boolean(row.perm_inventory),
      canVerifyPayments: Boolean(row.perm_payments),
      canViewReports: Boolean(row.perm_reports),
    },
    lastLoginAt: row.last_login_at
      ? formatDbTimestamp(row.last_login_at)
      : undefined,
    createdAt: formatDbTimestamp(row.created_at),
  };
}

export function mapStaffTaskRowToDomain(
  row: StaffTaskRow,
  staffUuidToCode: Map<string, string>,
  orderUuidToCode: Map<string, string>,
  invUuidToSku: Map<string, string>
): StaffTask {
  return {
    id: row.task_code,
    dbId: row.id,
    taskCode: row.task_code,
    staffMemberId: staffUuidToCode.get(row.staff_member_id) || row.staff_member_id,
    linkedOrderId: row.linked_order_id
      ? orderUuidToCode.get(row.linked_order_id)
      : undefined,
    linkedInventoryItemId: row.linked_inventory_item_id
      ? invUuidToSku.get(row.linked_inventory_item_id)
      : undefined,
    title: row.title,
    description: row.description || "",
    taskType: row.task_type,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date || undefined,
    completedAt: row.completed_at
      ? formatDbLogbookTimestamp(row.completed_at)
      : undefined,
    createdAt: formatDbTimestamp(row.created_at),
  };
}

export function mapOwnerProfileToAvatarConfig(
  row: OwnerProfileRow
): OwnerAvatarConfig {
  return {
    mode: row.avatar_mode,
    uploadedDataUrl: row.avatar_url || DEFAULT_LOGO_PATH,
    bgColor: row.avatar_bg_color,
    skinColor: row.avatar_skin_color,
    hairStyle: row.avatar_hair_style,
    hairColor: row.avatar_hair_color,
    jerseyColor: row.avatar_jersey_color,
    accessory: row.avatar_accessory,
  };
}
