# TRADETRACK — Enterprise POS & Inventory Management SaaS

> **Production-ready, offline-first Point-of-Sale and inventory management platform built for African SMBs.**

---

## Overview

TRADETRACK is a Next.js 15 + Supabase SaaS application that provides:

- **Multi-location POS** — process sales at the counter with cash, card, transfer, or split payments
- **Inventory management** — track stock across warehouses with real-time low-stock alerts
- **Vendor & purchase management** — manage suppliers and purchase orders
- **Subscription billing** — Zainpay-powered payment gateway with auto-activation
- **Multi-tenant architecture** — isolated data per organization with role-based access
- **Offline-first PWA** — works without internet; syncs automatically on reconnect
- **Owner super-dashboard** — platform-wide analytics for the SaaS operator

---

## Tech Stack

| Layer          | Technology                                  |
|----------------|---------------------------------------------|
| Frontend       | Next.js 15, React 19, TypeScript            |
| Styling        | Tailwind CSS 4, shadcn/ui                   |
| State          | Zustand, TanStack Query v5                  |
| Backend        | Next.js API Routes (serverless)             |
| Database       | Supabase (PostgreSQL 15)                    |
| Auth           | Supabase Auth (JWT + RLS)                   |
| Storage        | Supabase Storage (product images)           |
| Payments       | Zainpay (Nigerian payment gateway)          |
| Offline        | IndexedDB via idb library                   |
| Charts         | Recharts                                    |
| Forms          | React Hook Form + Zod                       |
| Notifications  | Sonner toast library                        |

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- Supabase account (free tier works)
- Zainpay merchant account (for payment features)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd tradetrack

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase and Zainpay credentials

# Run database migrations
# Go to Supabase SQL editor and run supabase/migrations/ files in order

# Start development server
npm run dev
```

### Environment Variables

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Zainpay (required for payments)
ZAINPAY_PUBLIC_KEY=your-zainpay-public-key
ZAINPAY_PRIVATE_KEY=your-zainpay-private-key
ZAINPAY_WEBHOOK_SECRET=your-webhook-secret
ZAINPAY_BASE_URL=https://sandbox.zainpay.ng
ZAINPAY_DEFAULT_ZAINBOX=your-zainbox-code

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Project Structure

```
tradetrack/
├── src/
│   ├── app/
│   │   ├── (auth)/           # Login, forgot-password pages
│   │   ├── (dashboard)/      # Protected dashboard pages
│   │   │   ├── admin/        # Owner super-dashboard
│   │   │   ├── dashboard/    # Main dashboard
│   │   │   ├── inventory/    # Inventory management
│   │   │   ├── merchants/    # Merchant management
│   │   │   ├── pos/          # Point of Sale
│   │   │   ├── products/     # Product catalog
│   │   │   ├── reports/      # Analytics & reports
│   │   │   ├── sales/        # Sales history
│   │   │   ├── settings/     # Organization settings
│   │   │   ├── subscriptions/# Billing & plans
│   │   │   ├── transfers/    # Warehouse transfers
│   │   │   ├── users/        # User management
│   │   │   ├── vendors/      # Vendor management
│   │   │   └── warehouses/   # Multi-location warehouses
│   │   └── api/              # API routes
│   │       ├── audit/        # Audit log endpoint
│   │       ├── payments/     # Zainpay payment routes
│   │       │   ├── initialize/
│   │       │   └── verify/
│   │       ├── users/        # User management API
│   │       └── webhooks/
│   │           └── zainpay/  # Payment webhook handler
│   ├── components/
│   │   ├── auth/             # Auth-related components
│   │   ├── dashboard/        # Stats cards, charts
│   │   ├── layout/           # Header, sidebar, navigation
│   │   ├── products/         # Product form, image upload
│   │   └── ui/               # shadcn/ui components
│   ├── hooks/                # Custom React hooks
│   ├── i18n/                 # Internationalization
│   ├── lib/
│   │   ├── offline/          # IndexedDB + sync engine
│   │   ├── supabase/         # Client, server, middleware, types
│   │   └── utils/            # Format, audit helpers
│   └── store/                # Zustand stores
├── supabase/
│   └── migrations/           # SQL migration files
│       ├── 001_initial_schema.sql
│       ├── 002_rls_policies.sql
│       ├── 003_payment_and_improvements.sql
│       └── 004_owner_payments_merchants.sql
├── public/
│   ├── icons/                # PWA icons (9 sizes)
│   └── manifest.json         # PWA manifest
└── docs/                     # This documentation
```

---

## User Roles

| Role          | Permissions                                              |
|---------------|----------------------------------------------------------|
| `super_admin` | Full platform access, owner dashboard, all merchants    |
| `owner`       | Full organization access, merchant management           |
| `admin`       | Manage users, products, reports                         |
| `manager`     | View reports, approve transfers, manage inventory       |
| `cashier`     | POS access only                                         |

---

## Available Scripts

```bash
npm run dev        # Start development server (Turbopack)
npm run build      # Production build
npm run start      # Start production server
npm run lint       # ESLint check
npm run type-check # TypeScript check
```

---

## Support & Documentation

- [System Architecture](./SYSTEM_ARCHITECTURE.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Offline Architecture](./OFFLINE_ARCHITECTURE.md)
- [Payment Architecture](./PAYMENT_ARCHITECTURE.md)
- [API Documentation](./API_DOCUMENTATION.md)
- [Database Schema](./DATABASE_SCHEMA.md)
- [Security Guide](./SECURITY.md)
