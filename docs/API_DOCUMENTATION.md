# TRADETRACK — API Documentation

All API routes are located in `src/app/api/`. Authentication is required unless noted otherwise.

---

## Authentication

All protected routes require a Supabase JWT in the Authorization header:

```
Authorization: Bearer <supabase-user-jwt>
```

Get the JWT from:
```typescript
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```

---

## Routes

### `POST /api/audit`

Write an audit log entry. Uses the service role key to bypass RLS.

**Request:**
```json
{
  "user_id": "uuid",
  "action": "product.created",
  "resource_type": "product",
  "resource_id": "uuid",
  "metadata": { "name": "Widget A", "price": 1500 }
}
```

**Response (201):**
```json
{ "success": true }
```

**Errors:**
- `400` — Missing required fields
- `500` — Database error

---

### `GET /api/users`

List all users in the system. Requires admin/owner role.

**Response (200):**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "cashier",
      "organization_id": "uuid",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### `POST /api/users`

Create a new user via Supabase Auth Admin API.

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "SecurePassword123!",
  "full_name": "Jane Smith",
  "role": "cashier",
  "organization_id": "uuid"
}
```

**Response (201):**
```json
{
  "success": true,
  "user": { "id": "uuid", "email": "...", "full_name": "..." }
}
```

**Errors:**
- `400` — Email already exists or invalid password
- `403` — Caller is not admin/owner
- `500` — Internal error

---

### `PATCH /api/users/:id`

Update a user's profile or reset their password.

**Request:**
```json
{
  "full_name": "Updated Name",
  "role": "manager",
  "password": "NewPassword123!"
}
```

**Response (200):**
```json
{ "success": true }
```

**Errors:**
- `403` — Cannot modify owner accounts (unless super_admin)
- `404` — User not found

---

### `DELETE /api/users/:id`

Delete a user account. Cannot delete yourself.

**Response (200):**
```json
{ "success": true }
```

**Errors:**
- `400` — Cannot delete your own account
- `404` — User not found

---

### `POST /api/payments/initialize`

Initialize a Zainpay card payment for a subscription purchase.

**Request:**
```json
{
  "amount": 500000,
  "planId": "professional",
  "name": "John Doe",
  "email": "john@business.com",
  "mobile": "+2348012345678",
  "zainboxCode": "ZB-xxxxx",
  "txnRef": "TT-custom-ref"
}
```

> Note: `amount` is in kobo (NGN × 100). Server converts to `String()` per Zainpay spec.

**Response (200):**
```json
{
  "success": true,
  "txnRef": "TT-1234567890-ABCDEF",
  "paymentUrl": "https://sandbox.zainpay.ng/pay/...",
  "reference": "ZP-REF-xxx"
}
```

**Errors:**
- `400` — Invalid amount or missing required fields
- `401` — Unauthorized
- `502` — Zainpay API error
- `503` — Payment gateway not configured

---

### `GET /api/payments/verify`

Verify a Zainpay payment after callback redirect.

**Query Parameters:**
| Param | Required | Description |
|-------|----------|-------------|
| `txnRef` | Yes | Transaction reference from initialization |
| `planId` | No | Plan ID to activate on success |
| `userId` | No | User ID for audit log |

**Response (200 — success):**
```json
{
  "success": true,
  "verified": true,
  "txnRef": "TT-xxx",
  "amount": 5000,
  "currency": "NGN",
  "message": "Payment verified and subscription activated",
  "subscriptionActivated": true
}
```

**Response (200 — failed):**
```json
{
  "success": false,
  "verified": false,
  "code": "01",
  "message": "Payment verification failed"
}
```

---

### `POST /api/payments/verify`

Alternative POST version of verify (same logic).

**Request:**
```json
{
  "txnRef": "TT-xxx",
  "planId": "professional",
  "userId": "uuid"
}
```

---

### `POST /api/webhooks/zainpay`

Zainpay asynchronous payment notification. Called by Zainpay servers.

**Headers:**
```
x-zainpay-signature: <hmac-sha512-of-body>
```

**Request Body (Zainpay deposit.successful):**
```json
{
  "txnRef": "TT-xxx",
  "amount": { "amount": 500000 },
  "code": "00",
  "event": "deposit.successful",
  "email": "user@example.com"
}
```

**Response (200 — always, even on error):**
```json
{ "received": true, "processed": true, "txnRef": "TT-xxx" }
```

> Always returns 200 to prevent Zainpay retries. Errors are logged internally.

---

### `GET /api/payments/initialize` *(health probe)*

Returns gateway configuration status. No auth required.

```json
{
  "endpoint": "POST /api/payments/initialize",
  "gateway": "Zainpay",
  "environment": "sandbox",
  "configured": true
}
```

---

## Error Response Format

All errors follow this format:

```json
{
  "error": "Human-readable error message",
  "details": "Optional additional context"
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (validation error) |
| 401 | Authentication required |
| 403 | Forbidden (insufficient permissions) |
| 404 | Resource not found |
| 500 | Internal server error |
| 502 | Upstream gateway error |
| 503 | Service unavailable (not configured) |
