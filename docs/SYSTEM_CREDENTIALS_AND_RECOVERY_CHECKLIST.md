# JM Maker Sportswear — System Credentials, Configuration & Recovery Checklist

**Purpose:** Master operational, security, credentials-inventory, and emergency-recovery reference for the **Point of Sale and Inventory System with Staff Monitoring and Analytics for JM Maker Sportswear** (STI College Fairview BSIT Capstone Project).

> **SECURITY NOTICE:** This document intentionally contains **ZERO plaintext passwords, ZERO plaintext PINs, ZERO API keys/secrets, ZERO service-role keys, and ZERO recovery codes**. Store all actual secret values exclusively inside a reputable password manager (e.g., Bitwarden, 1Password, KeePassXC, or Google Password Manager with 2FA) and an offline encrypted backup.

---

## 1. Accounts and Login Information

Only accounts and platforms **actually used** by this project are listed below. Unverified or unprovisioned services are marked clearly.

| Service / Platform | Purpose in Project | Login URL | Verified Identifier / Org | Plan / Access Required | 2FA Status / Recommendation | Recovery Options to Secure | Must Save Credentials? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **GitHub** | Primary Git remote repository, version control, and team code sharing | https://github.com/login | Account: `franzxcITboi` • Repo: `franzxcITboi/jm-sportswear` | Free Public Repository | **Strongly Recommended** (enable TOTP Authenticator + download recovery codes) | Verified primary + backup email, GitHub recovery codes | **YES** (password, 2FA recovery codes, any PAT/SSH keys) |
| **Supabase** | Cloud PostgreSQL 15+ database, Authentication, Row Level Security (RLS), Transactional RPCs, and Realtime sync | https://supabase.com/dashboard | Org: `franzxcITboi's Org` • Project: `jm-maker-sportswear` | Free Tier (note: free projects pause after 7 days of inactivity) | **Strongly Recommended** (via GitHub SSO 2FA or Supabase MFA) | Linked GitHub account + verified email | **YES** (account login, DB password, project API keys in password manager) |
| **Google / Gmail Account** | Owner account login for Supabase Auth, GitHub notifications, and Google Antigravity sign-in | https://accounts.google.com | Store personal/school Gmail in your password manager (not hardcoded in public docs) | Standard Google Account | **Required / Strongly Recommended** (Google Authenticator / Passkey + 10 backup codes) | Recovery phone number, secondary recovery email, printed 2FA backup codes | **YES** |
| **Google Antigravity** | AI-assisted coding and project workspace IDE | Sign in via Antigravity app / Google Account | Tied to your Google Account | Active Google Antigravity access | Inherited from Google Account 2FA | Google Account recovery options | **YES** (via Google Account) |
| **Hosting / Deployment Platform** *(Vercel / Netlify / Cloudflare Pages)* | Public web hosting of Vite production build (`dist/`) | **Not Yet Provisioned** *(currently runs on `http://localhost:5173`)* | To be recorded in `PRODUCTION_ACCESS_AND_DEPLOYMENT_CHECKLIST.md` when deployed | Free Hobby Tier sufficient for static Vite app | Enable 2FA upon account creation | GitHub SSO + recovery codes | **YES** (once provisioned) |
| **Domain Registrar** | Custom domain name & DNS | **Not Applicable / Not Yet Provisioned** | None configured yet | Optional for future shop rollout | Enable 2FA + registrar lock if purchased | Registrar recovery email & backup codes | Only if custom domain is purchased |
| **Google Fonts CDN** | Public font stylesheets (`Inter`, `Oswald`) loaded in HTML `<head>` | No login required (`https://fonts.googleapis.com`) | Public CDN | Free / Anonymous | N/A | N/A (system font fallbacks already in CSS) | **NO** |
| **Firebase / Gemini API / Payment Gateways / SMTP / SMS** | N/A — **Not Used** in this application | N/A | Verified absent from `package.json` and `src/` | N/A | N/A | N/A | **NO** |

---

## 2. Database Credentials and Configuration

### 2.1 Verified Database Metadata (Non-Secret)

