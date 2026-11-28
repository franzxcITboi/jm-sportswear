# JM Maker Sportswear — Complete Project Recovery & New-Computer Setup Guide

Use this guide if your computer is **reset, formatted, damaged, lost, or replaced**, or when onboarding a teammate's laptop so you can resume development, testing, and deployment without starting over.

---

## 1. Repository & Version Control Reference

| Item | Value |
| --- | --- |
| **GitHub Repository URL** | `https://github.com/franzxcITboi/jm-sportswear.git` |
| **Repository Name** | `jm-sportswear` |
| **Default Branch** | `main` |
| **Latest Verified Stable Commit** | `30ef096` (*Normalize Supabase URL and allow cloud registration with existing local emails*) |
| **Source Code Backup Strategy** | Primary remote on GitHub + secondary clone/ZIP on a teammate's laptop or encrypted cloud drive |

---

## 2. Step 1 — Install Required Software on the New Computer

Install only the tools actually required by this project:

1. **Node.js (v18+ LTS or v26.x — project verified on Node `v26.13.0` / npm `11.20.0`)**
   - Download: https://nodejs.org/
2. **Git (project verified on `v2.56.0`)**
   - Download: https://git-scm.com/downloads
3. **Visual Studio Code**
   - Download: https://code.visualstudio.com/
4. **Modern Browser (Google Chrome or Microsoft Edge)**
   - Download Chrome: https://www.google.com/chrome/
5. **Google Antigravity** *(optional, for continuing AI-assisted development)*

Verify installation in PowerShell / Terminal:

```powershell
node --version
npm --version
git --version
```

---

## 3. Step 2 — Clone the Repository & Install Dependencies

```powershell
# 1. Clone the repository from GitHub
git clone https://github.com/franzxcITboi/jm-sportswear.git

# 2. Enter the project folder
cd jm-sportswear

# 3. Install npm dependencies (@supabase/supabase-js ^2.119.2)
npm install
```

Configure Git identity on the new laptop (so future commits match your GitHub profile):

```powershell
git config user.name "franzxcITboi"
git config user.email "<your-github-email>"
```

---

## 4. Step 3 — Configure Environment Variables (`.env.local`)

Because `.env.local` is safely ignored by `.gitignore`, you must recreate it on any new computer:

1. Copy `.env.example` to `.env.local`:
   ```powershell
   Copy-Item .env.example .env.local
   ```
2. Open `.env.local` and paste your real **Project URL** (without `/rest/v1/`) and **Publishable / `anon` key** from **Supabase Dashboard → Project Settings → Data API & API Keys**:
   ```env
   VITE_SUPABASE_URL=https://sarlozgvoktmwrksxnst.supabase.co
   VITE_SUPABASE_ANON_KEY=<paste-publishable-key-from-supabase-or-password-manager>
   ```
3. **Never** paste any `service_role` or `sb_secret_` key into `.env.local`.

> **Offline / No-Internet Fallback:** If you skip creating `.env.local`, the app automatically launches in browser `localStorage` fallback mode with zero setup errors.

---

## 5. Step 4 — Run, Typecheck, Build, and Test the System

### Start Local Development Server
```powershell
npm run dev
```
- Opens `http://localhost:5173` automatically (`index.html`, `dashboard.html`, `buyer.html`).
- Stop server anytime with `Ctrl + C`.

### Run TypeScript Strict Typecheck (Zero Errors Expected)
```powershell
npx --yes -p typescript tsc --noEmit
```

### Build Production Bundle (`dist/`)
```powershell
npm run build
```
- Uses `vite.config.ts` multi-page Rollup configuration (`index.html`, `dashboard.html`, `buyer.html`).
- Outputs optimized static files into `dist/`.

### Preview the Built Production App Locally
```powershell
npm run preview
```

### Verify Live Supabase Sync After Startup
1. Open `http://localhost:5173`.
2. Sign in with your registered Owner/Manager Supabase account.
3. Confirm existing orders, inventory items, staff members, tasks, sales, and audit logs load from Supabase PostgreSQL.
4. Confirm creating a test item reflects immediately inside **Supabase → Table Editor**.

---

## 6. Daily Git Workflow (Preventing Code Loss)

```powershell
# Always pull teammate changes before starting work
git pull origin main

# After editing & testing your changes:
git status
git add .
git commit -m "Describe what you changed clearly"
git push origin main
```

> **Safety Check Before Pushing:** Run `git status` and confirm `.env.local` is **NOT** listed under Changes to be committed.

---

## 7. Restoring a Previous Working Version (Git Rollback)

If a recent change breaks the app, you can inspect commit history and safely revert without losing history:

```powershell
# 1. View recent commits
git log --oneline -n 10

# 2. Safest rollback (creates a new clean revert commit without rewriting shared history)
git revert <bad-commit-hash>
git push origin main

# 3. Or inspect a known-good commit (e.g., 30ef096) in a temporary branch
git checkout -b recovery-branch 30ef096
```

---

## 8. Re-Deploying to a Hosting Platform

When deploying the built application online (Vercel, Netlify, or Cloudflare Pages):
1. Connect your GitHub repository `franzxcITboi/jm-sportswear` (branch `main`).
2. Set **Build Command:** `npm run build` and **Output Directory:** `dist`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the hosting platform's **Environment Variables** panel.
4. Update **Supabase → Authentication → URL Configuration** (`Site URL` and `Redirect URLs`) to include your production HTTPS domain.
5. See [`docs/PRODUCTION_ACCESS_AND_DEPLOYMENT_CHECKLIST.md`](./PRODUCTION_ACCESS_AND_DEPLOYMENT_CHECKLIST.md) for the complete launch checklist.
