-- ============================================================================
-- MIGRATION 001: JM MAKER SPORTSWEAR — CORE NORMALIZED POSTGRESQL SCHEMA
-- Target: Supabase PostgreSQL 15+
-- Architecture: Single-operator (Owner/Manager) workspace + token-gated buyer
-- payment verification portal. Every primary key is UUID; every foreign key
-- enforces strict referential integrity.
-- ============================================================================

-- Note: gen_random_uuid() is built into PostgreSQL 13+ / Supabase core.

-- ----------------------------------------------------------------------------
-- Shared trigger function to maintain updated_at timestamps automatically
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 1. OWNER PROFILES (1:1 with Supabase auth.users)
-- Stores Owner/Manager identity, theme preference, avatar customization, and
-- last JSON backup timestamp. Enforces single-operator role ('owner_manager').
-- ============================================================================
CREATE TABLE public.owner_profiles (
  id                 uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_name         text        NOT NULL DEFAULT 'JM Maker Owner/Manager'
                                 CHECK (char_length(trim(owner_name)) >= 2),
  email              text        NOT NULL UNIQUE
                                 CHECK (position('@' IN email) > 1),
  role               text        NOT NULL DEFAULT 'owner_manager'
                                 CHECK (role = 'owner_manager'),
  theme_preference   text        NOT NULL DEFAULT 'light'
                                 CHECK (theme_preference IN ('light', 'dark')),
  avatar_mode        text        NOT NULL DEFAULT 'upload'
                                 CHECK (avatar_mode IN ('upload', 'custom')),
  avatar_url         text        NULL,
  avatar_bg_color    text        NOT NULL DEFAULT '#fee2e2',
  avatar_skin_color  text        NOT NULL DEFAULT '#e0ac69',
  avatar_hair_style  text        NOT NULL DEFAULT 'fade'
                                 CHECK (avatar_hair_style IN (
                                   'fade', 'part', 'spiky', 'curly',
                                   'long', 'bun', 'cap', 'headband'
                                 )),
  avatar_hair_color  text        NOT NULL DEFAULT '#18181b',
  avatar_jersey_color text       NOT NULL DEFAULT '#c62828',
  avatar_accessory   text        NOT NULL DEFAULT 'none'
                                 CHECK (avatar_accessory IN (
                                   'none', 'grin', 'glasses', 'shades', 'mic'
                                 )),
  last_backup_at     timestamptz NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_owner_profiles_updated_at
  BEFORE UPDATE ON public.owner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Automatically provision an owner_profiles row when a Supabase Auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_owner_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.owner_profiles (id, owner_name, email)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data ->> 'owner_name'), ''),
      'JM Maker Owner/Manager'
    ),
    lower(COALESCE(NEW.email, ''))
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_owner_user();

-- ============================================================================
-- 2. CUSTOM ORDERS (1:N from owner_profiles)
-- Core entity for team sublimation custom jersey orders created in POS and
-- tracked through the 4-step Order Fulfillment module.
-- ============================================================================
CREATE TABLE public.custom_orders (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             uuid          NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  order_code           varchar(4)    NOT NULL CHECK (order_code ~ '^\d{4}$'),
  client_name          text          NOT NULL CHECK (char_length(trim(client_name)) >= 1),
  sublimation_type     text          NOT NULL CHECK (char_length(trim(sublimation_type)) >= 1),
  colorway             text          NOT NULL DEFAULT 'Standard Colorway',
  printing_option      text          NOT NULL DEFAULT 'Full Sublimation',
  unit_price           numeric(10,2) NOT NULL CHECK (unit_price > 0),
  total_qty            integer       NOT NULL DEFAULT 0 CHECK (total_qty >= 0),
  total_amount         numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid          numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  stage                text          NOT NULL DEFAULT 'Order Received'
                                     CHECK (stage IN (
                                       'Order Received',
                                       'Production',
                                       'Quality Inspection',
                                       'Ready for Release',
                                       'Released',
                                       'Cancelled'
                                     )),
  specs_verified       boolean       NOT NULL DEFAULT false,
  jersey_template_url  text          NULL,
  jersey_template_name text          NULL,
  order_date           date          NOT NULL DEFAULT CURRENT_DATE,
  fulfilled_at         timestamptz   NULL,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT uq_custom_orders_owner_code UNIQUE (owner_id, order_code),
  CONSTRAINT chk_custom_orders_paid_le_total CHECK (amount_paid <= total_amount),
  CONSTRAINT chk_custom_orders_fulfilled_stage CHECK (
    stage <> 'Released' OR fulfilled_at IS NOT NULL
  )
);

CREATE TRIGGER trg_custom_orders_updated_at
  BEFORE UPDATE ON public.custom_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. ORDER SIZE ITEMS (1:N from custom_orders)
