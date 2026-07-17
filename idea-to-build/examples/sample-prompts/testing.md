# Example: Testing Prompts (Phase 11)

> Shows what Phase 11 prompts look like. Testing infrastructure is built first — then unit, integration, and security tests follow. Context: Finora, Phases 1–10 complete.

---

## [ ] [187] We're setting up Finora's complete test infrastructure — Jest configuration, Firebase Emulator Suite integration, fake implementations, and factory helpers — so all subsequent test prompts have a consistent, isolated foundation.

**Why test infrastructure first —** Writing a unit test without a proper test setup leads to: mocking inconsistencies (each test mocks Firestore differently), test interdependency (tests pass only in a specific order), flaky tests (real Firebase calls in unit tests). The infrastructure defined here is the contract that all subsequent Phase 11 prompts follow — they import from `tests/helpers/` and trust that the setup is correct.

**Firebase Emulator Suite —** All tests that touch Firestore or Firebase Auth use the local emulator (not production Firebase). The emulator is started automatically before the test suite runs and stopped after. Each test suite gets a fresh Firestore state by clearing all emulator data in `beforeEach`. This prevents test pollution.

**Fake implementations vs mocks —** For unit tests of services (like `TransactionService`), use a fake in-memory Firestore implementation (`@firebase/rules-unit-testing`) rather than mocking each Firestore call individually. Fakes behave like the real system and catch bugs that per-call mocks miss.

**Test helpers —** All test files import from `tests/helpers/` — never define test utilities inline in a test file. This ensures consistency and makes tests readable: `const user = await createTestUser()` is immediately understandable.

## Instructions

**Install test dependencies:**

```bash
npm install -D jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event ts-jest @firebase/rules-unit-testing firebase-admin
```

**Install Firebase Emulator:** `npm install -D firebase-tools` then run `firebase init emulators` — select Auth and Firestore emulators. Set ports: Auth: 9099, Firestore: 8080.

**`jest.config.ts —`** Use `ts-jest` preset, `node` environment, `setupFilesAfterFramework: ['<rootDir>/tests/setup.ts']`, `moduleNameMapper` mapping `@/*` to `<rootDir>/*`, `testMatch` covering `tests/**/*.test.ts` and `tests/**/*.test.tsx`. Coverage: collect from `lib/**/*.ts` and `app/api/**/*.ts`, exclude `*.d.ts`. Coverage thresholds: 80% lines, 70% branches, 80% functions.

**`tests/setup.ts —`** Imports `@testing-library/jest-dom` for matcher extensions. In a `beforeAll` block, connects the Firebase client SDK's Firestore and Auth instances to the local emulators using `connectFirestoreEmulator(db, 'localhost', 8080)` and `connectAuthEmulator(auth, 'http://localhost:9099')`. Imports `firebaseApp` from `lib/firebase/client.ts` (built in [2]) to get the initialised instances.

**`tests/helpers/db.ts —`**

- `getTestEnvironment()` — lazily initialises and returns a `RulesTestEnvironment` pointed at the local Firestore emulator, reading the rules from `firestore.rules`.
- `createTestUser(overrides?)` — creates a `User` document in the emulator with security rules bypassed, using `env.withSecurityRulesDisabled()`. Returns the created `User` object.
- `createTestTransaction(uid, overrides?)` — same pattern for a `Transaction`.
- `clearEmulatorData()` — calls `env.clearFirestore()` to reset state between tests.

**`tests/helpers/auth.ts —`** Exports `getAuthenticatedContext(uid: string)` which calls `testEnv.authenticatedContext(uid)` and returns the result. Exports `getUnauthenticatedContext()` which calls `testEnv.unauthenticatedContext()` and returns the result. These are thin wrappers — callers use them to obtain Firestore instances for security rule tests.

