# Example: Security Prompts (Phase 9)

> Shows what Phase 9 prompts look like. Security prompts enumerate every endpoint and verify that auth, rate limiting, data isolation, and input sanitization are actually enforced — not just assumed. Context: Finora, Phases 1–8 complete.

---

## [ ] [165] We're implementing the session cookie verification middleware that protects every Finora API endpoint — validating the session on every request and attaching the authenticated user's UID to the request context.

**What the middleware does —** Every request to any API route under `/api/` (except `/api/auth/login`, `/api/auth/register`, and `/api/health`) must include a valid `session` cookie. The middleware verifies this cookie with `adminAuth.verifySessionCookie(cookie, true)` (the `true` arg enables revocation checking — a logged-out user's cookie is rejected even if it hasn't expired). If valid, the middleware forwards the request with the UID in a request header. If invalid, it returns 401 immediately and the route handler never runs.

**Session auto-refresh —** If the session cookie is valid but will expire within the next 24 hours (i.e., the `exp` claim is less than 24 hours from now), the middleware issues a new 7-day cookie in the response. This prevents users from being logged out mid-session.

**Protected vs public routes —** The middleware's `matcher` config controls which routes it applies to. Public routes that do NOT require the middleware: `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `/api/health`. All other `/api/*` routes require the middleware.

