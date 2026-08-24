# TRADETRACK — Subscription System

## Overview

TRADETRACK uses a subscription-based SaaS model. Each organization subscribes to a plan that determines their feature access and device limits. Payments are processed via Zainpay.

---

## Subscription Plans

> **Restructured in migration 010** from the original 3-tier ladder
> (Basic ₦3,000 / Standard ₦5,000 / Business ₦8,000, actually seeded by
> migration 003 — see "Legacy Plans" below for a note on a since-fixed
> naming inconsistency in this doc) to a 5-tier ladder modeled on
> Sortly's pricing-page pattern, adapted to TradeTrack's actual features
> and priced in Naira. The 3 old rows were **deactivated** (`is_active =
> false`), never deleted, so organizations still subscribed to one of
> them keep working unaffected.

| Plan | Price (Monthly) | Price (Yearly) | Cashiers | Products | Locations | "Best for..." |
|------|------------------|-----------------|----------|----------|-----------|----------------|
| **Free** | ₦0 | — | 1 | 50 | 1 | Getting started |
| **Starter** | ₦5,000 | ₦48,000 (save ₦12,000) | 2 | 300 | 1 | A single shop finding its rhythm |
| **Growth** ⭐ Most Popular | ₦15,000 | ₦144,000 (save ₦36,000) | 5 | 1,500 | 3 | Multi-cashier shops that need real oversight |
| **Business** | ₦30,000 | ₦288,000 (save ₦72,000) | 12 | 5,000 | 8 | Growing operations with multiple staff roles |
| **Enterprise** | Talk to Sales | Talk to Sales | Unlimited | Unlimited | Unlimited | Custom multi-branch operations |

Yearly pricing is **not** stored as separate catalog rows — it is
computed client-side as `monthly × 12 × 0.8` (an exact 20% discount),
in `computeYearlyPricing()` in `src/app/(dashboard)/subscriptions/page.tsx`.
Enterprise has no self-serve price; its "Talk to Sales" CTA links to a
`mailto:` address instead of triggering the Zainpay checkout flow.

### Feature Matrix

Each tier includes everything in the tier below it, plus:

| Plan | Newly unlocked features |
|------|--------------------------|
| **Free** | `pos`, `inventory`, `basic_reports` |
| **Starter** | + `receipt_printing`, `daily_summaries` |
| **Growth** | + `advanced_reports`, `warehouses`, `vendors`, `barcode_label_printing`, `low_stock_alerts` |
| **Business** | + `purchase_orders`, `custom_role_permissions`, `priority_support` |
| **Enterprise** | + `api_access`, `webhooks`, `dedicated_account_manager` |

> **Not yet built in the product:** `barcode_label_printing` (only
> barcode/QR codes on receipts exist today — no dedicated label-printing
> surface). This is a plan-catalog feature flag with gating
> infrastructure ready (see "Plan Feature Enforcement" below), but no UI
> entry point exists to gate yet — building that product surface is
> tracked as separate future work, not part of this restructure.
>
> `purchase_orders` **is now live** (minimal draft → sent → received
> workflow at `/purchase-orders`, gated with `hasFeature(plan,
> 'purchase_orders')` — see "Plan Feature Enforcement" below). It exists
> alongside, and is distinct from, the warehouse-to-warehouse stock
> **transfers** feature: transfers move existing stock between an
> org's own warehouses, while purchase orders bring new stock in from a
> supplier. Partial receiving, PO approval workflows, PDF export,
> purchasing analytics, and supplier payment automation are explicitly
> out of scope for this minimal version.

### Legacy Plans

> **Note:** an earlier revision of this doc described the original
> lineup as "Starter / Professional / Enterprise". The actual rows
> seeded by migration 003 are **Basic** (₦3,000), **Standard**
> (₦5,000), and **Business** (₦8,000) — corrected here to match what
> migration 003 and migration 010 (which deactivates these exact rows
> by UUID) actually reference.

The original 3 plans (Basic ₦3,000 / Standard ₦5,000 / Business ₦8,000,
seeded by migration 003) still exist as rows in `subscription_plans`
with `is_active = false`. Any organization whose `subscriptions.plan_id`
still points at one of these rows continues to resolve its plan,
limits, and features exactly as before — deactivating a plan only
removes it from the self-serve "Plans" tab for **new** subscriptions,
it does not affect existing subscribers. See `resolveSubscriptionPlan()`
in `src/lib/subscriptions/plan-limits.ts`, which looks a subscription's
plan up by `plan_id` against the full plan list (active + inactive),
not an `is_active`-filtered one.

Plans are seeded in the `subscription_plans` table via migration 003
(original 3) and migration 010 (restructure to 5 + legacy deactivation).

---

## Database Tables

### `subscription_plans`

```sql
id            UUID PRIMARY KEY
name          TEXT NOT NULL       -- 'Free' | 'Starter' | 'Growth' | 'Business' | 'Enterprise'
price         DECIMAL(10,2)       -- monthly price in NGN (0 for Free/Enterprise)
currency      TEXT DEFAULT 'NGN'
billing_cycle VARCHAR(20)         -- 'monthly' | 'yearly' (added in migration 003)
features      JSONB               -- array of feature-flag strings
max_cashiers  INTEGER             -- a.k.a. "max users" in the pricing UI; -1 = unlimited
max_products  INTEGER             -- -1 = unlimited
max_warehouses INTEGER            -- a.k.a. "max locations" in the pricing UI; -1 = unlimited
is_active     BOOLEAN             -- false = hidden from self-serve Plans tab, legacy plans only
is_popular    BOOLEAN             -- true = "Most Popular" badge (Growth, post-migration 010)
trial_days    INTEGER
created_at    TIMESTAMPTZ
```

