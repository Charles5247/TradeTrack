# M0 implementation checkpoint

Updated 21 October 2026. Status: **isolated implementation gate passed; production release blocked.**

24 October update: the final broad M0/M1 run executed 385 passing tests but had ten worker-start errors. All ten missing files subsequently passed in a focused one-thread run (41 tests). The disjoint reports cover 426 tests; they are not a single aggregate green run. See `build-evidence/m1/verification-index.json`. Newer origin/main changes require integration verification before PR completion.

## Current implementation and evidence

This section supersedes the first-batch notes below. No hosted migration, deployment, credential rotation, business-data repair, commit or push has been performed. Local branch: `feat/m0-stock-integrity`. M1 may start only after the isolated M0 gate passes; production release remains a separate, blocked decision.

- Atomic PostgreSQL checkout commits the receipt, every line, stock decrements, authoritative ledger/audit and replay result together. Active actor, tenant, location, entitlement, price/arithmetic and positive integer quantity checks run inside the command. Duplicate requests return the committed result; changed payloads and ambiguous legacy ledger evidence fail closed.
- POS and inventory pages provide account-isolated saved-receipt recovery with original lines and an explicit reconciliation reason. Legacy partially uploaded receipts reconcile once where stock evidence is dependable. Reversed or ambiguous receipts are held without guessing. New command records never fall back to the legacy split-write transport.
- Manual stock adjustments use one durable local command and one idempotent server delta, including explicit retry after response loss. Quantity changes are locked increments/decrements, with no clamp to zero.
- Warehouse transfers now use `complete_warehouse_transfer`: source and destination stock and final status commit together. Stable lock order, tenant/location checks, insufficient-stock rejection, duplicate receipt/cancellation and checkout concurrency are covered. Clients cannot directly update/delete transfer records. Existing pending transfers retain a null command version and require explicit reconciliation: the old writer may have left partial stock effects. Their evidence is preserved.
- Active-account restrictions cover existing RLS tables; legacy summary views invoke underlying RLS. Forged audit writes, legacy sync-queue access and browser invoice/webhook writes are revoked. Composite foreign keys reject new cross-tenant links while preserving historical violations for an approved audit.
- Account revisions isolate carts, queries, drafts, outboxes and late network replies across logout and A→B→A changes. Offline remembered access retains the existing 30-day window, requires an active cached profile and does not extend its last online verification time while offline. Disconnected devices cannot learn a new suspension until reconnecting.
- SheetJS uses the patched publisher distribution. Parsing runs in a browser worker with a timeout, explicit 20 MiB file/20,000-row limits, central-directory checks and measured decompressed-byte limits. Overflow is rejected rather than truncated. This remains the existing first-sheet importer; complete selected-sheet intake belongs to M2.
- `.env.local` is removed from the Git index while the local file is preserved. A filename-only CI guard rejects tracked private environment files. This does not revoke exposed credentials or remove repository history. The owner reported the rotation status as unknown; it remains a production release blocker.

### Verification

| Check | Result and practical limit |
| --- | --- |
| Production build | Final combined M0/M1 build passed on installed Next.js 16.2.12, including TypeScript and 50 pages. Both public feature paths were enabled only in the build command's environment; repository defaults remain false. `build-evidence/m1/build.log`. Existing middleware deprecation warning remains. |
| Real PostgreSQL 18.1 | 13 acceptance groups passed, including populated upgrade, actual concurrent connections, row-lock contention, retries, reversal guard, tenant/role checks, legacy recovery, adjustment and transfer atomicity. `build-evidence/m0/postgres-result.json`. Uses synthetic data and authenticated SQL roles, not hosted JWT issuance. |
| Browser through actual components and PostgreSQL | 15 checks passed on synthetic loopback data: saved receipts survive reload, keyboard review, response loss/retry, mobile/desktop overflow, account switching, offline adjustment, compressed XLSX and worker limits. 20,000 CSV rows prepared in 3,306 ms with 213 UI heartbeats on the final run. 20,001 rejected explicitly. `build-evidence/m0/browser-result.json` and screenshots retained. This is a narrow browser demonstration, not a complete accessibility or supported-device certification. |
| Full Vitest suite | 411/413 tests passed. Two failures were in offline backlog timing/setup; the isolated rerun is recorded separately. Do not describe this aggregate run as passing. Raw report: `build-evidence/m0/vitest-result.json`. |
| Final isolated backlog rerun | Five tests passed, retaining the 300 ms checkout assertion. Direct `node node_modules/vitest/vitest.mjs run src/lib/offline/__tests__/sales-offline.test.ts --maxWorkers=1 --testTimeout=30000 --hookTimeout=60000 --reporter=default --reporter=json --outputFile.json=build-evidence/m0/offline-backlog-result.json`. Earlier attempts timed out starting the worker and ran zero tests; those are failures, not passes. |
| Final typecheck / scoped lint / tracked-env guard | All passed after the transfer/UI changes. Lint scope: transfer page, checkout recovery, PostgreSQL verifier and browser actions. `git diff --check` passed with line-ending notices only. |

