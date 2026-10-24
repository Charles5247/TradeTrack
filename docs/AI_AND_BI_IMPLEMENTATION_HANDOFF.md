# Bulk AI stock intake and Retail BI: engineering handoff

**Updated 24 October 2026 · M0 and M1 isolated gates passed after upstream integration. Production release is blocked by credential disposition and hosted verification.**

Read the [specification](STOCK_INTAKE_AND_RETAIL_BI_SPEC.md) for contracts/metrics and the [brief](AI_TEAM_BRIEF_BUILD_FIRST.md) for the merchant experience. Priority: bulk stock intake, then Retail BI. PDF, handwriting, voice and mixed bulk processing are stages within this programme. The confirmed model is exception resolution, summary review and one approval of selected ready receipts; all rows stay inspectable.

The user authorized completing M0 and then implementing M1 on 21 October, and authorized finalizing, committing, pushing a draft PR and moving to M2 on 24 October. Read the [M0 checkpoint](AI_AND_BI_M0_IMPLEMENTATION_CHECKPOINT.md) and current milestone status before continuing. This authorization does not include unrelated production operations, credential rotation, hosting spend or deployment. Do not repeatedly reopen already-specified implementation choices as approval questions.

## 1. Start in the current checkout

1. Re-read `AGENTS.md`, current files and `git -c safe.directory=C:/TradeTrack status --short`. Preserve unrelated work, including existing untracked planning/audit documents and the unrelated `idea-to-build` deletions observed during this delivery. Recheck state rather than assuming that snapshot remains current.
2. Before application code, read relevant installed guides under `node_modules/next/dist/docs/`. The installed Route Handlers guide was read during planning; it defines App Router `route.ts` handlers and request-time behavior. Re-read at implementation time, particularly route parameters/caching/auth APIs; this Next.js version has changed conventions.
3. Inspect provider/import contracts, server auth, inventory triggers, offline sync, dashboard role routing and design tokens using the existing-file map below. Neither generated documents nor source existence prove deployed behavior.
4. Record existing implementation authorization, isolated test target and milestone/release-gate owners. Work additively behind disabled-by-default flags. Document a baseline before touching shared stock paths.