-- First-normal-form (1NF) breakdown of jersey quantities per size (XS-XXL)
-- plus per-piece surcharge (e.g., ₱50 for XXL+).
-- ============================================================================
CREATE TABLE public.order_size_items (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid          NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  owner_id            uuid          NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  size_code           varchar(4)    NOT NULL CHECK (size_code IN ('XS', 'S', 'M', 'L', 'XL', 'XXL')),
  quantity            integer       NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  surcharge_per_piece numeric(10,2) NOT NULL DEFAULT 0 CHECK (surcharge_per_piece >= 0),
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT uq_order_size_items_order_size UNIQUE (order_id, size_code)
);

CREATE TRIGGER trg_order_size_items_updated_at
  BEFORE UPDATE ON public.order_size_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 4. ORDER FULFILLMENT CHECKLISTS (1:1 with custom_orders)
-- Dedicated 1:1 extension table tracking the 4-step guided fulfillment checks
-- without bloating core POS order specifications.
-- ============================================================================
CREATE TABLE public.order_fulfillment_checklists (
  order_id            uuid        PRIMARY KEY REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  owner_id            uuid        NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  order_reviewed      boolean     NOT NULL DEFAULT false,
  design_prepared     boolean     NOT NULL DEFAULT false,
  items_produced      boolean     NOT NULL DEFAULT false,
  quantities_verified boolean     NOT NULL DEFAULT false,
  quality_checked     boolean     NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_order_fulfillment_checklists_updated_at
  BEFORE UPDATE ON public.order_fulfillment_checklists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Automatically initialize a 1:1 fulfillment checklist whenever an order is created
CREATE OR REPLACE FUNCTION public.handle_new_custom_order_checklist()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.order_fulfillment_checklists (order_id, owner_id)
  VALUES (NEW.id, NEW.owner_id)
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_custom_orders_init_checklist
  AFTER INSERT ON public.custom_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_custom_order_checklist();

-- ============================================================================
-- 5. INVENTORY ITEMS (1:N from owner_profiles, optional 0..1:0..1 with custom_orders)
-- Holds ready-made Stock Apparel products AND completed custom order batches
-- temporarily staged for pickup ('Completed Custom' -> linked_order_id).
-- ============================================================================
CREATE TABLE public.inventory_items (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid          NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  sku_code            text          NOT NULL CHECK (char_length(trim(sku_code)) >= 1),
  item_name           text          NOT NULL CHECK (char_length(trim(item_name)) >= 1),
  category            text          NOT NULL DEFAULT 'Stock Apparel'
                                    CHECK (category IN ('Stock Apparel', 'Completed Custom')),
  linked_order_id     uuid          NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  qty                 integer       NOT NULL DEFAULT 0 CHECK (qty >= 0),
  unit_price          numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  low_stock_threshold integer       NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  status              text          NOT NULL DEFAULT 'In Stock'
                                    CHECK (status IN (
                                      'In Stock',
                                      'Low Stock',
                                      'Out of Stock',
                                      'Pending Release',
                                      'Released'
                                    )),
  image_url           text          NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT uq_inventory_items_owner_sku UNIQUE (owner_id, sku_code),
  CONSTRAINT chk_inventory_category_order_link CHECK (
    (category = 'Completed Custom' AND linked_order_id IS NOT NULL)
    OR (category = 'Stock Apparel' AND linked_order_id IS NULL)
  )
);

CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 6. PAYMENT ACCOUNTS (1:N from owner_profiles)
-- Official store receiving accounts (GCash, Bank Transfer, Maya).
-- ============================================================================
CREATE TABLE public.payment_accounts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid        NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  method         text        NOT NULL CHECK (method IN ('GCash', 'Bank Transfer', 'Maya')),
  provider_name  text        NOT NULL CHECK (char_length(trim(provider_name)) >= 1),
  account_name   text        NOT NULL CHECK (char_length(trim(account_name)) >= 1),
  account_number text        NOT NULL CHECK (char_length(trim(account_number)) >= 1),
  instructions   text        NOT NULL DEFAULT '',
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_payment_accounts_owner_method_num UNIQUE (owner_id, method, account_number)
);

CREATE TRIGGER trg_payment_accounts_updated_at
  BEFORE UPDATE ON public.payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 7. PAYMENT VERIFICATION LINKS (1:N from owner_profiles, 0..1:N from custom_orders)
