# TRADETRACK — Database Schema

All tables use PostgreSQL 15 on Supabase. Row Level Security (RLS) is enabled on all tables.

---

## Core Tables

### `organizations`
Multi-tenant root entity. Each organization owns all its data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Organization identifier |
| `name` | TEXT | Organization/business name |
| `slug` | TEXT (unique) | URL-safe identifier |
| `logo_url` | TEXT | Logo storage URL |
| `settings` | JSONB | Organization-level config |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### `users`
Application users. Linked to Supabase Auth.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Matches `auth.users.id` |
| `organization_id` | UUID (FK → organizations) | Owning organization |
| `email` | TEXT (unique) | User email |
| `full_name` | TEXT | Display name |
| `role` | TEXT | `owner`, `super_admin`, `admin`, `manager`, `cashier` |
| `avatar_url` | TEXT | Profile photo URL |
| `is_active` | BOOLEAN | Account status |
| `created_at` | TIMESTAMPTZ | |

---

### `products`
Product catalog with inventory tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `organization_id` | UUID (FK) | |
| `name` | TEXT | Product name |
| `sku` | TEXT | Stock-keeping unit |
| `barcode` | TEXT | Barcode (EAN, UPC) |
| `description` | TEXT | |
| `price` | NUMERIC(12,2) | Selling price |
| `cost_price` | NUMERIC(12,2) | Purchase cost |
| `category_id` | UUID (FK → categories) | |
| `stock_quantity` | INTEGER | Current stock |
| `low_stock_threshold` | INTEGER | Alert threshold |
| `image_url` | TEXT | Supabase Storage URL |
| `is_active` | BOOLEAN | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

---

### `sales`
POS transaction header.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `organization_id` | UUID (FK) | |
| `user_id` | UUID (FK → users) | Cashier |
| `warehouse_id` | UUID (FK → warehouses) | |
| `total` | NUMERIC(12,2) | Total sale amount |
| `discount` | NUMERIC(12,2) | Applied discount |
| `tax` | NUMERIC(12,2) | Applied tax |
| `payment_method` | TEXT | `cash`, `transfer`, `pos_terminal`, `split`, `partial` |
| `payment_status` | TEXT | `completed`, `partial`, `refunded` |
| `notes` | TEXT | |
| `created_at` | TIMESTAMPTZ | Sale timestamp |

---

### `sale_items`
Line items for each sale.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `sale_id` | UUID (FK → sales) | |
| `product_id` | UUID (FK → products) | |
| `quantity` | INTEGER | |
| `unit_price` | NUMERIC(12,2) | Price at time of sale |
| `subtotal` | NUMERIC(12,2) | quantity × unit_price |

---

### `warehouses`
Storage locations (stores, depots).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `organization_id` | UUID (FK) | |
| `name` | TEXT | Location name |
| `address` | TEXT | Physical address |
| `is_default` | BOOLEAN | Default for new sales |
| `created_at` | TIMESTAMPTZ | |

---

### `warehouse_transfers`
Stock movement between locations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `organization_id` | UUID (FK) | |
| `from_warehouse_id` | UUID (FK → warehouses) | |
| `to_warehouse_id` | UUID (FK → warehouses) | |
| `status` | TEXT | `pending`, `approved`, `completed`, `cancelled` |
| `notes` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

---

### `vendors`
Suppliers / purchase vendors.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `organization_id` | UUID (FK) | |
| `name` | TEXT | |
| `email` | TEXT | |
| `phone` | TEXT | |
| `balance` | NUMERIC(12,2) | Outstanding balance |
| `created_at` | TIMESTAMPTZ | |

---

### `vendor_transactions`
Purchase records and payments to vendors.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `vendor_id` | UUID (FK → vendors) | |
| `organization_id` | UUID (FK) | |
| `type` | TEXT | `purchase`, `payment`, `return` |
| `amount` | NUMERIC(12,2) | |
| `description` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

---

### `categories`
Product categories.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `organization_id` | UUID (FK) | |
| `name` | TEXT | |
| `color` | TEXT | Hex color for UI |
| `created_at` | TIMESTAMPTZ | |

---

### `audit_logs`
Immutable record of all significant user actions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | Who performed the action |
| `action` | TEXT | Dot-notation: `product.created` |
| `resource_type` | TEXT | Table or entity name |
| `resource_id` | UUID | The affected record |
| `old_data` | JSONB | Before state |
| `new_data` | JSONB | After state |
| `metadata` | JSONB | Additional context |
| `ip_address` | TEXT | Client IP |
| `created_at` | TIMESTAMPTZ | |

---

### `activity_logs`
User session and navigation activity.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `user_id` | UUID | |
| `organization_id` | UUID | |
| `action` | TEXT | |
| `metadata` | JSONB | |
| `created_at` | TIMESTAMPTZ | |

---