| Configuration Item | Verified Value / Source | Sensitivity |
| --- | --- | --- |
| **Database Provider** | Supabase (Managed PostgreSQL 15+) | Public metadata |
| **Project Name** | `jm-maker-sportswear` | Public metadata |
| **Project Reference ID** | `sarlozgvoktmwrksxnst` | Non-secret identifier |
| **Supabase Dashboard URL** | `https://supabase.com/dashboard/project/sarlozgvoktmwrksxnst` | Login-protected |
| **Base Project URL** (`VITE_SUPABASE_URL`) | `https://sarlozgvoktmwrksxnst.supabase.co` *(never append `/rest/v1/`)* | Public endpoint |
| **Database Host (Direct / Pooler)** | Retrieve from **Supabase Dashboard → Connect** (format: `db.sarlozgvoktmwrksxnst.supabase.co` or regional pooler host) | Operational metadata |
| **Database Name** | `postgres` (default Supabase database) | Standard default |
| **Database Port** | `5432` (direct PostgreSQL) / `6543` (Supavisor transaction pooler) / `54322` (local CLI in `supabase/config.toml`) | Standard default |
| **Database Username** | `postgres` (direct) or `postgres.sarlozgvoktmwrksxnst` (pooler) | Standard default |
| **Database Password** | Created during Supabase project setup — **store in password manager** (resettable via **Project Settings → Database → Reset database password**) | **HIGHLY SECRET** |
| **Direct / Pooler Connection String** | `postgresql://postgres:[YOUR-PASSWORD]@...` — retrieve from **Supabase Dashboard → Connect** | **HIGHLY SECRET** |
| **Publishable / `anon` Public Key** (`VITE_SUPABASE_ANON_KEY`) | Retrieve from **Supabase Dashboard → Project Settings → API Keys** (`sb_publishable_...`) | **Public (RLS-protected)** — safe in `.env.local`, still kept out of Git |
| **Secret / `service_role` Key** | Retrieve from **Supabase Dashboard → Project Settings → API Keys** (`sb_secret_...` / `service_role`) | **CRITICAL PRIVILEGED SECRET** — bypasses all RLS; **NEVER** place in frontend or `.env.local` |
| **JWT Signing Secret** | Managed by Supabase under **Project Settings → JWT Keys** | **CRITICAL PRIVILEGED SECRET** — server-side only |

### 2.2 Schema, Migrations, RLS, Realtime & Storage Summary
- **Active Schema:** `public` (plus Supabase-managed `auth`)
- **Normalized Tables (13):** `owner_profiles`, `staff_members`, `staff_tasks`, `custom_orders`, `order_size_items`, `order_fulfillment_checklists`, `inventory_items`, `payment_accounts`, `payment_verification_links`, `payment_proof_submissions`, `sales_logbook`, `notifications`, `audit_logs`
- **Security-Invoker Views (2):** `v_monthly_sales_summary`, `v_staff_performance_summary`
- **Transactional RPCs (6):** `resolve_payment_verification_link`, `submit_tokenized_payment_proof`, `approve_payment_proof`, `reject_payment_proof`, `record_walk_in_stock_sale`, `reset_owner_store_data`
- **Chronological SQL Migrations (Preserved in Git under `supabase/migrations/`):**
  1. `202611260001_initial_schema.sql`
  2. `202611260002_indexes_and_rls.sql`
  3. `202611260003_functions_and_rpcs.sql`
  4. `202611280004_staff_monitoring_and_pos_enhancements.sql`
- **Row Level Security (RLS):** Enabled on all **13** tables (`owner_id = auth.uid()`); `anon` has **zero direct table privileges**; `audit_logs` revokes `UPDATE` and `DELETE` from `authenticated` (strictly append-only).
- **Realtime Publication (`supabase_realtime`):** Must have `payment_proof_submissions` and `notifications` toggled **ON** in **Database → Publications**.
- **Storage Bucket Configuration:** No cloud Storage bucket is currently required — product images, jersey templates, and receipt proofs are compressed client-side (`src/utils/imageCompressor.ts`) and persisted as Data URLs. (`supabase/config.toml` has `[storage] enabled = true, file_size_limit = "5MiB"` ready for optional future migration.)
- **Full Backup & Restore Procedures:** See [`docs/DATABASE_BACKUP_AND_RESTORATION_GUIDE.md`](./DATABASE_BACKUP_AND_RESTORATION_GUIDE.md).

---

## 3. API Keys, Tokens, and Integrations Audit

Full static scan of `package.json`, `index.html`, `dashboard.html`, `buyer.html`, `vite.config.ts`, and all TypeScript files in `src/` confirmed the exact integration inventory below:

