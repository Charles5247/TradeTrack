# Bad vs. Good: Prompt Comparison

> Three side-by-side examples showing a poorly written prompt vs. the same prompt written correctly. Read these before writing your first build prompt — the contrast makes the rules concrete.
>
> The "bad" prompts are real examples of how most developers naturally write AI prompts. They feel reasonable at first but produce inconsistent, incomplete, or insecure implementations.

---

## Comparison 1: Database Prompt

### ❌ BAD

```
## [ ] [8] Create the transactions collection.

Set up the Firestore transactions collection with the necessary fields,
indexes, and security rules.

## Instructions

Create the transactions collection in Firestore with fields for amount,
type, description, status, and timestamps. Add appropriate security rules
so users can only see their own transactions. Add indexes as needed.

## Verification

Check that the collection works correctly.
```

**Why this fails:**

- "Necessary fields" — the agent decides the schema. Every agent invocation will produce a different field set.
- "Appropriate security rules" — no definition of what "appropriate" means. A plausible-sounding rule that's subtly wrong (e.g., missing the `userId` write constraint) ships silently.
- "As needed" for indexes — the agent guesses. The wrong indexes produce slow queries at scale.
- "Check that the collection works correctly" — not verifiable. What does "correctly" mean?
- No type definitions, no field-level constraints, no round-trip test.

---

### ✅ GOOD

```
## [ ] [8] We're building the transactions collection — defining all 16 fields,
4 composite indexes, security rules, and a round-trip serialization test.

**Collection design —** `transactions/{transactionId}` at the root level
(not nested under users). Every document includes a `userId` field equal
to the owning user's Auth UID. Security rules enforce that all reads and
writes filter by `userId == request.auth.uid`. The `userId` field is
immutable after creation.

**Fields —** The collection has 16 fields with exact types:
`id` (string, required, immutable), `userId` (string, required, immutable),
`type` (enum: payment|transfer|deposit|withdrawal|refund, required),
`amount` (positive integer in smallest currency unit, required, never zero or negative),
`currency` (3-character ISO 4217 code, required), `description` (string 1–500 chars, required),
`counterparty` (string max 100 chars, nullable), `status` (enum: pending|completed|failed|cancelled, default completed),
`categoryId` (string, nullable), `tags` (string[], max 10 items each max 30 chars, default []),
`isBusinessExpense` (boolean, default false), `receiptUrl` (nullable string),
`notes` (string max 2000 chars, nullable), `isDeleted` (boolean, default false),
`createdAt` (timestamp, immutable, server-generated), `updatedAt` (timestamp, server-generated).

**Security rules rationale —** A user may only read their own documents.
`userId` and `createdAt` are immutable — updates that touch these fields
are rejected. Hard deletes are blocked at the rules level (soft-delete via
`isDeleted` only). Creating a transaction with a `userId` that doesn't match
`request.auth.uid` is rejected.

## Instructions

**Full field table —** Define a table with columns: Field | Type | Required | Default | Immutable | Written by.
Populate all 16 rows exactly as specified in the field list above.

**Composite indexes —** Add 4 indexes to `firestore.indexes.json`:
(1) `userId` ASC + `createdAt` DESC — default list sorted by date.
(2) `userId` ASC + `type` ASC + `createdAt` DESC — type-filtered list.
(3) `userId` ASC + `status` ASC + `createdAt` DESC — status-filtered list.
(4) `userId` ASC + `categoryId` ASC + `createdAt` DESC — category-filtered list.

**Security rules —** Add a `match /transactions/{transactionId}` block to `firestore.rules` with:
- read: allowed if `request.auth.uid == resource.data.userId`
- create: allowed if `request.auth.uid == request.resource.data.userId` AND `amount > 0` AND `currency.size() == 3`
- update: allowed if `request.auth.uid == resource.data.userId` AND neither `userId` nor `createdAt` appears in the diff's affected keys
- delete: always false

**TypeScript type —** Define `Transaction` interface in `lib/types/transaction.ts` with all 16 fields.
Export `TransactionType` and `TransactionStatus` as string union types.

**Firestore converter —** Create `lib/firebase/converters/transaction-converter.ts` that converts
`createdAt` and `updatedAt` between `Date` (TypeScript) and `Timestamp` (Firestore) in both directions.

**Round-trip test —** In `__tests__/converters/transaction-converter.test.ts`:
create a `Transaction` object with all 16 fields populated (including non-null nullable fields).
Call `toFirestore()` then `fromFirestore()`. Assert all fields are strictly equal to the original.
Run a second test with all nullable fields set to `null` — assert nulls survive the round-trip.

## Verification

I'll verify this implementation automatically. I can:
- Run `npm test -- transaction-converter` — expect 2 tests, 0 failures.
- Attempt to create a transaction with `amount: -50` from client rules — expect `permission-denied`.
- Attempt to update `userId` on an existing transaction — expect `permission-denied`.
- Attempt to read another user's transaction (correct doc ID, wrong auth) — expect `permission-denied`.
- Attempt to hard-delete a transaction — expect `permission-denied`.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:
- Firebase Emulator security rules playground: simulate read with `auth.uid == document.userId` → expect ALLOW.
  Change `auth.uid` → expect DENY.

Then give me your honest assessment of:
- Whether the collection-level security rules (vs. subcollection-per-user) will cause Firestore to scan
  all documents before filtering — or whether the `userId` index is sufficient for efficient enforcement.
```