The isolated target uses synthetic accounts and no exposed application credentials. F01's owner-confirmed credential disposition and hosted parity remain production gates; they do not certify or prevent the already-authorized next local milestone. M1 starts after this isolated gate, as requested on 21 October. This is not an assertion that production is safe to release.

Overlapping test runs are not additive coverage counts. Earlier focused tests below are historical evidence only.

### Release and recovery requirements

1. Security/infrastructure owner must confirm exposed-key revocation/rotation and replacement verification, assess history exposure and choose any history-cleanup procedure. No secret values are needed in this document.
2. Database owner must verify hosted schema/grants/RLS and audit historical composite-FK violations before validation. No automatic historical repair is included.
3. Coordinate a maintenance/version rollout: pause old clients' stock writes and synchronization before applying these migrations, deploy compatible clients, verify pending queues and then resume. Old tabs can still contain unsafe snapshot writers; a feature flag alone cannot make them safe. RPC migrations must exist before compatible clients use them. `NEXT_PUBLIC_ATOMIC_CHECKOUT_ENABLED` and the private checkout setting remain false by default. Manual adjustment and transfer fixes require their corresponding migrations. Hosted version enforcement and this rollout procedure require owner verification before release.
4. Preserve queued operations and evidence. Disabling checkout does not authorize an old generic client to replay new command records. Do not roll back to the unsafe transfer writer, parser or snapshot sync. Old pending transfers require a reviewed stock reconciliation before finalization.
5. Representative merchant fixtures, real hosted authorization and deployment verification remain release evidence. Synthetic SQL roles establish isolated behavior, not production account/session parity.

Reproduction and PR scope are recorded in [M0 local verification](M0_LOCAL_VERIFICATION.md).

## Historical first-batch record (19 October)

This records the first implementation batch under [the milestones](AI_AND_BI_MILESTONES.md). It is not evidence that stock intake, AI preparation or Retail BI has shipped. M1 has not started. No hosted migration, deployment, production data repair or credential rotation was performed.

## Implemented locally

- `src/lib/offline/sales.ts`: one IndexedDB transaction commits the sale, lines, inventory and outbox together. Invalid/insufficient quantities abort everything. Each sale has a distinct transactionally allocated timestamp and its own stock operation; repeated product/location lines are aggregated within that sale.
- `src/lib/offline/db.ts`: sale stock operations retain their predecessor relationship and exact expected server version. Unknown stock successors are preserved. Vendor coalescing cannot overwrite a POS operation or untrusted legacy evidence. Queue pruning carries confirmed versions to successors and can use the originating account's database handle.
- `src/lib/offline/sync-engine.ts`: sale and line prerequisites precede stock dispatch. Stock updates compare the exact server version and include the sale timestamp required by cashier guards. Conflicts, ambiguous acknowledgments and interrupted stock writes are held for review. Interrupted idempotent inserts can resume. Pulls preserve unresolved stock. Suspended accounts cannot flush queues. Sync uses the originating database handle and checks for account changes before dispatch.
- `src/store/index.ts`, `src/lib/auth/account-state.ts`: cart and organization settings use tenant/account keys. Switching accounts clears visible cart, notification and sync state, then restores only that account's draft. Unowned legacy localStorage records and unsynced IndexedDB work are preserved.
- Auth, organization and query providers: active profiles only, revision checks for late authentication responses, guarded organization settings, and a separate QueryClient per account/role/status. Auth event callbacks return synchronously while profile work runs asynchronously.
- `src/lib/imports/parse.ts`: reject empty, oversized, invalid binary/format and over-limit worksheets explicitly. Preserve numeric zero and supported CSV/XLSX values. This remains the existing first-sheet import path; complete selected-sheet intake belongs to M2.
- SheetJS is pinned to the publisher's `xlsx-0.20.3.tgz` distribution. The earlier npm 0.18.5 distribution is removed from the lockfile. See [publisher installation guidance](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) and [the ReDoS advisory](https://cdn.sheetjs.com/advisories/CVE-2024-22363).
- `supabase/migrations/20261019123240_m0_stock_access_guards.sql`: active-account authorization helpers, composite tenant constraints for inventory/sales relationships, and a sale-line product/location guard. Existing grant identities are preserved. `NOT VALID` constraints enforce new writes while historical violations await a measured audit and explicit repair.

