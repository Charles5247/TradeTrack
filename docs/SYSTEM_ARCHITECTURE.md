# TRADETRACK — System Architecture

## Architecture Overview

TRADETRACK follows a **multi-tenant SaaS architecture** with an offline-first PWA front end powered by Next.js 15 App Router, backed by Supabase (PostgreSQL + Auth + Storage).

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                           │
│  Next.js 15 PWA (React 19 + TypeScript)                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐   │
│  │ Zustand Store│ │TanStack Query│ │  IndexedDB (offline) │   │
│  │ useAuthStore │ │  (server     │ │  sync engine + cache │   │
│  │ useUIStore   │ │   state)     │ │  user sessions       │   │
│  └──────────────┘ └──────────────┘ └──────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS / WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                       SERVER LAYER                              │
│  Next.js API Routes (Vercel Edge / Node.js)                    │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┐ ┌───────────┐  │
│  │/api/audit  │ │/api/users  │ │/api/payments│ │/api/       │  │
│  │(service    │ │(admin API) │ │/initialize  │ │webhooks/   │  │
│  │ role key)  │ │            │ │/verify      │ │zainpay     │  │
│  └────────────┘ └────────────┘ └─────────────┘ └───────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     DATA LAYER (Supabase)                       │
│  ┌─────────────────┐ ┌────────────────┐ ┌──────────────────┐  │
│  │  PostgreSQL 15  │ │  Supabase Auth │ │ Supabase Storage │  │
│  │  20+ tables     │ │  JWT + RLS     │ │  product images  │  │
│  │  Row Level Sec. │ │  service role  │ │  org logos       │  │
│  └─────────────────┘ └────────────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   EXTERNAL SERVICES                             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Zainpay Payment Gateway (Nigeria)                       │  │
│  │  POST /zainbox/card/initialize/payment                  │  │
│  │  GET  /virtual-account/wallet/deposit/verify/:txnRef    │  │
│  │  → Webhook: POST /api/webhooks/zainpay                  │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Authentication Flow

```
Browser → /login → Supabase Auth → JWT token stored in cookies
          ↓ (offline fallback)
      IndexedDB cached session → user_sessions store → auto-login offline
```

### 2. Real-time POS Sale

```
Cashier selects items → Cart state (Zustand)
  → Submit sale → supabase.from('sales').insert()
  → supabase.from('sale_items').insert()
  → Update inventory → supabase.from('products').update(stock)
  → Offline? → Queue to IndexedDB sync_queue
  → Reconnect → sync engine flushes queue
```

### 3. Payment Flow

```
User clicks "Upgrade Plan"
  → POST /api/payments/initialize
    → Validate JWT
    → Format amount as String()
    → POST Zainpay /zainbox/card/initialize/payment
    → Returns paymentUrl
  → Browser redirects to paymentUrl
  → User pays on Zainpay page
  → Zainpay redirects to callbackUrl (/api/payments/verify?txnRef=...)
    → GET Zainpay /virtual-account/wallet/deposit/verify/:txnRef
    → Check code === "00" && data (NOT txnStatus)
    → Update subscription → active
    → Insert invoice record
  → Zainpay also sends webhook to /api/webhooks/zainpay (async)
    → Idempotency check (webhook_logs.idempotency_key)
    → Verify signature (HMAC-SHA512)
    → Process if not already done
```

---

## Component Hierarchy

```
app/
└── (dashboard)/
    └── layout.tsx              # Sidebar + header shell
        ├── header.tsx          # Online status indicator, user menu
        ├── sidebar.tsx         # Navigation links + role-based items
        └── pages/
            ├── dashboard/      # KPIs, sales chart, low-stock alerts
            ├── admin/          # Owner: all merchants, MRR/ARR charts
            ├── merchants/      # Merchant CRUD + onboarding wizard
            ├── pos/            # POS terminal + payment processing
            ├── products/       # Product catalog + image upload
            ├── inventory/      # Stock levels + adjustments
            ├── sales/          # Historical sales + filters
            ├── reports/        # Revenue, products, payment charts
            ├── warehouses/     # Multi-location management
            ├── transfers/      # Inter-warehouse stock moves
            ├── vendors/        # Supplier management
            ├── users/          # User CRUD + role assignment
            ├── subscriptions/  # Billing overview + plan selection
            ├── settings/       # Profile + org + appearance + security
            ├── audit/          # Platform audit log
            └── notifications/  # User notifications
```

---

## State Management

### Zustand Stores

| Store                  | Purpose                                       |
|------------------------|-----------------------------------------------|
| `useAuthStore`         | User, profile, org, role, session             |
| `useUIStore`           | Sidebar state, theme, language preference     |
| `useSyncStore`         | Online/offline status, sync queue progress    |
| `useNotificationStore` | In-app notification queue                     |

### TanStack Query (Server State)

All Supabase reads go through `useQuery` with appropriate cache keys:

```typescript
// Pattern: always pass orgId as queryKey dependency
useQuery({
  queryKey: ['products', orgId, filters],
  queryFn: () => supabase.from('products').select('*').eq('organization_id', orgId),
  staleTime: 30_000, // 30 seconds
})
```

### IndexedDB Schema (idb v2)

```
stores:
  offline_queue   → pending mutations to sync
  products        → product cache for offline POS
  user_sessions   → encrypted session cache for offline login
  sales_cache     → draft sales in progress
```

---

## Security Model

See [SECURITY.md](./SECURITY.md) for full details.

- **Row Level Security** on all 20+ tables
- **Service Role Key** only used server-side (API routes)
- **Anon Key** only has read access to public data
- **JWT** validated on every API route
- **RBAC** enforced at both RLS and UI levels

---

## Multi-tenancy

Each organization is completely isolated:

- All tables have `organization_id` FK + RLS policy
- `auth.uid()` → `users.id` → `users.organization_id` → filters data
- Super-admin role can bypass RLS via service role key
- Storage buckets use `organization_id` as path prefix