Useful installed guides:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`

## 2. Sequential feature milestones

The [milestone plan](AI_AND_BI_MILESTONES.md) is the source of truth for M0–M11, A/B/C execution batches, status, demonstrations and completion gates. It replaces the old Stage 0–9 sequence. Do not run infrastructure, all extraction adapters and all UI as separate feature deliveries. Each feature includes its complete merchant path and acceptance; start the next milestone only after the current gate passes.

Within each milestone, A/B/C can run in separate sessions. Persist the checkpoint and exact next batch. A completed backend or mock is not a completed milestone. Do not hide a failing acceptance condition by starting a later feature. Keep production-release status separate from isolated implementation completion; neither removes the stated acceptance gate.

### Reuse baseline and checkout identity

Work in `C:\TradeTrack`. The reference architecture at `C:\TradeTrack-main\TradeTrack-main\docs\ai-ml-integration\BARCODE_AND_INVENTORY_INTEGRATION_SPEC.md` describes a different snapshot and contains proposals, not completion evidence. Do not copy its module/migration names or claim its scanner, UOM, OCR, IMEI and speed examples are implemented.

Reuse `src/lib/products/{detect-code,lookup-code}.ts`, `src/components/products/{product-code-lookup,image-upload,product-form}.tsx`, barcode/QR renderers and receipt lookup. The current product feature decodes a still photo, resolves an exact tenant catalog match and prefills an explicitly confirmed form; cached matches cannot save until rechecked online. It does not add stock automatically. Global HID interception, live-camera/fallback and full fractional UOM/serial tracking remain separate candidates.

Reuse structured import mapping/validation/history/results, but replace the intake limitations deliberately: `parseImportFile` reads only the first worksheet; `import-workbench.tsx` displays the first 200 rows; `executeImport` uses 50-row chunks; `apply_import_row` does not add deliveries to existing products. Reuse text AI/provider/entitlement boundaries, but the existing synchronous 1,000-row mapper is not the bulk pipeline.

### Files, owners and acceptance evidence by milestone

Existing paths are reuse/inspection targets. `src/lib/stock-intake/`, its jobs, `src/app/api/stock-intake-batches/`, `scripts/stock-intake-worker.ts`, `src/lib/retail-bi/` and `src/app/api/retail-bi/` are proposed locations, not modules delivered by this revision. Create migrations through the verified repository workflow; do not copy the reference's example `013_units_of_measure.sql`.

| Milestone / lead | Responsible files and symbols | Required completion evidence |
| --- | --- | --- |
| M0 · backend/offline/security | `src/lib/auth/api-context.ts::apiContext`; `src/store/index.ts`; auth/header/query caches; `src/lib/offline/sales.ts::persistOfflineSale`, `db.ts::addToSyncQueue`, `sync-engine.ts::{pushChanges,executeSyncOperation,pullData}`; parser/package/lockfile and grants/policies | Scoped stock/access/parser gates, recovery and account-switch demonstrations in the isolated target; production dispositions separately recorded. |
| M1 · backend/database/frontend | Proposed receipt command/persistence under `src/lib/stock-intake/`; manual intake UI in dashboard group; inspect `001_initial_schema.sql`, `014_accounting_controls.sql`, `015_business_imports.sql::apply_import_row`; reuse product lookup | Manual receipt UI → approved command → locked stock/ledger/evidence/result, with atomic rollback, replay, opening races and concurrency proof. |
| M2 · import/backend/frontend/infrastructure | `src/lib/imports/{parse,preview,execute}.ts`; `src/components/imports/import-workbench.tsx`; proposed batch routes, source storage, durable jobs and worker; `render.yaml` | Complete selected-sheet intake with all-row review, one batch approval, durable posting/outcomes and close/reopen/retry; no silent truncation or duplicate effects. |
| M3 · AI/backend/frontend | `src/lib/ai/{types,provider,openai,mock,entitlement}.ts`; `src/app/api/ai/route.ts`; `016_ai_assistant_plumbing.sql::reserve_ai_job`; proposed bounded text jobs | Live configured text preparation, usage reservation/budget, correction and approved receipt posting; mocks are not extraction acceptance. |
| M4 · AI/document/frontend | Proposed document/image adapters, source/page references and previews using M2/M3 jobs/budget/review | Printed-photo, digital-PDF and scanned-PDF workflows independently evaluated through actual saving. |
| M5 · AI/frontend/QA | Handwriting adapter/evaluation and source/correction views using existing review/posting | Readable/unreadable handwritten inputs corrected or explicitly excluded; agreed handwriting acceptance through stock posting. |
| M6 · AI/backend/frontend/QA | Recording/transcription adapter, private audio, transcript/time-span refs and playback/correction UI | English dictation/corrections end to end; separate Pidgin/Hausa evidence/flags; recording failures preserve reviewed work. |
| M7 · full feature team | Shared grouping/deduplication/draft logic, batch worker/workspace and receipt command | Cross-format grouping, approved mixed batch, partial recovery, multi-tenant load and full proposed limit/benchmark evidence. |
| M8 · reporting/backend/frontend | Proposed shared BI modules/routes; `src/app/(dashboard)/dashboard/page.tsx`, `reports/page.tsx`; `src/lib/accounting/reconciliation.ts`; `src/lib/offline/vendor-transactions.ts`; `src/hooks/use-realtime-sync.ts` | Sales/payment cards, trends, canonical transactions and drill-downs reconcile to independent SQL, including refresh/accessibility/role routing. |
| M9 · reporting/backend/frontend | Shared BI product/COGS/allocation functions and product/profit cards/detail; inspect `src/store/index.ts::{getSubtotal,getDiscountAmount}` | Exact supported-currency product/profit reconciliation, historical-cost coverage and honest unavailable values; usable views and details ship together. |
| M10 · reporting/backend/frontend | Shared BI inventory/movement/balance functions and views; `014_accounting_controls.sql::{record_stock_change,reverse_financial_sale}` | Current-cost/threshold/ledger/open-balance reconciliation with snapshot labels, complete drill-downs and committed-change refresh. |
| M11 · QA/product/infrastructure | Acceptance matrix, recorded evaluation datasets/results, pilot flags/operations and rollback | Merchant evaluation, funded/deployed pilot prerequisites, measured cost/accuracy/time/capacity and accepted rollout evidence. |

Preserve `src/app/(dashboard)/admin/page.tsx`, cashier dashboard behavior and `src/components/layout/nav-config.ts` role boundaries throughout BI. Reuse `src/app/globals.css` Retail tokens and existing components; consult relevant installed frontend skills/guides when implementing UI. Stock writing must preserve verified approving-actor attribution despite worker execution and the ledger's current `auth.uid()` behavior.

### Scoped readiness and release dependencies

Use the [audit review](AUDIT_REMEDIATION_REVIEW_2026-10-15.md) as historical evidence to revalidate, not a claim that repairs are already done:

| Gate | Owner and disposition needed |
| --- | --- |
| F01 credential disposition | Security/infrastructure owner; no secrets in output, no unapproved rotation/history rewrite/hosted changes. |
| F13/F14 authorization | Backend/database; active actor, tenant/location relations, grants/RLS and target-specific parity. |
| F17 account isolation | Frontend/offline; account-scoped caches with recoverable unsynced operations preserved. |
| F16 parser | Import/backend; maintained safe parser/advisory disposition and malformed/oversized tests; observed `xlsx` 0.18.5 is not assumed safe. |
| F02/F03 stock and outbox | Offline/backend; consecutive/concurrent sales, lost response/restarts and stale/conflicting writes cannot lose stock effects. |
| F22/F29 ledger/approval | Backend/database; authoritative movements once, immutable actor/payload approvals and evidence. |

Do not assign every audit finding to the AI engineer. M0 closes/verifies applicable isolated-workflow gates; target-specific production evidence is required before releasing the corresponding feature. M1–M7 cannot claim reliable stock while another relevant writer silently overwrites it. Full fractional UOM, global/live scanner expansion, serial/IMEI, supplier-channel integration and broader migration studio are outside these milestones unless separately scoped.

## 3. Verification commands and evidence records

Run from `C:\TradeTrack`. These are engineering verification commands, not checks claimed to have passed in this document delivery. Read test configuration first; use isolated fixtures, and do not run hosted migration/data tests against production without appropriate authorization.

Existing focused baselines. The 19 October review passed 24 tests across seven product-code/product-form/receipt/import suites, with a worker-start timeout resolved by an isolated single-worker retry. This is historical evidence for the unchanged foundation, not new milestone acceptance; it was not rerun for this documentation revision.

To reproduce that focused foundation check (single-worker execution is an available recovery option):

```powershell
npm test -- src/lib/products/detect-code.test.ts src/lib/products/lookup-code.test.ts src/components/products/product-code-lookup.test.tsx src/components/products/product-form.test.tsx src/app/api/receipts/lookup/route.test.ts src/lib/imports/__tests__/parse.test.ts src/lib/imports/__tests__/preview.test.ts --maxWorkers=1
```

Additional relevant existing suites, selected according to the active milestone:

```powershell
npm test -- src/lib/imports/__tests__/parse.test.ts src/lib/imports/__tests__/preview.test.ts src/lib/imports/__tests__/offline.test.ts
npm test -- src/lib/ai/__tests__/openai.test.ts src/lib/ai/__tests__/route.test.ts
npm test -- src/lib/accounting/__tests__/reconciliation.test.ts src/lib/accounting/__tests__/database.test.ts
npm test -- src/lib/offline/__tests__/sales-offline.test.ts src/lib/offline/__tests__/vendor-sync.test.ts src/lib/offline/__tests__/vendor-stock-version.test.ts
npm test -- src/components/imports/import-workbench.test.tsx src/components/layout/retail-workflows.test.tsx
```

After implementing the proposed modules, create and run meaningful receipt, worker, API authorization and BI fixtures under the matching directories (these suites do not exist yet):

```powershell
npm test -- src/lib/stock-intake/__tests__ src/app/api/stock-intake-batches
npm test -- src/lib/retail-bi/__tests__ src/app/api/retail-bi
npm run typecheck
npm run lint
npm run build
```

Run `npm test` as the final application regression gate in the configured isolated environment. Add a separately documented real-PostgreSQL multi-connection integration harness for lock/concurrency/lease proof; a mocked or single-connection database test cannot establish those guarantees. Record the exact harness command/environment when implemented. Likewise record browser/accessibility commands once a supported runner is selected; do not claim an uninstalled runner exists.

Each evidence record includes commit/diff identity, command, environment/dataset, expected invariant, actual result, unresolved failures and owner. Benchmarks additionally record configuration, sample count, latency distribution and measured cost. Distinguish source-reviewed, unit-tested, database-integrated, browser-tested and deployed/pilot evidence.

For documentation changes, check Markdown links, scope consistency, source paths/symbols and Git status/whitespace. For the active implementation batch, use the checkpoint's actual verification results and open gates; application suites do not validate future features that remain planned.

## 4. External requirements and rollback

| External requirement | Needed from / evidence |
| --- | --- |
| Representative inputs and review sessions | Product/merchants: human-checked development/held-out documents, recordings and timed review sessions across suppliers/businesses. |
| Handwriting and voice thresholds | Product/QA/AI: agreed thresholds and separate English/Pidgin/Hausa results before each enablement. |
| Budget and worker hosting | Business/infrastructure: approved spending policy, batch limit and worker provisioning. |
| Deployed permissions/shared stock integrity | Security/backend/offline: grants/RLS/active-user checks and all relevant stock writers verified. |
| BI accounting policies | Business/reporting: credit recognition, original-period reversal restatement and dependable cost definitions signed off. |
| Capacity and retention | QA/infrastructure/product: measured limits/performance and agreed source-evidence retention. |

Implementation choices already specified in the plan—batch approval, receipt atomicity, worker architecture, integer stock boundary and metric contracts—are not additional preference questions. External evidence/approvals above remain open.

Use additive schema changes and disabled-by-default flags for intake processing, posting, modalities and BI, enforced in routes and worker. Rollback disables new work, safely pauses/drains accepted jobs, restores existing dashboard routing and preserves committed receipts/stock/evidence. A flag rollback is not a stock reversal or database down-migration. Verify that disabling a feature cannot orphan invisible jobs or remove committed audit records.
