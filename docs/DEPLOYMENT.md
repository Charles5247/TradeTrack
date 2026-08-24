# TradeTrack — Deployment Guide

> **This replaces the older `docs/DEPLOYMENT_GUIDE.md`**, which described a
> Vercel deployment. TradeTrack is actually deployed on **Render** — see
> `render.yaml` at the repo root, which is the live, checked-in source of
> truth for the production build/start commands and required env vars.
> `DEPLOYMENT_GUIDE.md` is kept only for its still-accurate Supabase/Storage/
> Zainpay setup steps; anything about the hosting platform itself should be
> read from this file instead.

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
```

Optionally, run `supabase/seed/001_seed_data.sql` for demo data, then run
`npm run setup:demo` (see below) to create matching Supabase Auth users —
the seed SQL only inserts profile rows, it does **not** create real Auth
accounts.

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
dashboard (Render → your service → Environment) rather than committing
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

# Zainpay payment gateway (required for subscription/billing features)
ZAINPAY_BASE_URL=https://api.zainpay.ng   # sandbox.zainpay.ng for testing
ZAINPAY_PUBLIC_KEY=your-zainpay-public-key
ZAINPAY_PRIVATE_KEY=your-zainpay-private-key
ZAINPAY_DEFAULT_ZAINBOX=your-default-zainbox-code
ZAINPAY_WEBHOOK_SECRET=your-zainpay-webhook-secret

# Zainpay dedicated virtual accounts (required for per-merchant NUBAN
# creation at onboarding time)
ZAINPAY_SECRET_KEY=your-zainpay-secret-key
ZAINPAY_ZAINBOX_CODE=your-zainbox-code

# Update-check / download page metadata (see docs/DOWNLOAD_FLOW.md) —
# optional; leave *_DOWNLOAD_URL blank until real installers are hosted
TRADETRACK_WINDOWS_LATEST_VERSION=1.0.0
TRADETRACK_WINDOWS_DOWNLOAD_URL=
TRADETRACK_ANDROID_LATEST_VERSION=1.0.0
TRADETRACK_ANDROID_DOWNLOAD_URL=
TRADETRACK_ANDROID_UNKNOWN_SOURCES_HELP_URL=
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
    name: tradetrack-web
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

1. Push this repository to GitHub (already done — `Charles5247/TradeTrack`).
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

---

## 4. Deploying elsewhere (self-hosted / other platforms)

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
pm2 start npm --name "tradetrack" -- start
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

> If you deploy to a different platform (Railway, Fly.io, a bare VM, etc.),
> port the `buildCommand`/`startCommand`/env vars from `render.yaml` — it
> remains the single source of truth for what production actually needs,
> regardless of which platform hosts it.

---

## 5. Zainpay Webhook Configuration

1. Log into your Zainpay merchant dashboard.
2. Go to Settings → Webhooks.
3. Add webhook URL: `https://your-domain.com/api/webhooks/zainpay`.
4. Copy the webhook secret and set it as `ZAINPAY_WEBHOOK_SECRET`.
5. Select events: `deposit.successful`, `deposit.failed`, `card.payment`.

---

## 6. Post-Deployment Checklist

```
□ All env vars are set in Render (or your chosen platform)
□ Database migrations ran successfully, in order (see section 1)
□ Storage buckets created with correct policies
□ Supabase Auth redirect URLs updated to production domain
□ Zainpay webhook URL registered
□ ZAINPAY_BASE_URL set to the live endpoint (not sandbox) for production
□ npm run build passes with no errors
□ Test login flow works
□ Test POS sale end-to-end
□ Test offline mode: disable network, make a sale, reconnect and verify sync
□ Verify PWA install works on mobile (Android Chrome)
□ Test payment flow with a Zainpay test card
□ Test merchant onboarding end-to-end (creates org + business_owner + NUBAN)
```

---

## 7. Build Verification

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

## 8. Performance Recommendations

- Configure Supabase connection pooling (pgBouncer) for high traffic.
- Set up Supabase database backups (automatic on paid plans).
- Consider Supabase Edge Functions for heavy server-side processing.
- On Render, upgrade from the `free` plan (see `render.yaml`) before
  production launch — the free tier spins down on inactivity, which adds
  cold-start latency to the first request after idle periods.