| Integration / Key | Provider | Purpose | Where Used | Env Var Name | Where to Obtain / Regenerate | Public vs. Secret | Storage Location | Rotation / Renewal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Supabase Project URL** | Supabase | Base REST, Auth & Realtime API endpoint | `src/lib/supabaseClient.ts` | `VITE_SUPABASE_URL` | Supabase Dashboard → Project Settings → Data API | Public endpoint | Local `.env.local` & hosting env settings | Fixed per project |
| **Supabase Publishable / `anon` Key** | Supabase | Client SDK authentication header (strictly constrained by RLS) | `src/lib/supabaseClient.ts` | `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API Keys | Public (RLS-gated) | Local `.env.local` & hosting env settings | Rotate in Supabase API Keys if abused |
| **Supabase Secret / `service_role` Key** | Supabase | Administrative server-side operations (NOT used by frontend) | Not used in frontend code | None in frontend | Supabase Dashboard → Project Settings → API Keys | **Privileged Secret** | Password manager / server-only vault | Rotate immediately if ever exposed |
| **Buyer Payment Verification Tokens (`jm_...`)** | In-App Generated (`crypto.getRandomValues`) | Scopes anonymous buyer receipt upload to one order without login | `src/services/paymentLinkService.ts`, `buyer.html`, PostgreSQL RPCs | Stored per link in `payment_verification_links.token` | Generated inside Dashboard → Payment Proofs | Semi-secret capability URL | PostgreSQL database | Auto-expires (default 7 days) or revocable per link |
| **Gemini API / Google OAuth / Firebase / Email API / SMTP / SMS / Stripe / GCash API / Maps / Webhooks** | — | **Confirmed NOT used in this project** | None | None | N/A | N/A | N/A | N/A |

---

## 4. Environment Variables and `.env` Security Verification

### 4.1 Complete Environment Variable Inventory

| Variable Name | Description | Required / Optional | Usage Scope | Environments | Source |
| --- | --- | --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Base Supabase project URL (`https://<ref>.supabase.co`, without `/rest/v1/`) | Required for Cloud Mode *(Optional for offline localStorage fallback)* | Frontend (`src/lib/supabaseClient.ts`) | Development & Production | Supabase Dashboard → Project Settings → Data API |
| `VITE_SUPABASE_ANON_KEY` | Supabase Publishable (`sb_publishable_...`) or legacy `anon` public key | Required for Cloud Mode *(Optional for offline localStorage fallback)* | Frontend (`src/lib/supabaseClient.ts`) | Development & Production | Supabase Dashboard → Project Settings → API Keys |

### 4.2 `.env` & Secret Hygiene Audit Results
- [x] `.env`, `.env.local`, and `.env.*.local` are listed in `.gitignore` (lines 10–12).
- [x] `.env.example` exists in project root with placeholders only and **zero real secrets**.
- [x] `.env.local` is confirmed **untracked** by Git (`git status` verified).
- [x] **Zero** `service_role`, `sb_secret_`, or privileged backend keys exist anywhere in `src/` or Git history.
- [x] No missing environment variables were detected in `src/`.

### 4.3 Security Audit Findings (Hardcoded Values Detected — Action Recommended Before Public Launch)
Per strict security best practices, the codebase scan identified **three locations** where non-secret-manager fallback credentials/PINs exist in source/docs (values intentionally omitted here):

