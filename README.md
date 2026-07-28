# TradeTrack - Enterprise Offline-First POS & Inventory Management

> Production-ready cloud-based POS and inventory management platform for Nigerian market traders.

## 🚀 Features

- **Multi-Role Access**: Platform Owner, Business Owner, Admin, Cashier — see [User Roles](#-user-roles)
- **Org-Isolated Merchant Onboarding**: every merchant gets its own `organizations` row and a dedicated Business Owner login — never shares data with another merchant
- **Forced Password Change**: newly onboarded Business Owners get a server-generated temp password and must set their own password on first login
- **Point of Sale**: Barcode scanning, cart, discounts, tax, receipts, split/partial payments
- **Inventory Management**: Multi-warehouse, stock levels, adjustments, movement history
- **Warehouse Transfers**: Stock transfers between locations with approval workflow
- **Vendor Consignment**: Track outside vendor sales and outstanding payments
- **Audit Trail**: Immutable history of every change — who, what, when, old/new values
- **Reports**: Daily/weekly/monthly/quarterly/yearly with PDF/Excel/CSV export
- **Zainpay Subscription Billing**: dedicated virtual account (NUBAN) per merchant, webhook-based auto-reconciliation of subscription payments — see [Zainpay Integration](#-zainpay-payment-integration)
- **Offline-First**: IndexedDB + Service Worker — works without internet
- **Sync Engine**: Automatic background sync with explicit, documented conflict resolution — see [Offline Sync & Conflict Resolution](#-offline-sync--conflict-resolution)
- **Multilingual**: English, Hausa, Yoruba, Igbo, Pidgin English
- **PWA**: Installable on mobile and desktop
- **Dark/Light Mode**

## 🛠 Technology Stack

| Layer            | Technology                                     |
| ---------------- | ---------------------------------------------- |
| Frontend         | Next.js 16, React 19, TypeScript, Tailwind CSS |
| UI Components    | Radix UI + ShadCN pattern                      |
| State Management | Zustand                                        |
| Data Fetching    | TanStack Query (React Query)                   |
| Forms            | React Hook Form + Zod                          |
| Charts           | Recharts                                       |
| Backend          | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Offline          | IndexedDB (idb), Service Worker                |
| Deployment       | Vercel                                         |

## 📋 Prerequisites

- Node.js 18+
- npm 9+
- Supabase account

## ⚡ Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Charles5247/TradeTrack.git
cd TradeTrack

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 4. Run Supabase migrations
# In your Supabase dashboard → SQL Editor, run in order:
# supabase/migrations/001_initial_schema.sql
# supabase/migrations/002_rls_policies.sql
# supabase/migrations/003_payment_and_improvements.sql
# supabase/migrations/004_owner_payments_merchants.sql
# supabase/migrations/005_add_missing_roles.sql
# supabase/migrations/006_*.sql ... 007_feature_updates.sql
# supabase/migrations/008_role_model_rework.sql   (platform_owner/business_owner rename + RLS)
# supabase/migrations/009_merchant_onboarding_virtual_accounts.sql (Zainpay virtual accounts + renewal fields)
# supabase/seed/001_seed_data.sql (optional demo data)

# 5. Create demo Supabase Auth users matching the seed data
# (required - the seed SQL only inserts profile rows, it does NOT
# create real Auth accounts, so login will not work without this step)
npm run setup:demo

# 6. Start development server
npm run dev
```

## 🗄 Database Setup

### Supabase Configuration

1. Create a new Supabase project at https://app.supabase.com
2. Go to **Settings → API** to get your URL and anon key
3. Run the migrations in order:

```sql
-- Run in Supabase SQL Editor, in order:
-- 1. supabase/migrations/001_initial_schema.sql
-- 2. supabase/migrations/002_rls_policies.sql
-- 3. supabase/migrations/003_payment_and_improvements.sql
-- 4. supabase/migrations/004_owner_payments_merchants.sql
-- 5. supabase/migrations/005_add_missing_roles.sql
-- 6. supabase/migrations/006_*.sql ... 007_feature_updates.sql
-- 7. supabase/migrations/008_role_model_rework.sql
--    (renames super_admin→platform_owner, owner→business_owner, adds
--    is_platform_owner()/is_admin_or_above()/is_business_owner() helper
--    functions + org-scoped RLS policies used by the merchants/users APIs)
-- 8. supabase/migrations/009_merchant_onboarding_virtual_accounts.sql
--    (merchants.business_owner_user_id/onboarded_by, organizations.zainpay_*
--    virtual-account fields, organizations.next_renewal_at/last_payment_*,
--    payment_transactions.virtual_account_number)
-- 9. supabase/seed/001_seed_data.sql (optional demo data)
```

4. Create demo Supabase Auth users so the seeded demo profiles can
   actually sign in (development/staging only - never run this
   against a production database):

```bash
npm run setup:demo
```

This script (`scripts/setup-demo-users.ts`) uses the Supabase Admin
API (`SUPABASE_SERVICE_ROLE_KEY`) to create confirmed Auth users for
all four roles — `platformowner@tradetrack.ng`, `owner@demo.com`,
`admin@demo.com`, and `cashier@demo.com` — all with
the password `demo1234`, and keeps their `users` table profile rows in
sync. It is safe to re-run - existing users are detected and updated
instead of duplicated.

> Note: this seeded demo `owner@demo.com` account is a `business_owner`
> pre-attached to the seeded "Demo Store" organization purely for local
> development convenience. In production, every real `business_owner`
> account is created exclusively through the **Merchant Onboarding**
> flow (`POST /api/merchants/onboard`, gated to `platform_owner` — see
> [Merchant Onboarding](#-merchant-onboarding) below), which always
> creates a brand-new, dedicated organization per merchant rather than
> attaching a new owner to an existing one.

### Environment Variables

Copy `.env.example` to `.env.local` and fill in real values. See
`.env.example` for full inline documentation of every variable.

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App config (required)
NEXT_PUBLIC_APP_URL=http://localhost:3008
NODE_ENV=development

# Zainpay payment gateway (required for subscription/billing features)
ZAINPAY_BASE_URL=https://sandbox.zainpay.ng
ZAINPAY_PUBLIC_KEY=your-zainpay-public-key
ZAINPAY_PRIVATE_KEY=your-zainpay-private-key
ZAINPAY_DEFAULT_ZAINBOX=your-default-zainbox-code
ZAINPAY_WEBHOOK_SECRET=your-zainpay-webhook-secret

# Zainpay dedicated virtual accounts (required for per-merchant NUBAN
# creation at onboarding time — see "Zainpay Payment Integration" below).
# ZAINPAY_SECRET_KEY may be the same value as ZAINPAY_PRIVATE_KEY depending
# on your Zainpay dashboard's key naming; ZAINPAY_ZAINBOX_CODE is the
# Zainbox that collects all merchant subscription virtual accounts.
ZAINPAY_SECRET_KEY=your-zainpay-secret-key
ZAINPAY_ZAINBOX_CODE=your-zainbox-code

# Update-check endpoint (GET /api/version) — metadata only, no binaries
# served yet. Populate once Electron/React Native builds exist (see
# "Distribution Strategy" below).
TRADETRACK_API_VERSION=1.0.0
TRADETRACK_WINDOWS_LATEST_VERSION=1.0.0
TRADETRACK_WINDOWS_DOWNLOAD_URL=
TRADETRACK_ANDROID_LATEST_VERSION=1.0.0
TRADETRACK_ANDROID_DOWNLOAD_URL=
TRADETRACK_ANDROID_UNKNOWN_SOURCES_HELP_URL=
```

Run `npm run verify:env` at any time to check that all required (and
recommended) environment variables are set — it prints a clear report and
exits non-zero if anything required is missing.

### Pre-Deployment Check

Before deploying, run the full deploy-readiness gate — it verifies env vars,
type-checks, lints, and does a production build:

```bash
npm run deploy:check
# or skip the (slower) production build step:
./deploy-check.sh --skip-build
```

## 👥 User Roles

TradeTrack uses a 4-tier role hierarchy:
`platform_owner > business_owner > admin > cashier`

This replaces the earlier `super_admin > owner > admin > cashier` model.
`platform_owner` merges the old `super_admin` + `owner` roles into a single
cross-org, TradeTrack-staff-only role; `business_owner` is a **new**,
single-org role auto-created for every merchant at onboarding time.

| Role                | Scope                       | Permissions                                                                                                                                                                                              |
| -------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Platform Owner**   | Cross-organization (TradeTrack staff only) | Read-only merchant/revenue dashboard (`/admin`), merchant onboarding + plan management (`/merchants`), global subscription plan catalog (`/subscriptions`). **Never reads or writes any merchant's operational data** (products, inventory, sales, etc.) — only merchant/subscription/billing metadata. |
| **Business Owner**   | Single organization (their own merchant) | Full control of their own org: Products, Inventory, POS, Sales, Warehouses, Transfers, Vendors, Reports, Audit Trail, Users (admin/cashier only), Subscriptions/Zainpay billing for their own org.       |
| **Admin**            | Single organization          | Manage products, inventory, sales, reports, vendors, warehouses for their organization (no billing/subscription access).                                                                                |
| **Cashier**           | Single organization          | Create sales, view inventory, print receipts.                                                                                                                                                             |

A `business_owner` can never see or modify another organization's data —
every merchant is isolated in its own `organizations` row (see
[Merchant Onboarding](#-merchant-onboarding)). A `platform_owner` can see
merchant/subscription/revenue data across every organization, but the
`merchants`/`subscriptions` RLS policies and every operational table's
own RLS policy (products, inventory, sales, ...) deliberately do **not**
grant `platform_owner` any row access there — cross-org visibility is
scoped exclusively to the metadata a payments/billing dashboard needs.

### Demo Credentials (development only)

Demo credentials are only ever displayed in the app when
`NODE_ENV !== 'production'`, and only exist once you've run
`npm run setup:demo` (see Database Setup above). Every one of the four
roles has a working login:

| Role                | Email                         | Password   | Organization          |
| -------------------- | ------------------------------ | ---------- | ---------------------- |
| **Platform Owner**   | `platformowner@tradetrack.ng` | `demo1234` | None (cross-org)       |
| **Business Owner**   | `owner@demo.com`              | `demo1234` | Demo Store             |
| **Admin**            | `admin@demo.com`              | `demo1234` | Demo Store             |
| **Cashier**           | `cashier@demo.com`            | `demo1234` | Demo Store             |

```
Platform Owner: platformowner@tradetrack.ng / demo1234
Business Owner: owner@demo.com / demo1234
Admin:          admin@demo.com / demo1234
Cashier:        cashier@demo.com / demo1234
```

## 🏪 Merchant Onboarding

Onboarding a new merchant (`POST /api/merchants/onboard`, `platform_owner`
only) fully isolates every merchant's data from day one:

1. A **brand-new `organizations` row** is created for the merchant — the
   old "insert merchant under the creator's own org" behaviour is gone;
   every merchant is always its own tenant.
2. A secure **temporary password** is generated server-side
   (`generateTempPassword()` in the onboarding route) and used to create a
   Supabase Auth user with `role: 'business_owner'`, scoped to the new
   organization.
3. The new `users` profile row is inserted with `must_change_password:
   true`, and the `merchants` row records `business_owner_user_id` +
   `onboarded_by` (which `platform_owner` created it, for audit purposes).
4. A **dedicated Zainpay virtual account (NUBAN)** is created for the new
   organization on a best-effort basis (non-fatal if Zainpay credentials
   aren't configured — see [Zainpay Payment Integration](#-zainpay-payment-integration)).
5. If any step fails after the organization is created, everything created
   so far is **rolled back** (merchant row → auth user + profile →
   organization) so no half-onboarded merchant is ever left behind.
6. The generated temp password is returned **once** in the API response
   and shown once in the "Create Merchant" success screen for the
   platform_owner to copy and relay to the merchant — this pass has no
   email provider wired up, so there is no other delivery channel yet.

### Forced Password Change (first login)

Every newly onboarded `business_owner` has `must_change_password = true`.
On next login:

- `src/app/(auth)/login/page.tsx` checks the fetched profile and redirects
  straight to `/change-password` instead of `/dashboard` when the flag is set.
- `src/components/layout/dashboard-layout.tsx` also independently enforces
  this — if a user with `must_change_password = true` ever lands on any
  dashboard route (e.g. a stale bookmark), it blanks the dashboard chrome
  and redirects to `/change-password` rather than rendering protected data.
- `/change-password` (`src/app/change-password/page.tsx`) lets the user set
  a new password (`supabase.auth.updateUser`), then flips
  `must_change_password` back to `false` and redirects to `/dashboard`.
- The gate is a no-op for every other user — it self-redirects away
  immediately if `must_change_password` is already `false`.

## 📁 Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login, forgot password, reset password
│   ├── (dashboard)/     # All protected dashboard pages
│   │   ├── dashboard/   # Analytics overview
│   │   ├── products/    # Product catalogue
│   │   ├── inventory/   # Stock management
│   │   ├── pos/         # Point of sale
│   │   ├── sales/       # Sales history
│   │   ├── warehouses/  # Warehouse management
│   │   ├── transfers/   # Warehouse transfers
│   │   ├── vendors/     # Vendor consignment
│   │   ├── reports/     # Business reports
│   │   ├── audit/       # Audit trail
│   │   ├── notifications/
│   │   ├── users/       # User management (per-org: business_owner/admin)
│   │   ├── merchants/   # Merchant list + onboarding (platform_owner)
│   │   └── settings/    # App settings
│   ├── change-password/ # Forced first-login password-change gate
│   └── api/
│       ├── merchants/onboard/  # POST — new-org merchant onboarding (platform_owner)
│       ├── webhooks/zainpay/   # Zainpay payment reconciliation webhook
│       ├── version/            # GET — app update-check metadata
│       └── ...                 # Other route handlers
├── components/
│   ├── ui/              # Reusable UI primitives
│   ├── layout/          # Sidebar, header, dashboard layout
│   ├── dashboard/       # Dashboard-specific components
│   ├── products/        # Product forms
│   └── shared/          # Shared providers
├── lib/
│   ├── supabase/        # Supabase client (browser + server)
│   ├── auth/            # Authentication helpers
│   ├── offline/         # IndexedDB + sync engine
│   ├── utils/           # Formatting, audit logging
│   └── validations/     # Zod schemas
├── store/               # Zustand stores (auth, cart, UI, sync)
├── types/               # TypeScript type definitions
├── i18n/                # Internationalization
└── middleware.ts        # Route protection
supabase/
├── migrations/          # SQL migrations
└── seed/                # Seed data
```

## 🗃 Database Schema

### Core Tables

- `organizations` — Multi-tenant support
- `users` — User profiles with roles
- `products` — Product catalogue
- `categories` / `suppliers` — Product metadata
- `warehouses` — Multiple storage locations
- `inventory` — Stock per product per warehouse
- `inventory_movements` — Full movement history
- `sales` + `sale_items` — Transaction records
- `warehouse_transfers` — Stock movement between warehouses
- `vendor_transactions` + `vendor_transaction_items` — Consignment tracking
- `audit_logs` — Immutable change history
- `notifications` — System notifications
- `subscription_plans` + `subscriptions` — SaaS billing
- `payment_transactions` — Zainpay payment attempts/results (`provider_reference`, `virtual_account_number`)
- `settings` — Per-organization configuration
- `offline_sync_queue` — Offline sync tracking (`client_updated_at` for conflict resolution)

### Role Model & Merchant Onboarding Columns (migrations 008–009)

- `users.role` — `'platform_owner' | 'business_owner' | 'admin' | 'cashier'`
- `users.must_change_password` — forces the `/change-password` gate on first login
- `merchants.business_owner_user_id` / `merchants.onboarded_by` — link a merchant to its dedicated business_owner user and to the platform_owner who onboarded it
- `organizations.zainpay_virtual_account_number/bank/name`, `organizations.zainpay_customer_reference` — dedicated NUBAN per merchant org
- `organizations.next_renewal_at`, `organizations.last_payment_amount`, `organizations.last_payment_at` — denormalized fields refreshed by the Zainpay webhook, read directly by the platform_owner merchant list (avoids a join for every dashboard render)
- SQL helper functions `is_platform_owner()`, `is_business_owner()`, `is_admin_or_above()` — used throughout the RLS policies in migration 008 to keep policy conditions readable and consistent

## 💳 Subscription Plans

| Plan     | Price/Month | Cashiers  | Features                             |
| -------- | ----------- | --------- | ------------------------------------ |
| Basic    | ₦3,000      | 1         | Inventory, Sales, Reports            |
| Standard | ₦5,000      | 3         | + Receipt printing, Daily summaries  |
| Business | ₦8,000      | Unlimited | + Advanced reports, Priority support |

## 💰 Zainpay Payment Integration

Subscription billing is gated to the `business_owner` role only (an admin
or cashier never sees billing/plan UI). All Zainpay logic — API key usage,
virtual-account creation, and the webhook receiver — lives strictly in
server-only modules and is **never included in the client bundle**:

- `src/lib/zainpay.ts` — server-only helper (`createMerchantVirtualAccount`,
  `isZainpayConfigured`) that creates a dedicated **Zainbox virtual account
  (NUBAN)** per merchant organization at onboarding time. Failure here is
  non-fatal to onboarding (`ZainpayNotConfiguredError`) — a merchant can be
  onboarded and have its virtual account created later once Zainpay
  credentials are configured.
- `src/app/api/webhooks/zainpay/route.ts` — the webhook receiver
  (backend-only route, signature-validated via HMAC-SHA512, idempotent via
  `webhook_logs.idempotency_key`). It reconciles incoming payments two ways:
  1. **Checkout-initiated payments** — matched by `provider_reference` against
     an existing `payment_transactions` row.
  2. **Dedicated virtual-account deposits** (a merchant's customer paying
     straight into the org's NUBAN) — matched by destination account number
     against `organizations.zainpay_virtual_account_number`, with a new
     `payment_transactions` row created on the fly (recording
     `virtual_account_number` for auditability).
  On success it activates/extends the `subscriptions` row, updates the
  denormalized `organizations.next_renewal_at` / `last_payment_amount` /
  `last_payment_at` fields (so the platform_owner merchant list shows plan,
  renewal date, and amount without extra joins), re-activates a
  pending/suspended merchant, and creates a paid invoice.
- The **Platform Owner dashboard** (`/merchants`) lists every merchant with
  its current subscription plan/tier and lets a `platform_owner` change a
  merchant's plan (writes `merchants.subscription_plan_id` +
  upserts the matching `subscriptions` row) — this is metadata management,
  not a write path into the merchant's own operational data.

## 📱 Offline Mode & PWA

The application works fully offline:

1. **Products & Inventory** cached in IndexedDB on first load
2. **Sales** created offline are queued
3. **Sync Engine** pushes changes when connection restores
4. **Conflict Resolution** — see [Offline Sync & Conflict Resolution](#-offline-sync--conflict-resolution) below for the explicit rule
5. **Visual indicators** for online/offline and sync status
6. **Business Owner dashboard reflects a "last-synced" state by design**
   while offline — reads come from the local IndexedDB cache, which is
   only as fresh as the last successful sync, and this is intentional
   rather than a bug (there is no other consistent way to show data
   without a network round-trip).

TradeTrack is also an installable **Progressive Web App**:

- `public/manifest.json` — app name, icons, theme color, and shortcuts
  (New Sale, View Inventory) for the "Add to Home Screen" / "Install App"
  prompt on mobile and desktop.
- `public/sw.js` — a small, dependency-free service worker (registered via
  `src/components/shared/sw-register.tsx`, production builds only) that:
  - Caches the app shell and icons so the app can still launch offline.
  - Serves page navigations network-first with a cached-page fallback, and
    finally an `offline.html` fallback page if nothing is cached yet.
  - Deliberately does **not** intercept `/api/*` or Supabase requests —
    those stay fully owned by the existing IndexedDB sync engine
    (`src/lib/offline/sync-engine.ts`) so there's exactly one source of
    truth for data sync, not two competing caching layers.
- Note: we intentionally do **not** use the `next-pwa` package — its latest
  release pins Webpack 4 / Workbox 4, which is incompatible with this
  project's Next.js 16 (Turbopack) build. The hand-rolled service worker
  above covers the same installability + offline-shell requirements without
  that dependency conflict.

## 🔄 Offline Sync & Conflict Resolution

`src/lib/offline/sync-engine.ts` formalizes an explicit conflict-resolution
rule — **not** a naive "re-upload everything" strategy:

1. **`sales` / `sale_items` are treated as append-only.** A sale is an
   immutable financial record once created offline; the sync engine only
   ever upserts-by-id on `INSERT` for these tables and never reaches the
   `UPDATE` branch for them. This matches real-world POS semantics — you
   void/refund with a new record, you don't mutate history.
2. **Every other table uses last-write-wins-by-timestamp.** Each queued
   sync-queue item (`src/lib/offline/db.ts`'s `SyncQueueRecord`) now carries
   a `client_updated_at` timestamp captured from the record's own
   `updated_at` field at the moment it was queued. On `UPDATE`, the sync
   engine fetches the server row's current `updated_at` and compares it
   against `client_updated_at`:
   - If the **server's** version is newer, the local (offline-queued) write
     is **dropped** (logged via `console.info`, not silently discarded) —
     it does *not* overwrite a more recent concurrent change made by
     another device/user.
   - Otherwise, the local write is applied via `upsert(..., { onConflict: 'id'
     })`, which is idempotent on retry.
3. **`INSERT` for non-append-only tables** also upserts-by-id directly, so a
   retried sync operation (e.g. after a network blip mid-sync) can never
   create a duplicate row.

This means a `business_owner` dashboard viewed while offline intentionally
shows a "last-synced" snapshot rather than attempting to fabricate
real-time data it cannot actually have — see point 6 in
[Offline Mode & PWA](#-offline-mode--pwa) above.

## 📦 Distribution Strategy (Desktop / Android / iOS)

The following distribution approach is **confirmed but not yet built** in
this pass — it is scoped as a separate, greenfield follow-up:

| Platform    | Approach                                                                                          | Status        |
| ----------- | --------------------------------------------------------------------------------------------------- | -------------- |
| **Windows** | Electron-wrapped build producing a `.exe` installer                                                 | Not yet built  |
| **Android** | React Native app producing a side-loaded `.apk` (no Play Store listing)                             | Not yet built  |
| **iOS**     | Interim PWA "Add to Home Screen" install (native app deferred)                                      | Available today via the existing PWA manifest/service worker |
| **Both**    | A lightweight "check for update" call against `GET /api/version` (already implemented — see below) | ✅ Implemented |

`src/app/api/version/route.ts` is a small, public, always-on
(`export const dynamic = 'force-dynamic'`) endpoint that both future
clients can poll to learn the latest available version and download URL
for their platform:

```json
{
  "api_version": "1.0.0",
  "latest": {
    "windows": { "version": "1.0.0", "download_url": "" },
    "android": { "version": "1.0.0", "download_url": "", "unknown_sources_help_url": "" }
  },
  "checked_at": "2026-07-28T00:00:00.000Z"
}
```

It is metadata-only — it does **not** serve any binary itself — since no
Electron or React Native build artifacts exist yet. Populating the
`TRADETRACK_WINDOWS_DOWNLOAD_URL` / `TRADETRACK_ANDROID_DOWNLOAD_URL`
env vars once those builds exist is all that's needed to make the
version-check payload point at real installers.

## 🌍 Multilingual Support

- English (en)
- Hausa (ha)
- Yoruba (yo) — _in progress_
- Igbo (ig) — _in progress_
- Pidgin English (pcm) — _in progress_

Change language in **Settings → Appearance → Language**

## 🧪 Testing

Unit tests use [Vitest](https://vitest.dev) and cover pure business/formatting
logic — currency/date/phone formatting, invoice number generation, and every
Zod validation schema (including role-enum regression coverage for the
owner/manager role-gap fix).

```bash
npm run test        # run once (CI mode)
npm run test:watch  # watch mode for local development
npm run test:ui     # interactive Vitest UI
```

Test files live alongside the code they test, in `__tests__/` subfolders
(e.g. `src/lib/utils/__tests__/format.test.ts`). `npm run deploy:check` runs
the full suite as part of the pre-deployment gate.

## 🔒 Security

- Row Level Security (RLS) on all tables
- JWT authentication via Supabase Auth
- Role-based access control at both API and UI level
- Immutable audit logs
- Input validation with Zod
- XSS/CSRF protection via Next.js

## 🚀 Deployment (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard
```

## 📊 Roadmap

- [ ] Accounting module
- [ ] Payroll management
- [ ] Customer portal
- [ ] Mobile app (React Native)
- [ ] AI sales insights
- [ ] OPay / Moniepoint integration
- [ ] WhatsApp notifications
- [ ] Barcode scanner hardware support
- [ ] Thermal receipt printer (80mm/58mm)

## 📝 License

MIT © TradeTrack 2026
