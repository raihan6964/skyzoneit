# Skyzone IT — Review Task Earning Platform

A full-stack platform where users complete app-review tasks, submit screenshots, earn BDT (TK), and withdraw via bKash. Admins manage users, tasks, submissions, and withdrawals with manual control.

## Stack

| Layer | Tech |
| --- | --- |
| Web app | Next.js 16 (App Router, Turbopack), Tailwind v4, shadcn/ui 4 (Base UI) |
| Database | Supabase (Postgres, RLS, RPCs, Auth) |
| AI reviews | Groq API (OpenAI-compatible, default `openai/gpt-oss-120b`) |
| Screenshots | imgbb (via server-side `/api/upload` proxy — key never exposed) |
| Verification | Python FastAPI service (`python-service/`, separate deploy) |
| Sheets sync | Google Apps Script web app (`google-apps-script/Code.gs`) |
| Automation | Per-task approval start time; checks via GitHub Actions ping (5 min), traffic triggers, daily cron |
| Hosting | Vercel (Next.js + Python service) |

## Project structure

```
supabase/schema.sql        # Run in Supabase SQL Editor (tables, RLS, RPCs)
src/proxy.ts               # Auth/role route guarding (Next 16 proxy, not middleware)
src/lib/                   # API helpers, Groq, imgbb, sheets, validations
src/app/(auth)/            # login, signup, forgot/reset password, auth/confirm
src/app/(user)/dashboard/  # tasks, history, withdraw, AI review generator
src/app/(admin)/admin/     # dashboard, users, tasks, submissions, withdrawals
src/app/api/               # REST routes (user, admin, ai, upload, cron)
python-service/            # Standalone /verify screenshot verification API
google-apps-script/        # Sheets webhook (Code.gs)
vercel.json                # Daily cron for /api/cron/verify (00:20 Dhaka)
```

## Setup

### 1. Supabase

1. Create a Supabase project.
2. SQL Editor → paste and run `supabase/schema.sql` (creates tables, indexes, RLS, triggers, RPCs).
3. Providers → Email: **turn off "Confirm email"** OR keep it on (signup then requires the `/auth/confirm` link flow, which is already implemented).
4. Copy Project URL, anon key, service_role key.

Admin bootstrap (either):
- SQL: `update profiles set role = 'admin' where email = 'you@example.com';` (after first signup), **or**
- Set `ADMIN_EMAIL` env var to your login email (checked in addition to the `role` column).

### 2. Environment variables

Copy `.env.example` → `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=      NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     ADMIN_EMAIL=
GROQ_API_KEY=                  GROQ_MODEL=openai/gpt-oss-120b
IMGBB_API_KEY=
SHEETS_WEBHOOK_URL=            # /exec URL from Apps Script
PYTHON_SERVICE_URL=https://your-python-service.vercel.app  # service root; app calls /verify
PYTHON_SERVICE_SECRET=
CRON_SECRET=                   # random string; used by Vercel Cron
```

### 3. Local development

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # eslint
npm run build      # production build

cd python-service
pip install -r requirements.txt
uvicorn main:app --port 8000   # http://localhost:8000/verify
pytest                # tests (env: VERIFY_URL, PYTHON_SERVICE_SECRET)
```

### 4. Deploy (Vercel)

**Web app**
1. Import repo → Vercel → Framework: Next.js.
2. Add all env vars above.
3. `PYTHON_SERVICE_URL` → your Python deployment's root URL (the app calls `/verify`).
4. **Auto-approval** runs whenever the current Asia/Dhaka time passes each task's **approval start time** (`tasks.cron_time`). Checks are triggered three ways: the `approval-ping` GitHub Actions workflow hitting the endpoint **every 5 minutes** (Bearer `CRON_SECRET` repo secret), background piggybacked on user/admin traffic (`/api/user/profile`, `/api/user/tasks`, submissions & withdrawals routes — throttled to one cycle per 5 minutes), and the daily Vercel cron at **00:20 Asia/Dhaka**. Each pending row is retried **hourly** (15-minute age grace for `fail_action=pending`, 12-hour for `rejected`). Manual trigger: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/cron/verify`. Note: GitHub disables scheduled workflows after 60 days without repo activity — push a commit or run the workflow manually to re-enable.

**Python service**
1. New Vercel project with Root Directory = `python-service/`.
2. Env vars: `PYTHON_SERVICE_SECRET`.
3. Test: `curl -X POST <url>/verify -H "x-secret: <PYTHON_SERVICE_SECRET>" -H "Content-Type: application/json" -d '{...}'`

### 5. Google Apps Script (sheets sync)

1. Google Sheet → Extensions → Apps Script → paste `google-apps-script/Code.gs`.
2. Deploy → New deployment → Web app → Execute as: **Me**, Access: **Anyone**.
3. Copy the `/exec` URL → `SHEETS_WEBHOOK_URL`.
   Verify: `curl -X POST "$SHEETS_WEBHOOK_URL" -H "Content-Type: application/json" -d "{\"rows\":[]}"` → `{"ok":true,"appended":0}`.
4. Columns: `Date | User Name | App Name | Reviewer Name | Gmail | Screenshot Link` (the profile's display name, falling back to the Sky ID).
   Rows are always pushed pre-sorted (Date ASC → App Name ASC) so bulk approvals never interleave apps; rows whose screenshot link already exists are skipped (dedupe).

## How it works

**User flow:** signup (gets `sky-XXXX` ID) → pick a task → generate an AI review (Groq, per-task admin prompt) → publish on Play Store/App Store → upload screenshot (`/api/upload` → imgbb) → submission created with `submitted_date` (Asia/Dhaka) → daily per-task limit enforced race-safe via `create_submission` RPC.

**Verification loop:** once the daily Asia/Dhaka clock passes a task's approval start time, each approval cycle finds eligible pending submissions (age grace passed, not attempted within the last hour), sends them to the Python `/verify` service (Play Store + App Store web review matching), then auto-approves or auto-rejects per each task's `fail_action` setting, and back-syncs approved rows to Google Sheets. Cycles are triggered every 5 minutes by GitHub Actions, plus user/admin traffic and the daily cron.

**Earnings:** approval credits `profiles.balance` inside the `approve_submissions` RPC. Users request withdrawals (bKash, min configurable via `app_settings`); admin pays manually and sets status.

**Admin panel:** stats dashboard, user management (credit/debit, suspend, role), task CRUD (prompt, reward, platform, per-task `fail_action`, start/end), submissions review (screenshot viewer, single/bulk approve/reject), withdrawal management.

## Security notes

- All mutations go through API routes with server-side auth (`requireUser` / `requireAdmin`) or SECURITY DEFINER RPCs using the caller's JWT.
- Service-role key, Groq key, imgbb key, and webhook URL are server-only.
- Admin routes additionally enforce admin checks in `src/proxy.ts` and in-route.