## Verification record

The interrupted session's process handles were no longer available on continuation; those unknown final results are not counted as passes. Initial implementation evidence included 37 focused stock tests passing. That result predates the latest recovery/account changes.

Current continuation results before the final verification pass:

| Check | Observed result |
| --- | --- |
| `npm run typecheck` | Passed |
| Seven focused intake/account/sync suites, one worker | Six suites / 44 tests passed; account-store worker startup timed out. Overall command failed; not a clean aggregate pass. |
| Account store, POS stock integrity and sync authentication rerun outside sandbox | Three suites / 24 tests passed, including simultaneous checkouts and suspended-account sync |
| Full-migration PGlite accounting suite | 22 tests passed, including inactive-account RLS and cross-tenant inventory constraints |
| Scoped ESLint | Initially blocked by the pre-existing `eslint-config-next` 0.2.4 configuration; tooling repair and final results are recorded below |

Subsequent verification:

- Eight focused suites passed cleanly: **54 tests**, covering stock/version/retry behavior, account and query isolation, authentication races and parsing. Command: `npm test -- src/lib/offline/__tests__/pos-stock-integrity.test.ts src/lib/offline/__tests__/vendor-stock-version.test.ts src/lib/offline/__tests__/sync-auth.test.ts src/lib/offline/__tests__/sync-timestamp.test.ts src/components/auth/auth-provider.test.tsx src/store/account-isolation.test.ts src/components/shared/query-provider.test.tsx src/lib/imports/__tests__/parse.test.ts --maxWorkers=1`.
- The database suite passed **23 tests** after adding actual authenticated cashier posting of two separate stock effects and ledger reconciliation. Command: `npm test -- src/lib/accounting/__tests__/database.test.ts --maxWorkers=1`.
- The existing offline checkout suite and new auth-provider suite passed in the preceding four-suite run. That command also found an outdated vendor assertion: UUID order cannot identify a legacy queue entry when its successor is now preserved separately. The assertion now verifies both record IDs/payloads. The subsequent 54-test run passed it.
- A final account-transition revision guard was added after the 54-test run. It stops logout and A→B→A transitions that a namespace-only comparison could miss. The affected POS/auth/account suites passed **27 tests**. Command: `npm test -- src/lib/offline/__tests__/sync-auth.test.ts src/lib/offline/__tests__/pos-stock-integrity.test.ts src/store/account-isolation.test.ts --maxWorkers=1`.
- Review added a vendor/POS interleaving regression and a guard against coalescing a vendor operation across its later POS successor. The vendor-stock suite passed **13 tests**: `npm test -- src/lib/offline/__tests__/vendor-stock-version.test.ts --maxWorkers=1`.
- `npm run typecheck` passed again after the account revision guard and authentication tests were added.
- ESLint configuration was aligned with installed Next.js 16.2.10. ESLint 10 exposed a React-plugin API incompatibility; ESLint **9.39.5** is installed for compatibility. npm marks that major unsupported; track a tooling upgrade when the chosen React/Next plugins support ESLint 10. This is a development-tool constraint, not a claim of a complete dependency audit. Final scoped lint results are recorded below.
- Scoped ESLint completed with **0 errors and 3 existing unused-destructuring warnings** in `sync-engine.ts` (`_localSynced` and two `_join` aliases). Command: `npx eslint` with the 20 changed TypeScript source/test files passed explicitly. This is not a repository-wide lint pass.
- `git -c safe.directory=C:/TradeTrack diff --check -- src docs package.json package-lock.json supabase/migrations/20261019123240_m0_stock_access_guards.sql` passed. Git emitted line-ending normalization notices only. Work remains an uncommitted local diff; unrelated existing deletions and untracked documents were preserved.
- No full application build, repository-wide suite, real multi-connection PostgreSQL concurrency run or browser acceptance was completed in this batch. Those cannot be inferred from focused tests.

