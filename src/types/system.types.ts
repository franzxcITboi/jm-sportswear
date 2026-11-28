// ============================================================================
// JM MAKER SPORTSWEAR — CORE DOMAIN & SYSTEM STATE TYPES
// Shared TypeScript interfaces for orders, inventory, sales, payments,
// notifications, audit activity, avatar config, and overall SystemState.
// ============================================================================

export type PageId =
  | "overview"
  | "pos-specs"
  | "workflow"
  | "inventory"
  | "payment-proofs"
  | "sales-logbook"
  | "analytics"
  | "staff-monitoring"
  | "notifications";

export type WorkflowStage =
  | "Order Received"
  | "Production"
  | "Quality Inspection"
  | "Ready for Release"
  | "Released"
  | "Cancelled";

export interface SizeBreakdown {
  XS: number;
  S: number;
  M: number;
  L: number;
  XL: number;
  XXL: number;
}

export interface FulfillmentChecklist {
  orderReviewed: boolean;
  designPrepared: boolean;
  itemsProduced: boolean;
  quantitiesVerified: boolean;
  qualityChecked: boolean;
}

export interface CustomOrder {
  id: string;
  /** Authoritative PostgreSQL UUID when synced with Supabase */
  dbId?: string;
  clientName: string;
  /** Customer phone / Messenger contact (Interview Q4) */
  clientContact?: string;
  sublimationType: string;
  colorway: string;
  printingOption: string;
  unitPrice: number;
  sizes: SizeBreakdown;
  totalQty: number;
  /** Discount applied in PHP before final totalAmount (Objective 1) */
  discountAmount?: number;
  totalAmount: number;
  amountPaid: number;
  stage: WorkflowStage;
  specsVerified: boolean;
  fulfillmentChecklist?: FulfillmentChecklist;
  /** Optional assigned staff code/ID responsible for this order (Objective 4) */
  assignedStaffId?: string;
  fulfilledAt?: string;
  createdAt: string;
  jerseyTemplateImage?: string;
  jerseyTemplateName?: string;
}

export type StockCondition =
  | "In Stock"
  | "Low Stock"
  | "Out of Stock"
  | "Pending Release"
  | "Released";

export interface InventoryItem {
  id: string;
  /** Authoritative PostgreSQL UUID when synced with Supabase */
  dbId?: string;
  itemName: string;
  category: "Stock Apparel" | "Completed Custom";
  linkedOrderId?: string;
  qty: number;
  unitPrice: number;
  imageUrl?: string;
  lowStockThreshold?: number;
  status: StockCondition | "Available";
}

export type LogbookPaymentType =
  | "Downpayment"
  | "Balance Settlement"
  | "Full Payment"
  | "Walk-In Stock Sale";

export type PaymentMethod = "Cash" | "GCash" | "Bank Transfer" | "Maya";

export type PaymentProofStatus =
  | "Pending Verification"
  | "Approved"
  | "Rejected";

export type PaymentLinkStatus =
  | "Active"
  | "Submitted"
  | "Revoked"
  | "Expired";

export interface PaymentVerificationLink {
  id: string;
  /** Cryptographically random opaque token — no customer PII is exposed in URLs */
  token: string;
  orderId: string;
  orderLabel: string;
  buyerName: string;
  expectedAmount: number;
  createdAt: string;
  expiresAt: string; // ISO timestamp
  status: PaymentLinkStatus;
  submissionId?: string;
}

export interface PaymentAccountInstruction {
  id: string;
  method: "GCash" | "Bank Transfer" | "Maya";
  providerName: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  active: boolean;
}

export interface PaymentProofSubmission {
  id: string;
  submissionCode: string;
  linkToken?: string;
  orderId: string;
  orderLabel: string;
  buyerName: string;
  buyerEmail: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  proofImageDataUrl: string;
  proofFileName: string;
  proofMimeType: string;
  proofFileSizeBytes: number;
  buyerNotes: string;
  status: PaymentProofStatus;
  rejectionReason?: string;
  submittedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
}

export interface SalesLogbookEntry {
  /** Authoritative PostgreSQL UUID when synced with Supabase */
  dbId?: string;
  logNo: string;
  dateTime: string;
  isoDate: string; // YYYY-MM-DD for accurate filtering
  orNumber: string;
  orderId: string;
  clientName: string;
  particulars: string;
  productId?: string;
  qty: number;
  unitPrice?: number;
  paymentType: LogbookPaymentType;
  paymentMethod?: PaymentMethod;
  referenceNumber?: string;
  paymentProofImage?: string;
  amountPaid: number;
  balanceRemaining: number;
  remarks: string;
}