**Why this works:**

- Schema is locked — 16 fields with exact types, constraints, and write ownership. The agent cannot deviate.
- Security rules are specified as precise allow/deny conditions — no interpretation needed.
- The round-trip test is a concrete deliverable, not a vague "check it works."
- Verification checks are exact: specific operations with exact expected outcomes.

---

## Comparison 2: UI Page Prompt

### ❌ BAD

```
## [ ] [118] Build the transactions list page.

Show a list of the user's transactions. Handle loading and error states.
Add filtering by type and status. Make it look nice. Make sure it works
on mobile too.

## Instructions

Create the transactions list page at /transactions. Fetch the transactions
from the API and display them in a list. Add filters for type and status.
Handle loading, empty, and error states. Make it responsive.

## Verification

Check that the page loads and shows transactions.
```

**Why this fails:**

- "Make it look nice" — undefined. The agent defaults to whatever looks generic.
- "Handle loading, empty, and error states" — with what content? What copy? What actions?
- "Make it responsive" — how? What breakpoints? What changes at each breakpoint?
- No reference to the components already built in Phase 6. The agent might rebuild them from scratch.
- No accessibility requirements. The agent ships an inaccessible page by default.
- "Check that the page loads" is not a verification — it's a hope.

---

### ✅ GOOD