-- Unique opaque token links (?token=jm_...) shared with buyers so they can
-- upload payment receipts without creating an account.
-- ============================================================================
CREATE TABLE public.payment_verification_links (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid          NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  order_id        uuid          NULL REFERENCES public.custom_orders(id) ON DELETE SET NULL,
  token           text          NOT NULL UNIQUE CHECK (char_length(token) >= 12),
  order_code      varchar(4)    NOT NULL CHECK (order_code ~ '^\d{4}$'),
  order_label     text          NOT NULL CHECK (char_length(trim(order_label)) >= 1),
  buyer_name      text          NOT NULL CHECK (char_length(trim(buyer_name)) >= 2),
  expected_amount numeric(12,2) NOT NULL CHECK (expected_amount > 0),
  status          text          NOT NULL DEFAULT 'Active'
                                CHECK (status IN ('Active', 'Submitted', 'Revoked', 'Expired')),
  expires_at      timestamptz   NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT chk_payment_links_expiry_after_create CHECK (expires_at > created_at)
);

CREATE TRIGGER trg_payment_verification_links_updated_at
  BEFORE UPDATE ON public.payment_verification_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 8. PAYMENT PROOF SUBMISSIONS
-- (1:N from owner_profiles, 1:N from payment_verification_links,
--  0..1:N from custom_orders, 0..1:N from owner_profiles as verifier)
-- Receipt screenshots & reference numbers submitted by buyers; a rejected
-- submission re-activates its parent link so a buyer can resubmit cleanly.
-- ============================================================================
CREATE TABLE public.payment_proof_submissions (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid          NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  verification_link_id  uuid          NOT NULL REFERENCES public.payment_verification_links(id) ON DELETE RESTRICT,
  order_id              uuid          NULL REFERENCES public.custom_orders(id) ON DELETE SET NULL,
  submission_code       text          NOT NULL CHECK (char_length(trim(submission_code)) >= 1),
  order_code            varchar(4)    NOT NULL CHECK (order_code ~ '^\d{4}$'),
  order_label           text          NOT NULL,
  buyer_name            text          NOT NULL CHECK (char_length(trim(buyer_name)) >= 1),
  buyer_email           text          NOT NULL DEFAULT '',
  payment_method        text          NOT NULL DEFAULT 'GCash'
                                      CHECK (payment_method IN ('Cash', 'GCash', 'Bank Transfer', 'Maya')),
  reference_number      text          NOT NULL CHECK (char_length(trim(reference_number)) >= 4),
  amount                numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date          date          NOT NULL DEFAULT CURRENT_DATE,
  proof_image_url       text          NOT NULL CHECK (char_length(trim(proof_image_url)) >= 1),
  proof_file_name       text          NOT NULL CHECK (char_length(trim(proof_file_name)) >= 1),
  proof_mime_type       text          NOT NULL CHECK (proof_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  proof_file_size_bytes integer       NOT NULL CHECK (proof_file_size_bytes > 0 AND proof_file_size_bytes <= 5242880),
  buyer_notes           text          NOT NULL DEFAULT '',
  status                text          NOT NULL DEFAULT 'Pending Verification'
                                      CHECK (status IN ('Pending Verification', 'Approved', 'Rejected')),
  rejection_reason      text          NULL,
  verified_by_id        uuid          NULL REFERENCES public.owner_profiles(id) ON DELETE SET NULL,
  verified_by_name      text          NULL,
  submitted_at          timestamptz   NOT NULL DEFAULT now(),
  verified_at           timestamptz   NULL,
  updated_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT uq_payment_proofs_owner_code UNIQUE (owner_id, submission_code),
  CONSTRAINT chk_payment_proofs_rejection_reason CHECK (
    status <> 'Rejected' OR char_length(trim(COALESCE(rejection_reason, ''))) >= 5
  ),
  CONSTRAINT chk_payment_proofs_verified_at CHECK (
    status = 'Pending Verification' OR verified_at IS NOT NULL
  )
);

CREATE TRIGGER trg_payment_proof_submissions_updated_at
  BEFORE UPDATE ON public.payment_proof_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 9. SALES LOGBOOK
-- Consolidated financial ledger feeding Sales History & Sales Reports.
-- Links optionally to custom_orders (1:N), inventory_items (1:N for walk-ins),
-- and payment_proof_submissions (0..1:0..1 UNIQUE to prevent double-crediting).
-- ============================================================================
CREATE TABLE public.sales_logbook (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                uuid          NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  order_id                uuid          NULL REFERENCES public.custom_orders(id) ON DELETE SET NULL,
  inventory_item_id       uuid          NULL REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  payment_proof_id        uuid          NULL UNIQUE REFERENCES public.payment_proof_submissions(id) ON DELETE SET NULL,
  log_no                  text          NOT NULL CHECK (char_length(trim(log_no)) >= 1),
  or_number               text          NOT NULL CHECK (char_length(trim(or_number)) >= 1),
  order_reference         text          NOT NULL CHECK (char_length(trim(order_reference)) >= 1),
  transaction_date        date          NOT NULL DEFAULT CURRENT_DATE,
  recorded_at             timestamptz   NOT NULL DEFAULT now(),
  client_name             text          NOT NULL CHECK (char_length(trim(client_name)) >= 1),
  particulars             text          NOT NULL CHECK (char_length(trim(particulars)) >= 1),
  qty                     integer       NOT NULL CHECK (qty >= 1),
  unit_price              numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  payment_type            text          NOT NULL CHECK (payment_type IN (
                                          'Downpayment',
                                          'Balance Settlement',
                                          'Full Payment',
                                          'Walk-In Stock Sale'
                                        )),
  payment_method          text          NOT NULL DEFAULT 'Cash'
                                        CHECK (payment_method IN ('Cash', 'GCash', 'Bank Transfer', 'Maya')),
  reference_number        text          NULL,
  payment_proof_image_url text          NULL,
  amount_paid             numeric(12,2) NOT NULL CHECK (amount_paid >= 0),
  balance_remaining       numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance_remaining >= 0),
  remarks                 text          NOT NULL DEFAULT '',
  created_at              timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT uq_sales_logbook_owner_log_no UNIQUE (owner_id, log_no),
  CONSTRAINT chk_sales_logbook_walkin_no_order CHECK (
    payment_type <> 'Walk-In Stock Sale' OR order_id IS NULL
  )
);

