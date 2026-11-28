# JM Maker Sportswear — Production Access & Deployment Checklist

Complete deployment architecture, hosting configuration, pre-launch security hardening, rollback instructions, and presentation-day access checklist.

---

## 1. Current Deployment Status & Hosting Profile

| Field | Current Verified State | Target Production Value (Fill When Provisioned) |
| --- | --- | --- |
| **Current Run Mode** | Local Vite Server (`http://localhost:5173`) connected live to Supabase Cloud | Static HTTPS Web Hosting (recommended: **Vercel**, **Netlify**, or **Cloudflare Pages**) |
| **Hosting Platform** | *Not yet provisioned* | `[Vercel / Netlify / Cloudflare Pages]` |
| **Hosting Project Name** | *Not yet provisioned* | `jm-maker-sportswear` |
| **Hosting Dashboard URL** | *Not yet provisioned* | `[Record after deployment]` |
| **Production URL** | *Not yet provisioned* | `[e.g., https://jm-maker-sportswear.vercel.app]` |
| **Preview / Staging URL** | *Not yet provisioned* | Auto-generated per Pull Request / branch |
| **Connected Git Repo & Branch** | `https://github.com/franzxcITboi/jm-sportswear.git` (`main`) | Same (`main` auto-deploys on push) |
| **Framework Preset** | Vite (Multi-Page Static App) | Vite |
| **Build Command** | `npm run build` (`npx --yes vite build`) | `npm run build` |
| **Output Directory** | `dist` | `dist` |
| **Node.js Version** | Verified on `v26.13.0` (compatible with Node `18+` / `20 LTS` / `22 LTS`) | Set Node `20.x` or `22.x` in hosting build settings |
| **Entry HTML Pages Built** | `index.html`, `dashboard.html`, `buyer.html` (defined in `vite.config.ts`) | Served directly at `/`, `/dashboard.html`, `/buyer.html` |
| **Custom Domain / DNS / SSL** | *Not yet provisioned* | Hosting provider auto-issues free Let's Encrypt HTTPS SSL; record registrar & renewal date below if purchased |

---

## 2. Required Production Environment Variables

Configure these exact two variables inside your hosting provider's **Project Settings → Environment Variables** (for both Production and Preview environments):

| Environment Variable | Value Source | Public / Secret |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://sarlozgvoktmwrksxnst.supabase.co` *(Supabase → Project Settings → Data API)* | Public endpoint |
| `VITE_SUPABASE_ANON_KEY` | Publishable / `anon` public key from *Supabase → Project Settings → API Keys* | Public (RLS-enforced) |

> **NEVER** add `service_role`, `sb_secret_`, or Database Password to hosting frontend `VITE_*` variables!

---

## 3. Supabase Production Configuration Checklist

Before opening a live HTTPS URL to the public or real customers, verify these Supabase Dashboard settings:

- [ ] **Migrations 001–004 Applied:** All 13 tables, 2 views, and 6 RPCs exist in `public` schema.
- [ ] **Row Level Security Enabled:** All 13 tables have RLS **ON**; `anon` has zero direct table access.
- [ ] **Realtime Replication Enabled:** `payment_proof_submissions` and `notifications` are enabled under **Database → Publications → `supabase_realtime`**.
- [ ] **Authentication → URL Configuration Updated:**
  - **Site URL:** Set to your production HTTPS URL (e.g., `https://your-app.vercel.app`).
  - **Additional Redirect URLs:** Add:
    - `https://your-app.vercel.app/index.html`
    - `https://your-app.vercel.app/dashboard.html`
    - `https://your-app.vercel.app/buyer.html`
    - `http://localhost:5173/**` *(keep for local dev)*
- [ ] **Authentication → Sign In / Providers → Email:**
  - **Enable Email provider:** **ON**
  - **Confirm email:** **OFF** for classroom/defense demo; switch to **ON** for real shop production rollout.