> Column names predate this restructure: `max_cashiers` and
> `max_warehouses` are the actual DB/TypeScript field names backing
> what the pricing spec calls "max users" and "max locations" — there
> is no separate `max_users`/`max_locations` column.

### `subscriptions`

```sql
id               UUID
organization_id  UUID → organizations.id
plan_id          UUID → subscription_plans.id
status           TEXT  -- 'active' | 'expired' | 'cancelled' | 'trial'
starts_at        TIMESTAMPTZ
expires_at       TIMESTAMPTZ
created_by       UUID
created_at       TIMESTAMPTZ
auto_renew       BOOLEAN
payment_reference TEXT
billing_cycle    VARCHAR(20)  -- 'monthly' | 'yearly' (added in migration 010 — this table
                               -- had no billing_cycle column before the 5-tier restructure)
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

Feature-gate and plan-limit logic lives in
`src/lib/subscriptions/plan-limits.ts` — a framework-free module (no
Supabase/React imports) so it is directly unit-testable and reusable
from both server routes and client components. Key exports:

| Function | Purpose |
|---|---|
| `resolveSubscriptionPlan(subscription, allPlans)` | Looks up a subscription's plan by `plan_id` against the **full** plan list (active + inactive) — the mechanism that keeps legacy/deactivated-plan subscribers working correctly. |
| `canAddProduct(currentCount, plan)` | Returns `false` once `currentCount >= plan.max_products` (unless `-1`/unlimited). Fails open (`true`) if `plan` is unavailable. |
| `hasFeature(plan, featureFlag)` | Whether a plan includes a given feature flag. Fails closed (`false`) if `plan` is unavailable. |
| `getMinTierForFeature(flag)` / `upgradePromptMessage(flag)` | Minimum tier + ready-to-render copy for gated flags: `receipt_printing`/`daily_summaries` → Starter; `advanced_reports`/`warehouses`/`vendors`/`barcode_label_printing`/`low_stock_alerts` → Growth; `purchase_orders`/`custom_role_permissions`/`priority_support` → Business; `api_access`/`webhooks`/`dedicated_account_manager` → Enterprise. |

Currently wired in:

```typescript
// src/components/products/product-form.tsx — blocks creating a NEW
// product once the org's plan limit is reached (updates are never
// blocked; fails open if the limit check itself errors out, since a
// transient fetch failure must never block product creation).
const plan = resolveSubscriptionPlan(subscription, allPlans);

if (plan && !canAddProduct(currentProductCount, plan)) {
  toast.error(productLimitMessage(plan.max_products));
  return;
}
```

```typescript
// src/app/(dashboard)/purchase-orders/page.tsx — gates the entire
// Purchase Orders page behind the Business-tier `purchase_orders`
// flag. Fails open (never blocks the page) if the plan itself can't
// be resolved — same "fail open" precedent as canAddProduct() above —
// but explicitly locks the page (with an upgrade prompt in place of
// the feature) once a plan IS resolved and it doesn't include the flag.
const plan = resolveSubscriptionPlan(subscription, allPlans);
const featureLocked = !!plan && !hasFeature(plan, 'purchase_orders');

if (featureLocked) {
  return <UpgradePrompt message={upgradePromptMessage('purchase_orders')} />;
  // "Purchase Orders is available on the Business plan and above —
  // Upgrade to unlock it."
}
```

**Not yet wired in (ticketed as future work):** `barcode_label_printing`,
`custom_role_permissions`, `api_access`, and `webhooks` have no real UI
entry point in TradeTrack yet (see "Feature Matrix" above). Once those
product surfaces are built, gating them follows the same one-line
`hasFeature(plan, flag)` + `upgradePromptMessage(flag)` pattern shown
above for `purchase_orders`.

---

## Subscription Page (`/subscriptions`)

The subscriptions page has 3 tabs:

### Overview Tab
- Current plan details
- Feature list with checkmarks
- Usage stats (products, users, locations)
- "Upgrade" and "Manage Billing" buttons

### Plans Tab
- 5 plan cards in a row (Free/Starter/Growth/Business/Enterprise),
  responsive: stacks to 1 column on mobile, 2-3 on tablet, 5 on desktop
- Monthly/Yearly toggle above the cards, recomputes price + "You'll
  save ₦X, billed at ₦Y/yr" line client-side per card
- Each card: icon, plan name, one-line "Best for..." tagline, price
  with "/mo" or "/yr" suffix, feature checklist with "+"-prefixed items
  **exclusive** to that tier (earlier tiers' features are implied, not
  re-listed)
- Growth card carries the "Most Popular" ribbon in TradeTrack's
  existing primary accent color
- "Current Plan" badge on the organization's active plan
- Upgrade buttons trigger the self-serve subscription flow (Zainpay for
  paid tiers); the Enterprise card has no self-serve price — its CTA is
  "Talk to Sales", a `mailto:` link, not a Zainpay checkout trigger

### Billing Tab
- Invoice history table
- Download invoice button (PDF URL)
- Payment method on file
- Transaction history

---

## Billing Cycle

- Default: **Monthly**
- Yearly option available at an exact 20% discount on every priced tier
  (Starter/Growth/Business), computed client-side as `monthly × 12 ×
  0.8` — not stored as separate catalog rows
- `billing_cycle` stored on both `subscription_plans` (since migration
  003) and `subscriptions` (added in migration 010, alongside the
  5-tier restructure — the per-org `subscriptions` row previously had
  no way to record which cycle a customer actually chose at checkout)
- Free (₦0) and Enterprise (custom quote) plans never show a yearly
  price or savings line

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