export type NotificationCategory =
  | "Orders & Payments"
  | "Fulfillment"
  | "Inventory"
  | "Store";

export interface OwnerNotification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory | string;
  severity: "urgent" | "warning" | "info" | "success";
  timestamp: string;
  read: boolean;
  targetPage: PageId;
  linkedOrderId?: string;
}

export type AuditActionType =
  | "login"
  | "logout"
  | "order_update"
  | "task_update"
  | "inventory_update"
  | "price_change"
  | "payment"
  | "backup"
  | "staff_admin"
  | "system";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  module: string;
  /** Operational actor who performed this change (Objective 4 & Interview Q18) */
  actorName?: string;
  actorRole?: string;
  actionType?: AuditActionType;
  staffMemberId?: string;
  relatedOrderId?: string;
  relatedTaskId?: string;
}

export type StaffRoleLevel = "owner_manager" | "supervisor" | "staff";
export type StaffAvailabilityStatus = "On Duty" | "Off Duty" | "On Leave";
export type StaffAccountStatus = "Active" | "Inactive";

export interface StaffPermissions {
  canManagePOS: boolean;
  canManageOrders: boolean;
  canManageInventory: boolean;
  canVerifyPayments: boolean;
  canViewReports: boolean;
}

export interface StaffMember {
  id: string;
  /** Authoritative PostgreSQL UUID when synced with Supabase */
  dbId?: string;
  staffCode: string;
  fullName: string;
  email?: string;
  /** Optional local sign-in password when testing staff RBAC login offline */
  loginPassword?: string;
  contactNumber: string;
  positionTitle: string;
  roleLevel: StaffRoleLevel;
  availabilityStatus: StaffAvailabilityStatus;
  accountStatus: StaffAccountStatus;
  shiftSchedule: string;
  permissions: StaffPermissions;
  lastLoginAt?: string;
  createdAt: string;
}

export type StaffTaskType =
  | "Order Production"
  | "Quality Inspection"
  | "Inventory Check"
  | "Order Release"
  | "General Shop Task";

export type StaffTaskPriority = "Low" | "Normal" | "High" | "Urgent";
export type StaffTaskStatus = "Pending" | "In Progress" | "Completed" | "Cancelled";

export interface StaffTask {
  id: string;
  /** Authoritative PostgreSQL UUID when synced with Supabase */
  dbId?: string;
  taskCode: string;
  staffMemberId: string;
  linkedOrderId?: string;
  linkedInventoryItemId?: string;
  title: string;
  description: string;
  taskType: StaffTaskType;
  priority: StaffTaskPriority;
  status: StaffTaskStatus;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
}

export interface HistoricalMonthlySales {
  monthKey: string;
  monthShort: string;
  year: number;
  revenue: number;
  unitsSold: number;
  transactions: number;
}

export type CharacterHairStyle =
  | "fade"
  | "part"
  | "spiky"
  | "curly"
  | "long"
  | "bun"
  | "cap"
  | "headband";

export type CharacterAccessory =
  | "none"
  | "grin"
  | "glasses"
  | "shades"
  | "mic";

export interface OwnerAvatarConfig {
  mode: "upload" | "custom";
  uploadedDataUrl?: string;
  bgColor: string;
  skinColor?: string;
  hairStyle?: CharacterHairStyle;
  hairColor?: string;
  jerseyColor?: string;
  accessory?: CharacterAccessory;
}

export interface SalesRevenueBreakdown {
  totalRevenue: number;
  totalUnitsSold: number;
  totalTransactions: number;
  customOrdersRevenue: number;
  customOrdersTxns: number;
  customOrdersUnits: number;
  stockSalesRevenue: number;
  stockSalesTxns: number;
  stockSalesUnits: number;
  cashTotal: number;
  gcashTotal: number;
  bankTotal: number;
}

export interface SystemState {
  orders: CustomOrder[];
  selectedOrderId: string;
  inventory: InventoryItem[];
  salesLogbook: SalesLogbookEntry[];
  paymentAccounts: PaymentAccountInstruction[];
  paymentVerificationLinks: PaymentVerificationLink[];
  paymentProofSubmissions: PaymentProofSubmission[];
  staffMembers: StaffMember[];
  staffTasks: StaffTask[];
  historicalMonthlySales: HistoricalMonthlySales[];
  notifications: OwnerNotification[];
  baseMonthlyRevenue: number;
  lastBackupTime: string;
  auditLogs: AuditLogEntry[];
}
