-- ============================================================================
-- MIGRATION 004: STAFF MONITORING, RBAC PERMISSIONS, TASK TRACKING,
-- IMMUTABLE ACTOR AUDIT TRAIL & POS DISCOUNT / CONTACT EXTENSIONS
-- Target: Supabase PostgreSQL 15+
-- Non-destructive migration preserving all existing tables and rows.
-- Aligns database 100% with Capstone Paper Specific Objectives 1, 4, 5, and 6.
-- ============================================================================

-- ============================================================================
-- 1. STAFF MEMBERS (1:N from owner_profiles)
-- Stores shop staff profiles, shift schedules, availability status, RBAC
-- module permissions, and last login timestamp.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staff_members (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid        NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  auth_user_id        uuid        NULL UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  staff_code          text        NOT NULL CHECK (char_length(trim(staff_code)) >= 1),
  full_name           text        NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  email               text        NULL,
  contact_number      text        NOT NULL DEFAULT '',
  position_title      text        NOT NULL CHECK (char_length(trim(position_title)) >= 2),
  role_level          text        NOT NULL DEFAULT 'staff'
                                  CHECK (role_level IN ('owner_manager', 'supervisor', 'staff')),
  availability_status text        NOT NULL DEFAULT 'On Duty'
                                  CHECK (availability_status IN ('On Duty', 'Off Duty', 'On Leave')),
  account_status      text        NOT NULL DEFAULT 'Active'
                                  CHECK (account_status IN ('Active', 'Inactive')),
  shift_schedule      text        NOT NULL DEFAULT 'Mon–Sat 8:00 AM – 5:00 PM',
  -- Module-level Role-Based Access Control (RBAC) permissions (Objective 4)
  perm_pos            boolean     NOT NULL DEFAULT true,
  perm_orders         boolean     NOT NULL DEFAULT true,
  perm_inventory      boolean     NOT NULL DEFAULT true,
  perm_payments       boolean     NOT NULL DEFAULT false,
  perm_reports        boolean     NOT NULL DEFAULT false,
  last_login_at       timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_staff_members_owner_code UNIQUE (owner_id, staff_code)
);

CREATE TRIGGER trg_staff_members_updated_at
  BEFORE UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 2. EXTEND CUSTOM ORDERS WITH CUSTOMER CONTACT, DISCOUNT & STAFF ASSIGNMENT
-- Directly fulfills Objective 1 ("applies discounts"), Interview Q4 ("contact
-- information"), and Objective 4 (order responsibility tracking).
-- ============================================================================
ALTER TABLE public.custom_orders
  ADD COLUMN IF NOT EXISTS client_contact    text          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS discount_amount   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid          NULL REFERENCES public.staff_members(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_custom_orders_discount_nonneg'
  ) THEN
    ALTER TABLE public.custom_orders
      ADD CONSTRAINT chk_custom_orders_discount_nonneg CHECK (discount_amount >= 0);
  END IF;
END;
$$;

-- ============================================================================
-- 3. STAFF TASKS (1:N from staff_members, optional 0..1:N to orders/inventory)
-- Tracks operational shop tasks, assignments, priorities, and completion.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staff_tasks (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                 uuid        NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  staff_member_id          uuid        NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  linked_order_id          uuid        NULL REFERENCES public.custom_orders(id) ON DELETE SET NULL,
  linked_inventory_item_id uuid        NULL REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  task_code                text        NOT NULL CHECK (char_length(trim(task_code)) >= 1),
  title                    text        NOT NULL CHECK (char_length(trim(title)) >= 2),
  description              text        NOT NULL DEFAULT '',
  task_type                text        NOT NULL DEFAULT 'Order Production'
                                       CHECK (task_type IN (
                                         'Order Production',
                                         'Quality Inspection',
                                         'Inventory Check',
                                         'Order Release',
                                         'General Shop Task'
                                       )),
  priority                 text        NOT NULL DEFAULT 'Normal'
                                       CHECK (priority IN ('Low', 'Normal', 'High', 'Urgent')),
  status                   text        NOT NULL DEFAULT 'Pending'
                                       CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')),
  due_date                 date        NULL,
  completed_at             timestamptz NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_staff_tasks_owner_code UNIQUE (owner_id, task_code),
  CONSTRAINT chk_staff_tasks_completed_at CHECK (
    status <> 'Completed' OR completed_at IS NOT NULL
  )
);

CREATE TRIGGER trg_staff_tasks_updated_at
  BEFORE UPDATE ON public.staff_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 4. UPGRADE IMMUTABLE AUDIT LOGS WITH ACTOR ATTRIBUTION & ACTION TYPES
-- Directly fulfills Interview Q17-Q18: who performed each update, when,
-- covering logins, order status updates, task completions, and price/stock edits.
-- ============================================================================
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS staff_member_id uuid NULL REFERENCES public.staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_task_id uuid NULL REFERENCES public.staff_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_name      text NOT NULL DEFAULT 'JM Maker Owner/Manager',
  ADD COLUMN IF NOT EXISTS actor_role      text NOT NULL DEFAULT 'owner_manager',
  ADD COLUMN IF NOT EXISTS action_type     text NOT NULL DEFAULT 'system';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_audit_logs_action_type'
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT chk_audit_logs_action_type CHECK (
        action_type IN (
          'login',
          'logout',
          'order_update',
          'task_update',
          'inventory_update',
          'price_change',
          'payment',
          'backup',
          'staff_admin',
          'system'
        )
      );
  END IF;
END;
$$;

-- ============================================================================
-- 5. DERIVED PERFORMANCE VIEW: STAFF ACCOUNTABILITY & ACCOMPLISHMENT SUMMARY
-- Dynamically aggregates tasks and logged actions per staff member (no duplicate data).
-- ============================================================================
CREATE OR REPLACE VIEW public.v_staff_performance_summary
WITH (security_invoker = true) AS
SELECT
  s.id                                                                            AS staff_member_id,
  s.owner_id,
  s.staff_code,
  s.full_name,
  s.position_title,
  s.role_level,
  s.availability_status,
  s.account_status,
  COUNT(DISTINCT t.id)::integer                                                   AS total_tasks,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'Pending')::integer               AS pending_tasks,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'In Progress')::integer           AS in_progress_tasks,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'Completed')::integer             AS completed_tasks,
  CASE
    WHEN COUNT(DISTINCT t.id) FILTER (WHERE t.status <> 'Cancelled') = 0 THEN 0
    ELSE ROUND(
      (COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'Completed')::numeric * 100)
      / COUNT(DISTINCT t.id) FILTER (WHERE t.status <> 'Cancelled')::numeric,
      1
    )
  END                                                                             AS completion_rate_pct,
  (
    SELECT COUNT(*)::integer
    FROM public.audit_logs a
    WHERE a.staff_member_id = s.id
  )                                                                               AS total_logged_actions,
  (
    SELECT MAX(a.created_at)
    FROM public.audit_logs a
    WHERE a.staff_member_id = s.id
  )                                                                               AS last_activity_at
