# JM Maker Sportswear — Database Backup & Restoration Guide

Practical, non-destructive procedures to preserve, export, restore, and verify your **Supabase PostgreSQL** database (`13` normalized tables, `2` security-invoker views, `6` transactional RPCs, and Row Level Security policies).

---

## 1. What Must Be Preserved for Complete Database Recovery

| Asset | Where It Lives | How It Is Backed Up |
| --- | --- | --- |
| **Schema, Constraints, Indexes, RLS Policies, Views & RPCs** | `supabase/migrations/202611260001` through `202611280004` | Version-controlled permanently inside GitHub (`main`) |
| **Supabase Local Config** | `supabase/config.toml` | Version-controlled in GitHub |
| **Operational Store Data** (orders, sizes, checklists, inventory, staff, tasks, payments, sales, notifications, audit logs) | Live Supabase PostgreSQL (`jm-maker-sportswear`) | Method A (In-App JSON Backup) + Method B (PostgreSQL `pg_dump` / Supabase Backup) |
| **Auth Users (`auth.users`)** | Supabase Auth service | Exportable via Supabase SQL / `pg_dump` or re-provisioned via Sign-Up / Dashboard |
| **Realtime Publication Settings** | Supabase Dashboard → Database → Publications | Documented below (`payment_proof_submissions`, `notifications`) |

---

## 2. How to Back Up Your Database

### Method A — In-App Full Store JSON Snapshot (Fastest — Built-In Objective 6 Feature)
Best for weekly shop backups, pre-defense snapshots, and instant one-click recovery:
1. Sign in to the application as **Owner / Manager**.
2. Open **Sales Reports** (`analytics`).
3. Scroll to **Database Backup, Recovery & Reset** and click **Download Backup (.JSON)**.
4. A timestamped file downloads: `jm-maker-sportswear-backup-YYYY-MM-DD.json`.
5. Store a copy in **two separate places** (e.g., encrypted Google Drive folder + physical USB flash drive).
6. Note: The app automatically updates `owner_profiles.last_backup_at` and appends an immutable `backup` entry to `audit_logs`.

### Method B — Full PostgreSQL Dump via Supabase CLI / `pg_dump` (DBA-Level Backup)
Best for full SQL-level snapshots including schema, RLS policies, and data:
```powershell
# Export full schema (tables, constraints, RLS, views, RPCs)
npx supabase db dump --db-url "postgresql://postgres:<DB-PASSWORD>@db.sarlozgvoktmwrksxnst.supabase.co:5432/postgres" -f backup_schema.sql

# Export data only across public tables
npx supabase db dump --db-url "postgresql://postgres:<DB-PASSWORD>@db.sarlozgvoktmwrksxnst.supabase.co:5432/postgres" --data-only -f backup_data.sql
```
*(Never commit `.sql` data backup files to a public GitHub repository — they contain real customer names, contact info, and sales figures!)*

### Method C — Table-Level CSV Export (Quick Spreadsheet Archive)
- **From App:** Open **Sales Reports**, pick **Logbook** or any date range, and click **Export CSV (.csv)**.
- **From Supabase Dashboard:** Open **Table Editor**, select any table (`custom_orders`, `sales_logbook`, `inventory_items`, `staff_members`, `staff_tasks`, `audit_logs`), click **Export → Export to CSV**.

### Storage Bucket Files (Current vs. Future)
- Currently, compressed product photos, jersey design templates, and payment receipt proofs are stored inline as compact Data URLs inside the database rows (and are automatically included inside both Method A JSON backups and Method B SQL dumps!).
- If you later migrate images to a Supabase Storage bucket, back up bucket objects separately via Supabase Dashboard → **Storage** or Supabase Storage API sync scripts.

---

## 3. Preserving Migrations & RLS Policies

All 4 SQL migrations in `supabase/migrations/` are **idempotent-ordered and non-destructive**. To recreate the exact database structure on any fresh Supabase project, run them in **strict chronological order** inside **Supabase → SQL Editor**:

