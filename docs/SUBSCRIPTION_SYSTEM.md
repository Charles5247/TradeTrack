# TRADETRACK — Subscription System

## Overview

TRADETRACK uses a subscription-based SaaS model. Each organization subscribes to a plan that determines their feature access and device limits. Payments are processed via Zainpay.

---

## Subscription Plans

| Plan | Price (Monthly) | Devices | Features |
|------|-----------------|---------|---------|
| **Starter** | ₦5,000 | 1 | POS, Inventory, Basic Reports |
| **Professional** | ₦15,000 | 5 | All Starter + Advanced Reports, Warehouses, Vendors |
| **Enterprise** | ₦50,000 | Unlimited | All features + Priority Support, API Access, Custom Integrations |

Plans are seeded in the `subscription_plans` table via migration 003.

---

## Database Tables

### `subscription_plans`

```sql
id            TEXT PRIMARY KEY   -- e.g. 'starter', 'professional', 'enterprise'
name          TEXT NOT NULL
price         NUMERIC(10,2)      -- monthly price in NGN
billing_cycle TEXT               -- 'monthly' | 'yearly'
features      JSONB              -- array of feature strings
max_users     INTEGER
max_products  INTEGER
max_locations INTEGER
is_active     BOOLEAN
```

### `subscriptions`

```sql
id               UUID
organization_id  UUID → organizations.id
plan_id          TEXT → subscription_plans.id
status           TEXT  -- 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'
start_date       TIMESTAMPTZ
end_date         TIMESTAMPTZ
payment_method   TEXT  -- 'cash' | 'transfer' | 'pos_terminal'
billing_cycle    TEXT  -- 'monthly' | 'yearly'
```

### `payment_transactions`

```sql
id               UUID
organization_id  UUID
subscription_id  UUID
amount           NUMERIC(12,2)
currency         TEXT  -- 'NGN'
payment_method   TEXT
status           TEXT  -- 'pending' | 'completed' | 'failed' | 'refunded'
reference        TEXT  -- Zainpay txnRef
metadata         JSONB
```

### `invoices`

```sql
id                     UUID
organization_id        UUID
subscription_id        UUID
payment_transaction_id UUID
invoice_number         TEXT  -- e.g. INV-2025-000042
amount                 NUMERIC(12,2)
currency               TEXT  -- 'NGN'
status                 TEXT  -- 'paid' | 'unpaid' | 'cancelled'
due_date               TIMESTAMPTZ
paid_at                TIMESTAMPTZ
```

---

## Subscription Lifecycle

```
Trial (14 days)
    ↓ (trial expires)
Expired → user prompted to subscribe
    ↓ (payment initiated)
payment_transactions: pending
    ↓ (Zainpay callback or webhook: code === "00")
payment_transactions: completed
subscriptions: active
invoices: paid
    ↓ (end_date approaches)
Renewal reminder (7 days before)
    ↓ (payment not made)
past_due → read-only access
    ↓ (30 days past_due)
cancelled
```

---

## Plan Feature Enforcement

Feature gates are checked at the component level:

```typescript
// Example: check if user can add more products
const subscription = useAuthStore(s => s.subscription);
const plan = PLANS[subscription?.plan_id ?? 'starter'];

if (productCount >= plan.max_products) {
  toast.error('Upgrade your plan to add more products');
  return;
}
```

---

## Subscription Page (`/subscriptions`)

The subscriptions page has 3 tabs:

### Overview Tab
- Current plan details
- Feature list with checkmarks
- Usage stats (products, users, locations)
- "Upgrade" and "Manage Billing" buttons

### Plans Tab
- Side-by-side plan comparison
- "Current Plan" badge on active plan
- Upgrade/downgrade buttons (triggers Zainpay payment flow)

### Billing Tab
- Invoice history table
- Download invoice button (PDF URL)
- Payment method on file
- Transaction history

---

## Billing Cycle

- Default: **Monthly**
- Yearly option available (10-20% discount depending on plan)
- `billing_cycle` stored on both `subscriptions` and `subscription_plans`

---

## Renewal Process

1. Cron job or Supabase Edge Function checks subscriptions daily
2. If `end_date < NOW() + 7 days` AND status is active → send renewal reminder
3. If `end_date < NOW()` AND status is active → set status to `past_due`
4. If `end_date < NOW() - 30 days` AND status is `past_due` → set to `cancelled`

---

## Grace Period

- After expiry: 30 days `past_due` grace period
- During grace: read-only access (no new sales, no edits)
- After grace: `cancelled` status, data preserved for 90 days

---

## Revenue Analytics

The owner super-dashboard (`/admin`) shows:

| Metric | Calculation |
|--------|-------------|
| MRR | Sum of active subscription prices per month |
| ARR | MRR × 12 |
| Churn Rate | (Cancelled this month / Total active last month) × 100% |
| LTV | Average MRR per customer × Average subscription duration |

Revenue data is aggregated from `invoices` table grouped by month.