FROM public.staff_members s
LEFT JOIN public.staff_tasks t ON t.staff_member_id = s.id
GROUP BY s.id;

-- ============================================================================
-- 6. INDEXES & PARTIAL UNIQUE CONSTRAINTS FOR STAFF MONITORING
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uidx_staff_members_owner_email
  ON public.staff_members (owner_id, lower(email))
  WHERE email IS NOT NULL AND trim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_staff_members_owner_status
  ON public.staff_members (owner_id, account_status, availability_status);

CREATE INDEX IF NOT EXISTS idx_staff_tasks_owner_staff_status
  ON public.staff_tasks (owner_id, staff_member_id, status);

CREATE INDEX IF NOT EXISTS idx_staff_tasks_linked_order
  ON public.staff_tasks (linked_order_id)
  WHERE linked_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_custom_orders_assigned_staff
  ON public.custom_orders (assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_owner_action_type
  ON public.audit_logs (owner_id, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_staff_member
  ON public.audit_logs (staff_member_id, created_at DESC)
  WHERE staff_member_id IS NOT NULL;

-- ============================================================================
-- 7. LEAST-PRIVILEGE GRANTS & ROW LEVEL SECURITY (RLS) FOR NEW TABLES
-- ============================================================================
REVOKE ALL ON public.staff_members, public.staff_tasks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_members, public.staff_tasks TO authenticated;
GRANT SELECT ON public.v_staff_performance_summary TO authenticated;

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_tasks   ENABLE ROW LEVEL SECURITY;

-- staff_members policies
CREATE POLICY "staff_members_select_own"
  ON public.staff_members FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "staff_members_insert_own"
  ON public.staff_members FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "staff_members_update_own"
  ON public.staff_members FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "staff_members_delete_own"
  ON public.staff_members FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- staff_tasks policies (verifies ownership of assigned staff and optional linked order/inventory)
CREATE POLICY "staff_tasks_select_own"
  ON public.staff_tasks FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "staff_tasks_insert_own"
  ON public.staff_tasks FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff_members s
      WHERE s.id = staff_member_id AND s.owner_id = auth.uid()
    )
    AND (
      linked_order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.custom_orders o
        WHERE o.id = linked_order_id AND o.owner_id = auth.uid()
      )
    )
    AND (
      linked_inventory_item_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.inventory_items i
        WHERE i.id = linked_inventory_item_id AND i.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "staff_tasks_update_own"
  ON public.staff_tasks FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff_members s
      WHERE s.id = staff_member_id AND s.owner_id = auth.uid()
    )
  );

CREATE POLICY "staff_tasks_delete_own"
  ON public.staff_tasks FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Allow notifications to deep-link into the new staff-monitoring page
DO $$
DECLARE
  v_con_name text;
BEGIN
  SELECT c.conname INTO v_con_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'notifications'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%target_page%';

  IF v_con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', v_con_name);
  END IF;

  ALTER TABLE public.notifications
    ADD CONSTRAINT chk_notifications_target_page CHECK (
      target_page IN (
        'overview',
        'pos-specs',
        'workflow',
        'inventory',
        'payment-proofs',
        'sales-logbook',
        'analytics',
        'staff-monitoring',
        'notifications'
      )
    );
END;
$$;

-- ============================================================================
-- 8. UPDATE reset_owner_store_data() TO CLEAR STAFF MONITORING RECORDS SAFELY
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reset_owner_store_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid := auth.uid();
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Owner sign-in required.';
  END IF;

  DELETE FROM public.notifications              WHERE owner_id = v_owner_id;
  DELETE FROM public.audit_logs                 WHERE owner_id = v_owner_id;
  DELETE FROM public.sales_logbook              WHERE owner_id = v_owner_id;
  DELETE FROM public.payment_proof_submissions  WHERE owner_id = v_owner_id;
  DELETE FROM public.payment_verification_links WHERE owner_id = v_owner_id;
  DELETE FROM public.payment_accounts           WHERE owner_id = v_owner_id;
  DELETE FROM public.staff_tasks                WHERE owner_id = v_owner_id;
  DELETE FROM public.inventory_items            WHERE owner_id = v_owner_id;
  DELETE FROM public.custom_orders              WHERE owner_id = v_owner_id;
  DELETE FROM public.staff_members              WHERE owner_id = v_owner_id;

  UPDATE public.owner_profiles
     SET last_backup_at = NULL
   WHERE id = v_owner_id;
END;
$$;