### `notifications`
In-app notification queue.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | Recipient |
| `title` | TEXT | |
| `message` | TEXT | |
| `type` | TEXT | `info`, `warning`, `error`, `success` |
| `is_read` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

---

## Payment & Billing Tables

### `subscription_plans`

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | `starter`, `professional`, `enterprise` |
| `name` | TEXT | |
| `price` | NUMERIC(10,2) | Monthly price NGN |
| `billing_cycle` | TEXT | `monthly`, `yearly` |
| `features` | JSONB | Feature list |
| `max_users`, `max_products`, `max_locations` | INTEGER | |

---

### `subscriptions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `organization_id` | UUID (FK) | |
| `plan_id` | TEXT (FK → subscription_plans) | |
| `status` | TEXT | `trial`, `active`, `past_due`, `cancelled`, `expired` |
| `start_date`, `end_date` | TIMESTAMPTZ | |
| `payment_method` | TEXT | |
| `billing_cycle` | TEXT | `monthly`, `yearly` |

---

### `payment_transactions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `organization_id` | UUID (FK) | |
| `subscription_id` | UUID (FK) | |
| `amount` | NUMERIC(12,2) | In NGN |
| `currency` | TEXT | `NGN` |
| `payment_method` | TEXT | |
| `status` | TEXT | `pending`, `completed`, `failed`, `refunded` |
| `reference` | TEXT | Zainpay txnRef |
| `metadata` | JSONB | Raw gateway response |

---

### `invoices` *(Migration 004)*

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `organization_id` | UUID (FK) | |
| `subscription_id` | UUID (FK, nullable) | |
| `payment_transaction_id` | UUID (FK, nullable) | |
| `invoice_number` | TEXT (unique) | `INV-2025-000042` |
| `amount` | NUMERIC(12,2) | |
| `currency` | TEXT | `NGN` |
| `status` | TEXT | `paid`, `unpaid`, `cancelled` |
| `due_date` | TIMESTAMPTZ | |
| `paid_at` | TIMESTAMPTZ | |

---

## Merchant Management Tables *(Migration 004)*

### `merchants`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `organization_id` | UUID (FK) | |
| `business_name` | TEXT | |
| `business_type` | TEXT | |
| `status` | TEXT | `pending`, `active`, `suspended`, `deactivated` |
| `verification_status` | TEXT | `unverified`, `pending`, `verified`, `rejected` |
| `contact_name`, `contact_email`, `contact_phone` | TEXT | |
| `address`, `city`, `state`, `country` | TEXT | |
| `onboarding_completed` | BOOLEAN | |
| `onboarding_step` | INTEGER | 1-5 |

---

### `merchant_device_limits` *(Migration 004)*

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `merchant_id` | UUID (FK → merchants, unique) | |
| `plan_type` | TEXT | `starter`, `professional`, `enterprise` |
| `max_devices` | INTEGER | |
| `current_devices` | INTEGER | |

---

### `webhook_logs` *(Migration 004)*

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `provider` | TEXT | `zainpay` |
| `event_type` | TEXT | `deposit.successful`, etc. |
| `payload` | JSONB | Raw webhook body |
| `processed` | BOOLEAN | Processing flag |
| `processing_error` | TEXT | Error message if failed |
| `idempotency_key` | TEXT (unique) | Prevents duplicate processing |
| `created_at` | TIMESTAMPTZ | |

---

## Key Indexes

```sql
-- Fast lookups by organization
CREATE INDEX idx_products_org ON products(organization_id);
CREATE INDEX idx_sales_org_created ON sales(organization_id, created_at DESC);

-- Merchant queries
CREATE INDEX idx_merchants_org ON merchants(organization_id);
CREATE INDEX idx_merchants_status ON merchants(status);

-- Webhook idempotency
CREATE UNIQUE INDEX idx_webhook_idempotency ON webhook_logs(idempotency_key);

-- Invoice lookup
CREATE INDEX idx_invoices_org ON invoices(organization_id);
```

---

## Analytics Views

```sql
-- Revenue summary by month
CREATE VIEW v_subscription_revenue AS
SELECT DATE_TRUNC('month', created_at) AS month,
       COUNT(*) FILTER (WHERE status = 'active') AS active_subscriptions,
       SUM(amount) FILTER (WHERE status = 'paid') AS mrr
FROM invoices
GROUP BY 1 ORDER BY 1 DESC;

-- Merchant summary with device info
CREATE VIEW v_merchant_summary AS
SELECT m.*, dl.plan_type, dl.max_devices, dl.current_devices,
       COUNT(i.id) AS total_invoices,
       COALESCE(SUM(i.amount) FILTER (WHERE i.status='paid'), 0) AS total_paid
FROM merchants m
LEFT JOIN merchant_device_limits dl ON dl.merchant_id = m.id
LEFT JOIN invoices i ON i.organization_id = m.organization_id
GROUP BY m.id, dl.plan_type, dl.max_devices, dl.current_devices;
```
