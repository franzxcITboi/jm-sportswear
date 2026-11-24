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
  clientName: string;
  sublimationType: string;
  colorway: string;
  printingOption: string;
  unitPrice: number;
  sizes: SizeBreakdown;
  totalQty: number;
  totalAmount: number;
  amountPaid: number;
  stage: WorkflowStage;
  specsVerified: boolean;
  fulfillmentChecklist?: FulfillmentChecklist;
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

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  module: string;
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
  historicalMonthlySales: HistoricalMonthlySales[];
  notifications: OwnerNotification[];
  baseMonthlyRevenue: number;
  lastBackupTime: string;
  auditLogs: AuditLogEntry[];
}
