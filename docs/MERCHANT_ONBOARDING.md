# TRADETRACK — Merchant Onboarding Guide

## Overview

The merchant onboarding process is a 5-step wizard that collects all necessary information to activate a merchant account on the TRADETRACK platform.

---

## Merchant Lifecycle

```
Registration (pending)
    ↓
Information Submitted (pending, onboarding_step: 2-4)
    ↓
Documents Verified (verification_status: verified)
    ↓
Payment Setup (subscription activated)
    ↓
Activated (status: active, onboarding_completed: true)
    ↓
(optional) Suspended → Re-activated
    ↓
(optional) Deactivated (permanent)
```

---

## Status Definitions

### `status` field

| Value | Description |
|-------|-------------|
| `pending` | Merchant registered but not yet activated |
| `active` | Fully operational, all access granted |
| `suspended` | Temporarily disabled (e.g., payment failure) |
| `deactivated` | Permanently closed account |

### `verification_status` field

| Value | Description |
|-------|-------------|
| `unverified` | No documents submitted |
| `pending` | Documents under review |
| `verified` | Identity/business confirmed |
| `rejected` | Documents rejected, resubmission required |

---

## Onboarding Steps

### Step 1: Business Information

Required fields:
- `business_name` (required)
- `business_type` (retail/wholesale/restaurant/services/ecommerce/other)
- `registration_number` (optional, CAC number for Nigeria)
- `tax_id` (optional, TIN number)
- `country` (default: Nigeria)

### Step 2: Contact & Address

Required fields:
- `contact_name` (required — primary contact person)
- `contact_email` (required — communication & billing)
- `contact_phone` (optional)
- `address` (optional)
- `city`, `state` (optional)

### Step 3: Document Verification

Documents to submit (via support channel or future upload feature):
1. CAC Certificate or Business Registration
2. Government-issued ID of director/owner
3. Proof of business address (utility bill, bank statement)
4. Bank account details for settlement

### Step 4: Payment Setup

The merchant sets up their subscription plan:
1. Choose plan (Starter / Professional / Enterprise)
2. Complete Zainpay payment
3. Subscription activates automatically on payment confirmation

### Step 5: Complete

- `onboarding_completed` set to `true`
- `onboarding_step` set to `5`
- `status` set to `active`
- Welcome email sent
- Full platform access granted

---

## Admin Actions

Platform admins can perform these actions on any merchant:

### Activate
```typescript
UPDATE merchants SET status = 'active', onboarding_step = 5, onboarding_completed = true
WHERE id = $merchantId;
```

### Verify Documents
```typescript
UPDATE merchants SET verification_status = 'verified'
WHERE id = $merchantId;
```

### Suspend
```typescript
UPDATE merchants SET status = 'suspended'
WHERE id = $merchantId;
// Optionally notify merchant via email
```

### Delete
```typescript
DELETE FROM merchants WHERE id = $merchantId;
// Cascades to: merchant_device_limits
// Does NOT cascade to: invoices (organization_id FK → organization remains)
```

---

## Device Limits

Each merchant account has a device limit based on their subscription plan:

| Plan | Max Devices | Features |
|------|-------------|---------|
| Starter | 1 | Single POS terminal |
| Professional | 5 | Multiple terminals, priority support |
| Enterprise | Unlimited | Custom integrations, dedicated support |

Device limits are stored in `merchant_device_limits`:

```sql
merchant_id     → merchants.id
plan_type       → 'starter' | 'professional' | 'enterprise'
max_devices     → integer limit
current_devices → active terminals count
```

Updating device limits:
```typescript
await supabase
  .from('merchant_device_limits')
  .update({ max_devices: 10, plan_type: 'enterprise' })
  .eq('merchant_id', merchantId);
```

---

## Notifications

TRADETRACK sends notifications at these onboarding milestones:
- Registration confirmed → "Welcome to TradeTrack"
- Documents submitted → "Your documents are under review"
- Verification approved/rejected → "Document Verification Update"
- Subscription activated → "Your account is now active!"
- Suspension → "Account Suspended — Action Required"

---

## Data Isolation

Each merchant's data is isolated by `organization_id`:
- All tables enforce RLS: `WHERE organization_id = auth.uid()::uuid`
- Storage paths: `product-images/{organization_id}/`
- Merchants can only see their own organization's data
- Platform admins see all via service role key
