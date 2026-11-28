-- ============================================================================
-- MIGRATION 002: INDEXES, PARTIAL UNIQUE CONSTRAINTS, RLS POLICIES & STORAGE
-- Target: Supabase PostgreSQL 15+
-- Security model:
--   * Every public table has Row Level Security (RLS) enabled.
--   * Anonymous (`anon`) users have ZERO direct table read/write privileges;
--     buyers interact strictly through vetted SECURITY DEFINER RPCs (Migration 003).
--   * Authenticated Owner/Manager users can only access rows where
--     owner_id = auth.uid() (or id = auth.uid() on owner_profiles).
-- ============================================================================

-- ============================================================================
-- PART 1: PARTIAL UNIQUE CONSTRAINTS & PERFORMANCE INDEXES
-- ============================================================================

-- Enforce strict 0..1:0..1 between Completed Custom inventory staging and custom_orders
CREATE UNIQUE INDEX uidx_inventory_items_linked_order
  ON public.inventory_items (linked_order_id)
  WHERE linked_order_id IS NOT NULL;

-- Prevent duplicate active (non-rejected) transaction reference numbers per store
CREATE UNIQUE INDEX uidx_payment_proofs_active_ref
  ON public.payment_proof_submissions (owner_id, upper(reference_number))
  WHERE status <> 'Rejected';

-- Prevent multiple concurrent pending/approved submissions on the same payment link
CREATE UNIQUE INDEX uidx_payment_proofs_active_link
  ON public.payment_proof_submissions (verification_link_id)
  WHERE status <> 'Rejected';

-- Custom Orders indexes
CREATE INDEX idx_custom_orders_owner_stage
  ON public.custom_orders (owner_id, stage);

CREATE INDEX idx_custom_orders_owner_created
  ON public.custom_orders (owner_id, created_at DESC);

-- Order Size Items & Fulfillment Checklists FK/owner indexes
CREATE INDEX idx_order_size_items_owner_order
  ON public.order_size_items (owner_id, order_id);

CREATE INDEX idx_order_checklists_owner
  ON public.order_fulfillment_checklists (owner_id);

-- Inventory Items indexes
CREATE INDEX idx_inventory_items_owner_category_status
  ON public.inventory_items (owner_id, category, status);

-- Payment Accounts index
CREATE INDEX idx_payment_accounts_owner_active
  ON public.payment_accounts (owner_id, is_active);

-- Payment Verification Links indexes
CREATE INDEX idx_payment_links_owner_status_created
  ON public.payment_verification_links (owner_id, status, created_at DESC);

