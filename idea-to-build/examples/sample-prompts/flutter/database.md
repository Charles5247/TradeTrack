# Example: Flutter Database Prompts (Phase 2)

> Flutter-specific Phase 2 prompts. Data models use `freezed` for immutability and serialization. Security rules are identical to the web version (Cloud Firestore is the same service). Context: Finora Flutter, Phase 1 (scaffolding) complete.
>
> **Package versions used in these examples:**
>
> ```
> cloud_firestore: ^4.17.0
> firebase_auth: ^4.20.0
> firebase_core: ^2.32.0
> freezed: ^2.5.2
> freezed_annotation: ^2.4.3
> json_serializable: ^6.8.0
> build_runner: ^2.4.9
> ```
>
> Verify these are still current at [pub.dev](https://pub.dev) before use.

---

## [ ] [8] We're building the Transaction data model for Finora Flutter — a freezed class with all 16 fields, Firestore serialization, and a round-trip unit test.

**Why freezed —** Dart lacks built-in value semantics. `freezed` generates: `copyWith` (for immutable updates), `==` and `hashCode` (for equality), `toString` (for debugging), and `fromJson`/`toJson` via `json_serializable`. This eliminates an entire class of mutation bugs. All data models in Finora Flutter use `freezed` — no exceptions.

**Transaction class fields —** The class must have exactly 16 fields matching the Firestore schema defined in the web version's [9]: `id`, `userId`, `type` (TransactionType enum), `amount` (int — smallest currency unit), `currency` (String), `description` (String), `counterparty` (String?), `status` (TransactionStatus enum), `categoryId` (String?), `tags` (List<String>), `isBusinessExpense` (bool), `receiptUrl` (String?), `notes` (String?), `isDeleted` (bool), `createdAt` (DateTime), `updatedAt` (DateTime).

**Enums —** `TransactionType` has values: `payment`, `transfer`, `deposit`, `withdrawal`, `refund`. `TransactionStatus` has values: `pending`, `completed`, `failed`, `cancelled`. Both enums serialize to/from their lowercase string names in Firestore.

**Firestore converter —** A typed `withConverter` on the `transactions` CollectionReference converts `Timestamp` fields (createdAt, updatedAt) to/from Dart `DateTime`. It also converts `TransactionType` and `TransactionStatus` from their Firestore string representations to their enum values.

**Round-trip test —** Create a `Transaction` instance with all 16 fields set (non-null values for all nullable fields). Serialize to a Firestore map via the converter's `toFirestore` method. Deserialize back via `fromFirestore`. Assert that the original and deserialized objects are equal (using `freezed`-generated `==`). Run a second test with all nullable fields set to `null`.

## Instructions

**Files to create:**

- `lib/features/transactions/models/transaction.dart` — the `@freezed` class
- `lib/features/transactions/models/transaction.g.dart` — generated, do not edit
- `lib/features/transactions/models/transaction_type.dart` — `TransactionType` enum with `@JsonValue` annotations
- `lib/features/transactions/models/transaction_status.dart` — `TransactionStatus` enum with `@JsonValue` annotations
- `lib/features/transactions/repositories/transaction_converter.dart` — the typed Firestore converter
- `test/features/transactions/models/transaction_test.dart` — round-trip tests

**`pubspec.yaml` additions (dev_dependencies):**
Add: `freezed`, `build_runner`, `json_serializable` under `dev_dependencies`. Add `freezed_annotation` under `dependencies`.

**freezed class structure —**
The class is annotated with `@freezed`. It has a single factory constructor named `Transaction` with all 16 fields as named required/optional parameters. Nullable fields use `String?`, `DateTime?` etc. Lists use `List<String>` with a default of `const []` (use the `@Default([])` annotation). Booleans with defaults use `@Default(false)`.

**Enum serialization —**
Each enum value is annotated with `@JsonValue('payment')` (etc.) so `json_serializable` maps the enum to/from the Firestore string representation. Do not use `.name` or `.toString()` for serialization — those produce capitalized strings that don't match the Firestore values.

**Firestore converter —**
Create an extension on `CollectionReference<Map<String, dynamic>>` named `withTransactionConverter`. The `toFirestore` function converts `DateTime` fields to `Timestamp.fromDate()`. The `fromFirestore` function converts `Timestamp` fields to `.toDate()` on each DateTime field.

**Code generation —**
After creating the model file, run: `dart run build_runner build --delete-conflicting-outputs`. The generated `.g.dart` file must be committed to the repository (it is a build artifact, not a generated file that should be gitignored).

**Round-trip test —**
The test file imports `Transaction`, the converter, and `package:flutter_test/flutter_test.dart`. It does NOT use a real Firestore instance — it tests only the serialization logic. The `toFirestore` method is called directly with a mock `SetOptions` argument. The deserialized result is compared with `==`.

## Verification

I'll verify this implementation automatically. I can:

- Run `flutter test test/features/transactions/models/` — expect 2 tests, 0 failures.
- Run `dart run build_runner build` — expect no errors and the `.g.dart` file to be generated.
- Check that the generated `fromJson`/`toJson` methods handle the `TransactionType.payment` enum as the string `"payment"` — not `"TransactionType.payment"`.
- Verify the `@Default([])` annotation generates a `const []` default (not a mutable list).
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Create a Transaction in the Firestore Emulator → fetch it in the Flutter app using the typed converter → print the resulting `Transaction` object → verify all fields are populated correctly.

Then give me your honest assessment of:

- Whether running `build_runner` every time a model changes is fast enough for a development workflow — and whether there is a `watch` mode that automatically regenerates on file changes.

---

## [ ] [9] We're building the TransactionRepository for Finora Flutter — the data access layer that handles all Firestore reads and writes with per-user data isolation.

**Repository pattern —** The repository is the only place in the app that touches Firestore directly. Widgets and providers never import `cloud_firestore`. This makes the data layer independently testable (swap the real implementation for a fake in tests), and makes future backend migrations (e.g., Firestore → REST API) a single-file change.

**Data isolation enforcement —** Every query includes `.where('userId', isEqualTo: uid)` as the first filter. There is no method on this repository that queries without a userId constraint. The `uid` is provided to the repository via its constructor — it is never read from a request parameter or passed as a method argument (which would allow callers to query other users' data).

**Pagination —** Cursor-based pagination using `DocumentSnapshot` as the cursor (not an integer page number). The `getTransactions` method accepts an optional `lastDocument` argument. When provided, the query starts after that document. Returns a `TransactionPage` value object containing `items`, `hasMore`, and `nextCursor` (the last `DocumentSnapshot` in the returned list, or null if there are no more pages).

**Offline persistence —** Firestore's offline persistence is enabled by default in the Flutter SDK. No additional configuration is needed for the repository to work offline — Firestore returns cached data automatically. When offline, mutations (create, update, delete) are queued and applied when connectivity is restored.

**Error mapping —** All `FirebaseException` errors thrown by Firestore are caught and re-thrown as domain-specific errors. The domain error hierarchy: `TransactionError` (abstract base) → `TransactionNotFoundError`, `TransactionPermissionError`, `TransactionNetworkError`, `TransactionUnknownError`. Domain errors include the original `FirebaseException` as a `cause` field for logging.

## Instructions

**Files to create:**

- `lib/features/transactions/repositories/transaction_repository.dart` — abstract class defining the interface
- `lib/features/transactions/repositories/firestore_transaction_repository.dart` — the Firestore implementation
- `lib/features/transactions/models/transaction_page.dart` — a simple value class with `items`, `hasMore`, `nextCursor` fields
- `lib/features/transactions/models/transaction_errors.dart` — the domain error hierarchy
- `lib/features/transactions/providers/transaction_repository_provider.dart` — Riverpod provider

**Abstract repository interface —**
`TransactionRepository` is an abstract class with methods:

- `Future<TransactionPage> getTransactions({ TransactionFilters? filters, DocumentSnapshot? lastDocument, int limit = 20 })`
- `Future<Transaction?> getTransaction(String transactionId)`
- `Future<Transaction> createTransaction(CreateTransactionInput input)`
- `Future<Transaction> updateTransaction(String transactionId, UpdateTransactionInput input)`
- `Future<void> softDeleteTransaction(String transactionId)`

**`FirestoreTransactionRepository` constructor —**
Accepts `Firestore firestore` and `String uid`. The `uid` is stored as an instance variable and used in every query. It is not a method parameter.

**`getTransactions` implementation steps —**

1. Build a base query: `firestore.collection('transactions').withTransactionConverter().where('userId', isEqualTo: uid).where('isDeleted', isEqualTo: false)`.
2. Apply each filter from the `filters` object if present (type, status, categoryId, dateFrom, dateTo).
3. Apply `.orderBy('createdAt', descending: true).limit(limit + 1)`.
4. If `lastDocument` is provided, apply `.startAfterDocument(lastDocument)`.
5. Execute with `.get()`.
6. If result has more than `limit` documents, set `hasMore = true` and trim to `limit`. Otherwise `hasMore = false`.
7. Set `nextCursor` to the last `QueryDocumentSnapshot` in the trimmed list, or null.

**Error mapping —**
Wrap every Firestore call in a `try/catch (FirebaseException e)`. Map `e.code` to the domain error:

- `'permission-denied'` → `TransactionPermissionError`
- `'not-found'` → `TransactionNotFoundError`
- `'unavailable'`, `'network-request-failed'` → `TransactionNetworkError`
- all others → `TransactionUnknownError`

**Riverpod provider —**
Declare a `transactionRepositoryProvider` as a `Provider<TransactionRepository>` that reads `firestoreProvider` and `currentUserIdProvider` from other providers and constructs a `FirestoreTransactionRepository`.

## Verification

I'll verify this implementation automatically. I can:

- Call `getTransactions()` for User A → verify all returned transactions have `userId == userA.uid`.
- Call `getTransactions()` with `lastDocument` from the first page → verify the second page starts after the correct cursor.
- Call `getTransaction('nonexistent-id')` → verify it returns `null` (not throws).
- Mock a Firestore `permission-denied` error → verify `TransactionPermissionError` is thrown, not the raw `FirebaseException`.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Enable airplane mode on the test device → navigate to the transactions list → verify cached transactions still appear.
- Disable airplane mode → verify the list refreshes automatically when connectivity is restored.

Then give me your honest assessment of:

- Whether injecting `uid` into the repository constructor (rather than reading it from `FirebaseAuth.instance.currentUser` inside each method) creates a staleness problem when the user signs out and signs back in as a different user — and whether Riverpod's `ref.watch` on `currentUserIdProvider` invalidates the repository correctly.
