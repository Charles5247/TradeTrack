# AI stock intake — engineering handoff

**26 October 2026 · Active implementation order: AI-1 → AI-5. Next: AI-1/A in a fresh session.**

Read the [agreed plan](AI_STOCK_INTAKE_PLAN.md), [specification](STOCK_INTAKE_AND_RETAIL_BI_SPEC.md), [milestones](AI_AND_BI_MILESTONES.md) and [fresh-session handoff](AI_STOCK_INTAKE_NEXT_SESSION.md). These supersede M0–M11 ordering. This documentation revision implements no application feature or hosted change. The user requested that implementation start in a new session.

## 1. Intent and authority

- AI is optional beside existing product/stock entry, including the stock-in dialog. Preserve familiar manual entry and legitimate upstream changes.
- One shared AI journey handles one item or mixed sources, both new-product starting stock and additional deliveries. All listed modalities remain required. Resolve exceptions, inspect any row, review and approve selected ready receipts once.
- Preserve fractional purchases exactly; convert only to whole catalog stock units. Generate stable internal SKUs in application code for new drafts. English dictation first. Do not invent manufacturer barcodes, prices or unreadable values.
- No real examples or independent reviewer are available currently. Use labelled synthetic fixtures; real-world quality/merchant acceptance remain unverified.
- Reuse foundations; avoid broad reverts or an inventory redesign. BI/business insights are separate future work. The older barcode architecture document is historical reference, not instructions to implement every proposed capability.

## 2. Start-of-session checks

1. Inspect `AGENTS.md`, Git branch/status/log and active documents. Application baseline at documentation discovery was `6f11e6a` on `feat/m2-spreadsheet-batches`; documentation commits may follow it. Recheck current state rather than resetting to that hash.
2. Preserve unrelated tracked `idea-to-build/` and `idea-to-build.zip` deletions and the untracked audit review. Never stage all changes blindly. Use checkout-specific `git -c safe.directory=C:/TradeTrack ...` if required.
3. Read relevant installed Next.js guides under `node_modules/next/dist/docs/` before application code. Follow repository conventions/skills; dependencies/models/API contracts require current official verification.
4. Verify the manual branch baseline `c5291a9` versus combined M0/M1 commit `e30380f`, preserving legitimate upstream unit/variant changes from `fb3cb03`. The desired UI is the product form plus Inventory stock-in, not the added manual receipt workspace. Do not restore old absolute stock writes.
5. Inspect flags, current schema/grants and the target without printing credentials. Known separate hosted development ref: `jtqyxfoyllcvptxgwhmk`. Never substitute the older production ref `ajrflgewbsosthsjtvuj`. Revalidate actual env/CLI targets before any data/schema operation. Isolated local PostgreSQL tests are preferred for migration/concurrency work.
6. App and worker were not running at the 26 October discovery. Do not assume they are running now or launch duplicates. Private `.m0-local/dev-backend/` material includes development logins, fixtures and previous reports; never print or commit keys/passwords or reset existing test batches.

## 3. Source map and required seams

| Responsibility | Current paths / contracts | Required change or proof |
| --- | --- | --- |
| Product entry | `src/app/(dashboard)/products/page.tsx`, `src/components/products/product-form.tsx` | Optional Add with AI adjacent to normal creation. Preserve manual behavior, unit/variant fields and existing role boundaries. |
| Stock entry | `src/app/(dashboard)/inventory/page.tsx`, `src/lib/offline/inventory-adjustment.ts` | Optional Receive with AI beside entry and in its dialog; carry location/product. Retain atomic adjustment/legacy recovery safeguards. |
| Existing AI | `src/app/api/ai/route.ts`, `src/lib/ai/{types,provider,openai}.ts` | Existing mapper receives text without tenant catalog candidates. Extend provider interfaces for structured document extraction/transcription/matching; no mock-as-live fallback or general agent framework. |
| Ordinary imports | `src/components/imports/import-workbench.tsx`, `src/lib/imports/{parse,parse-core,execute,preview}.ts`, `src/app/api/imports/route.ts`, `015_business_imports.sql` | First-sheet product imports are not delivery receiving. Preserve existing imports; use complete selected-sheet processing and decimal-safe AI contracts for the new flow. |
| Batch UI/API | `src/components/inventory/batch-stock-intake*.tsx`, `src/app/api/stock-intake-batches/`, `src/lib/stock-intake-batches/{contracts,http,spreadsheet}.ts` | Reuse domain engine/private inputs but provide a shared AI journey. Version the AI DTO; prevent legacy integer editors from misreading decimal AI rows. Preparation is automatic after source submission. |
| Durable processing | `src/lib/stock-intake-batches/{worker,parser-child}.mts`, `scripts/stock-intake-worker.mts` | Reuse leases/checkpoints/fencing/retries. Add bounded modality adapters, complete source coverage and batch-aware budget reservations. |
| Receipt commands | `src/lib/stock-intake/{contracts,http,client}.ts`, M1/M2 migrations | Targeted fractional purchase storage/validation and final approval consent. Do not forge per-row confirmation or bypass actor/hash/unit checks. |
| Database history | `20261021024854_m1_manual_stock_receipts.sql`, `20261024131715_m2_spreadsheet_batch_intake.sql`, crypto compatibility migrations | Add migrations rather than rewriting applied ones. Preserve immutable historical documents/approvals and existing integer callers. Final inventory remains integer stock units. |
| Existing integration proof | `scripts/verify-m0-postgres.mjs`, `scripts/local-intake-sql.mjs`, `build-evidence/m2/` | Reuse isolated multi-connection tests, expand meaningful cases and distinguish historical/synthetic/live/hosted results. |