- [ ] **Buyer Link Base URL Verification:** When deployed to HTTPS, `paymentAdapter.buildVerificationUrl(token)` automatically uses `window.location.origin` — verify generated buyer links point to `https://your-domain/buyer.html?token=jm_...` (not `localhost`).

---

## 4. Pre-Production Security Hardening Checklist (Before Public Internet Rollout)

Complete these hardening steps before exposing the live site to the general public (do not break demo login right before defense without coordinating with your group):

- [ ] **Remove Plaintext Fallback Credentials from `README.md` (lines 25–31):** Update `README.md` so no default password or PIN is published in the public GitHub repo.
- [ ] **Harden `OWNER_SECURITY_PIN` (`src/services/authService.ts` lines 28–29 & `index.html` lines 165, 210):** Remove the PIN hint from HTML placeholders/error messages, disable public Owner self-registration (or move invite validation to a Supabase Edge Function), and rotate the PIN.
- [ ] **Disable Local Fallback Password in Production Builds (`src/services/authService.ts` lines 22–26):** Ensure live deployments authenticate strictly through Supabase Auth.
- [ ] **Provision Cloud Staff Auth Accounts:** For multi-device staff usage in production, create real `auth.users` accounts linked to `staff_members.auth_user_id` rather than local passwords.
- [ ] **Enable 2FA on All Admin Accounts:** Turn on 2FA on GitHub, Google, Supabase, and your hosting account, and store recovery codes in a password manager.

---

## 5. Custom Domain, DNS & Renewal Tracker (Optional Future Step)

If JM Maker Sportswear later purchases a custom domain (e.g., `jmmakersportswear.ph` or `.com`), record non-secret operational info here and credentials in your password manager:

| Item | Record Value |
| --- | --- |
| **Domain Name** | `[None yet]` |
| **Registrar** | `[e.g., Cloudflare Registrar / Namecheap / GoDaddy]` |
| **DNS Records** | `A` / `CNAME` pointing to hosting provider per dashboard instructions |
| **SSL Certificate** | Automatic HTTPS (Let's Encrypt / Edge SSL) — verify `HTTPS Redirect = ON` |
| **Registration / Renewal Date** | `[YYYY-MM-DD — set calendar reminder 30 days prior]` |
| **Auto-Renew Enabled?** | `[ ] Yes` |

---

## 6. Deployment & Rollback Steps

### Deploying Updates
1. Verify locally:
   ```powershell
   npx --yes -p typescript tsc --noEmit
   npm run build
   ```
2. Push to `main`:
   ```powershell
   git add .
   git commit -m "Release description"
   git push origin main
   ```
3. Watch the hosting dashboard build turn **Ready** and run a quick smoke test on `/index.html`, `/dashboard.html`, and a test `/buyer.html?token=...` link.

### Instant Rollback if a Deployment Fails
- **Hosting Dashboard Rollback (Fastest — ~10 seconds):** Open **Deployments** in Vercel / Netlify / Cloudflare Pages → locate the last green deployment → click **Promote to Production / Rollback**.
- **Git Revert Rollback:** Run `git revert <bad-commit-hash> && git push origin main` to trigger a clean rebuild of the previous working commit.

---

## 7. Final Capstone Presentation & Handoff Sign-Off

- [ ] Latest commit pushed to `https://github.com/franzxcITboi/jm-sportswear.git` (`main`)
- [ ] All groupmates' laptops ran `git pull origin main && npm install` and have `.env.local` configured
- [ ] Supabase project `jm-maker-sportswear` (`sarlozgvoktmwrksxnst`) is **Active** (not paused)
- [ ] Owner/Manager login tested end-to-end on live Supabase (`index.html` → `dashboard.html`)
- [ ] Fresh JSON backup downloaded and copied to USB + secondary laptop
- [ ] Print-ready documentation (`docs/SYSTEM_EXPLANATION_PAPER.html`) exported to PDF for defense
- [ ] All master account passwords, DB password, and 2FA recovery codes stored safely in a password manager
