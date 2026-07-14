# TRADETRACK — Deployment Guide

## Prerequisites

- Node.js 20+
- Supabase project (PostgreSQL 15)
- Vercel account (recommended) or self-hosted Node.js environment
- Zainpay merchant account

---

## 1. Supabase Setup

### Create Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a region close to your users (e.g., `eu-west-2` for Nigeria/West Africa)
3. Note your **Project URL** and **Anon Key** from Settings → API

### Run Migrations

Run these SQL files **in order** in Supabase SQL Editor:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_payment_and_improvements.sql
supabase/migrations/004_owner_payments_merchants.sql
```

### Configure Storage

1. Go to Storage → Create bucket: `product-images` (public)
2. Create bucket: `org-logos` (public)
3. Add RLS policy on `product-images`:
```sql
CREATE POLICY "authenticated_upload" ON storage.objects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "public_read" ON storage.objects
  FOR SELECT USING (bucket_id IN ('product-images', 'org-logos'));
```

### Configure Auth

1. Auth → Settings → Email Templates: customize signup/reset emails
2. Auth → URL Configuration:
   - Site URL: `https://your-domain.com`
   - Redirect URLs: `https://your-domain.com/**`
3. Enable **Email confirmations** for production

---

## 2. Environment Variables

Create `.env.local` (development) or set in your hosting platform (production):

```env
# ── Supabase (REQUIRED) ─────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ── Zainpay (REQUIRED for payments) ────────────────────────────
ZAINPAY_PUBLIC_KEY=ZPK-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ZAINPAY_PRIVATE_KEY=ZSK-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ZAINPAY_WEBHOOK_SECRET=your-hmac-webhook-secret
ZAINPAY_BASE_URL=https://sandbox.zainpay.ng   # or https://api.zainpay.ng for live
ZAINPAY_DEFAULT_ZAINBOX=your-default-zainbox-code

# ── Application ─────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

> **Security Note**: Never commit `.env.local` to version control.
> The `SUPABASE_SERVICE_ROLE_KEY` is a super-admin key — keep it server-side only.

---

## 3. Vercel Deployment (Recommended)

### Initial Setup

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
vercel link

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Set Environment Variables on Vercel

```bash
# Set each variable (prompts for value)
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add ZAINPAY_PUBLIC_KEY production
vercel env add ZAINPAY_PRIVATE_KEY production
vercel env add ZAINPAY_WEBHOOK_SECRET production
vercel env add ZAINPAY_BASE_URL production
vercel env add ZAINPAY_DEFAULT_ZAINBOX production
vercel env add NEXT_PUBLIC_APP_URL production
```

Or set via Vercel Dashboard → Project → Settings → Environment Variables.

### Vercel Configuration (vercel.json)

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "regions": ["lhr1"],
  "headers": [
    {
      "source": "/api/webhooks/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "no-store" }]
    }
  ]
}
```

---

## 4. Self-Hosted Deployment

### PM2 + Nginx

```bash
# Build
npm run build

# Install PM2
npm install -g pm2

# Start
pm2 start npm --name "tradetrack" -- start

# Save PM2 state
pm2 save
pm2 startup
```

**Nginx configuration:**

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

---

## 5. Zainpay Webhook Configuration

1. Log into your Zainpay merchant dashboard
2. Go to Settings → Webhooks
3. Add webhook URL: `https://your-domain.com/api/webhooks/zainpay`
4. Copy the webhook secret and set it as `ZAINPAY_WEBHOOK_SECRET`
5. Select events: `deposit.successful`, `deposit.failed`, `card.payment`

---

## 6. Post-Deployment Checklist

```
□ All env vars are set in production
□ Database migrations ran successfully
□ Storage buckets created with correct policies
□ Supabase Auth redirect URLs updated to production domain
□ Zainpay webhook URL registered
□ ZAINPAY_BASE_URL set to live (not sandbox) for production
□ npm run build passes with no errors
□ Test login flow works
□ Test POS sale end-to-end
□ Test offline mode: disable network, make a sale, reconnect and verify sync
□ Verify PWA install works on mobile (Android Chrome)
□ Test payment flow with Zainpay test card
```

---

## 7. Build Verification

```bash
# Install dependencies
npm ci

# Type check (must pass with 0 errors)
npx tsc --noEmit --skipLibCheck

# Lint (fix any blocking issues)
npm run lint

# Production build (must complete without errors)
npm run build
```

Expected output:
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages
✓ Collecting build traces
✓ Finalizing page optimization
```

---

## 8. Performance Recommendations

- Enable Vercel Analytics for production monitoring
- Configure Supabase connection pooling (pgBouncer) for high traffic
- Set up Supabase database backups (automatic on paid plans)
- Consider Supabase Edge Functions for heavy server-side processing
- Use Vercel's built-in CDN for static assets (handled automatically)
