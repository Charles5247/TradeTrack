> Current-build live test instructions: [RENDER_LIVE_TEST.md](./RENDER_LIVE_TEST.md). Read its payment and demo-account limitations before using the older setup steps below.

# TracKasuwa — Deployment Guide

> **This replaces the older `docs/DEPLOYMENT_GUIDE.md`**, which described a
> Vercel deployment from an earlier project snapshot. TracKasuwa's current
> production deployment is **Render** — see `render.yaml` at the repo root
> for its checked-in build/start commands and environment variables. This
> guide also includes steps for deploying a separate instance on Vercel.
> `DEPLOYMENT_GUIDE.md` is kept for its still-accurate Supabase/Storage/
> Zainpay setup steps; use this file for current hosting instructions.

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (PostgreSQL 15)
- A [Render](https://render.com) account (or any Node-hosting platform —
  see "Deploying elsewhere" below)
- A [Zainpay](https://zainpay.ng) merchant account (required for
  subscription billing; the app runs without it, but billing/checkout
  features stay disabled — see `isZainpayConfigured()`)

---

## 1. Supabase Setup

### Create the project

1. Go to [supabase.com](https://supabase.com) → New Project.
2. Choose a region close to your users (e.g. `eu-west-2` for Nigeria/West
   Africa).
3. Note your **Project URL** and **anon key** from Settings → API, and your
   **service role key** (Settings → API → service_role) — never expose the
   service role key to the client.

### Run migrations, in order

Run every file in `supabase/migrations/` **in numeric order** via the
Supabase SQL Editor (there is no migration-runner CLI wired into this repo
yet — copy/paste each file's contents and run it):

```
001_initial_schema.sql
002_rls_policies.sql
003_payment_and_improvements.sql
003_2_automatic_generate_invoice.sql
004_owner_payments_merchants.sql
005_add_missing_roles.sql
006_fix_role_policies.sql
007_feature_updates.sql
008_role_model_rework.sql                       -- platform_owner/business_owner rename + RLS
009_merchant_onboarding_virtual_accounts.sql    -- Zainpay virtual accounts + renewal fields
010_five_tier_subscription_plans.sql            -- Free/Starter/Growth/Business/Enterprise
011_purchase_orders.sql                         -- Purchase Orders (Business-tier feature)
012_fix_stray_active_legacy_plans.sql           -- Closes a gap in 010's legacy-plan deactivation
```

For local development (including a step-by-step "why your local
`/pricing` page might show stale/duplicate plans" troubleshooting
guide), see **[`docs/LOCAL_DEV_SETUP.md`](./LOCAL_DEV_SETUP.md)**.

Optionally, run `supabase/seed/001_seed_data.sql` for demo data, then run
`npm run setup:demo` (see below) to create matching Supabase Auth users —
the seed SQL only inserts profile rows, it does **not** create real Auth
accounts.

### September 2026 schema rollout

The live TracKasuwa project has received migrations 013–019; see [LIVE_MIGRATION_RECEIPT.md](LIVE_MIGRATION_RECEIPT.md) for the applied state and verification. Do not rerun already-applied files.

For another populated hosted database, migration **018 must run before 014** when `pgcrypto` is installed in `extensions`; it supplies the owner-only compatibility function used by 014's backfill. The continuation after the original 001–012 baseline is therefore **013 → 018 → 014 → 015 → 016 → 017 → 019**. Migration 019 accounts for Supabase's direct default grants to anonymous/authenticated roles. This project still uses explicitly applied SQL; do not use `db push` until its legacy history has been reconciled.

### Configure Storage

1. Storage → Create bucket: `product-images` (public).
2. Create bucket: `org-logos` (public).
3. Add an RLS policy on `storage.objects` so authenticated users can
   upload and anyone can read:

```sql
CREATE POLICY "authenticated_upload" ON storage.objects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "public_read" ON storage.objects
  FOR SELECT USING (bucket_id IN ('product-images', 'org-logos'));
```

### Configure Auth

1. Auth → Settings → Email Templates: customize signup/reset emails.
2. Auth → URL Configuration:
   - Site URL: `https://your-domain.com`
   - Redirect URLs: `https://your-domain.com/**`
3. Enable **Email confirmations** for production.

---

## 2. Environment Variables

See `.env.example` at the repo root for the full, inline-documented list.
Copy it to `.env.local` for local development:

```bash
cp .env.example .env.local
```

For production, set the same variables in your hosting platform's
environment settings (for example, Render → your service → Environment or
Vercel → Project → Settings → Environment Variables) rather than committing
`.env.local`. The required/recommended variables are:

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App config (required)
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_APP_VERSION=1.0.0
NODE_ENV=production

# Zainpay mode is test or live; use only the selected mode's credentials
ZAINPAY_MODE=test
ZAINPAY_TEST_PUBLIC_KEY=your-test-public-key
ZAINPAY_TEST_PRIVATE_KEY=your-test-private-key
ZAINPAY_TEST_DEFAULT_ZAINBOX=your-test-checkout-zainbox
ZAINPAY_TEST_WEBHOOK_SECRET=your-test-webhook-secret
ZAINPAY_TEST_SECRET_KEY=your-test-server-secret
ZAINPAY_TEST_ZAINBOX_CODE=your-test-virtual-account-zainbox

# Update-check / download page metadata (see docs/DOWNLOAD_FLOW.md) —
# optional; leave *_DOWNLOAD_URL blank until real installers are hosted
TracKasuwa_WINDOWS_LATEST_VERSION=1.0.0
TracKasuwa_WINDOWS_DOWNLOAD_URL=
TracKasuwa_ANDROID_LATEST_VERSION=1.0.0
TracKasuwa_ANDROID_DOWNLOAD_URL=
TracKasuwa_ANDROID_UNKNOWN_SOURCES_HELP_URL=
```

> **Security note:** never commit `.env.local`. `SUPABASE_SERVICE_ROLE_KEY`
> bypasses Row Level Security — keep it server-side only, never expose it
> to the browser bundle.

Run `npm run verify:env` at any time to check that all required
(and recommended) environment variables are set — it prints a report
and exits non-zero if anything required is missing.

---

## 3. Render Deployment (current production platform)

The repo ships a checked-in `render.yaml` (Render's "Infrastructure as
Code" / Blueprint format) that fully describes the web service:

```yaml
services:
  - type: web
    name: TracKasuwa-web
    env: node
    plan: free
    rootDir: .
    buildCommand: npm install && npm run build
    startCommand: npm start
    healthCheckPath: /
    envVars:
      - key: NODE_ENV
        value: production
      - key: NEXT_PUBLIC_APP_URL
        sync: false
      # ... (see render.yaml for the full list)
```

### Initial setup

1. Push this repository to GitHub (already done — `Charles5247/TracKasuwa`).
2. In the [Render Dashboard](https://dashboard.render.com), click
   **New → Blueprint**, connect the GitHub repo, and Render will detect
   `render.yaml` automatically.
3. For every `envVars` entry with `sync: false`, Render will prompt you to
   fill in the value manually (these are secrets/instance-specific values
   that must never be committed to `render.yaml`).
4. Click **Apply** — Render runs `npm install && npm run build`, then
   `npm start` on every deploy, and polls `/` (`healthCheckPath`) to confirm
   the service is healthy.

### Redeploying

Render redeploys automatically on every push to the connected branch
(typically `main`). To trigger a manual redeploy without a new commit, use
the **Manual Deploy** button in the Render dashboard.

### Updating environment variables

Render Dashboard → your service → **Environment** tab → add/edit variables,
then **Save Changes** (this triggers a redeploy so the new values take
effect).

### Keeping a free instance warm

Render Free web services spin down after 15 minutes without inbound traffic.
If you accept the limitations of a free instance, use
[Cron-job.org](https://cron-job.org/) to request the lightweight health
endpoint every 10 minutes:

```text
https://YOUR-SERVICE.onrender.com/api/health
```

Create a job with method **GET**, a 10-minute schedule, and expect HTTP `200`
with body `ok`. The endpoint performs no database or gateway work and does not
expose configuration. A ping can wake a service that has already spun down,
so this reduces sleep but does not guarantee uninterrupted availability or
avoid cold starts. Free instances share a 750-hour monthly allowance per
workspace; an always-running service can use nearly all of it. Render
recommends paid instances for production workloads.

---

## 4. Deploying to Vercel

Vercel detects Next.js automatically and runs the app as a Next.js deployment.
No `vercel.json` or static export is required; this app needs a Node.js
runtime for its API routes, authentication, and server-rendered pages.

### Initial setup

1. Push the repository to GitHub, then in the
   [Vercel Dashboard](https://vercel.com/dashboard) select **Add New → Project**
   and import the repository.
2. Keep the **Root Directory** set to `.` and the **Framework Preset** set to
   Next.js. Use Node.js **22.x** in the project's Build & Development Settings.
3. In **Environment Variables**, add the values listed below for the
   environments you intend to deploy (Production, Preview, and/or Development).
   Set them before the first deployment because `verify:env` checks required
   values during the build. Set `NEXT_PUBLIC_APP_URL` to the intended
   production HTTPS URL (the Vercel-provided `.vercel.app` domain or your
   custom domain).
4. Use `npm ci` as the install command and
   `npm run verify:env && npm run build` as the build command. Leave the output
   directory and start command at their Next.js defaults.
5. Select **Deploy**. When deployment completes, confirm the production
   domain matches `NEXT_PUBLIC_APP_URL`. If you change the URL, update the
   variable and redeploy so the built app uses the correct canonical URL.

Vercel deploys new commits pushed to the connected branch and creates Preview
Deployments for other branches and pull requests. Changes to environment
variables take effect after a new deployment; redeploy the relevant
environment after editing them.

### Environment variables

At minimum, set the required variables from `npm run verify:env`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```

Add the Zainpay variables from section 2 to enable payment features. Set
`ZAINPAY_MODE=test` for development and Preview, or `ZAINPAY_MODE=live` only
for a production deployment that is ready to accept real payments. The mode
selects the corresponding `ZAINPAY_TEST_*` or `ZAINPAY_LIVE_*` credentials
and defaults to `https://sandbox.zainpay.ng` or `https://api.zainpay.ng`.
For backwards compatibility, existing unprefixed `ZAINPAY_*` credentials
continue to work when no mode-prefixed credentials are configured; keep those
credentials matched to the selected mode. Live webhooks require a configured
`ZAINPAY_LIVE_WEBHOOK_SECRET`; they are rejected when the selected mode's
signing secret is absent. Keep `SUPABASE_SERVICE_ROLE_KEY`, all Zainpay
credentials, and other private values server-side: do not give them a
`NEXT_PUBLIC_` prefix.

`NEXT_PUBLIC_*` values are embedded into the client bundle at build time. If
one changes, deploy again. Use Vercel's separate environment scopes when
Production and Preview need different Supabase projects or app URLs. Only
register Preview URLs in Supabase Auth's redirect allow list if you intend to
test authentication from those deployments.

### Supabase and webhook configuration

After assigning the production domain:

1. In Supabase **Authentication → URL Configuration**, set the Site URL to
   the production HTTPS domain and add the required auth callback/redirect
   URLs for that domain. Add Preview deployment URLs only if needed.
2. Register the Zainpay webhook at
   `https://your-production-domain.com/api/webhooks/zainpay` only when the
   matching production payment credentials and callback behavior are ready.
   For sandbox testing, use the sandbox credentials and that deployment's
   webhook URL.
3. Apply database migrations and configure Storage policies as described in
   section 1. Vercel deployments do not run Supabase migrations automatically.

Do not run demo-user setup or seed scripts against a production Supabase
project just to deploy. Deployment does not create or reset user accounts.

---

## 5. Deploying elsewhere (self-hosted / other platforms)

`render.yaml` is Render-specific, but the app itself is a standard Next.js
production build and will run anywhere Node.js 20+ runs:

```bash
npm ci
npm run build
npm start   # listens on $PORT (or 3000 if unset)
```

### PM2 + Nginx (self-hosted VM)

```bash
npm run build
npm install -g pm2
pm2 start npm --name "TracKasuwa" -- start
pm2 save
pm2 startup
```

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> For platforms other than Render or Vercel (Railway, Fly.io, a bare VM,
> etc.), adapt the build/start commands and environment variables above.
> `render.yaml` is the source of truth for the Render deployment only.

---

## 6. Zainpay Webhook Configuration

1. Log into your Zainpay merchant dashboard.
2. Go to Settings → Webhooks.
3. Add webhook URL: `https://your-domain.com/api/webhooks/zainpay`.
4. Copy the webhook secret and set it as `ZAINPAY_WEBHOOK_SECRET`.
5. Select events: `deposit.successful`, `deposit.failed`, `card.payment`.

---

## 7. Post-Deployment Checklist

```
□ All env vars are set in Render, Vercel, or your chosen platform
□ Database migrations ran successfully, in order (see section 1)
□ Storage buckets created with correct policies
□ Supabase Auth redirect URLs updated to production domain
□ Zainpay webhook URL registered only when production payments are ready
□ ZAINPAY_MODE set to `live` only for production payment processing
□ npm run build passes with no errors
□ Test login flow works
□ Test POS sale end-to-end
□ Test offline mode: disable network, make a sale, reconnect and verify sync
□ Verify PWA install works on mobile (Android Chrome)
□ Test payment flow with a Zainpay test card
□ Test merchant onboarding end-to-end (creates org + business_owner + NUBAN)
```

---

## 8. Build Verification

```bash
npm ci
npx tsc --noEmit                 # type check — must pass with 0 errors
npm run lint                     # ESLint — fix any blocking issues
npm test                         # Vitest unit suite
npm run build                    # production build — must complete without errors
```

Or run the bundled pre-deployment gate, which does all of the above in one
step:

```bash
npm run deploy:check
# or, to skip the (slower) production build step during iteration:
./deploy-check.sh --skip-build
```

---

## 9. Performance Recommendations

- Configure Supabase connection pooling (pgBouncer) for high traffic.
- Set up Supabase database backups (automatic on paid plans).
- Consider Supabase Edge Functions for heavy server-side processing.
- On Render, upgrade from the `free` plan (see `render.yaml`) before
  production launch — the free tier spins down on inactivity, which adds
  cold-start latency to the first request after idle periods.
