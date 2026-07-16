# Example: Backend Feature Prompts (Phase 4)

> Shows what Phase 4 prompts look like. Each prompt builds one endpoint group or one service. Security requirements are explicit in every prompt — never implied. Context: Finora (Next.js + Firebase). Phases 1–3 complete.

---

## [ ] [42] We're building the GET /api/transactions endpoint that returns the authenticated user's transactions with cursor-based pagination and multi-field filtering.

**What this endpoint does —** Returns a paginated list of transactions belonging to the authenticated user. The `userId` filter is always hardcoded to `request.auth.uid` derived from the session cookie — it is never taken from query parameters. A user can never retrieve another user's transactions, regardless of what they pass in the URL.

**Query parameters —** All are optional:

- `limit` — integer, default `20`, max `100`. Clamped silently (never error on out-of-range limit).
- `cursor` — the Firestore document ID of the last item in the previous page. When provided, the query starts after this document.
- `type` — one of `payment | transfer | deposit | withdrawal | refund`. Filters by transaction type.
- `status` — one of `pending | completed | failed | cancelled`.
- `categoryId` — a Firestore category document ID. Filters to transactions in this category.
- `dateFrom` — ISO 8601 date string. Returns transactions with `createdAt >= dateFrom`.
- `dateTo` — ISO 8601 date string. Returns transactions with `createdAt <= dateTo`.
- `search` — a string. For MVP: client-side filtering on `description` (contains, case-insensitive). This limitation is documented in the response metadata.

**Pagination response —** Returns: `{ items: Transaction[], nextCursor: string | null, hasMore: boolean }`. Does NOT return a total count — it is too expensive for Firestore. `nextCursor` is the `id` of the last item in `items`, or `null` if this is the last page.

**Known limitation —** Firestore does not support full-text search. For MVP, `search` queries are performed client-side against the returned page. The response includes `{ meta: { searchMode: 'client-side', searchLimitation: 'Search only applies to the current page of results' } }` when a search query is present. This is documented so the executing agent does not attempt to implement a workaround.

## Instructions

**File:** `app/api/transactions/route.ts`

**Query param schema (`lib/validators/transaction.ts`):**

```typescript
export const listTransactionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  type: z.enum(['payment', 'transfer', 'deposit', 'withdrawal', 'refund']).optional(),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']).optional(),
  categoryId: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  search: z.string().max(100).optional(),
});
```

**Processing order:**

1. Verify session cookie from `request.cookies.get('session')`. If missing or invalid: return 401 with `{ code: 'UNAUTHORIZED', message: 'You must be signed in to access your transactions.' }`.
2. Extract `uid` from the verified session. Never trust a `userId` from query params.
3. Parse query params with `listTransactionsSchema`. On error: return 400.
4. Build Firestore query starting from `adminFirestore.collection('transactions').where('userId', '==', uid).where('isDeleted', '==', false)`.
5. Apply optional filters: add `.where('type', '==', type)` if type present. Same for `status`, `categoryId`, `dateFrom` (`.where('createdAt', '>=', Timestamp.fromDate(new Date(dateFrom)))`), `dateTo`.
6. Always apply: `.orderBy('createdAt', 'desc').limit(limit + 1)` (fetch one extra to determine `hasMore`).
7. If `cursor` present: get the cursor document (`adminFirestore.collection('transactions').doc(cursor).get()`) and apply `.startAfter(cursorDoc)`.
8. Execute query. If result has `limit + 1` items, set `hasMore = true` and slice to `limit` items. Otherwise `hasMore = false`.
9. Set `nextCursor = hasMore ? items[items.length - 1].id : null`.
10. Return 200 with `{ items, nextCursor, hasMore, meta: search ? { searchMode: 'client-side', searchLimitation: '...' } : undefined }`.

**If Next.js:** Use `request.nextUrl.searchParams` to read query params. Use `adminFirestore` from `lib/firebase/admin.ts`. The cursor document fetch (step 7) requires a separate Firestore read — this is unavoidable with cursor pagination.

## Verification

I'll verify this implementation automatically. I can:

- GET `/api/transactions` without a session cookie → expect 401 with code `UNAUTHORIZED`.
- GET `/api/transactions` with a valid session cookie → expect 200 with `items` array and `hasMore` boolean.
- GET `/api/transactions?limit=3` with 5 transactions in the database → expect 3 items, `hasMore: true`, and a non-null `nextCursor`.
- GET `/api/transactions?cursor={nextCursor}` from the previous request → expect the next 2 items and `hasMore: false`.
- GET `/api/transactions?type=payment` → expect only transactions with `type === 'payment'`.
- GET `/api/transactions?userId={otherUsersId}` — note this param is ignored — expect only the authenticated user's transactions, never the other user's.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Sign in as User A, GET `/api/transactions` → expect User A's transactions only.
- Sign in as User B, GET `/api/transactions` → expect User B's transactions (different set) — never User A's.
- GET `/api/transactions?limit=5&type=payment&dateFrom=2024-01-01T00:00:00Z` → expect only payment transactions from 2024, max 5 per page.

