-- ============================================================================
-- MIGRATION 003: TRANSACTIONAL RPC FUNCTIONS (BUYER PORTAL & ATOMIC WORKFLOWS)
-- Target: Supabase PostgreSQL 15+
-- Why RPCs?
--   1. Buyers on buyer.html?token=... never log in and have ZERO direct table
--      privileges. They interact strictly via resolve_payment_verification_link
--      and submit_tokenized_payment_proof (SECURITY DEFINER, token-scoped).
--   2. Financial operations (approve/reject payment proof, walk-in stock sale,
--      store reset) execute inside a single ACID transaction on the database.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BUYER PORTAL (anon + authenticated): Resolve opaque verification token
-- Returns ONLY safe transaction summary fields for that exact token.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_payment_verification_link(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_token text := trim(COALESCE(p_token, ''));
  v_link        public.payment_verification_links%ROWTYPE;
  v_latest_sub  public.payment_proof_submissions%ROWTYPE;
  v_has_sub     boolean := false;
BEGIN
  IF v_clean_token = '' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'missing',
      'message', 'No payment verification token was provided. Please open the direct payment verification link sent to you by JM Maker Sportswear.'
    );
  END IF;

  SELECT *
    INTO v_link
    FROM public.payment_verification_links
   WHERE token = v_clean_token
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'not_found',
      'message', 'This payment verification link is invalid or does not exist. Please check the link sent by JM Maker Sportswear.'
    );
  END IF;

  IF v_link.status = 'Revoked' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'revoked',
      'message', 'This payment verification link has been revoked by JM Maker Sportswear. Please request a new link if needed.'
    );
  END IF;

  IF v_link.status = 'Expired' OR now() > v_link.expires_at THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'expired',
      'message', 'This payment verification link has expired. Please contact JM Maker Sportswear to request a fresh link.'
    );
  END IF;

  SELECT *
    INTO v_latest_sub
    FROM public.payment_proof_submissions
   WHERE verification_link_id = v_link.id
   ORDER BY submitted_at DESC
   LIMIT 1;

  v_has_sub := FOUND;

  RETURN jsonb_build_object(
    'valid', true,
    'link', jsonb_build_object(
      'id', v_link.id,
      'token', v_link.token,
      'orderId', v_link.order_code,
      'orderLabel', v_link.order_label,
      'buyerName', v_link.buyer_name,
      'expectedAmount', v_link.expected_amount,
      'expiresAt', v_link.expires_at,
      'status', v_link.status,
      'createdAt', to_char(v_link.created_at, 'Mon DD, YYYY HH12:MI AM')
    ),
    'latestSubmission', CASE WHEN v_has_sub THEN jsonb_build_object(
      'id', v_latest_sub.id,
      'submissionCode', v_latest_sub.submission_code,
      'linkToken', v_link.token,
      'orderId', v_latest_sub.order_code,
      'orderLabel', v_latest_sub.order_label,
      'buyerName', v_latest_sub.buyer_name,
      'paymentMethod', v_latest_sub.payment_method,
      'referenceNumber', v_latest_sub.reference_number,
      'amount', v_latest_sub.amount,
      'paymentDate', v_latest_sub.payment_date,
      'status', v_latest_sub.status,
      'rejectionReason', v_latest_sub.rejection_reason,
      'submittedAt', to_char(v_latest_sub.submitted_at, 'Mon DD, YYYY HH12:MI AM')
    ) ELSE NULL END
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. BUYER PORTAL (anon + authenticated): Submit payment proof via unique token
-- Atomically validates token/expiry/duplicates, forces status='Pending Verification',
-- updates parent link to 'Submitted', alerts the owner, and logs audit activity.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_tokenized_payment_proof(
  p_token                 text,
  p_reference_number      text,
  p_proof_image_url       text,
  p_proof_file_name       text,
  p_proof_mime_type       text,
  p_proof_file_size_bytes integer,
  p_buyer_notes           text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_token text := trim(COALESCE(p_token, ''));
  v_norm_ref    text;
  v_link        public.payment_verification_links%ROWTYPE;
  v_active_sub  public.payment_proof_submissions%ROWTYPE;
  v_dup_sub     public.payment_proof_submissions%ROWTYPE;
  v_next_seq    integer;
  v_sub_code    text;
  v_inserted    public.payment_proof_submissions%ROWTYPE;
BEGIN
  -- Lock the link row to prevent concurrent duplicate submissions
  SELECT *
    INTO v_link
    FROM public.payment_verification_links
   WHERE token = v_clean_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid payment verification link. Please request a valid link from JM Maker.'
    );
  END IF;

  IF v_link.status = 'Revoked' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This payment verification link has been revoked by JM Maker and can no longer be used.'
    );
  END IF;

  IF v_link.status = 'Expired' OR now() > v_link.expires_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This payment verification link has expired. Please contact JM Maker for a new link.'
    );
  END IF;

  SELECT *
    INTO v_active_sub
    FROM public.payment_proof_submissions
   WHERE verification_link_id = v_link.id
     AND status <> 'Rejected'
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', CASE
        WHEN v_active_sub.status = 'Approved'
          THEN 'This payment has already been verified and approved by JM Maker.'
        ELSE 'A payment proof for this link has already been submitted and is pending owner verification.'
      END
    );
  END IF;

  IF p_proof_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid file type. Only JPG, JPEG, PNG, and WEBP screenshots are allowed.'
    );
  END IF;

  IF p_proof_file_size_bytes IS NULL OR p_proof_file_size_bytes <= 0 OR p_proof_file_size_bytes > 5242880 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'File size must be between 1 byte and 5 MB.'
    );
  END IF;

  IF trim(COALESCE(p_proof_image_url, '')) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Please upload your payment receipt or transaction screenshot.'
    );
  END IF;

  v_norm_ref := upper(regexp_replace(
    regexp_replace(trim(COALESCE(p_reference_number, '')), '\s+', '-', 'g'),
    '[^A-Za-z0-9\-_]', '', 'g'
  ));

  IF char_length(v_norm_ref) < 4 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Please enter a valid transaction reference number (at least 4 characters).'
    );
  END IF;

  SELECT *
    INTO v_dup_sub
    FROM public.payment_proof_submissions
   WHERE owner_id = v_link.owner_id
     AND status <> 'Rejected'
     AND upper(reference_number) = v_norm_ref
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Transaction reference number "%s" has already been submitted (%s).', v_norm_ref, v_dup_sub.status)
    );
  END IF;

  SELECT COUNT(*) + 1
    INTO v_next_seq
    FROM public.payment_proof_submissions
   WHERE owner_id = v_link.owner_id;

  v_sub_code := format('PAY-%s-%s', to_char(CURRENT_DATE, 'YYYY'), lpad(v_next_seq::text, 4, '0'));

  INSERT INTO public.payment_proof_submissions (
    owner_id,
    verification_link_id,
    order_id,
    submission_code,
    order_code,
    order_label,
    buyer_name,
    buyer_email,
    payment_method,
    reference_number,
    amount,
    payment_date,
    proof_image_url,
    proof_file_name,
    proof_mime_type,
    proof_file_size_bytes,
    buyer_notes,
    status
  ) VALUES (
    v_link.owner_id,
    v_link.id,
    v_link.order_id,
    v_sub_code,
    v_link.order_code,
    v_link.order_label,
    v_link.buyer_name,
    '',
    'GCash',
    v_norm_ref,
    v_link.expected_amount,
    CURRENT_DATE,
    p_proof_image_url,
    trim(p_proof_file_name),
    p_proof_mime_type,
    p_proof_file_size_bytes,
    trim(COALESCE(p_buyer_notes, '')),
    'Pending Verification'
  )
  RETURNING * INTO v_inserted;

  UPDATE public.payment_verification_links
     SET status = 'Submitted'
   WHERE id = v_link.id;

  INSERT INTO public.notifications (
    owner_id,
    linked_order_id,
    linked_payment_proof_id,
    title,
    message,
    category,
    severity,
    target_page
  ) VALUES (
    v_link.owner_id,
    v_link.order_id,
    v_inserted.id,
    format('New Payment Proof Submitted — %s', v_sub_code),
    format('%s uploaded a payment screenshot (Ref: %s) for %s.', v_link.buyer_name, v_norm_ref, v_link.order_label),
    'Orders & Payments',
    'urgent',
    'payment-proofs'
  );

  INSERT INTO public.audit_logs (owner_id, related_order_id, module, action)
  VALUES (
    v_link.owner_id,
    v_link.order_id,
    'Payment Proofs',
    format('Received payment proof %s via link for %s (Ref: %s).', v_sub_code, v_link.order_label, v_norm_ref)
  );

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id', v_inserted.id,
      'submissionCode', v_inserted.submission_code,
      'linkToken', v_link.token,
      'orderId', v_inserted.order_code,
      'orderLabel', v_inserted.order_label,
      'buyerName', v_inserted.buyer_name,
      'buyerEmail', v_inserted.buyer_email,
      'paymentMethod', v_inserted.payment_method,
      'referenceNumber', v_inserted.reference_number,
      'amount', v_inserted.amount,
      'paymentDate', v_inserted.payment_date,
      'proofImageDataUrl', v_inserted.proof_image_url,
      'proofFileName', v_inserted.proof_file_name,
      'proofMimeType', v_inserted.proof_mime_type,
      'proofFileSizeBytes', v_inserted.proof_file_size_bytes,
      'buyerNotes', v_inserted.buyer_notes,
      'status', v_inserted.status,
      'submittedAt', to_char(v_inserted.submitted_at, 'Mon DD, YYYY HH12:MI AM')
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. OWNER/MANAGER ONLY (authenticated): Approve a payment proof atomically
-- Credits custom_orders.amount_paid, inserts sales_logbook (guarded by UNIQUE
-- payment_proof_id), sends notification, and appends audit log.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_payment_proof(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id    uuid := auth.uid();
  v_owner_name  text;
  v_sub         public.payment_proof_submissions%ROWTYPE;
  v_order       public.custom_orders%ROWTYPE;
  v_has_order   boolean := false;
  v_prev_paid   numeric(12,2) := 0;
  v_new_paid    numeric(12,2) := 0;
  v_balance     numeric(12,2) := 0;
  v_qty         integer := 1;
  v_unit_price  numeric(10,2);
  v_particulars text;
  v_pay_type    text := 'Full Payment';
  v_next_txn    integer;
  v_log_no      text;
  v_or_number   text;
BEGIN
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Owner sign-in required.');
  END IF;

  SELECT owner_name INTO v_owner_name FROM public.owner_profiles WHERE id = v_owner_id;
  v_owner_name := COALESCE(v_owner_name, 'JM Maker Owner/Manager');

  SELECT *
    INTO v_sub
    FROM public.payment_proof_submissions
   WHERE id = p_submission_id
     AND owner_id = v_owner_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment submission record not found.');
  END IF;

  IF v_sub.status = 'Approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This payment proof has already been approved and credited.');
  END IF;

  UPDATE public.payment_proof_submissions
     SET status = 'Approved',
         rejection_reason = NULL,
         verified_by_id = v_owner_id,
         verified_by_name = v_owner_name,
         verified_at = now()
   WHERE id = v_sub.id
   RETURNING * INTO v_sub;

  UPDATE public.payment_verification_links
     SET status = 'Submitted'
   WHERE id = v_sub.verification_link_id;

  v_unit_price := v_sub.amount;
  v_particulars := format('Verified Buyer Payment — Order #%s', v_sub.order_code);

  IF v_sub.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.custom_orders WHERE id = v_sub.order_id AND owner_id = v_owner_id FOR UPDATE;
    IF FOUND THEN
      v_has_order := true;
      v_prev_paid := v_order.amount_paid;
      v_new_paid := LEAST(v_order.total_amount, v_prev_paid + v_sub.amount);
      v_balance := GREATEST(0, v_order.total_amount - v_new_paid);
      v_qty := GREATEST(1, v_order.total_qty);
      v_unit_price := v_order.unit_price;
      v_particulars := format('%s (Verified Proof %s)', v_order.sublimation_type, v_sub.submission_code);
      v_pay_type := CASE
        WHEN v_balance = 0 AND v_prev_paid = 0 THEN 'Full Payment'
        WHEN v_balance = 0 THEN 'Balance Settlement'
        ELSE 'Downpayment'
      END;

      UPDATE public.custom_orders
         SET amount_paid = v_new_paid
       WHERE id = v_order.id;
    END IF;
  END IF;

  SELECT COUNT(*) + 1 INTO v_next_txn FROM public.sales_logbook WHERE owner_id = v_owner_id;
  v_log_no := format('TXN-%s-%s', to_char(CURRENT_DATE, 'YYYY'), lpad(v_next_txn::text, 3, '0'));
  v_or_number := format('INV-%s-%s', v_sub.order_code, lpad(v_next_txn::text, 3, '0'));

  INSERT INTO public.sales_logbook (
    owner_id,
    order_id,
    payment_proof_id,
    log_no,
    or_number,
    order_reference,
    transaction_date,
    client_name,
    particulars,
    qty,
    unit_price,
    payment_type,
    payment_method,
    reference_number,
    payment_proof_image_url,
    amount_paid,
    balance_remaining,
    remarks
  ) VALUES (
    v_owner_id,
    CASE WHEN v_has_order THEN v_order.id ELSE NULL END,
    v_sub.id,
    v_log_no,
    v_or_number,
    '#' || v_sub.order_code,
    v_sub.payment_date,
    CASE WHEN v_has_order THEN v_order.client_name ELSE v_sub.buyer_name END,
    v_particulars,
    v_qty,
    v_unit_price,
    v_pay_type,
    v_sub.payment_method,
    v_sub.reference_number,
    v_sub.proof_image_url,
    v_sub.amount,
    v_balance,
    format('Approved payment proof %s by %s', v_sub.submission_code, v_owner_name)
  )
  ON CONFLICT (payment_proof_id) DO NOTHING;

  INSERT INTO public.notifications (
    owner_id, linked_order_id, linked_payment_proof_id,
    title, message, category, severity, target_page
  ) VALUES (
    v_owner_id,
    CASE WHEN v_has_order THEN v_order.id ELSE NULL END,
    v_sub.id,
    format('Payment Approved — %s', v_sub.submission_code),
    format('Approved payment from %s (%s) and recorded to Sales History.', v_sub.buyer_name, v_sub.order_label),
    'Orders & Payments',
    'success',
    'sales-logbook'
  );

  INSERT INTO public.audit_logs (owner_id, related_order_id, module, action)
  VALUES (
    v_owner_id,
    CASE WHEN v_has_order THEN v_order.id ELSE NULL END,
    'Payment Verification',
    format('Approved payment proof %s (Ref: %s) for %s.', v_sub.submission_code, v_sub.reference_number, v_sub.order_label)
  );

  RETURN jsonb_build_object(
    'success', true,
    'submissionId', v_sub.id,
    'submissionCode', v_sub.submission_code,
    'status', v_sub.status,
    'amount', v_sub.amount
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. OWNER/MANAGER ONLY (authenticated): Reject a payment proof & re-open link
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_payment_proof(
  p_submission_id uuid,
  p_reason        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id   uuid := auth.uid();
  v_owner_name text;
  v_reason     text := trim(COALESCE(p_reason, ''));
  v_sub        public.payment_proof_submissions%ROWTYPE;
BEGIN
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Owner sign-in required.');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please provide a clear rejection reason (at least 5 characters).');
  END IF;

  SELECT owner_name INTO v_owner_name FROM public.owner_profiles WHERE id = v_owner_id;
  v_owner_name := COALESCE(v_owner_name, 'JM Maker Owner/Manager');

  SELECT *
    INTO v_sub
    FROM public.payment_proof_submissions
   WHERE id = p_submission_id
     AND owner_id = v_owner_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment submission record not found.');
  END IF;

  IF v_sub.status = 'Approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approved payment proofs cannot be rejected.');
  END IF;

  UPDATE public.payment_proof_submissions
     SET status = 'Rejected',
         rejection_reason = v_reason,
         verified_by_id = v_owner_id,
         verified_by_name = v_owner_name,
         verified_at = now()
   WHERE id = v_sub.id
   RETURNING * INTO v_sub;

  -- Re-activate link for resubmission unless the owner already revoked it
  UPDATE public.payment_verification_links
     SET status = 'Active'
   WHERE id = v_sub.verification_link_id
     AND status <> 'Revoked';

  INSERT INTO public.notifications (
    owner_id, linked_order_id, linked_payment_proof_id,
    title, message, category, severity, target_page
  ) VALUES (
    v_owner_id,
    v_sub.order_id,
    v_sub.id,
    format('Payment Proof Rejected — %s', v_sub.submission_code),
    format('Rejected payment proof from %s (%s). Reason: %s', v_sub.buyer_name, v_sub.order_label, v_reason),
    'Orders & Payments',
    'warning',
    'payment-proofs'
  );

  INSERT INTO public.audit_logs (owner_id, related_order_id, module, action)
  VALUES (
    v_owner_id,
    v_sub.order_id,
    'Payment Verification',
    format('Rejected payment proof %s (%s). Reason: %s', v_sub.submission_code, v_sub.order_label, v_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'submissionId', v_sub.id,
    'submissionCode', v_sub.submission_code,
    'status', v_sub.status
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. OWNER/MANAGER ONLY (authenticated): Atomic walk-in stock sale
-- Locks the inventory item row, verifies stock >= qty, deducts stock, updates
-- stock status, records sales_logbook entry, and raises stock alert if needed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_walk_in_stock_sale(
  p_inventory_item_id       uuid,
  p_client_name             text,
  p_qty                     integer,
  p_payment_method          text DEFAULT 'Cash',
  p_reference_number        text DEFAULT NULL,
  p_payment_proof_image_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id   uuid := auth.uid();
  v_item       public.inventory_items%ROWTYPE;
  v_new_qty    integer;
  v_new_status text;
  v_total      numeric(12,2);
  v_next_txn   integer;
  v_log_no     text;
  v_entry_id   uuid;
BEGIN
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Owner sign-in required.');
  END IF;

  IF p_qty IS NULL OR p_qty < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity sold must be at least 1.');
  END IF;

  SELECT *
    INTO v_item
    FROM public.inventory_items
   WHERE id = p_inventory_item_id
     AND owner_id = v_owner_id
     AND category = 'Stock Apparel'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Selected stock apparel product was not found.');
  END IF;

  IF v_item.qty < p_qty THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient stock for "%s" (Only %s pcs left).', v_item.item_name, v_item.qty)
    );
  END IF;

  v_new_qty := v_item.qty - p_qty;
  v_new_status := CASE
    WHEN v_new_qty = 0 THEN 'Out of Stock'
    WHEN v_new_qty <= v_item.low_stock_threshold THEN 'Low Stock'
    ELSE 'In Stock'
  END;
  v_total := v_item.unit_price * p_qty;

  UPDATE public.inventory_items
     SET qty = v_new_qty,
         status = v_new_status
   WHERE id = v_item.id;

  SELECT COUNT(*) + 1 INTO v_next_txn FROM public.sales_logbook WHERE owner_id = v_owner_id;
  v_log_no := format('TXN-%s-%s', to_char(CURRENT_DATE, 'YYYY'), lpad(v_next_txn::text, 3, '0'));

  INSERT INTO public.sales_logbook (
    owner_id,
    inventory_item_id,
    log_no,
    or_number,
    order_reference,
    transaction_date,
    client_name,
    particulars,
    qty,
    unit_price,
    payment_type,
    payment_method,
    reference_number,
    payment_proof_image_url,
    amount_paid,
    balance_remaining,
    remarks
  ) VALUES (
    v_owner_id,
    v_item.id,
    v_log_no,
    format('INV-WALK-IN-%s', lpad(v_next_txn::text, 3, '0')),
    'WALK-IN',
    CURRENT_DATE,
    COALESCE(NULLIF(trim(p_client_name), ''), 'Walk-In Customer'),
    v_item.item_name,
    p_qty,
    v_item.unit_price,
    'Walk-In Stock Sale',
    COALESCE(NULLIF(trim(p_payment_method), ''), 'Cash'),
    NULLIF(trim(COALESCE(p_reference_number, '')), ''),
    p_payment_proof_image_url,
    v_total,
    0,
    format('%s pcs x %s (%s)', p_qty, v_item.unit_price, v_new_status)
  )
  RETURNING id INTO v_entry_id;

  IF v_new_qty = 0 THEN
    INSERT INTO public.notifications (
      owner_id, linked_inventory_item_id, title, message, category, severity, target_page
    ) VALUES (
      v_owner_id,
      v_item.id,
      format('Out of Stock — %s', v_item.item_name),
      format('%s has 0 pcs remaining after transaction %s.', v_item.item_name, v_log_no),
      'Inventory',
      'urgent',
      'inventory'
    );
  ELSIF v_new_qty <= v_item.low_stock_threshold THEN
    INSERT INTO public.notifications (
      owner_id, linked_inventory_item_id, title, message, category, severity, target_page
    ) VALUES (
      v_owner_id,
      v_item.id,
      format('Low Stock Alert — %s', v_item.item_name),
      format('%s has %s pcs remaining after transaction %s.', v_item.item_name, v_new_qty, v_log_no),
      'Inventory',
      'warning',
      'inventory'
    );
  END IF;

  INSERT INTO public.audit_logs (owner_id, module, action)
  VALUES (
    v_owner_id,
    'Sales',
    format('Recorded consolidated sale %s — %s pcs %s = %s.', v_log_no, p_qty, v_item.item_name, v_total)
  );

  RETURN jsonb_build_object(
    'success', true,
    'entryId', v_entry_id,
    'logNo', v_log_no,
    'newQty', v_new_qty,
    'newStatus', v_new_status,
    'totalAmount', v_total
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. OWNER/MANAGER ONLY (authenticated): Reset current owner's store records
-- Respects FK dependency order cleanly and leaves other owners untouched.
-- ----------------------------------------------------------------------------
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

  DELETE FROM public.notifications             WHERE owner_id = v_owner_id;
  DELETE FROM public.audit_logs                WHERE owner_id = v_owner_id;
  DELETE FROM public.sales_logbook             WHERE owner_id = v_owner_id;
  DELETE FROM public.payment_proof_submissions WHERE owner_id = v_owner_id;
  DELETE FROM public.payment_verification_links WHERE owner_id = v_owner_id;
  DELETE FROM public.payment_accounts          WHERE owner_id = v_owner_id;
  DELETE FROM public.inventory_items           WHERE owner_id = v_owner_id;
  DELETE FROM public.custom_orders             WHERE owner_id = v_owner_id;

  UPDATE public.owner_profiles
     SET last_backup_at = NULL
   WHERE id = v_owner_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Explicit RPC EXECUTE permissions (least privilege)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.resolve_payment_verification_link(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_tokenized_payment_proof(text, text, text, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_payment_proof(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_payment_proof(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_walk_in_stock_sale(uuid, text, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_owner_store_data() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.resolve_payment_verification_link(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tokenized_payment_proof(text, text, text, text, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payment_proof(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payment_proof(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_walk_in_stock_sale(uuid, text, integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_owner_store_data() TO authenticated;
