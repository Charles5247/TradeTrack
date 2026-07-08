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
| Frontend | Next.js 15, React, TypeScript, Tailwind CSS |
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
# In your Supabase dashboard → SQL Editor, run:
# supabase/migrations/001_initial_schema.sql
# supabase/migrations/002_rls_policies.sql
# supabase/seed/001_seed_data.sql

# 5. Start development server
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
-- 3. supabase/seed/001_seed_data.sql (optional demo data)
```

### Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 👥 User Roles

| Role | Permissions |
|------|------------|
| **Super Admin** | Full access: create users, manage subscriptions, view all data |
| **Admin** | Manage products, inventory, sales, reports, vendors, warehouses |
| **Cashier** | Create sales, view inventory, print receipts |

### Demo Credentials
```
Super Admin: superadmin@tradetrack.ng
Admin:       admin@demo.com / demo1234
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

## 📱 Offline Mode

The application works fully offline:

1. **Products & Inventory** cached in IndexedDB on first load
2. **Sales** created offline are queued
3. **Sync Engine** pushes changes when connection restores
4. **Conflict Resolution** — last-write-wins with manual override
5. **Visual indicators** for online/offline and sync status

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