**UID forwarding —** After verifying the session, forward the `uid` to the route handler via a request header: `request.headers.set('x-user-id', decodedClaims.uid)`. Route handlers read `request.headers.get('x-user-id')` — they never re-verify the session cookie themselves (that is the middleware's job). This is the only place in the entire codebase where the session cookie is verified.

## Instructions

**File:** `middleware.ts` (at the project root — Next.js picks this up automatically)

```typescript
export const config = {
  matcher: ['/api/:path*'],
};
```

**`Middleware processing order —`**

1. Check if the path matches a public route (`/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `/api/health`) — if yes, return `NextResponse.next()` unchanged.
2. Read the `session` cookie from `request.cookies.get('session')?.value`.
3. If missing: return 401 response with `{ code: 'UNAUTHORIZED', message: 'You must be signed in to access this resource.' }`.
4. Call `adminAuth.verifySessionCookie(session, true)` to verify the cookie with revocation checking enabled.
5. On any error: return 401 response with `{ code: 'UNAUTHORIZED', message: 'Your session has expired. Please sign in again.' }`.
6. Extract `uid` and `exp` from the decoded claims.
7. Set `x-user-id` header to `decodedClaims.uid` on a cloned request headers object.
8. If the session cookie is valid but expires within the next 24 hours (i.e., `(exp * 1000 - Date.now()) < 24 * 60 * 60 * 1000`): call `adminAuth.createSessionCookie(session, { expiresIn: 7 * 24 * 60 * 60 * 1000 })` and set it on the response cookies as `session` with options: `httpOnly: true`, `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'strict'`, `path: '/'`, `maxAge: 7 * 24 * 60 * 60`.
9. Return the response using `NextResponse.next({ request: { headers: requestHeaders } })`.

**All API route handlers —** Update to read the UID from the `x-user-id` header. If the header is missing, return a 401 response with code `UNAUTHORIZED` and status code 401.

**Important:** Do NOT run this middleware on the Edge Runtime — Firebase Admin SDK requires Node.js. Ensure Next.js uses the Node.js runtime for the middleware by checking that `next.config.ts` does not set `experimental.runtime: 'edge'` globally.

## Verification

I'll verify this implementation automatically. I can:

- GET `/api/transactions` with no session cookie → expect 401 with code `UNAUTHORIZED`.
- GET `/api/transactions` with an invalid/tampered session cookie value → expect 401.
- GET `/api/transactions` with a valid session cookie → expect 200 (middleware passes through, route handler runs).
- POST `/api/auth/login` (public route) with no session cookie → expect the route to run normally (middleware does not block it).
- Sign in → wait until the cookie is within 24 hours of expiry (manually set `exp` in testing) → make a request → expect the `Set-Cookie` header to appear in the response with a refreshed 7-day cookie.
- Sign out (which revokes the session) → use the old cookie → expect 401 (revocation check blocks it).
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Sign in → open DevTools → Application → Cookies → verify `session` cookie has `HttpOnly` and `SameSite=Strict` flags set.
- Manually delete the session cookie → navigate to any app page → expect redirect to login.
- Sign in → sign out (which revokes the cookie) → try pasting the old cookie value back into DevTools → reload → expect 401 (revocation works).

Then give me your honest assessment of:

- Whether using a Next.js middleware to dynamically import `firebase-admin` on every request introduces unacceptable cold-start latency in a Vercel serverless environment — and whether a singleton module-level import would be safer, or whether that approach risks the module being included in the client bundle.

---

## [ ] [166] We're auditing every Finora API endpoint for data isolation failures — verifying that no endpoint can return or modify another user's data under any request crafting.

**What this prompt does —** This is a security audit pass, not a code-writing prompt. The executing agent reads every API route handler and verifies each one against the data isolation checklist. For any endpoint that fails, the agent writes the fix.

**The core rule —** Every database read and write must be constrained to the authenticated user's data. The UID must come from `request.headers.get('x-user-id')` (set by the middleware in [165]) — never from the request body, query params, or path params. Path params like `/api/transactions/[id]` are used to identify the specific resource but the ownership check must still verify `document.userId === uid`.

**Audit checklist for every endpoint:**

1. The UID comes from `x-user-id` header (not from request body or query params).
2. Every Firestore read includes a `.where('userId', '==', uid)` filter OR fetches the document and verifies `document.userId === uid` before returning data.
3. Every Firestore write includes `userId: uid` hardcoded (not from request body).
4. No endpoint returns a full list of documents without a userId constraint.
5. Path param IDs (e.g., `transactionId` from `/transactions/[id]`) are used to fetch the document, but ownership is verified after fetching — not trusted to be correct.

## Instructions

**Run the audit** against these endpoints (all built in Phase 4):

- `GET /api/transactions` — verify `where('userId', '==', uid)` is always applied, verify `uid` comes from header
- `POST /api/transactions` — verify `userId: uid` is hardcoded in the created document, not taken from request body
- `GET /api/transactions/[id]` — verify ownership check after fetch: `if (doc.userId !== uid) return 403`
- `PATCH /api/transactions/[id]` — verify ownership check, verify `userId` field cannot be changed
- `DELETE /api/transactions/[id]` (soft delete) — verify ownership check
- `GET /api/categories` — verify userId filter
- `POST /api/categories` — verify userId hardcoded in document
- `PATCH /api/categories/[id]` — verify ownership check
- `DELETE /api/categories/[id]` — verify ownership check
- `GET /api/reports/*` — verify all aggregation queries are scoped to uid

**Ownership check pattern —** Fetch the document by ID. If `doc.exists` is false: return 404 with `{ code: 'NOT_FOUND', message: 'Transaction not found.' }`. If `doc.data().userId !== uid`: return 403 with `{ code: 'FORBIDDEN', message: 'You cannot access this transaction.' }`. Always return 403 for ownership failures — never 404, because returning 404 when a resource exists reveals that the resource ID exists (information leakage).

**Input sanitization audit —** Strip HTML tags from `description`, `counterparty`, `notes`, and `displayName` fields before writing to the database. Validate any field accepting a URL (`receiptUrl`, `photoUrl`) starts with `https://` and matches the expected domain.

## Verification

I'll verify this implementation automatically. I can:

- Sign in as User A → note a transaction ID from User A's list → sign in as User B → attempt `GET /api/transactions/{userATransactionId}` → expect 403 (not 404, not 200).
- Sign in as User B → attempt `PATCH /api/transactions/{userATransactionId}` with `{ userId: userBId }` in the body → expect 403.
- Sign in as User A → POST `/api/transactions` with `{ userId: 'some-other-user-id', ... }` in the request body → expect the created transaction to have `userId === userAId` (the injected body value is ignored).
- Attempt `GET /api/transactions` without the `userId` header being set (simulate middleware bypass) → route handler should still check and return 401.
- POST `/api/transactions` with `description: '<script>alert(1)</script>'` → GET the created transaction → expect description to be `'alert(1)'` (HTML stripped).
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Use a tool like `curl` or Postman → sign in as User A and copy the session cookie → craft a request to `GET /api/transactions/{knownUserBTransactionId}` with User A's cookie → expect 403 Forbidden with code FORBIDDEN.

Then give me your honest assessment of:

- Whether the HTML-stripping regex (`/<[^>]*>/g`) is sufficient sanitization for user input that will be displayed in the UI — or whether a more robust library (like `DOMPurify`) would provide meaningfully better protection against XSS attack vectors.