CREATE INDEX idx_payment_links_order_id
  ON public.payment_verification_links (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX idx_payment_links_expires_at
  ON public.payment_verification_links (expires_at);

-- Payment Proof Submissions indexes
CREATE INDEX idx_payment_proofs_owner_status_submitted
  ON public.payment_proof_submissions (owner_id, status, submitted_at DESC);

CREATE INDEX idx_payment_proofs_link_submitted
  ON public.payment_proof_submissions (verification_link_id, submitted_at DESC);

CREATE INDEX idx_payment_proofs_order_id
  ON public.payment_proof_submissions (order_id)
  WHERE order_id IS NOT NULL;

-- Sales Logbook indexes (for date range, monthly/annual charts & search)
CREATE INDEX idx_sales_logbook_owner_tx_date
  ON public.sales_logbook (owner_id, transaction_date DESC, recorded_at DESC);

CREATE INDEX idx_sales_logbook_order_id
  ON public.sales_logbook (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX idx_sales_logbook_inventory_item_id
  ON public.sales_logbook (inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;

-- Notifications indexes (unread bell counter & category filter)
CREATE INDEX idx_notifications_owner_unread_created
  ON public.notifications (owner_id, is_read, created_at DESC);

CREATE INDEX idx_notifications_owner_category
  ON public.notifications (owner_id, category, created_at DESC);

-- Audit Logs index
CREATE INDEX idx_audit_logs_owner_created
  ON public.audit_logs (owner_id, created_at DESC);

-- ============================================================================
-- PART 2: LEAST-PRIVILEGE GRANTS & ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Revoke all direct table access from anonymous users (buyers use token RPCs only)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Grant standard DML to authenticated role (scoped strictly by RLS policies below)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.owner_profiles,
  public.custom_orders,
  public.order_size_items,
  public.order_fulfillment_checklists,
  public.inventory_items,
  public.payment_accounts,
  public.payment_verification_links,
  public.payment_proof_submissions,
  public.sales_logbook,
  public.notifications
TO authenticated;

-- Audit logs are append-only for normal app usage (no direct UPDATE or DELETE)
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT ON public.v_monthly_sales_summary TO authenticated;

-- Enable RLS across all 11 tables
ALTER TABLE public.owner_profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_size_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_fulfillment_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_verification_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_proof_submissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_logbook                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs                   ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1. owner_profiles policies (strict self-ownership: id = auth.uid())
-- ----------------------------------------------------------------------------
CREATE POLICY "owner_profiles_select_own"
  ON public.owner_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "owner_profiles_insert_own"
  ON public.owner_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "owner_profiles_update_own"
  ON public.owner_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "owner_profiles_delete_own"
  ON public.owner_profiles FOR DELETE TO authenticated
  USING (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. custom_orders policies
-- ----------------------------------------------------------------------------
CREATE POLICY "custom_orders_select_own"
  ON public.custom_orders FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "custom_orders_insert_own"
  ON public.custom_orders FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "custom_orders_update_own"
  ON public.custom_orders FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "custom_orders_delete_own"
  ON public.custom_orders FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. order_size_items policies (also verifies parent order ownership)
-- ----------------------------------------------------------------------------
CREATE POLICY "order_size_items_select_own"
  ON public.order_size_items FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "order_size_items_insert_own"
  ON public.order_size_items FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.custom_orders o
      WHERE o.id = order_id AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY "order_size_items_update_own"
  ON public.order_size_items FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.custom_orders o
      WHERE o.id = order_id AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY "order_size_items_delete_own"
  ON public.order_size_items FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. order_fulfillment_checklists policies (verifies parent order ownership)
-- ----------------------------------------------------------------------------
CREATE POLICY "order_checklists_select_own"
  ON public.order_fulfillment_checklists FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "order_checklists_insert_own"
  ON public.order_fulfillment_checklists FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.custom_orders o
      WHERE o.id = order_id AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY "order_checklists_update_own"
  ON public.order_fulfillment_checklists FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.custom_orders o
      WHERE o.id = order_id AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY "order_checklists_delete_own"
  ON public.order_fulfillment_checklists FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. inventory_items policies (verifies optional linked_order_id ownership)
-- ----------------------------------------------------------------------------
CREATE POLICY "inventory_items_select_own"
  ON public.inventory_items FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "inventory_items_insert_own"
  ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      linked_order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.custom_orders o
        WHERE o.id = linked_order_id AND o.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "inventory_items_update_own"
  ON public.inventory_items FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      linked_order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.custom_orders o
        WHERE o.id = linked_order_id AND o.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "inventory_items_delete_own"
  ON public.inventory_items FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. payment_accounts policies
-- ----------------------------------------------------------------------------
CREATE POLICY "payment_accounts_select_own"
  ON public.payment_accounts FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "payment_accounts_insert_own"
  ON public.payment_accounts FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "payment_accounts_update_own"
  ON public.payment_accounts FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "payment_accounts_delete_own"
  ON public.payment_accounts FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 7. payment_verification_links policies
-- ----------------------------------------------------------------------------
CREATE POLICY "payment_links_select_own"
  ON public.payment_verification_links FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "payment_links_insert_own"
  ON public.payment_verification_links FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.custom_orders o
        WHERE o.id = order_id AND o.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "payment_links_update_own"
  ON public.payment_verification_links FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.custom_orders o
        WHERE o.id = order_id AND o.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "payment_links_delete_own"
  ON public.payment_verification_links FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 8. payment_proof_submissions policies
-- ----------------------------------------------------------------------------
CREATE POLICY "payment_proofs_select_own"
  ON public.payment_proof_submissions FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "payment_proofs_insert_own"
  ON public.payment_proof_submissions FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.payment_verification_links l
      WHERE l.id = verification_link_id AND l.owner_id = auth.uid()
    )
  );

CREATE POLICY "payment_proofs_update_own"
  ON public.payment_proof_submissions FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "payment_proofs_delete_own"
  ON public.payment_proof_submissions FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 9. sales_logbook policies
-- ----------------------------------------------------------------------------
CREATE POLICY "sales_logbook_select_own"
  ON public.sales_logbook FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "sales_logbook_insert_own"
  ON public.sales_logbook FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.custom_orders o
        WHERE o.id = order_id AND o.owner_id = auth.uid()
      )
    )
    AND (
      inventory_item_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.inventory_items i
        WHERE i.id = inventory_item_id AND i.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "sales_logbook_update_own"
  ON public.sales_logbook FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "sales_logbook_delete_own"
  ON public.sales_logbook FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 10. notifications policies
-- ----------------------------------------------------------------------------
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "notifications_insert_own"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 11. audit_logs policies (append-only: SELECT & INSERT only)
-- ----------------------------------------------------------------------------
CREATE POLICY "audit_logs_select_own"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "audit_logs_insert_own"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- ============================================================================
-- PART 3: SUPABASE STORAGE BUCKET & OWNER-SCOPED MEDIA POLICIES (OPTIONAL)
-- Runs automatically in Supabase Cloud/CLI when the storage schema is present.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'jm-store-media',
      'jm-store-media',
      false,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'jm_store_media_owner_manage'
    ) THEN
      CREATE POLICY "jm_store_media_owner_manage"
        ON storage.objects FOR ALL TO authenticated
        USING (
          bucket_id = 'jm-store-media'
          AND (storage.foldername(name))[1] = auth.uid()::text
        )
        WITH CHECK (
          bucket_id = 'jm-store-media'
          AND (storage.foldername(name))[1] = auth.uid()::text
        );
    END IF;
  END IF;
END;
$$;
