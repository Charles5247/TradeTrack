# Example: Database Prompts (Phase 2)

> Shows what Phase 2 prompts look like. Each prompt creates one feature's collections with full field definitions, security rules, and a required serialization round-trip test. Context: this is Finora (personal finance tracker), Phase 1 (scaffolding) is complete.

---

## [ ] [8] We're building the Finora users collection in Firestore — defining all 11 fields, composite indexes, security rules that enforce per-user isolation, and a round-trip serialization unit test.

**Collection design —** The `users` collection stores the Finora user profile. The document ID equals the Firebase Auth UID — not an auto-generated Firestore ID. This 1:1 mapping between `users/{uid}` and the Auth user is enforced by the Cloud Function that creates the document on sign-up (built in Phase 3). No user document is ever created by client code — always by the Cloud Function.

**Fields —** Every field has an exact type, whether it is required, its default value (where applicable), and whether it is immutable after creation:

- `id` (string, required, immutable) — equals the Firebase Auth UID. Stored redundantly for easier Firestore queries.
- `email` (string, required, immutable) — the Auth email. Max 254 characters. Never changed through Finora; users change email via Firebase Auth directly.
- `displayName` (string, required) — 1–50 characters. User can update via settings.
- `photoUrl` (string, optional) — Firebase Storage URL or external image URL. Nullable.
- `role` (string, required, immutable-by-client) — one of: `'user'` or `'admin'`. Default: `'user'`. Must only be updated by Admin SDK.
- `currency` (string, required) — ISO 4217 code, e.g. `'USD'`. Default: `'USD'`. User can update via settings.
- `locale` (string, required) — BCP 47 locale tag, e.g. `'en-US'`. Default: `'en-US'`.
- `onboardingCompleted` (boolean, required) — `false` until the user completes the onboarding flow. Default: `false`.
- `lastLoginAt` (timestamp, optional) — server-generated. Updated by the sign-in endpoint.
- `createdAt` (timestamp, required, immutable) — server-generated. Set once by the Cloud Function.
- `updatedAt` (timestamp, required) — server-generated. Updated by every write. Never from client.
- `isDeleted` (boolean, required) — soft-delete flag. Default: `false`. When `true`, the user is invisible to all app features but the Auth account still exists.

**Security rules rationale —** Users can only read and update their own document. They cannot update `role`, `createdAt`, `id`, or `email`. They cannot hard-delete their document (only soft-delete via the account deletion endpoint). Admins can read any user document but cannot bypass the immutable field rules.

## Instructions

**Firestore collection:** `users/{uid}` (uid = Firebase Auth UID)

**Full field table:**

| Field               | Type      | Required | Default      | Immutable        | Written by               |
| ------------------- | --------- | -------- | ------------ | ---------------- | ------------------------ |
| id                  | string    | yes      | (auth uid)   | yes              | Cloud Function only      |
| email               | string    | yes      | (auth email) | yes              | Cloud Function only      |
| displayName         | string    | yes      | (from auth)  | no               | client or Cloud Function |
| photoUrl            | string    | no       | null         | no               | client                   |
| role                | string    | yes      | 'user'       | client-immutable | Admin SDK only           |
| currency            | string    | yes      | 'USD'        | no               | client                   |
| locale              | string    | yes      | 'en-US'      | no               | client                   |
| onboardingCompleted | boolean   | yes      | false        | no               | client                   |
| lastLoginAt         | timestamp | no       | null         | no               | server only              |
| createdAt           | timestamp | yes      | (server now) | yes              | Cloud Function only      |
| updatedAt           | timestamp | yes      | (server now) | no               | server only              |
| isDeleted           | boolean   | yes      | false        | no               | server only              |

**Firestore security rules (add to `firestore.rules`):**

```
match /users/{uid} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow create: if false; // Cloud Function only
  allow update: if request.auth != null
                && request.auth.uid == uid
                && !('role' in request.resource.data.diff(resource.data).affectedKeys())
                && !('createdAt' in request.resource.data.diff(resource.data).affectedKeys())
                && !('id' in request.resource.data.diff(resource.data).affectedKeys())
                && !('email' in request.resource.data.diff(resource.data).affectedKeys());
  allow delete: if false; // soft-delete only via API
}
```

**TypeScript type (`lib/types/user.ts`):**

```typescript
export interface User {
  id: string;
  email: string;
  displayName: string;
  photoUrl: string | null;
  role: 'user' | 'admin';
  currency: string;
  locale: string;
  onboardingCompleted: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}
```

**Firestore converter (`lib/firebase/converters/user-converter.ts`):**

- `toFirestore(user: User)`: converts `lastLoginAt`, `createdAt`, `updatedAt` from `Date` to `Timestamp`
- `fromFirestore(snapshot)`: converts the three timestamp fields from `Timestamp` to `Date`

**Serialization unit test (`__tests__/converters/user-converter.test.ts`):**
Create a mock `User` object with all 12 fields populated (including a non-null `lastLoginAt` and a `createdAt` of `new Date('2024-01-15T10:00:00Z')`). Call `toFirestore()` → verify timestamps are Firestore `Timestamp` objects. Call `fromFirestore()` on the result → verify the reconstituted `User` is strictly equal to the original. This round-trip must pass.

## Verification

I'll verify this implementation automatically. I can:

- Run the serialization unit test: `npm test -- user-converter` — expect 1 test suite, 1 test, 0 failures.
- Attempt to write a document to `users/{uid}` from the Firestore emulator as an authenticated user — expect success.
- Attempt to read `users/{otherUid}` as a different authenticated user — expect `permission-denied`.
- Attempt to update the `role` field from client rules — expect `permission-denied`.
- Attempt to update `createdAt` from client rules — expect `permission-denied`.
- Attempt to `delete` a user document from client rules — expect `permission-denied`.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Open the Firebase Emulator UI at `localhost:4000/firestore` → create a document at `users/test-uid-1` with all required fields → verify no validation errors in the Emulator.
- From the Emulator security rules playground, simulate a read of `users/test-uid-1` as `test-uid-1` → expect ALLOW. Simulate the same read as `test-uid-2` → expect DENY.

Then give me your honest assessment of:

- Whether the security rule that checks `request.resource.data.diff(resource.data).affectedKeys()` correctly handles partial updates (PATCH operations that only send changed fields) — or whether it will incorrectly flag an update that legitimately doesn't include `role` as a violation.

---

## [ ] [9] We're building the transactions collection — defining all 16 fields, 4 composite indexes, security rules, the TypeScript type, and a round-trip serialization test.

**Collection design —** `transactions/{transactionId}` under the root collection (not nested under users). All transactions include a `userId` field that equals the creating user's Auth UID. Security rules enforce that every read and write query must filter by `userId == request.auth.uid` — this is enforced both in rules and in every query that touches this collection.

**Fields:**

- `id` (string, required, immutable) — Firestore auto-generated document ID, stored redundantly
- `userId` (string, required, immutable) — Auth UID of the owning user. Never updated.
- `type` (string, required) — one of: `'payment' | 'transfer' | 'deposit' | 'withdrawal' | 'refund'`
- `amount` (number, required) — positive integer in the smallest currency unit (e.g., cents for USD). Never negative. Never zero.
- `currency` (string, required) — ISO 4217 code. Max 3 characters.
- `description` (string, required) — 1–500 characters
- `counterparty` (string, optional) — merchant name, sender name, etc. Max 100 characters. Nullable.
- `status` (string, required) — one of: `'pending' | 'completed' | 'failed' | 'cancelled'`. Default: `'completed'`
- `categoryId` (string, optional) — Firestore document ID from the `categories` collection. Must belong to the same `userId`. Nullable.
- `tags` (array of strings, optional) — max 10 items, each max 30 characters. Default: `[]`
- `isBusinessExpense` (boolean, optional) — default `false`
- `receiptUrl` (string, optional) — Firebase Storage URL only. Nullable.
- `notes` (string, optional) — max 2000 characters. Nullable.
- `isDeleted` (boolean, required) — soft-delete flag. Default: `false`
- `createdAt` (timestamp, required, immutable) — server-generated
- `updatedAt` (timestamp, required) — server-generated on every write

**Composite indexes (add to `firestore.indexes.json`):**

1. `userId` ASC + `createdAt` DESC — for the default transaction list (filtered by user, sorted by date)
2. `userId` ASC + `type` ASC + `createdAt` DESC — for type-filtered lists
3. `userId` ASC + `status` ASC + `createdAt` DESC — for status-filtered lists
4. `userId` ASC + `categoryId` ASC + `createdAt` DESC — for category-filtered lists

## Instructions

**TypeScript type (`lib/types/transaction.ts`):**

```typescript
export type TransactionType = 'payment' | 'transfer' | 'deposit' | 'withdrawal' | 'refund';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  description: string;
  counterparty: string | null;
  status: TransactionStatus;
  categoryId: string | null;
  tags: string[];
  isBusinessExpense: boolean;
  receiptUrl: string | null;
  notes: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**Firestore security rules (add to the rules file):**

```
match /transactions/{transactionId} {
  allow read: if request.auth != null
              && request.auth.uid == resource.data.userId;
  allow create: if request.auth != null
                && request.auth.uid == request.resource.data.userId
                && request.resource.data.amount > 0
                && request.resource.data.currency.size() == 3;
  allow update: if request.auth != null
                && request.auth.uid == resource.data.userId
                && !('userId' in request.resource.data.diff(resource.data).affectedKeys())
                && !('createdAt' in request.resource.data.diff(resource.data).affectedKeys());
  allow delete: if false;
}
```

**Firestore converter (`lib/firebase/converters/transaction-converter.ts`):** Same pattern as the user converter. Convert `createdAt` and `updatedAt` between `Date` and Firestore `Timestamp`.

**Composite indexes** — add all 4 index definitions to `firestore.indexes.json`.

**Serialization test (`__tests__/converters/transaction-converter.test.ts`):** Create a `Transaction` object with all 16 fields populated. Run the round-trip (toFirestore → fromFirestore). Assert strict equality. Run a second test with `null` nullable fields (counterparty, categoryId, receiptUrl, notes) to verify nulls survive the round-trip.

## Verification

I'll verify this implementation automatically. I can:

- Run serialization tests: `npm test -- transaction-converter` — expect 2 tests (full object + null fields), 0 failures.
- Attempt to create a transaction with `amount: -50` from emulator client rules — expect `permission-denied`.
- Attempt to update `userId` on an existing transaction — expect `permission-denied`.
- Attempt to read another user's transaction (correct document ID, wrong auth user) — expect `permission-denied`.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Open Firebase Emulator → Firestore → create a `transactions` document with all required fields → verify it is created without error.
- In the security rules playground, simulate a read with `auth.uid == document.userId` → expect ALLOW. Change `auth.uid` to a different value → expect DENY.

Then give me your honest assessment of:

- Whether the collection-level security rules (vs. subcollection-per-user pattern) will cause performance issues at scale — specifically, whether Firestore can efficiently enforce the `userId` filter at the rules level without scanning all documents first.