Then give me your honest assessment of:

- Whether cursor-based pagination correctly handles the edge case where the cursor document was soft-deleted between the first and second page request — and whether the query will skip the deleted document gracefully or produce an error.

---

## [ ] [43] We're building the transactionService that encapsulates all business logic for creating, updating, and soft-deleting transactions — keeping the API route handlers thin.

**Why a service layer —** The API route handlers (GET, POST, PATCH, DELETE) should contain only: session verification, input parsing, calling the service, and returning the response. All business logic — category ownership verification, atomic counter updates, validation rules that go beyond Zod — belongs in `TransactionService`. This separation makes the service independently testable without mounting the Next.js server.

**createTransaction logic —** Steps in order: (1) Verify `categoryId` belongs to the requesting user (if provided — a user cannot use another user's category). (2) Create the transaction document with `adminFirestore.collection('transactions').add(...)` — let Firestore generate the ID. (3) In the same Firestore batch or transaction, increment the `monthlySummary/{userId}_{YYYY-MM}` counter document's `totalAmount` and `transactionCount` fields for the transaction's month. (4) Return the created transaction with its generated `id`.

**updateTransaction logic —** Verify the transaction exists and belongs to the user. Apply only the changed fields. Never allow updates to: `userId`, `createdAt`, `id`. Always update `updatedAt` to server timestamp.

**softDeleteTransaction logic —** Set `isDeleted: true` and `updatedAt: serverTimestamp()`. Decrement the `monthlySummary` counters for the transaction's original amount and month.

## Instructions

**File:** `lib/services/transaction-service.ts`

**Class: `TransactionService`** with static methods (no instantiation needed):

- `static async createTransaction(uid: string, data: CreateTransactionDto): Promise<Transaction>`
- `static async updateTransaction(uid: string, transactionId: string, data: UpdateTransactionDto): Promise<Transaction>`
- `static async softDeleteTransaction(uid: string, transactionId: string): Promise<void>`

**`createTransaction` implementation:**

1. If `data.categoryId` provided: fetch `categories/{data.categoryId}`. If not found or `userId !== uid`: throw `AppError` with code `NOT_FOUND` and message `'Category not found.'`.
2. Construct the transaction object: spread `data`, add `userId: uid`, `createdAt: FieldValue.serverTimestamp()`, `updatedAt: FieldValue.serverTimestamp()`, `isDeleted: false`.
3. Use `adminFirestore.runTransaction(async (t) => { ... })` to atomically: (a) add the transaction document, (b) upsert (set with merge) the `monthlySummaries/{uid}_${YYYY-MM}` document, incrementing `totalAmount` by `data.amount` and `transactionCount` by 1.
4. Fetch the created document (to get the server-generated timestamps) and return it as a `Transaction` object using the transaction converter.

**`UpdateTransactionDto`** — same fields as `Transaction` minus: `id`, `userId`, `createdAt`, `isDeleted`. All fields optional.

**File:** `app/api/transactions/route.ts` — add `POST` handler that: verifies session, parses body with `createTransactionSchema`, calls `TransactionService.createTransaction(uid, data)`, returns 201.

**`createTransactionSchema`** — define in `lib/validators/transaction.ts`:

- `type`: required, enum
- `amount`: required, positive integer
- `currency`: required, 3-character ISO 4217 code
- `description`: required, 1–500 chars
- `counterparty`: optional string, max 100 chars
- `status`: optional, enum, default `'completed'`
- `categoryId`: optional string
- `tags`: optional array, max 10 items each max 30 chars
- `isBusinessExpense`: optional boolean, default `false`
- `receiptUrl`: optional string, must start with `https://firebasestorage.googleapis.com`

## Verification

I'll verify this implementation automatically. I can:

- POST `/api/transactions` with valid data → expect 201 with the created transaction including a Firestore-generated `id`.
- POST `/api/transactions` with `categoryId` belonging to a different user → expect 404 with message `'Category not found.'`
- POST `/api/transactions` with `amount: -100` → expect 400 validation error.
- POST `/api/transactions` with `amount: 5000` for June 2024 → then GET `monthlySummaries/{uid}_2024-06` → expect `totalAmount` to have increased by 5000 and `transactionCount` by 1.
- POST `/api/transactions` → DELETE (soft) → GET `monthlySummaries` counter → expect counter to have decreased.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- In Finora, create a new transaction → expect it to appear at the top of the transactions list immediately.
- Create a transaction with an invalid `receiptUrl` (not a Firebase Storage URL) → expect 400 validation error.

Then give me your honest assessment of:

- Whether using `adminFirestore.runTransaction()` for the counter update correctly handles the case where two transactions are created simultaneously by the same user — and whether Firestore transactions provide sufficient isolation to prevent double-counting.