1. `supabase/migrations/202611260001_initial_schema.sql` — core tables, foreign keys, `updated_at` & `owner_profiles` triggers
2. `supabase/migrations/202611260002_indexes_and_rls.sql` — performance indexes, RLS policies, least-privilege grants, `v_monthly_sales_summary`
3. `supabase/migrations/202611260003_functions_and_rpcs.sql` — 6 atomic transactional RPCs (`resolve_payment_verification_link`, `submit_tokenized_payment_proof`, `approve_payment_proof`, `reject_payment_proof`, `record_walk_in_stock_sale`, `reset_owner_store_data`)
4. `supabase/migrations/202611280004_staff_monitoring_and_pos_enhancements.sql` — `staff_members`, `staff_tasks`, `custom_orders` contact/discount/staff columns, actor-attributed immutable `audit_logs`, `v_staff_performance_summary`, and `notifications.target_page` `'staff-monitoring'` support

Then re-enable Realtime in **Database → Publications → `supabase_realtime`**:
- Toggle **ON** `payment_proof_submissions`
- Toggle **ON** `notifications`

---

## 4. How to Restore the Database & Recover Deleted/Corrupted Data

### Scenario 1 — Accidental Deletion or Bad Test Edits (Using In-App JSON Backup)
1. Sign in as **Owner / Manager** and open **Sales Reports**.
2. Click **Restore Backup (.JSON)** under **Database Backup, Recovery & Reset**.
3. Select your last known-good `jm-maker-sportswear-backup-YYYY-MM-DD.json` file.
4. The app validates required collections (`orders`, `inventory`, `salesLogbook`), normalizes all records, restores the dashboard state, logs a `"backup"` audit trail entry, and syncs recovered records to Supabase PostgreSQL automatically.

### Scenario 2 — Full Disaster Recovery Onto a Brand-New Supabase Project
1. Create a new Supabase project (Region: Southeast Asia — Singapore).
2. Run all **4 SQL migrations** (`001` → `004`) in order in **SQL Editor**.
3. Enable Realtime on `payment_proof_submissions` and `notifications`.
4. Configure **Authentication → Sign In / Providers → Email** (**Enable Email provider = ON**).
5. Update `.env.local` (and hosting env vars) with the new `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
6. Restart `npm run dev`, create your Owner/Manager account, sign in, and click **Sales Reports → Restore Backup (.JSON)** to restore all business records.

### Scenario 3 — Restoring a `pg_dump` SQL File
1. Provision a clean PostgreSQL/Supabase instance (do **not** run destructive drops on live production data without first taking a fresh backup!).
2. Apply `backup_schema.sql` (or the 4 migration files), followed by `backup_data.sql` using `psql` against the direct database connection string.

### Scenario 4 — Supabase Free-Tier Auto-Pause Recovery
- Free-tier Supabase projects automatically pause after **7 consecutive days of no traffic**.
- No data is deleted. Log in to https://supabase.com/dashboard, open `jm-maker-sportswear`, and click **Restore project** (~2 minutes).

---

## 5. Post-Restoration Verification Checklist

After any restoration, verify every check below before resuming normal shop operations:

- [ ] **Table Count Check:** Supabase **Table Editor** shows all **13 tables** and **2 views** (`v_monthly_sales_summary`, `v_staff_performance_summary`).
- [ ] **RLS Active Check:** Every public table in **Authentication → Policies** shows **RLS Enabled** (green shield).
- [ ] **Record Counts Match:** Compare Orders, Finished Goods Stock SKUs, Staff Profiles, Staff Tasks, and Sales Logbook totals in Dashboard Overview against your backup summary.
- [ ] **Financial Integrity Check:** Total Recorded Sales Revenue in **Sales Reports** equals the exact sum of `sales_logbook.amount_paid`.
- [ ] **Order Workflow Check:** Open an active custom order in **Order Fulfillment** and verify its 4-step checklist flags and size breakdown loaded intact.
- [ ] **Buyer Portal Check:** Generate a test payment link in **Payment Proofs**, open it in an incognito window (`buyer.html?token=...`), and verify the order summary resolves cleanly.
- [ ] **Audit Trail Check:** Confirm **Staff Monitoring → Immutable Activity & Login Trail** displays the restoration event with accurate timestamp and actor name.