Unit tests mock the Supabase transport where stated; PGlite applies the repository migrations but does not establish hosted Supabase grant/schema parity or browser acceptance. These are test sets, not additive counts of unique tests; overlapping reruns must not be summed as additional coverage.

## Remaining M0 work and release boundaries

1. Complete final regression checks, including authentication races, interrupted inserts, existing vendor workflows and checkout backlog performance. Exercise the receiving workflow in an isolated browser/real database target before claiming the M0 demonstration.
2. Complete the server transaction/reconciliation policy for existing checkout writers. The transport still sends headers, lines and stock separately; a held conflict preserves evidence but does not atomically complete a sale remotely. Implement/verify an operator recovery path for POS conflicts and legacy stock work, including partially uploaded historical sales. Do not call a held operation reconciled or automatically replay an ambiguous stock effect.
3. Revalidate other applicable stock writers and the complete active-account/tenant boundary. The new helpers/constraints do not certify every legacy view, service-role API, permissive policy or historical cross-tenant relationship. F14 deployment/grant evidence remains required. F15 BI definitions, F22 authoritative-ledger treatment and F29 approved AI payload binding remain governed by their later feature milestones; no new AI write capability is connected here.
4. Infrastructure/security owner: settle F01 credential disposition, revocation/rotation, repository exposure/history assessment and prevention. `.env.local` remains tracked (filename-only check); its values were not printed or copied. No repository history rewrite or production rotation was attempted.
5. Approve and verify the offline access policy, cached-profile freshness and reconnection behavior for the isolated target. These changes reject known suspended profiles and server sync but do not promise instant revocation on disconnected devices.
6. Validate historical composite-FK relationships before `VALIDATE CONSTRAINT`; record an approved repair preview for any violations. Verify hosted roles, view owners, grants and RLS using authorized accounts. Assign the relevant infrastructure/database/security owners explicitly.
7. Measure spreadsheet parsing responsiveness/expansion limits on supported devices. File/row checks and a patched dependency do not establish a safe archive expansion budget or background parser isolation. M2 adds the durable complete-sheet path.

These are explicit open acceptance conditions, not completed features or requests to repeat implementation approval. Continue M0 in execution batches; do not begin M1 while an applicable gate remains unmet.

## Recovery and rollout

- Preserve all queued operations and source records. No queue clearing, account reset or stock replacement is a test/recovery procedure.
- Keep new intake/BI features disabled until their own milestones pass; this batch introduces no intake/BI feature surface to enable.
- Migration rollout requires an isolated upgrade check, backup/recovery ownership and hosted authorization verification. Keep authorization guards in place during application rollback. Do not restore the vulnerable parser as a rollback strategy.
- If a composite constraint blocks a legitimate historical relationship update, diagnose and repair the relationship under an approved data-repair procedure. Do not disable tenant validation globally to make writes pass.
- Roll back application changes only with a compatible queue reader: new sale operations contain `sale_id` and predecessor/version metadata. Older generic snapshot sync must not replay those records. Retain this queue guard or pause synchronization during rollback; never delete evidence.

## Next batch

Finish the checks below and close M0's existing stock command/recovery and isolated authorization evidence. Update this record and the milestone status with actual commands, failures and demonstrated behavior. M1's manual stock receipt is the next feature only after M0 passes.