| # | File & Location | Finding Description | Risk Level | Recommended Remediation (After Defense / Before Public Launch) |
| --- | --- | --- | --- | --- |
| **1** | `src/services/authService.ts` (lines 22–26) | Hardcoded local fallback Owner/Manager email & password (`DEFAULT_OWNER_CREDENTIALS`) for offline demo mode | Medium (only active when Supabase is unconfigured) | Remove hardcoded default password before public internet hosting, or require Supabase Auth exclusively in production builds. |
| **2** | `src/services/authService.ts` (lines 28–29, 129, 190, 542) & `index.html` (lines 165, 210) | Hardcoded `OWNER_SECURITY_PIN` constant + visible placeholder/error hint inside frontend HTML/TS | High for public web hosting | Move registration/reset authorization to a Supabase Edge Function / invitation flow, remove PIN hints from HTML placeholders/errors, and rotate the PIN. |
| **3** | `README.md` (lines 25–31) | Plaintext local default credentials and PIN table committed in a **public** GitHub repository (and outdated "No database connected" wording) | High | Update `README.md` to remove plaintext passwords/PINs and reflect the live Supabase setup (ask before modifying so existing thesis demo flow isn't disrupted). |
| **4** | `src/modules/staff/staffMonitoringModule.ts` & `src/services/authService.ts` | Local-mode optional staff passwords stored in browser `localStorage` (`jm_pos_inventory_system_v3`); NOT synced to Supabase | Low in single-shop offline use; High on shared public browsers | For multi-device cloud staff logins, provision real Supabase Auth users linked via `staff_members.auth_user_id` instead of local passwords. |

---

## 5. Admin, Staff, and Demo Accounts

### 5.1 System User Roles

| Role | Code Value | Access Scope | Account Provisioning Method |
| --- | --- | --- | --- |
| **Owner / Manager (Admin)** | `owner_manager` | Full access to all 9 modules, Staff Monitoring RBAC admin, and JSON Backup/Restore/Reset | **Cloud Mode:** Sign up via `index.html` → **Create Account** (creates `auth.users` + auto-provisions `owner_profiles` via SQL trigger) or via **Supabase → Authentication → Users**. |
| **Supervisor** | `supervisor` | Dashboard Overview, Notifications, Staff Monitoring (view directory, manage tasks, view audit trail) + checked RBAC modules | Created by Owner/Manager inside **Dashboard → Staff Monitoring → Staff Directory**. |
| **Shop Staff** | `staff` | Dashboard Overview, Notifications + ONLY the 5 RBAC modules explicitly checked by Owner (`POS`, `Orders`, `Inventory`, `Payments`, `Reports`) | Created by Owner/Manager inside **Dashboard → Staff Monitoring → Staff Directory**. |
| **Buyer (External Customer)** | `anon` (token-scoped) | Single-order receipt upload via unique `buyer.html?token=jm_...` link (no account needed) | Generated per order by Owner/Authorized Staff in **Payment Proofs** or **Custom Orders & POS**. |

### 5.2 Account Creation, Reset & Recovery Procedures
- **Creating the Primary Owner Account (Supabase Cloud Mode):**
  1. Ensure **Supabase → Authentication → Sign In / Providers → Email**: **Enable Email provider = ON** (and **Confirm email = OFF** for instant demo login, or **ON** for production email verification).
  2. Open `index.html`, click **Create Account**, fill in Owner Name, Gmail, Password (min 6 chars), and the Owner Security PIN, then submit.
  3. Verify the new row appears automatically in **Supabase → Table Editor → `owner_profiles`**.
- **Password Reset (Cloud Mode):**
  - Self-service: Click **Forgot Password?** on `index.html` (triggers `supabase.auth.resetPasswordForEmail`).
  - Admin recovery via Supabase Dashboard: Go to **Authentication → Users** → click the user → **Send password recovery** or update the user via Supabase Auth admin tools.
- **Email Confirmation Manual Override (if locked at "Email not confirmed"):**
  - Run in **Supabase → SQL Editor**: `UPDATE auth.users SET email_confirmed_at = now() WHERE email = '<owner-email>';`
- **Owner Security PIN Reset Procedure:**
  - Currently defined in `src/services/authService.ts` (`OWNER_SECURITY_PIN`). Changing it requires updating the constant (or moving it to server-side config), rebuilding, and pushing to GitHub.
- **Demo / Panelist Account Checklist (Fill In Privately — Do NOT Commit Passwords):**
  - [ ] Primary Owner/Manager Account Email recorded in password manager (`[Stored in Password Manager]`)
  - [ ] Backup Owner / Co-Proponent Account Email (if created for defense) (`[Stored in Password Manager]`)
  - [ ] Sample Staff Account(s) created in **Staff Monitoring** before demo (e.g., Sublimation Artist with POS/Orders/Inventory enabled, Payments/Reports disabled)
  - [ ] Sample Supervisor Account created in **Staff Monitoring** (if demonstrating role hierarchy)

---

## 6. Master Personal Checklist — Passwords, PINs & Recovery Codes to Save Securely

Print or check off each item inside your **password manager** (never commit filled-in values to GitHub):

| # | Item to Save Securely | Where to Retrieve / Generate | Sensitivity | Can Be Regenerated / Reset If Lost? | Saved? |
| --- | --- | --- | --- | --- | --- |
| 1 | **Google / Gmail Account Password** | Your Google Account | **Critical** | Yes (via recovery phone/email) | [ ] |
| 2 | **Google 2FA Backup Codes (10 codes)** | Google Account → Security → 2-Step Verification → Backup codes | **Critical** | Yes (regenerating invalidates old ones) | [ ] |
| 3 | **Google Recovery Phone & Secondary Email** | Google Account → Security → Recovery info | High | Editable while signed in | [ ] |
| 4 | **GitHub Account Password** (`franzxcITboi`) | https://github.com/settings/security | **Critical** | Yes (via verified email) | [ ] |
| 5 | **GitHub 2FA Recovery Codes** | GitHub → Settings → Password and authentication → Recovery codes | **Critical** | Yes (while signed in) | [ ] |
| 6 | **GitHub Personal Access Token (PAT) / SSH Keys** *(if created)* | GitHub → Settings → Developer settings | **Critical** | Yes (revoke old & create new) | [ ] |
| 7 | **Supabase Account Login / Linked GitHub Access** | https://supabase.com/dashboard | **Critical** | Yes (via GitHub SSO or email reset) | [ ] |
| 8 | **Supabase PostgreSQL Database Password** | Created at project creation (or reset at **Project Settings → Database**) | **Critical** | Yes (resetting updates direct/pooler strings) | [ ] |
| 9 | **Supabase Project URL & Publishable (`anon`) Key** | Supabase → Project Settings → Data API & API Keys | Public (RLS-gated) | Key can be rotated in API Keys | [ ] |
| 10 | **Supabase Secret / `service_role` Key & JWT Secret** | Supabase → Project Settings → API Keys & JWT Keys | **Critical** | Yes (rotating requires redeploy/re-auth) | [ ] |
| 11 | **Owner/Manager App Login Email & Password** | Registered in Supabase Auth (`Authentication → Users`) | **Critical** | Yes (via Supabase Auth reset) | [ ] |
| 12 | **Demo / Staff / Panelist Account Credentials** | Created in Staff Monitoring / Supabase Auth | High | Yes (editable by Owner/Manager) | [ ] |
| 13 | **Owner Security PIN** | Configured in `src/services/authService.ts` (keep private once hardened) | High | Editable in source / future backend config | [ ] |
| 14 | **Authenticator App Backup / Cloud Sync Key** (Google Authenticator / Authy / Bitwarden) | Your phone's Authenticator app settings | **Critical** | Hard if phone lost without backup codes | [ ] |
| 15 | **Windows PC / Laptop Login PIN & BitLocker Recovery Key** *(if BitLocker enabled)* | Windows Settings → Accounts / Microsoft Account | **Critical** | BitLocker key is NOT recoverable if lost | [ ] |
| 16 | **Hosting Platform Password & 2FA Recovery Codes** *(when deployed)* | Vercel / Netlify / Cloudflare account settings | **Critical** | Yes (via GitHub SSO / email) | [ ] |
| 17 | **Domain Registrar Password & Recovery Codes** *(if domain purchased)* | Domain registrar account | **Critical** | Yes (via registrar ID verification) | [ ] |
| 18 | **Latest Offline JSON Store Backup File** (`jm-maker-sportswear-backup-YYYY-MM-DD.json`) | Dashboard → Sales Reports → **Download Backup (.JSON)** | Confidential business data | Generated on demand | [ ] |

---

## 7. GitHub & Source Code Recovery Summary

- **Repository URL:** `https://github.com/franzxcITboi/jm-sportswear.git`
- **Repository Name:** `jm-sportswear` (Owner: `franzxcITboi`)
- **Primary Branch:** `main`
- **Latest Verified Stable Commit:** `30ef096` (*Normalize Supabase URL and allow cloud registration with existing local emails*)
- **Previous Major Milestone Commit:** `eb10abc` (*Add Supabase schema, Staff Monitoring, POS discounts, Reports & Capstone Docs*)
- **Backup Recommendation:** Keep a secondary copy of the repository (e.g., ZIP archive or clone on a teammate's laptop / Google Drive / USB drive) in addition to GitHub.
- **Full Step-by-Step Reinstallation, Clone, Run, Build, Test & Rollback Guide:** See [`docs/PROJECT_RECOVERY_GUIDE.md`](./PROJECT_RECOVERY_GUIDE.md).

---

## 8. Deployment, Hosting & Database Backup References

- **Deployment & Production Access Checklist:** See [`docs/PRODUCTION_ACCESS_AND_DEPLOYMENT_CHECKLIST.md`](./PRODUCTION_ACCESS_AND_DEPLOYMENT_CHECKLIST.md).
- **Database Backup & Restoration Guide:** See [`docs/DATABASE_BACKUP_AND_RESTORATION_GUIDE.md`](./DATABASE_BACKUP_AND_RESTORATION_GUIDE.md).

---

## 9. Software & Tools Verified in This Project

| Tool | Verified Version / Requirement | Purpose | Official Download Link |
| --- | --- | --- | --- |
| **Node.js** | `v26.13.0` installed (v18+ LTS minimum) | JavaScript runtime & dev/build tooling | https://nodejs.org/ |
| **npm** | `11.20.0` (bundled with Node.js) | Installs `@supabase/supabase-js` and runs scripts | Bundled with Node.js |
| **Git** | `v2.56.0.windows.4` | Version control & GitHub sync | https://git-scm.com/downloads |
| **Visual Studio Code** | Latest stable | Code editor & integrated terminal | https://code.visualstudio.com/ |
| **Google Antigravity** | Latest stable | AI-assisted development workflow | Via Google Antigravity app |
| **Vite** | `v8.4.0` (invoked via `npx --yes vite` in `package.json`) | Local dev server (`localhost:5173`) & multi-page production bundler | Auto-fetched via `npm run dev` / `npm run build` |
| **TypeScript** | Strict ES2020 (`tsc --noEmit` via `npx --yes -p typescript`) | Static type checking (`tsconfig.json`) | Auto-fetched via `npx` |
| **`@supabase/supabase-js`** | `^2.119.2` (in `package.json`) | Official Supabase PostgreSQL, Auth & Realtime SDK | Installed via `npm install` |
| **Modern Web Browser** | Google Chrome / Microsoft Edge | Running `index.html`, `dashboard.html`, `buyer.html`, DevTools & Print-to-PDF | https://www.google.com/chrome/ |
| **Supabase CLI** *(Optional for DB CLI dumps/push)* | Latest via `npx supabase` | Optional `supabase db dump` / `supabase db push` | https://supabase.com/docs/guides/cli |

---

## 10. Quick-Reference Emergency Recovery Checklist (Scenarios A–J)

### Scenario A — Computer Accidentally Shuts Down Mid-Work
1. Reboot PC and open VS Code in `c:\Users\FRANZCUTE\Desktop\jm-sportswear`.
2. Run `git status` and `git diff --stat` to inspect any unsaved or half-edited files.
3. Run `npx --yes -p typescript tsc --noEmit` to verify zero syntax/type corruption.
4. Check if `.env.local` still exists and contains both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Run `npm run dev` — your cloud data in Supabase is completely unaffected by a local PC power outage.

### Scenario B — Computer Gets Reset, Lost, or Replaced
1. Follow [`docs/PROJECT_RECOVERY_GUIDE.md`](./PROJECT_RECOVERY_GUIDE.md) from Step 1 (install Node.js, Git, VS Code).
2. Run `git clone https://github.com/franzxcITboi/jm-sportswear.git && cd jm-sportswear && npm install`.
3. Copy `.env.example` → `.env.local` and paste your saved `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your password manager (or Supabase Dashboard).
4. Run `npm run dev`, open `http://localhost:5173`, sign in with your existing Owner/Manager Supabase credentials — all live orders, inventory, staff, tasks, sales, and audit logs hydrate automatically from Supabase!

### Scenario C — Lost Access to GitHub Account
1. Use **GitHub Account Recovery** (`https://github.com/password_reset`) with your verified email and saved **GitHub 2FA recovery codes**.
2. Meanwhile, because Git is distributed, any laptop that already cloned `jm-sportswear` holds the **complete Git history**. Create a backup mirror immediately on another repository or ZIP archive (`git bundle create jm-sportswear-backup.bundle --all`).
3. Once access is recovered (or on a new repo), add the new remote with `git remote set-url origin <NEW-REPO-URL>` and run `git push -u origin main`.

### Scenario D — Lost Access to Supabase Account
1. Recover the linked **GitHub** or **email** account used to sign in to Supabase (`https://supabase.com/dashboard/sign-in`).
2. If you need to stand up a **fresh replacement Supabase project** immediately:
   - Create a new Supabase project.
   - Run the 4 SQL migrations in `supabase/migrations/` (`001` → `002` → `003` → `004`) in order inside **SQL Editor**.
   - Enable Realtime on `payment_proof_submissions` and `notifications`.
   - Update `.env.local` with the new Project URL and Publishable key.
   - Create your Owner account, sign in, go to **Sales Reports → Restore Backup (.JSON)**, and upload your latest saved JSON backup snapshot!

### Scenario E — Database Corrupted or Data Accidentally Deleted
1. **Stop** making further edits immediately so you don't overwrite good snapshots.
2. **Option 1 (Fastest — In-App JSON Snapshot Restore):** Open **Sales Reports → Restore Backup (.JSON)** as Owner/Manager and select your latest `jm-maker-sportswear-backup-*.json` file. All records reload, normalize, and sync back to Supabase.
3. **Option 2 (Supabase Point-in-Time / SQL Dump Restore):** Follow [`docs/DATABASE_BACKUP_AND_RESTORATION_GUIDE.md`](./DATABASE_BACKUP_AND_RESTORATION_GUIDE.md) to restore from a `pg_dump` SQL backup or Supabase Dashboard backup.
4. **If a free-tier Supabase project paused due to 7 days of inactivity:** Open Supabase Dashboard and click **Restore project** (takes ~2 minutes; no data is lost).

### Scenario F — API Keys Expire or Are Compromised
1. **If `service_role` / Secret Key is ever leaked:** Immediately go to **Supabase Dashboard → Project Settings → API Keys**, revoke/rotate the compromised secret key, and check **Logs** for unauthorized queries.
2. **If Publishable (`anon`) Key needs rotation:** Rotate it in **Supabase Dashboard → Project Settings → API Keys**, update `VITE_SUPABASE_ANON_KEY` in local `.env.local` (and in your hosting platform's Environment Variables), share the new public key privately with teammates, and redeploy/restart `npm run dev`.
3. Never commit the rotated key to GitHub.

### Scenario G — Hosting / Deployment Fails
1. Check the hosting platform's build log for the exact error (missing `VITE_SUPABASE_*` variables, Node version mismatch, or build command typo).
2. Test locally first with `npm run build` and `npm run preview` to confirm `dist/` builds cleanly with Node v18+.
3. Roll back immediately to the previous green deployment inside your hosting dashboard (1-click Rollback in Vercel/Netlify/Cloudflare Pages) while investigating.

### Scenario H — Forgot Admin (Owner/Manager) Password or PIN
1. **Forgot Supabase Owner Password:** Click **Forgot Password?** on `index.html`, OR go to **Supabase Dashboard → Authentication → Users**, locate the owner email, and trigger a password reset (or set a new password via Auth admin).
2. **Forgot Local Offline Fallback Password / PIN:** Inspect `src/services/authService.ts` in your local repository (or use Supabase Cloud Mode where Supabase Auth governs login).
3. **Locked Out After 5 Failed Attempts:** Wait 15 seconds for the automatic brute-force cooldown timer to reset.

### Scenario I — Continuing Development on Another Computer / Classmate's Laptop
1. Install Node.js (v18+), Git, and VS Code.
2. Run: `git clone https://github.com/franzxcITboi/jm-sportswear.git && cd jm-sportswear && npm install`.
3. Create `.env.local` using the two non-secret lines (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) shared privately by the lead developer.
4. Run `npm run dev` — open `http://localhost:5173`.
5. Before coding each day, run `git pull origin main`; after coding, run `git add .`, `git commit -m "..."`, and `git push origin main`.

### Scenario J — Preparing the System for Final Presentation / Capstone Defense
1. **48 Hours Before Defense:**
   - Open Supabase Dashboard to ensure the free-tier project is **Active** (not paused!).
   - Verify **Authentication → Providers → Email**: **Enable Email provider = ON**, **Confirm email = OFF** (for smooth live account demos).
   - Verify **Database → Publications → `supabase_realtime`**: `payment_proof_submissions` and `notifications` are **ON**.
   - Download a fresh **JSON Backup** (`Sales Reports → Download Backup (.JSON)`) and save it on a USB drive + second laptop.
2. **Day of Defense (Backup Plan Ready):**
   - Pull latest `main` on **two laptops** (primary + backup laptop), verify `npm run dev` opens cleanly on both.
   - Know that even if venue Wi-Fi fails, removing/renaming `.env.local` lets the entire 9-module app run cleanly in offline fallback mode!
   - Have [`docs/SYSTEM_EXPLANATION_PAPER.html`](./SYSTEM_EXPLANATION_PAPER.html) exported to PDF and [`docs/DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) open for panelist Q&A.
