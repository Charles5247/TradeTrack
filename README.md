# TradeTrack — Enterprise Offline-First POS & Inventory Management

> Production-ready cloud-based POS and inventory management platform for Nigerian market traders.

TradeTrack is a Next.js + Supabase SaaS application: multi-role POS,
multi-warehouse inventory, offline-first sync, Zainpay subscription
billing, and native Windows/Android distribution shells around a single
installable PWA.

This README is a concise entry point. Deeper documentation lives in
**[`docs/`](./docs)** — see the index at the bottom.

## 🚀 Features

- **Multi-Role Access**: Platform Owner, Business Owner, Admin, Cashier
- **Org-Isolated Merchant Onboarding**: every merchant gets its own `organizations` row and a dedicated Business Owner login
- **Point of Sale**: Barcode scanning, cart, discounts, tax, receipts, split/partial payments
- **Inventory Management**: Multi-warehouse, stock levels, adjustments, movement history
- **Warehouse Transfers** and **Vendor Consignment** tracking
- **Purchase Orders**: create → send → receive workflow that updates inventory on receipt (Business plan and above)
- **Audit Trail**: Immutable history of every change
- **Reports**: Daily/weekly/monthly/quarterly/yearly with PDF/Excel/CSV export
- **Zainpay Subscription Billing**: dedicated virtual account (NUBAN) per merchant, webhook-based auto-reconciliation
- **Offline-First**: IndexedDB + Service Worker — works without internet, with an explicit, documented conflict-resolution rule
- **Multilingual**: English, Hausa (fully translated); Yoruba, Igbo, Pidgin English (scaffolded)
- **PWA + Native Shells**: Installable on mobile/desktop, plus a Windows `.exe` and an Android `.apk` — see [Download & Distribution](./docs/DOWNLOAD_FLOW.md)
- **Dark/Light Mode**

## 🛠 Technology Stack

| Layer            | Technology                                     |
| ---------------- | ----------------------------------------------- |
| Frontend         | Next.js 16, React 19, TypeScript, Tailwind CSS |
| UI Components    | Radix UI + ShadCN pattern                      |
| State Management | Zustand                                        |
| Data Fetching    | TanStack Query (React Query)                   |
| Forms            | React Hook Form + Zod                          |
| Backend          | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Offline          | IndexedDB (idb), Service Worker                |
| Payments         | Zainpay                                        |
| Deployment       | **Render** (see `render.yaml`)                 |

## ⚡ Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Charles5247/TradeTrack.git
cd TradeTrack
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase + Zainpay credentials

# 3. Run Supabase migrations, in order (see docs/DEPLOYMENT.md §1 for the
#    full list and Storage/Auth setup steps, or docs/LOCAL_DEV_SETUP.md
#    for the full local-dev walkthrough incl. `supabase db reset`)
#    supabase/migrations/001_initial_schema.sql ... 012_fix_stray_active_legacy_plans.sql

# 4. Create demo Supabase Auth users matching the seed data (required —
#    the seed SQL only inserts profile rows, it does not create logins)
npm run setup:demo

