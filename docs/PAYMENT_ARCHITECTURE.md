# TRADETRACK — Payment Architecture (Zainpay Integration)

## Overview

TRADETRACK integrates with **Zainpay** — a Nigerian payment gateway — for subscription billing. The integration follows Zainpay's card payment flow with asynchronous webhook confirmation.

---

## Zainpay Account Setup

1. Register at [zainpay.ng](https://zainpay.ng)
2. Complete KYC (business verification)
3. Create a **Zainbox** (virtual account group)
4. Get API keys from Dashboard → API Settings:
   - Public Key: `ZPK-...`
   - Private Key: `ZSK-...`
   - Webhook Secret (set a strong random string)

---

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST   | `/zainbox/card/initialize/payment` | Initialize card payment, get paymentUrl |
| GET    | `/virtual-account/wallet/deposit/verify/:txnRef` | Verify payment status |
| POST   | *(webhook)* → our `/api/webhooks/zainpay` | Async deposit notification |

**Base URLs:**
- Sandbox: `https://sandbox.zainpay.ng`
- Live: `https://api.zainpay.ng`

---

## Critical Implementation Rules

> These rules come directly from the Zainpay reference implementation:

### ✅ Rule 1: Amount as String

```typescript
// ❌ WRONG — amount as number
{ amount: 5000 }

// ✅ CORRECT — amount must be String()
{ amount: String(5000) }  // "5000"
```

### ✅ Rule 2: Check `code === "00"` — NOT `txnStatus`

```typescript
// ❌ WRONG — txnStatus is unreliable
if (response.data.txnStatus === 'Completed') { ... }

// ✅ CORRECT — always check code
if (response.code === '00' && response.data) {
  // Payment is successful
}
```

### ✅ Rule 3: Extract amount safely

```typescript
// data.amount can be a number OR an object like { amount: 50000 }
const amount = data.data?.amount?.amount ?? data.data?.amount;
```

### ✅ Rule 4: Authorization header format

```
Authorization: Bearer ${ZAINPAY_PUBLIC_KEY}
```

---

## Payment Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  1. User clicks "Upgrade to Professional"                        │
│     Client: POST /api/payments/initialize                        │
│     Body: { amount: 500000, planId, email, name }               │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  2. Server validates JWT, formats amount as String()             │
│     Server: POST https://sandbox.zainpay.ng/zainbox/card/       │
│             initialize/payment                                    │
│     Headers: Authorization: Bearer ${ZAINPAY_PUBLIC_KEY}        │
│     Body: { amount: "500000", txnRef, emailAddress, ... }       │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  3. Zainpay returns { code: "00", data: { paymentUrl } }        │
│     Server inserts pending payment_transaction                   │
│     Server returns { success: true, paymentUrl, txnRef }        │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  4. Browser redirects user to paymentUrl (Zainpay hosted page)  │
│     User enters card details, 3DS verification                  │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  5a. SYNCHRONOUS: Zainpay redirects to callbackUrl              │
│      GET /api/payments/verify?txnRef=TT-xxx&planId=xxx          │
│      Server: GET Zainpay /virtual-account/wallet/deposit/       │
│              verify/:txnRef                                      │
│      Check: code === "00" && data (not txnStatus)               │
│      → Update subscription to active                             │
│      → Insert invoice record                                     │
│      → Activate merchant if pending                             │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  5b. ASYNCHRONOUS: Zainpay POSTs webhook                        │
│      POST /api/webhooks/zainpay                                  │
│      → Validate HMAC-SHA512 signature                           │
│      → Idempotency check (webhook_logs.idempotency_key)         │
│      → Process if code === "00" && not already done             │
│      → Return 200 (always, to prevent Zainpay retries)         │
└──────────────────────────────────────────────────────────────────┘
```

---

## API Route: `POST /api/payments/initialize`

### Request

```http
POST /api/payments/initialize
Authorization: Bearer <supabase-user-jwt>
Content-Type: application/json

{
  "amount": 500000,          // in kobo (NGN × 100) — server converts to String()
  "planId": "professional",
  "name": "John Doe",
  "email": "john@business.com",
  "mobile": "+2348012345678",
  "zainboxCode": "ZB-xxxxx",
  "txnRef": "TT-1234567890-ABCDEF"  // optional, auto-generated if omitted
}
```

### Response (success)

```json
{
  "success": true,
  "txnRef": "TT-1234567890-ABCDEF",
  "paymentUrl": "https://sandbox.zainpay.ng/pay/TT-xxx",
  "reference": "ZP-REF-xxx",
  "data": { ... }
}
```

---

## API Route: `GET /api/payments/verify`

### Request

```
GET /api/payments/verify?txnRef=TT-xxx&planId=professional&userId=uuid
```

### Response (success)

```json
{
  "success": true,
  "verified": true,
  "txnRef": "TT-1234567890-ABCDEF",
  "amount": 5000,
  "currency": "NGN",
  "message": "Payment verified and subscription activated",
  "subscriptionActivated": true
}
```

---

## Webhook Handler: `POST /api/webhooks/zainpay`

### Security

1. Validate `x-zainpay-signature` header (HMAC-SHA512 of raw body)
2. Idempotency: check `webhook_logs.idempotency_key = "zainpay:{txnRef}"`
3. Always return HTTP 200 (Zainpay retries on 4xx/5xx)

### Processing Logic

```typescript
// CORRECT: check code only
if (payload.code === '00') {
  await activateSubscription(txnRef);
  await createInvoice(...);
  await activateMerchant(...);
}
// Log all events, even failures
await markWebhookProcessed(logId);
```

---

## Invoice Generation

Every successful payment creates an invoice:

```sql
INSERT INTO invoices (
  organization_id,
  subscription_id,
  payment_transaction_id,
  invoice_number,   -- auto-generated: INV-2025-123456
  amount,
  currency,         -- 'NGN'
  status,           -- 'paid'
  paid_at
) VALUES (...)
```

---

## Error Handling

| Scenario | Behavior |
|----------|---------|
| Zainpay API down | Return 502, show retry UI to user |
| Invalid signature | Return 401, log security alert |
| Duplicate webhook | Return 200 with `{ duplicate: true }` |
| code !== "00" | Mark transaction failed, log details |
| DB insert fails | Return 200 to prevent Zainpay retries, log error |
| JWT expired | Return 401, redirect to login |