```
## [ ] [118] We need the TransactionListPage — the primary screen where users
browse, filter, search, and paginate through all their transactions in Finora.

**Loading state —** Render 8 `TransactionCardSkeleton` components (built in [98])
in a vertical list. The skeleton must match the real card's exact height so
no layout shift occurs when data arrives.

**Empty state (no transactions) —** Render `<EmptyState>` (built in [99]) with
icon: Receipt, title: "No transactions yet", description: "Track your spending,
income, and transfers in one place.", action: { label: "Add your first transaction",
opens the create modal }.

**Empty state (filters active, no results) —** Render `<EmptyState>` with
icon: SearchX, title: "No matching transactions", description: "Try removing
some filters or adjusting your search.", action: { label: "Clear all filters",
calls clearFilters from the filters store }.

**Error state —** Render `<ErrorState onRetry={() => refetch()} />` (built in [99]).
Only for non-401 errors — 401 triggers the session expiry flow from the auth store,
not an inline error.

**Filter bar —** Visible only when at least one filter is active. Shows one chip
per active filter with a close (×) button that clears that specific filter.
"Clear all" button at the right.

**URL sync —** Active filters are reflected in query params (`?type=payment&status=completed`).
On page load, initialize the filter store from URL params. On filter change,
update the URL with `router.replace` (not `router.push` — no history entry).

**Pagination —** Infinite scroll: load more when the user scrolls to 80% of
the list. Show `<LoadingSpinner size="sm" />` (built in [99]) at the bottom
while fetching the next page.

**Accessibility —** Page `<h1>` is "Transactions". Filter button: `aria-label="Open filters"`.
Filter panel: `role="dialog"`, `aria-label="Transaction filters"`, traps focus when open.
Transaction list: `role="list"`. Each card: `role="listitem"`. When new items load:
announce via `aria-live="polite"` on a visually-hidden element.

## Instructions

**File:** `app/(app)/transactions/page.tsx` — Client Component (`'use client'`).

**Hooks used —**
`useTransactions()` from [68]: provides `transactions`, `isLoading`, `isError`, `fetchNextPage`, `hasNextPage`.
`useTransactionFiltersStore()` from [68]: provides current filters and `setFilter`, `clearFilters`.
`useNetworkStatus()` from [177]: provides `isOnline` for the cached-data indicator.

**Filter panel layout —**
- Desktop (≥1024px): `<aside>` with `position: sticky`, width 280px, appears inline beside the list.
- Mobile (<1024px): shadcn/ui `<Sheet>` (bottom variant). Opens on filter button click.
  Closes on Escape key — return focus to the filter button.
- Contents: Type (radio group in a `<fieldset>` with `<legend>`),
  Status (same pattern), Category (select), Date range (two date inputs: From / To).

**Infinite scroll —** Use an `IntersectionObserver` on a sentinel `<div>`
placed at the bottom of the list. Trigger `fetchNextPage()` when it enters
the viewport and `hasNextPage` is true.

**Metadata —** Export from a separate `app/(app)/transactions/layout.tsx`:
`title: 'Transactions | Finora'`, `description: 'Browse and manage your income, expenses, and transfers.'`

**Design reference:** `docs/design/mockups/transactions-list.html`

## Verification

I'll verify this implementation automatically. I can:
- Navigate while loading → expect exactly 8 skeleton cards, no layout shift on data arrival.
- Navigate with no transactions → expect EmptyState with "Add your first transaction" CTA.
- Apply a filter → expect URL to update and list to refetch with the new filter.
- Scroll to 80% of the list with more pages available → expect `fetchNextPage` to fire.
- Press Tab through the page → expect visible focus ring on each interactive element.
- Disconnect Wi-Fi → navigate → expect ErrorState with retry button.
- Suggest improvements before we move to the next step.

Then give me your honest assessment of:
- Whether syncing filter state to both the URL and the Zustand store creates a source-of-truth
  conflict when the user uses the browser back button after navigating to a detail page.
```

---

## Comparison 3: Security Prompt

### ❌ BAD

```
## [ ] [165] Make the API secure.

Require authentication on all endpoints. Validate inputs.
Make sure users can only access their own data.

## Instructions

Add authentication to all API endpoints. Validate request inputs.
Make sure the userId from the auth token is used instead of
from the request body.

## Verification

Test that unauthenticated requests are rejected.
```

**Why this fails:**

- "Require authentication" — how? Session cookie? Bearer token? Which header?
- "Validate inputs" — which fields? What rules? What happens on failure?
- "Make sure userId from auth token is used" — the agent might do this for one endpoint and miss five others.
- "Test that unauthenticated requests are rejected" — with what status code? What response body?
- No mention of rate limiting, input sanitization, ownership checks after fetch (403 vs 404), or revocation.

---

### ✅ GOOD