`render.yaml` defines only the web service; a hosted worker is not already provisioned by that file. Source originals stay private and tenant-scoped. Provider output cannot authorize mutations or choose another tenant's catalog. Stock math and cost arithmetic are exact and independently reconciled.

## 4. First work: AI-1/A

Implement a small usable printed-invoice slice, not a new standalone infrastructure milestone: familiar AI entry action → private PDF source → bounded provider extraction → tenant catalog match → source-linked review snapshot → final approval → shared atomic stock posting → saved outcome.

Prepare fixed synthetic source records and a separate expected-answer manifest before provider execution. Add versioned fractional purchase/consent contracts and targeted persistence compatibility so half-carton and base-unit cases can work without fractional inventory balances. Preserve legacy callers, source evidence and approval hashes. One completed slice is a checkpoint; AI-1 remains incomplete until its B/C photo/scanned-PDF/new-product/recovery gates pass.

Fix the confirmed next-step bug for configured sources. Investigate older disappearing rows through API/render traces before marking that report resolved. An empty display is not proof that persisted rows were lost. The source/hash duplicate rule must offer a clear recovery path rather than silently blocking entry.

Use a disabled-by-default `NEXT_PUBLIC_AI_STOCK_INTAKE_ENABLED` client flag and server `AI_STOCK_INTAKE_ENABLED` gate, plus the existing worker switch. Gate routes and worker too. Underlying receipt commands must still enforce their settings/permissions. Do not turn the new M1 manual screen into the default experience to expose the AI feature.

## 5. Verification

These are starting commands to adapt to the actual changed scope, not claims of new passing checks. Run heavy checks sequentially on this low-memory machine. Inspect existing test configuration and paths before execution.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/stock-intake-batches src/lib/stock-intake src/lib/imports/__tests__/parse.test.ts src/lib/imports/__tests__/parse-worker.test.ts --pool=threads --maxWorkers=1 --testTimeout=60000
node scripts/verify-m0-postgres.mjs --m2 --supabase-crypto
npm run typecheck
```

The PostgreSQL harness needs its configured isolated target; read the script first. Its historical local cluster is loopback 55439, not the user's system PostgreSQL on 5432. Do not reset either to satisfy tests. Scope ESLint to changed application files, then run appropriate integration/browser/manual-regression checks and a build at the milestone gate. Broaden tests when affected behavior or failures justify it; record remaining full-suite gaps honestly.

Use the installed Playwright CLI for actual browser journeys; verify runner availability rather than assuming `@playwright/test`. API tests, a single-connection database mock and a build cannot establish concurrent/idempotent stock or merchant usability.

For live provider tests, first verify configured budget, account/model capabilities and private inputs; a missing requirement blocks the live proof, not unrelated local implementation. Never silently substitute mock output. Record model, fixture version, source coverage, correctness, latency, retries and measured/unknown cost. Do not expose original sources or credentials in reports. Artificial handwriting/synthesized audio are not real merchant quality evidence.

At each batch checkpoint record actual changed files, commands/results, target, feature flags, demonstrated behavior, limitations and next batch. Keep AI-1 through AI-5 status accurate; do not count old M0/M1/M2 checks as new feature completion.

## 6. Rollout and external gates

Development proceeds in isolated targets. Production requires representative merchant data, independent reference/quality review, observed merchant completion, agreed modality thresholds, configured provider budget and worker hosting, credential disposition, deployed access boundaries and safe coordination of existing POS/offline/manual stock writers. Do not claim new additive intake fixes an old writer that can overwrite stock.

Rollback disables new AI work while preserving originals, approvals, posted receipts and recoverable drafts/jobs. Do not down-migrate committed receipt evidence or clear unsynced outboxes. Keep existing draft PRs as reviewable history; do not merge/deploy merely because a controlled prototype passes.