**`package.json` test scripts:**

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --testPathPattern='tests/unit'",
    "test:integration": "jest --testPathPattern='tests/integration'",
    "test:security": "jest --testPathPattern='tests/security'",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch"
  }
}
```

## Verification

I'll verify this implementation automatically. I can:

- Run `npm test` — expect Jest to start, connect to emulators, and exit with 0 failures (no test files yet, but 0 failures).
- Run `npm run test:coverage` — expect the coverage report to be generated without errors.
- Import `createTestUser` in a test file — call it — expect a `User` object with the default values.
- Import `getAuthenticatedContext('uid-1')` — expect a Firestore context that behaves as if `auth.uid === 'uid-1'`.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Start the Firebase Emulators: `firebase emulators:start` → verify Auth runs on port 9099 and Firestore on port 8080 in the terminal.
- Run `npm test` with emulators running → expect all tests to pass (or "No tests found" if no test files yet).

Then give me your honest assessment of:

- Whether connecting to the Firebase Emulator in `tests/setup.ts` using `beforeAll` (runs once) is safe when multiple test files run in parallel — or whether each test file needs its own connection setup to avoid port conflicts.

---

## [ ] [188] We're writing Firestore security rule tests that verify every blocked and allowed operation in the Finora data model — ensuring users can never access, modify, or delete each other's data.

**Why these tests are critical —** Firestore security rules are easy to get wrong silently. A missing condition allows unauthorized access. A typo in a field name bypasses a check. These tests run the actual rules (loaded from `firestore.rules`) against the actual emulator — they catch bugs that code review misses.

**Testing philosophy —** Every test must assert BOTH the allowed operation (it succeeds) AND the blocked operation (it fails with `permission-denied`). Testing only the allowed case gives false confidence. Testing only the blocked case doesn't prove legitimate users can access their own data.

## Instructions

**File:** `tests/security/firestore-rules.test.ts`

**`tests/security/firestore-rules.test.ts — required test cases:`**
Use a `beforeEach(clearEmulatorData)` call to reset state. Required test cases:

1. "user can read their own document" — create User A via `createTestUser`, attempt `getDoc` on `users/userA.id` in `getAuthenticatedContext(userA.id)` — `assertSucceeds`.
2. "user cannot read another user's document" — create User A and B, attempt `getDoc` on `users/userA.id` in context of B — `assertFails`.
3. "unauthenticated user cannot read any user document" — create User A, attempt `getDoc` in `getUnauthenticatedContext()` context — `assertFails`.
4. "user cannot update the role field" — create User A, attempt `updateDoc` with `{ role: 'admin' }` as own user — `assertFails`.
5. "user can update allowed fields (displayName, currency)" — create User A, attempt `updateDoc` with `{ displayName: 'New Name' }` as own user — `assertSucceeds`.
6. "user cannot delete their document" — create User A, attempt `deleteDoc` as own user — `assertFails`.
7. "client cannot create a user document directly" — attempt `setDoc` from authenticated context `getAuthenticatedContext('any-uid')` with any user fields — `assertFails`.
8. "user can read their own transactions" — create transaction for User A, `getDoc` in context of User A — `assertSucceeds`.
9. "user cannot read another user's transaction" — create transaction for User A, read in context of User B — `assertFails`.
10. "user cannot update userId on a transaction" — create transaction for User A, `updateDoc` with `{ userId: 'other-uid' }` in context of User A — `assertFails`.
11. "user cannot hard-delete a transaction" — create transaction for User A, `deleteDoc` in context of User A — `assertFails`.
12. "user cannot create a transaction with a different userId" — attempt `setDoc` from authenticated context `getAuthenticatedContext('uid-1')` with `userId: 'uid-2'` — `assertFails`.

## Verification

I'll verify this implementation automatically. I can:

- Run `npm run test:security` — expect all tests to pass.
- Introduce a deliberate bug in `firestore.rules` (comment out the `userId` check in the transactions read rule) → rerun tests → expect at least the "user cannot read another user's transaction" test to fail — proving the tests catch rule regressions.
- Restore the rules → rerun → expect all tests to pass again.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Run `npm run test:security` → verify the output shows all test names, "PASS" status, and 0 failures.
- Temporarily delete the `role` update restriction from `firestore.rules` → rerun → verify the "cannot update role" test fails — confirming the test is meaningfully testing the rule, not just passing trivially.

Then give me your honest assessment of:

- Whether this test suite covers all the security rule scenarios in `firestore.rules`, or whether there are edge cases (such as batch writes, transactions using `getAfter()`, or Admin SDK bypass scenarios) that these tests do not and cannot cover.
