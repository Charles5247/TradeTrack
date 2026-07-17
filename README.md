# TradeTrack - Enterprise Offline-First POS & Inventory Management

> Production-ready cloud-based POS and inventory management platform for Nigerian market traders.

## 🚀 Features

- **Multi-Role Access**: Super Admin, Admin, Cashier
- **Point of Sale**: Barcode scanning, cart, discounts, tax, receipts, split/partial payments
- **Inventory Management**: Multi-warehouse, stock levels, adjustments, movement history
- **Warehouse Transfers**: Stock transfers between locations with approval workflow
- **Vendor Consignment**: Track outside vendor sales and outstanding payments
- **Audit Trail**: Immutable history of every change — who, what, when, old/new values
- **Reports**: Daily/weekly/monthly/quarterly/yearly with PDF/Excel/CSV export
- **Offline-First**: IndexedDB + Service Worker — works without internet
- **Sync Engine**: Automatic background sync with conflict resolution
- **Multilingual**: English, Hausa, Yoruba, Igbo, Pidgin English
- **PWA**: Installable on mobile and desktop
- **Dark/Light Mode**

## 🛠 Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| UI Components | Radix UI + ShadCN pattern |
| State Management | Zustand |
| Data Fetching | TanStack Query (React Query) |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Offline | IndexedDB (idb), Service Worker |
| Deployment | Vercel |

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
-- Run in Supabase SQL Editor:
-- 1. supabase/migrations/001_initial_schema.sql
-- 2. supabase/migrations/002_rls_policies.sql
-- 3. supabase/migrations/003_payment_and_improvements.sql
-- 4. supabase/migrations/004_owner_payments_merchants.sql
-- 5. supabase/migrations/005_add_missing_roles.sql
-- 6. supabase/seed/001_seed_data.sql (optional demo data)
```

4. Create demo Supabase Auth users so the seeded demo profiles can
   actually sign in (development/staging only - never run this
   against a production database):

```bash
npm run setup:demo
```

This script (`scripts/setup-demo-users.ts`) uses the Supabase Admin
API (`SUPABASE_SERVICE_ROLE_KEY`) to create confirmed Auth users for
all five roles — `superadmin@tradetrack.ng`, `owner@demo.com`,
`admin@demo.com`, `manager@demo.com`, and `cashier@demo.com` — all with
the password `demo1234`, and keeps their `users` table profile rows in
sync. It is safe to re-run - existing users are detected and updated
instead of duplicated.

### Environment Variables

Copy `.env.example` to `.env.local` and fill in real values. See
`.env.example` for full inline documentation of every variable.

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App config (required)
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Zainpay payment gateway (required for subscription/billing features)
ZAINPAY_BASE_URL=https://sandbox.zainpay.ng
ZAINPAY_PUBLIC_KEY=your-zainpay-public-key
ZAINPAY_PRIVATE_KEY=your-zainpay-private-key
ZAINPAY_DEFAULT_ZAINBOX=your-default-zainbox-code
ZAINPAY_WEBHOOK_SECRET=your-zainpay-webhook-secret
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

TradeTrack uses a 5-tier role hierarchy:
`super_admin > owner > admin > manager > cashier`

| Role | Permissions |
|------|------------|
| **Super Admin** | Full platform access: create users, manage subscriptions, view all data across every organization |
| **Owner** | Business owner: platform-wide merchant/revenue dashboard (`/admin`), merchant management (`/merchants`) |
| **Admin** | Manage products, inventory, sales, reports, vendors, warehouses for their organization |
| **Manager** | Day-to-day operational management: inventory, sales, reports (no user/billing management) |
| **Cashier** | Create sales, view inventory, print receipts |

### Demo Credentials (development only)

Demo credentials are only ever displayed in the app when
`NODE_ENV !== 'production'`, and only exist once you've run
`npm run setup:demo` (see Database Setup above). Every one of the five
roles has a working login:

| Role | Email | Password | Organization |
|------|-------|----------|--------------|
| **Super Admin** | `superadmin@tradetrack.ng` | `demo1234` | None (platform-wide) |
| **Owner** | `owner@demo.com` | `demo1234` | Demo Store |
| **Admin** | `admin@demo.com` | `demo1234` | Demo Store |
| **Manager** | `manager@demo.com` | `demo1234` | Demo Store |
| **Cashier** | `cashier@demo.com` | `demo1234` | Demo Store |

```
Super Admin: superadmin@tradetrack.ng / demo1234
Owner:       owner@demo.com / demo1234
Admin:       admin@demo.com / demo1234
Manager:     manager@demo.com / demo1234
Cashier:     cashier@demo.com / demo1234
```

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
│   │   ├── users/       # User management (Super Admin)
│   │   └── settings/    # App settings
│   └── api/             # API route handlers
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
- `settings` — Per-organization configuration
- `offline_sync_queue` — Offline sync tracking

## 💳 Subscription Plans

| Plan | Price/Month | Cashiers | Features |
|------|------------|----------|---------|
| Basic | ₦3,000 | 1 | Inventory, Sales, Reports |
| Standard | ₦5,000 | 3 | + Receipt printing, Daily summaries |
| Business | ₦8,000 | Unlimited | + Advanced reports, Priority support |

## 📱 Offline Mode & PWA

The application works fully offline:

1. **Products & Inventory** cached in IndexedDB on first load
2. **Sales** created offline are queued
3. **Sync Engine** pushes changes when connection restores
4. **Conflict Resolution** — last-write-wins with manual override
5. **Visual indicators** for online/offline and sync status

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

## 🌍 Multilingual Support

- English (en)
- Hausa (ha)
- Yoruba (yo) — *in progress*
- Igbo (ig) — *in progress*
- Pidgin English (pcm) — *in progress*

Change language in **Settings → Appearance → Language**

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