-- ============================================================================
-- 10. NOTIFICATIONS (1:N from owner_profiles + optional context FKs)
-- Real-time Owner/Manager store alerts linked directly to affected entities.
-- ============================================================================
CREATE TABLE public.notifications (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                 uuid        NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  linked_order_id          uuid        NULL REFERENCES public.custom_orders(id) ON DELETE SET NULL,
  linked_inventory_item_id uuid        NULL REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  linked_payment_proof_id  uuid        NULL REFERENCES public.payment_proof_submissions(id) ON DELETE SET NULL,
  title                    text        NOT NULL CHECK (char_length(trim(title)) >= 1),
  message                  text        NOT NULL CHECK (char_length(trim(message)) >= 1),
  category                 text        NOT NULL CHECK (category IN (
                                         'Orders & Payments',
                                         'Fulfillment',
                                         'Inventory',
                                         'Store'
                                       )),
  severity                 text        NOT NULL DEFAULT 'info'
                                       CHECK (severity IN ('urgent', 'warning', 'info', 'success')),
  is_read                  boolean     NOT NULL DEFAULT false,
  target_page              text        NOT NULL CHECK (target_page IN (
                                         'overview',
                                         'pos-specs',
                                         'workflow',
                                         'inventory',
                                         'payment-proofs',
                                         'sales-logbook',
                                         'analytics',
                                         'notifications'
                                       )),
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. AUDIT LOGS (1:N from owner_profiles, optional 0..1:N from custom_orders)
-- Append-only operational activity trail displayed in Sales Reports.
-- ============================================================================
CREATE TABLE public.audit_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid        NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  related_order_id uuid        NULL REFERENCES public.custom_orders(id) ON DELETE SET NULL,
  module           text        NOT NULL CHECK (char_length(trim(module)) >= 1),
  action           text        NOT NULL CHECK (char_length(trim(action)) >= 1),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- REPORTING VIEW: MONTHLY SALES SUMMARY (Derived dynamically — zero duplicate data)
-- Uses security_invoker = true so PostgreSQL enforces sales_logbook RLS policies.
-- ============================================================================
CREATE OR REPLACE VIEW public.v_monthly_sales_summary
WITH (security_invoker = true) AS
SELECT
  owner_id,
  to_char(transaction_date, 'YYYY-MM')                                        AS month_key,
  EXTRACT(YEAR FROM transaction_date)::integer                                AS sales_year,
  COUNT(*)::integer                                                           AS total_transactions,
  COALESCE(SUM(qty), 0)::integer                                              AS total_units_sold,
  COALESCE(SUM(amount_paid), 0)::numeric(12,2)                                AS total_revenue,
  COALESCE(SUM(amount_paid) FILTER (WHERE payment_type <> 'Walk-In Stock Sale'), 0)::numeric(12,2)
                                                                              AS custom_orders_revenue,
  COALESCE(SUM(amount_paid) FILTER (WHERE payment_type = 'Walk-In Stock Sale'), 0)::numeric(12,2)
                                                                              AS stock_sales_revenue,
  COALESCE(SUM(amount_paid) FILTER (WHERE payment_method = 'Cash'), 0)::numeric(12,2)
                                                                              AS cash_total,
  COALESCE(SUM(amount_paid) FILTER (WHERE payment_method IN ('GCash', 'Maya')), 0)::numeric(12,2)
                                                                              AS ewallet_total,
  COALESCE(SUM(amount_paid) FILTER (WHERE payment_method = 'Bank Transfer'), 0)::numeric(12,2)
                                                                              AS bank_total
FROM public.sales_logbook
GROUP BY owner_id, to_char(transaction_date, 'YYYY-MM'), EXTRACT(YEAR FROM transaction_date);