# 5. Start the dev server
npm run dev
```

Run `npm run verify:env` any time to confirm required env vars are set.
Run `npm run verify:plans` any time to confirm your local
`subscription_plans` table has exactly the 5 canonical active plans
and that the public pricing page and dashboard Plans tab are reading
from the exact same code path — see
**[`docs/LOCAL_DEV_SETUP.md`](./docs/LOCAL_DEV_SETUP.md)** if it fails.

### Demo Credentials (development only, after `npm run setup:demo`)

| Role | Email | Password |
|---|---|---|
| Platform Owner | `platformowner@tradetrack.ng` | `demo1234` |
| Business Owner | `owner@demo.com` | `demo1234` |
| Admin | `admin@demo.com` | `demo1234` |
| Cashier | `cashier@demo.com` | `demo1234` |

Only ever shown in the app when `NODE_ENV !== 'production'`.

## 👥 User Roles

4-tier hierarchy: `platform_owner > business_owner > admin > cashier`.
`platform_owner` is TradeTrack-staff-only, cross-organization, and never
reads or writes a merchant's operational data — only merchant/subscription
metadata. `business_owner` is auto-created per merchant at onboarding and
fully isolated from every other organization. See
[`docs/SYSTEM_ARCHITECTURE.md`](./docs/SYSTEM_ARCHITECTURE.md) for the
full permissions matrix.

## 💳 Subscription Plans

5 tiers — **Free, Starter, Growth, Business, Enterprise** — each including
everything in the tier below plus more features and higher limits. Full
feature matrix, plan-enforcement code, and legacy-plan notes:
[`docs/SUBSCRIPTION_SYSTEM.md`](./docs/SUBSCRIPTION_SYSTEM.md).

## 📁 Project Structure

```
src/
├── app/
│   ├── (marketing)/     # Public landing page, /pricing, /features, /download
│   ├── (auth)/          # Login, forgot/reset password
│   ├── (dashboard)/     # All protected dashboard pages (POS, inventory,
│   │                      purchase-orders, transfers, vendors, reports, ...)
│   └── api/             # Route handlers (merchants/onboard, webhooks/zainpay, version, ...)
├── components/          # UI primitives, layout, dashboard, shared providers
├── lib/                 # Supabase clients, offline/sync engine, subscriptions, utils
├── store/               # Zustand stores
├── types/               # TypeScript type definitions
└── i18n/                # Internationalization
supabase/
├── migrations/          # SQL migrations (run in order — see docs/DEPLOYMENT.md)
└── seed/                # Optional demo data
desktop-app/             # Electron Windows shell (see docs/DOWNLOAD_FLOW.md)
android-app/             # Native Android WebView shell
```

## 🧪 Testing

```bash
npm run test        # Vitest, run once (CI mode)
npm run test:watch  # watch mode
npm run typecheck   # tsc --noEmit
npm run deploy:check  # full pre-deployment gate: env, types, lint, build, tests
```

## 🔒 Security

Row Level Security on every table, JWT auth via Supabase, role-based
access control at API and UI level, immutable audit logs, Zod input
validation. Details: [`docs/SECURITY.md`](./docs/SECURITY.md).

## 🚀 Deployment

TradeTrack is deployed on **Render** (see the checked-in `render.yaml`),
not Vercel. Full setup (Supabase, Storage, Auth, env vars, Render
Blueprint deploy, self-hosting alternative): **[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)**.

## 📚 Documentation Index

| Doc | Covers |
|---|---|
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Render deployment (current platform), Supabase setup, env vars, self-hosting |
| [`docs/LOCAL_DEV_SETUP.md`](./docs/LOCAL_DEV_SETUP.md) | Local database setup, `supabase db reset`, `npm run verify:plans`, troubleshooting stale/duplicate plan data |
| [`docs/DOWNLOAD_FLOW.md`](./docs/DOWNLOAD_FLOW.md) | `/download` page, Windows/Android shells, update-check API |
| [`docs/SUBSCRIPTION_SYSTEM.md`](./docs/SUBSCRIPTION_SYSTEM.md) | 5-tier plans, feature-flag gating, legacy plans |
| [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) | What shipped, by feature milestone |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | What's shipped, deferred, and not started |
| [`docs/SYSTEM_ARCHITECTURE.md`](./docs/SYSTEM_ARCHITECTURE.md) | Roles, high-level architecture |
| [`docs/DATABASE_SCHEMA.md`](./docs/DATABASE_SCHEMA.md) | Full table reference |
| [`docs/OFFLINE_ARCHITECTURE.md`](./docs/OFFLINE_ARCHITECTURE.md) | IndexedDB cache + sync engine + conflict resolution |
| [`docs/PAYMENT_ARCHITECTURE.md`](./docs/PAYMENT_ARCHITECTURE.md) | Zainpay integration, webhooks, virtual accounts |
| [`docs/API_DOCUMENTATION.md`](./docs/API_DOCUMENTATION.md) | Route handler reference |
| [`docs/MERCHANT_ONBOARDING.md`](./docs/MERCHANT_ONBOARDING.md) | Onboarding flow, forced password change |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | RLS, auth, validation |
| [`desktop-app/README.md`](./desktop-app/README.md) | Electron Windows shell build/sign/rebrand |
| [`android-app/README.md`](./android-app/README.md) | Android WebView shell build/sign/rebrand |

> **Note on `docs/README.md` and `docs/DEPLOYMENT_GUIDE.md`:** these are
> older documents from an earlier project snapshot (they describe Next.js
> 15, a `super_admin`/`owner`/`manager` role model, and Vercel deployment —
> all superseded). They're kept for historical reference but should not be
> treated as current; this root README and `docs/DEPLOYMENT.md` are the
> up-to-date sources.

## 📝 License

MIT © TradeTrack 2026