```
## [ ] [165] We're implementing the session cookie verification middleware
that protects every Finora API endpoint and attaches the authenticated UID
to every request context.

**What the middleware does —** Reads the `session` httpOnly cookie.
Verifies it using `adminAuth.verifySessionCookie(cookie, true)` — the
`true` argument enables revocation checking, so a logged-out user's
unexpired cookie is still rejected. If valid, forwards the request with
the UID in a request header (`x-user-id`). If invalid, returns 401 immediately —
the route handler never runs.

**Public routes (bypass middleware) —** `/api/auth/login`, `/api/auth/register`,
`/api/auth/logout`, `/api/health`. All other `/api/*` routes require the middleware.

**Session auto-refresh —** If the session cookie is valid but expires within
the next 24 hours, the middleware issues a new 7-day session cookie in the
response. Route handlers do not re-verify the session — that is the middleware's
sole responsibility.

**UID forwarding —** The verified `uid` is forwarded via a request header (`x-user-id`).
Route handlers read `request.headers.get('x-user-id')` — they never accept
a userId from the request body, query params, or path params as proof of identity.

**Ownership check after fetch —** When a route handler fetches a document by ID
(e.g., `GET /api/transactions/[id]`), it must verify `document.userId === uid`
after fetching — not before. If ownership fails: return 403 with
`{ code: 'FORBIDDEN', message: 'You cannot access this transaction.' }`.
Never return 404 for ownership failures (that reveals the resource exists —
information leakage).

## Instructions

**File:** `middleware.ts` at the project root.

**Matcher config —** Apply the middleware to all routes matching `/api/:path*`.
List the public routes explicitly in the middleware body and `return NextResponse.next()`
for them without verifying the session.

**Processing order —**
1. Check if the path matches a public route — if yes, pass through.
2. Read the `session` cookie from `request.cookies.get('session')`.
3. If no cookie: return 401 with `{ code: 'UNAUTHORIZED', message: 'You must be signed in to access this resource.' }`.
4. Call `adminAuth.verifySessionCookie(session, true)`. On any error: return 401 with `{ code: 'UNAUTHORIZED', message: 'Your session has expired. Please sign in again.' }`.
5. Extract `uid` and `exp` from the decoded claims.
6. Set `x-user-id: uid` on a cloned request headers object.
7. If `(exp * 1000 - Date.now()) < 24 * 60 * 60 * 1000`: generate a new 7-day session cookie and set it on the response.
8. Return `NextResponse.next({ request: { headers: modifiedHeaders } })`.

**Route handler pattern —** Every route handler reads the UID exactly as:
`const uid = request.headers.get('x-user-id')`. If null (middleware bypassed somehow): return 401.

**Important:** Import `firebase-admin` dynamically inside the middleware function body
— not at the module level. This prevents the Admin SDK from being bundled into the
Edge Runtime. Verify `next.config.ts` does not set `experimental.runtime: 'edge'` globally.

**Design reference:** n/a (backend-only prompt)

## Verification

I'll verify this implementation automatically. I can:
- GET `/api/transactions` with no session cookie → expect 401, code `UNAUTHORIZED`.
- GET `/api/transactions` with a tampered cookie value → expect 401.
- GET `/api/transactions` with a valid cookie → expect 200 (middleware passes through).
- POST `/api/auth/login` (public route) with no cookie → expect the route to run normally.
- Sign out (revoke session) → reuse the old cookie → expect 401 (revocation check works).
- Attempt GET `/api/transactions/{userBTransactionId}` as User A → expect 403, code `FORBIDDEN` (not 404).
- Suggest improvements before we move to the next step.

Then give me your honest assessment of:
- Whether dynamically importing `firebase-admin` on every middleware invocation introduces
  cold-start latency in Vercel serverless functions that would be better solved by a
  module-level singleton import — and whether the client-bundle risk is real or theoretical.
```

---

## Key Takeaways

| Dimension           | BAD                   | GOOD                                                                                                                   |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Scope               | "Handle states"       | "Loading: 8 skeletons. Empty (no data): EmptyState with exact copy. Empty (filtered): EmptyState with different copy." |
| References          | Rebuilds everything   | References prior phases by `[N]` and component name                                                                    |
| Error codes         | "Reject it"           | "Return 401 with `{ code: 'UNAUTHORIZED', message: '...' }`"                                                           |
| Verification        | "Check that it works" | "Call X → expect exact Y. Call Z → expect exact error code W."                                                         |
| Accessibility       | Never mentioned       | Every prompt specifies ARIA roles, keyboard behavior, focus management                                                 |
| Security            | "Validate inputs"     | "Field X: max N chars. Strip HTML. Verify ownership after fetch. 403 not 404 for auth failures."                       |
| Decisions left open | Many                  | Zero                                                                                                                   |
