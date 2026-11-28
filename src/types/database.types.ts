// ============================================================================
// JM MAKER SPORTSWEAR — SUPABASE POSTGRESQL DATABASE TYPES
// Strictly mirrors supabase/migrations/202611260001-0003 for full type safety
// with @supabase/supabase-js (PostgREST v12 GenericSchema compatible).
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OwnerProfileRow = {
  id: string;
  owner_name: string;
  email: string;
  role: "owner_manager";
  theme_preference: "light" | "dark";
  avatar_mode: "upload" | "custom";
  avatar_url: string | null;
  avatar_bg_color: string;
  avatar_skin_color: string;
  avatar_hair_style:
    | "fade"
    | "part"
    | "spiky"
    | "curly"
    | "long"
    | "bun"
    | "cap"
    | "headband";
  avatar_hair_color: string;
  avatar_jersey_color: string;
  avatar_accessory: "none" | "grin" | "glasses" | "shades" | "mic";
  last_backup_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomOrderRow = {
  id: string;
  owner_id: string;
  order_code: string;
  client_name: string;
  client_contact: string;
  sublimation_type: string;
  colorway: string;
  printing_option: string;
  unit_price: number;
  total_qty: number;
  discount_amount: number;
  total_amount: number;
  amount_paid: number;
  stage:
    | "Order Received"
    | "Production"
    | "Quality Inspection"
    | "Ready for Release"
    | "Released"
    | "Cancelled";
  specs_verified: boolean;
  assigned_staff_id: string | null;
  jersey_template_url: string | null;
  jersey_template_name: string | null;
  order_date: string;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderSizeItemRow = {
  id: string;
  order_id: string;
  owner_id: string;
  size_code: "XS" | "S" | "M" | "L" | "XL" | "XXL";
  quantity: number;
  surcharge_per_piece: number;
  created_at: string;
  updated_at: string;
};

export type OrderFulfillmentChecklistRow = {
  order_id: string;
  owner_id: string;
  order_reviewed: boolean;
  design_prepared: boolean;
  items_produced: boolean;
  quantities_verified: boolean;
  quality_checked: boolean;
  updated_at: string;
};

export type InventoryItemRow = {
  id: string;
  owner_id: string;
  sku_code: string;
  item_name: string;
  category: "Stock Apparel" | "Completed Custom";
  linked_order_id: string | null;
  qty: number;
  unit_price: number;
  low_stock_threshold: number;
  status:
    | "In Stock"
    | "Low Stock"
    | "Out of Stock"
    | "Pending Release"
    | "Released";
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentAccountRow = {
  id: string;
  owner_id: string;
  method: "GCash" | "Bank Transfer" | "Maya";
  provider_name: string;
  account_name: string;
  account_number: string;
  instructions: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentVerificationLinkRow = {
  id: string;
  owner_id: string;
  order_id: string | null;
  token: string;
  order_code: string;
  order_label: string;
  buyer_name: string;
  expected_amount: number;
  status: "Active" | "Submitted" | "Revoked" | "Expired";
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type PaymentProofSubmissionRow = {
  id: string;
  owner_id: string;
  verification_link_id: string;
  order_id: string | null;
  submission_code: string;
  order_code: string;
  order_label: string;
  buyer_name: string;
  buyer_email: string;
  payment_method: "Cash" | "GCash" | "Bank Transfer" | "Maya";
  reference_number: string;
  amount: number;
  payment_date: string;
  proof_image_url: string;
  proof_file_name: string;
  proof_mime_type: "image/jpeg" | "image/png" | "image/webp";
  proof_file_size_bytes: number;
  buyer_notes: string;
  status: "Pending Verification" | "Approved" | "Rejected";
  rejection_reason: string | null;
  verified_by_id: string | null;
  verified_by_name: string | null;
  submitted_at: string;
  verified_at: string | null;
  updated_at: string;
};

export type SalesLogbookRow = {
  id: string;
  owner_id: string;
  order_id: string | null;
  inventory_item_id: string | null;
  payment_proof_id: string | null;
  log_no: string;
  or_number: string;
  order_reference: string;
  transaction_date: string;
  recorded_at: string;
  client_name: string;
  particulars: string;
  qty: number;
  unit_price: number;
  payment_type:
    | "Downpayment"
    | "Balance Settlement"
    | "Full Payment"
    | "Walk-In Stock Sale";
  payment_method: "Cash" | "GCash" | "Bank Transfer" | "Maya";
  reference_number: string | null;
  payment_proof_image_url: string | null;
  amount_paid: number;
  balance_remaining: number;
  remarks: string;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  owner_id: string;
  linked_order_id: string | null;
  linked_inventory_item_id: string | null;
  linked_payment_proof_id: string | null;
  title: string;
  message: string;
  category: "Orders & Payments" | "Fulfillment" | "Inventory" | "Store";
  severity: "urgent" | "warning" | "info" | "success";
  is_read: boolean;
  target_page:
    | "overview"
    | "pos-specs"
    | "workflow"
    | "inventory"
    | "payment-proofs"
    | "sales-logbook"
    | "analytics"
    | "staff-monitoring"
    | "notifications";
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  owner_id: string;
  related_order_id: string | null;
  staff_member_id: string | null;
  related_task_id: string | null;
  actor_name: string;
  actor_role: string;
  action_type:
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
  module: string;
  action: string;
  created_at: string;
};

export type StaffMemberRow = {
  id: string;
  owner_id: string;
  auth_user_id: string | null;
  staff_code: string;
  full_name: string;
  email: string | null;
  contact_number: string;
  position_title: string;
  role_level: "owner_manager" | "supervisor" | "staff";
  availability_status: "On Duty" | "Off Duty" | "On Leave";
  account_status: "Active" | "Inactive";
  shift_schedule: string;
  perm_pos: boolean;
  perm_orders: boolean;
  perm_inventory: boolean;
  perm_payments: boolean;
  perm_reports: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffTaskRow = {
  id: string;
  owner_id: string;
  staff_member_id: string;
  linked_order_id: string | null;
  linked_inventory_item_id: string | null;
  task_code: string;
  title: string;
  description: string;
  task_type:
    | "Order Production"
    | "Quality Inspection"
    | "Inventory Check"
    | "Order Release"
    | "General Shop Task";
  priority: "Low" | "Normal" | "High" | "Urgent";
  status: "Pending" | "In Progress" | "Completed" | "Cancelled";
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffPerformanceSummaryViewRow = {
  staff_member_id: string;
  owner_id: string;
  staff_code: string;
  full_name: string;
  position_title: string;
  role_level: "owner_manager" | "supervisor" | "staff";
  availability_status: "On Duty" | "Off Duty" | "On Leave";
  account_status: "Active" | "Inactive";
  total_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  completed_tasks: number;
  completion_rate_pct: number;
  total_logged_actions: number;
  last_activity_at: string | null;
};

export type MonthlySalesSummaryViewRow = {
  owner_id: string;
  month_key: string;
  sales_year: number;
  total_transactions: number;
  total_units_sold: number;
  total_revenue: number;
  custom_orders_revenue: number;
  stock_sales_revenue: number;
  cash_total: number;
  ewallet_total: number;
  bank_total: number;
};

export type Database = {
  public: {
    Tables: {
      owner_profiles: {
        Row: OwnerProfileRow;
        Insert: Partial<OwnerProfileRow> & { id: string; email: string };
        Update: Partial<OwnerProfileRow>;
        Relationships: [];
      };
      custom_orders: {
        Row: CustomOrderRow;
        Insert: Omit<CustomOrderRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<CustomOrderRow>;
        Relationships: [];
      };
      order_size_items: {
        Row: OrderSizeItemRow;
        Insert: Omit<OrderSizeItemRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<OrderSizeItemRow>;
        Relationships: [];
      };
      order_fulfillment_checklists: {
        Row: OrderFulfillmentChecklistRow;
        Insert: Omit<OrderFulfillmentChecklistRow, "updated_at">;
        Update: Partial<OrderFulfillmentChecklistRow>;
        Relationships: [];
      };
      inventory_items: {
        Row: InventoryItemRow;
        Insert: Omit<InventoryItemRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<InventoryItemRow>;
        Relationships: [];
      };
      payment_accounts: {
        Row: PaymentAccountRow;
        Insert: Omit<PaymentAccountRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<PaymentAccountRow>;
        Relationships: [];
      };
      payment_verification_links: {
        Row: PaymentVerificationLinkRow;
        Insert: Omit<
          PaymentVerificationLinkRow,
          "id" | "created_at" | "updated_at"
        > & { id?: string };
        Update: Partial<PaymentVerificationLinkRow>;
        Relationships: [];
      };
      payment_proof_submissions: {
        Row: PaymentProofSubmissionRow;
        Insert: Omit<
          PaymentProofSubmissionRow,
          "id" | "submitted_at" | "updated_at"
        > & { id?: string };
        Update: Partial<PaymentProofSubmissionRow>;
        Relationships: [];
      };
      sales_logbook: {
        Row: SalesLogbookRow;
        Insert: Omit<SalesLogbookRow, "id" | "recorded_at" | "created_at"> & {
          id?: string;
          recorded_at?: string;
        };
        Update: Partial<SalesLogbookRow>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Omit<NotificationRow, "id" | "created_at"> & { id?: string };
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLogRow;
        Insert: Omit<AuditLogRow, "id" | "created_at"> & { id?: string };
        Update: Partial<AuditLogRow>;
        Relationships: [];
      };
      staff_members: {
        Row: StaffMemberRow;
        Insert: Omit<StaffMemberRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<StaffMemberRow>;
        Relationships: [];
      };
      staff_tasks: {
        Row: StaffTaskRow;
        Insert: Omit<StaffTaskRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<StaffTaskRow>;
        Relationships: [];
      };
    };
    Views: {
      v_monthly_sales_summary: {
        Row: MonthlySalesSummaryViewRow;
        Relationships: [];
      };
      v_staff_performance_summary: {
        Row: StaffPerformanceSummaryViewRow;
        Relationships: [];
      };
    };
    Functions: {
      resolve_payment_verification_link: {
        Args: { p_token: string };
        Returns: Json;
      };
      submit_tokenized_payment_proof: {
        Args: {
          p_token: string;
          p_reference_number: string;
          p_proof_image_url: string;
          p_proof_file_name: string;
          p_proof_mime_type: string;
          p_proof_file_size_bytes: number;
          p_buyer_notes?: string;
        };
        Returns: Json;
      };
      approve_payment_proof: {
        Args: { p_submission_id: string };
        Returns: Json;
      };
      reject_payment_proof: {
        Args: { p_submission_id: string; p_reason: string };
        Returns: Json;
      };
      record_walk_in_stock_sale: {
        Args: {
          p_inventory_item_id: string;
          p_client_name: string;
          p_qty: number;
          p_payment_method?: string;
          p_reference_number?: string | null;
          p_payment_proof_image_url?: string | null;
        };
        Returns: Json;
      };
      reset_owner_store_data: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
