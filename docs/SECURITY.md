# TRADETRACK — Security Guide

## Security Architecture

TRADETRACK employs a defense-in-depth strategy with multiple layers of security:

```
Layer 1: Supabase Auth (JWT + PKCE)
Layer 2: Next.js Middleware (route protection)
Layer 3: Row Level Security (PostgreSQL)
Layer 4: API Route validation (server-side)
Layer 5: Role-Based Access Control (application-level)
```

---

## Authentication

### Supabase Auth

- **Method**: Email/password with Supabase Auth (JWTs)
- **Token lifetime**: 1 hour (auto-refreshed by Supabase client)
- **Session storage**: httpOnly cookies (via `@supabase/ssr`)
- **Refresh tokens**: Rotated on each use

### Offline Sessions

Cached sessions in IndexedDB have:
- 24-hour expiry (`expiresAt` field)
- No password stored — only profile data
- Cleared on explicit logout
- Cannot be used to make API calls (API routes re-validate with Supabase)

---

## API Key Management

### Client-side (anon key)
```
NEXT_PUBLIC_SUPABASE_ANON_KEY
```
- Public — safe to expose in browser
- RLS restricts what it can access
- Can only read/write data belonging to the authenticated user

### Server-side (service role key)
```
SUPABASE_SERVICE_ROLE_KEY
```
- **NEVER expose to the browser**
- Used only in API routes (`src/app/api/`)
- Bypasses RLS — full admin access
- Currently used for: audit log writes, user CRUD, payment processing

### Zainpay Keys
```
ZAINPAY_PUBLIC_KEY   — used in server-side requests only
ZAINPAY_PRIVATE_KEY  — kept server-side, not currently sent to Zainpay
ZAINPAY_WEBHOOK_SECRET — HMAC-SHA512 webhook validation
```

---

## Row Level Security (RLS)

All 20+ tables have RLS enabled. The base pattern:

```sql
-- Standard org-level isolation
CREATE POLICY "users_own_org_only" ON some_table
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );
```

### Sensitive Tables

| Table | Access Pattern |
|-------|----------------|
| `audit_logs` | Write via service role only (`/api/audit`); read by admin+ |
| `webhook_logs` | Write via service role only; read by admin+ |
| `invoices` | Write via service role only; read by own org |
| `payment_transactions` | Write via service role; read by own org |
| `users` | Read own record; admin CRUD via `/api/users` (service role) |

---

## Role-Based Access Control (RBAC)

### Role Hierarchy

```
super_admin > owner > admin > manager > cashier
```

### Permission Matrix

| Action | cashier | manager | admin | owner | super_admin |
|--------|---------|---------|-------|-------|-------------|
| Process sale | ✓ | ✓ | ✓ | ✓ | ✓ |
| View reports | ✗ | ✓ | ✓ | ✓ | ✓ |
| Manage products | ✗ | ✓ | ✓ | ✓ | ✓ |
| Manage users | ✗ | ✗ | ✓ | ✓ | ✓ |
| View subscriptions | ✗ | ✗ | ✓ | ✓ | ✓ |
| Manage settings | ✗ | ✗ | ✗ | ✓ | ✓ |
| Admin dashboard | ✗ | ✗ | ✗ | ✓ | ✓ |
| All merchants view | ✗ | ✗ | ✗ | ✗ | ✓ |
| Delete users | ✗ | ✗ | ✗ | ✓ | ✓ |

---

## Middleware Protection

`src/middleware.ts` protects all dashboard routes:

```typescript
const PROTECTED_PREFIXES = [
  '/dashboard', '/products', '/inventory', '/pos', '/sales',
  '/warehouses', '/transfers', '/vendors', '/reports', '/audit',
  '/notifications', '/users', '/subscriptions', '/settings',
  '/admin', '/merchants',
];
```

Unauthenticated requests to these routes are redirected to `/login?redirect=<original-path>`.

---

## Webhook Security

### Signature Validation

All Zainpay webhooks are validated with HMAC-SHA512:

```typescript
const expected = crypto
  .createHmac('sha512', ZAINPAY_WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');

// Constant-time comparison (prevents timing attacks)
crypto.timingSafeEqual(
  Buffer.from(incomingSignature, 'hex'),
  Buffer.from(expected, 'hex')
);
```

### Idempotency

Each webhook is logged with a unique `idempotency_key = "zainpay:{txnRef}"`. If a webhook with the same key has already been processed, it is safely ignored.

---

## Input Validation

All API routes validate input:

```typescript
// Required field check
if (!body.email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

// Type coercion
const amount = Number(body.amount);
if (isNaN(amount) || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
```

Form inputs are validated with Zod schemas via React Hook Form.

---

## Content Security Policy

Recommended CSP headers (add to `next.config.ts`):

```typescript
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL} https://api.zainpay.ng https://sandbox.zainpay.ng`,
      "img-src 'self' blob: data: https:",
    ].join('; '),
  },
];
```

---

## Data Retention

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Audit logs | 12 months | Required for compliance |
| Webhook logs | 90 days | Auto-cleanup recommended |
| Sales records | Indefinite | Business records |
| Cancelled subscriptions | 90 days data access | After cancellation |
| Deleted users | Immediate | Auth record removed |

---

## Security Checklist

```
□ Supabase service role key is NEVER in client-side code
□ .env.local is in .gitignore
□ All API routes validate JWT before processing
□ RLS is enabled on ALL tables
□ Webhook signature is validated
□ Timing-safe comparison used for HMAC
□ User cannot delete their own account
□ Owner cannot be deleted by non-super_admin
□ Audit logs are written for all sensitive actions
□ Passwords are never logged or stored in plaintext
□ Supabase Auth email confirmation enabled in production
```

---

## Reporting Security Issues

Report security vulnerabilities to: security@yourcompany.com

Please include:
1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if known)

We aim to respond within 48 hours and patch critical issues within 7 days.
