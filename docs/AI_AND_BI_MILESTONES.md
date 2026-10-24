# AI stock intake and Retail BI: implementation milestones

**Updated 24 October 2026. M0 and M1 isolated implementation gates passed, including integration with current origin/main; production release remains blocked. M2 is next.**

Deliver one usable feature end to end before starting the next milestone. The [specification](STOCK_INTAKE_AND_RETAIL_BI_SPEC.md) owns business/API/metric rules; this file owns execution order, milestone status and acceptance gates. The [engineering handoff](AI_AND_BI_IMPLEMENTATION_HANDOFF.md) supplies code locations and verification commands. These milestones replace the previous layer-by-layer engineering stages.

## Working in execution batches

Each milestone has three execution batches, **A → B → C**. They can run in separate sessions. A or B finishing is a checkpoint, not a finished feature. Keep unfinished functionality disabled and record the exact next batch. Do not start the next milestone until the current milestone's completion gate passes. M0 is the necessary readiness gate; M11 is the final programme release gate. M1–M10 each deliver a merchant-facing workflow.

Every feature milestone includes its required database/command work, server authorization, UI, error/retry experience, tests and an end-to-end demonstration. Do not defer approval screens, saving, outcome reporting or recovery to a later integration milestone. Private uploads and workers first ship with the spreadsheet workflow; AI budgets first ship with AI text intake. Reuse them thereafter.

Before starting a batch, verify the preceding batch/milestone evidence and current checkout. At its end record changed files, commands/results, actual behavior, limitations, flag state and next work. A failed or externally blocked gate leaves that milestone incomplete; do not silently waive it or count a mock as implementation. Completion in an isolated environment and permission to release to production are separate statuses. An unmet milestone acceptance condition blocks the next milestone; an unrelated future production gate does not manufacture a new approval requirement for already-authorized local work.

## Sequence and status

| Milestone | End-to-end result | Depends on | Status |
| --- | --- | --- | --- |
| M0 | Applicable stock, security, account-isolation and parser gates verified/repaired in the isolated target | Current baseline | Isolated gate passed; credential/hosted release gates remain — [checkpoint](AI_AND_BI_M0_IMPLEMENTATION_CHECKPOINT.md) |
| M1 | Merchant enters, reviews and saves a manual stock receipt safely | M0 | Isolated gate passed — [implementation and acceptance checkpoint](AI_AND_BI_M1_IMPLEMENTATION_CHECKPOINT.md) |
| M2 | Merchant uploads complete selected spreadsheet sheets, approves a batch and receives saved/failed outcomes | M1 | Not started |
| M3 | Merchant pastes a stock list, reviews AI preparation and posts the approved receipts | M2 | Not started |
| M4 | Merchant processes printed invoice photos and digital/scanned PDFs through posting | M3 | Not started |
| M5 | Merchant processes readable handwritten notes through posting | M4 | Not started |
| M6 | Merchant records/uploads English stock dictation, corrects it and posts receipts | M5 | Not started |
| M7 | Merchant completes mixed-format bulk intake at the measured programme boundaries | M6 | Not started |
| M8 | Owner uses reconciled sales/payment cards, trends and transaction drill-downs | M7 | Not started |
| M9 | Owner uses dependable product rankings, historical COGS and profit availability | M8 | Not started |
| M10 | Owner uses current inventory, alerts, movements and open balances with detail | M9 | Not started |
| M11 | Complete programme passes merchant evaluation and an approved pilot | M10 | Not started |

All previously verified barcode/import/AI code is a reusable baseline, not evidence that these new milestones are complete. The existing review's 24 focused passing tests cover that baseline only.

## M0 — Readiness and existing-workflow integrity

**Owners:** backend/offline/security/infrastructure, with QA. **Demo:** two consecutive offline sales synchronize correctly, an account switch exposes no prior tenant data, and an unauthorized stock operation is rejected.

- **A — Establish facts:** record checkout/test target, flags and audit dispositions. Revalidate scoped F01–F03, F13–F17, F22/F29. Verify credential disposition without displaying secrets; separate owner-operated rotation/hosted changes from local implementation. Collect representative fixtures and assign external evidence owners.
- **B — Close applicable gaps:** repair/reverify local outbox and stock-conflict handling, active-user/tenant/location enforcement and account-isolated caches. Select/verify a safe parser while preserving supported imports. This is scoped work, not all 29 audit findings.
- **C — Prove the gate:** exercise consecutive/concurrent sales, failed/reordered writes, lost acknowledgments, restart/reconnect, account switching and malformed files. Record isolated permission/schema results and remaining production dispositions separately.

**Completion gate:** reproducible evidence establishes the relevant existing stock writers, access boundaries and parser are safe for the isolated receiving workflow. A stock-loss or authorization failure cannot be deferred to the AI stages. Missing external evidence required for this gate leaves M0 incomplete.

**Recovery:** preserve unsynced operations and use an explicit reconciliation path; never clear queues or reset demo/business accounts to make a test pass.

## M1 — Manual stock receipt, safely saved

**Owners:** backend/database/frontend/QA. **Demo:** select a product and location, enter 10 cartons × 12 units, inspect the proposed +120, approve and see the committed receipt and stock result.

- **A — Command:** add receipt/line/evidence and immutable approval persistence; implement one validated manual/AI command with integer stock units, locked increments, still-initial opening checks, reviewed conversions, separate receipt costs and stable command IDs. Preserve approving-actor audit attribution. Support explicit reviewed product creation without changing existing catalog prices silently.
- **B — Merchant path:** add the manual entry/review/approve/result screens using existing product lookup where appropriate. Display current/expected stock, location, original unit/conversion, receipt costs and validation errors. A changed balance alone must not invalidate an approved delivery increment.
- **C — Prove receipt atomicity:** test duplicate clicks, response loss, all-lines rollback, cross-tenant/suspended users, product/unit conflicts, simultaneous sale/delivery, opening-stock races and repeat execution returning the original result. Recheck permissions/entitlement at posting.

**Completion gate:** the manual feature works through real persistence and UI in the isolated target; inventory, authoritative ledger, audit and receipt evidence reconcile. No AI or file upload is required to use it.

**Recovery:** failed receipts have no partial stock/product effects; retry returns the original result when already committed. Disabling the feature preserves saved receipts.

## M2 — Complete spreadsheet batch intake

**Owners:** backend/import/frontend/infrastructure/QA. **Demo:** upload a workbook, select two sheets, inspect a row beyond 1,000, resolve an unmatched product, approve ready receipts once and recover a partial batch without duplicate stock.

- **A — File and execution path:** add authorized private upload sessions, source hashes, selected-sheet/row provenance, complete deterministic parsing and receipt grouping. Ship the dedicated Node/PostgreSQL worker with leases, heartbeats, fencing, checkpoints, bounded concurrency and retry policy as part of this working feature. Enforce file/byte/row limits before claiming readiness; no dependency on an open browser.
- **B — Batch workspace:** add progress, complete paginated/virtualized rows, exact catalog matching, explicit drafts/conversions, receipt locations, selected-row corrections, summary/exclusions and immutable one-click batch approval. Post through M1 and show per-receipt saved/failed/needs-review outcomes. Supply grouping metadata when a sheet contains several receipts; do not treat each chunk as a receipt transaction.
- **C — Completeness and recovery:** test all selected sheets, repeated headers, >1,000 rows, exact 20,000-row/overflow handling, duplicates, unauthorized sources, browser closure/reconnect, worker crash/expired lease and idempotent partial retries. Demonstrate all rows are inspectable, replacing the existing 200-row-only preview for this feature.

**Completion gate:** structured CSV/XLSX intake is usable without AI, with durable processing and reliable receipt posting. Existing non-intake imports still work. Treat 100 files/250 MiB/20 MiB-file limits as proposed ceilings to enforce/test, not advertised throughput.

**Recovery:** restore authoritative progress by batch ID; retry unposted receipts only. Cancellation stops unstarted work and retains committed evidence. Private storage/worker hosting and applicable retention decisions must be available for the environment being demonstrated.

## M3 — AI pasted-list intake

**Owners:** AI/backend/frontend/QA. **Demo:** paste a messy list, correct an ambiguous carton size, review the batch and approve receipt posting once.

- **A — Preparation:** adapt the existing text provider behind bounded durable tasks. Preserve original text/spans, human corrections and processing versions. Split or explicitly reject over-capacity input; never silently accept a model's shorter output as complete. Reuse M2 matching, drafts and M1 posting.
- **B — Merchant path and budget:** integrate text entry, estimated AI usage, an explicit spending limit, batch-aware entitlement/usage reservations, exception queues, editable rows and existing batch approval/outcomes. AI cannot write stock directly.
- **C — Prove behavior:** test inputs beyond the old 1,000-row mapping boundary, conflicts, missing values, malformed/incomplete responses, provider failures, three-attempt policy, budget pause/resume and changed/suspended approvers. Reconcile prepared counts and posted results.

**Completion gate:** an actual configured provider completes the workflow on approved development/held-out text fixtures; deterministic mocks remain useful tests but are not evidence of extraction quality. No stock, catalog cost or selling price changes without the required recorded approval.

**Recovery:** retain the text and prepared rows after provider/budget failure; resume eligible work without repeating posted effects. Manual M1/M2 paths remain usable.

## M4 — Printed invoice photos and PDFs

**Owners:** AI/document/backend/frontend/QA. **Demo:** upload a printed photo and a multi-page PDF, inspect extracted fields against originals, correct grouping and quantities, approve and verify stock.

- **A — Source adapters:** add bounded printed-image, digital-PDF and scanned-PDF extraction through the existing provider boundary. Preserve page/document/field evidence; enforce actual page counts and resource limits before extraction. Do not rebuild product-photo barcode detection as invoice OCR.
- **B — Merchant path:** expose private source/page previews beside rows, correctable multi-file/multi-invoice grouping, exceptions, exclusions, batch budget and M2 approval/outcomes. All selected pages must be accounted for.
- **C — Modality proof:** evaluate printed photos, digital PDFs and scanned PDFs separately on development/held-out sources. Cover long documents, overlapping pages, repeated headers, unreadable pages, charges/tax discrepancies, duplicate uploads, 500-page boundary and overflow. Exercise retries through actual posting.

**Completion gate:** each supported printed modality completes the full workflow, with measured numeric extraction, source coverage and agreed test conditions. Proposed ≥99% printed numeric accuracy is a release target requiring evidence; do not claim it from unit tests or model confidence.

**Recovery:** failed pages remain visible and block affected receipt readiness; other explicitly ready receipts may post. Source corrections invalidate affected unposted approvals.

## M5 — Handwritten stock notes

**Owners:** AI/frontend/QA/product. **Demo:** upload a handwritten note, resolve an unreadable number with the source beside it, approve and verify the saved receipt.

- **A — Handwriting:** add the visual extraction/quality rules and separate handwriting evaluation set; preserve uncertain and unreadable fields without converting them to zero.
- **B — Merchant path:** provide source comparison, explicit corrections, matching/conversion exceptions and the complete existing approval/posting workflow. Reprocessing must preserve human corrections.
- **C — Acceptance:** agree handwriting thresholds from representative merchant data, report numeric/name/unit errors separately and demonstrate corrected/uncorrectable cases, duplicates and retries through stock posting.

**Completion gate:** handwriting end-to-end acceptance and its agreed evidence pass. If representative data/thresholds are missing, leave M5 awaiting evidence rather than marking the adapter done and starting M6.

**Recovery:** retain unreadable sources as needs-review or explicitly excluded; never infer a number to get a receipt posted.

## M6 — Recorded stock dictation and corrections

**Owners:** AI/frontend/backend/QA/product. **Demo:** record/upload English stock dictation, play it back, edit the transcript/conversion, approve and verify stock and recording provenance.

- **A — Audio path:** add authorized recording/upload and file transcription, duration/byte validation, transcript/time-span references and durable preparation. Reuse M3 budgets and M2 jobs; no realtime conversational POS agent is required.
- **B — Merchant path:** add playback, transcript editing, row/source linking, recorded corrections, exception resolution and full batch approval/outcomes. Corrections invalidate affected unposted approvals; they cannot silently edit saved receipts.
- **C — Language proof:** agree/test English thresholds using representative accents/noise and held-out recordings; test ten-minute/20 MiB boundaries, missing/unclear numbers, budget recovery, duplicate submission and revoked permissions. Produce separate Pidgin/Hausa evaluation results.

**Completion gate:** English dictation and correction workflow passes agreed end-to-end acceptance. Pidgin and Hausa remain individually disabled until their own results pass; their absence is explicit rather than a false claim of supported languages. If either is later enabled, run its own A/B/C language-enablement batch through the same gate before starting another language.

**Recovery:** transcription failure preserves the recording and any reviewed work; reconnect resumes by batch ID. Ordinary manual entry remains available.

## M7 — Mixed-format bulk workflow and capacity proof

**Owners:** full feature team/QA/infrastructure/product. **Demo:** combine sheets, PDFs, photos, handwriting, text and an enabled-language recording; fix receipt grouping, resolve exceptions, approve once, recover partial posting and reconcile final stock.

- **A — Cross-source reconciliation:** complete duplicate fingerprints, overlap detection, shared product drafts and split/merge grouping across all supported sources. Reuse the working reviews/posting from M2–M6; this milestone must not be their first usable UI.
- **B — Bulk experience:** finish cross-source progress/exceptions, selected bulk corrections, locations, usage/cancellation and full row inspection under load. Preserve human edits and immutable approved payloads when other sources finish late.
- **C — Programme boundaries:** test 100 files, 500 pages, 20,000 rows, 250 MiB total, 20 MiB/file and ten-minute recordings, plus explicit boundary failures. Test multiple workers/tenants, expired leases, budget exhaustion, interrupted uploads and concurrent sales/deliveries. Benchmark 100 single-page documents/~1,000 rows against the proposed 30-minute target.

**Completion gate:** mixed intake works end to end at the declared tested limits, with no omitted segments or duplicate stock. If capacity falls short, record the failing limit and resolve or explicitly re-scope it with the user; do not quietly lower the advertised target and mark complete.

**Recovery:** posted receipts survive cancellation and worker restarts; all remaining outcomes reconcile visibly. Programme capacity remains unadvertised until measured and accepted.

## M8 — Retail BI sales and recorded payments

**Owners:** reporting/backend/frontend/QA. **Demo:** owner selects seven business-calendar days, sees revenue/count/recorded paid with comparisons and opens paginated supporting transactions that reconcile exactly.

- **A — Shared definitions:** implement canonical authorized server eligibility, vendor mirror deduplication, credit recognition, full-reversal restatement, payment corrections, precise arithmetic and imported-history exclusion. Establish timezone/currency, half-open ranges, equal elapsed comparisons and coverage/as-of metadata for all later BI consumers.
- **B — Usable dashboard:** deliver cards, trend/comparison chart, filters, recent transactions and drill-downs together, using existing Retail components. Ship account-scoped caches, direct/debounced invalidation, 60-second visible/online polling, reconnect/manual refresh and loading/empty/partial/error/stale states now.
- **C — Reconciliation:** independently verify SQL against >200-item fixtures, tax/discounts, credit/partial payments, duplicate mirrors/reversals, dates, zero baselines and unallocated vendor locations. Test mobile/keyboard/chart tables and cashier/platform routing.

**Completion gate:** sales/payment BI is a usable feature with matching cards/charts/details and business-policy sign-off. Do not finish an API-only milestone and defer the dashboard. Unbuilt profit/inventory panels stay disabled rather than showing zeros.

**Recovery:** failed refresh retains timestamped last-success data and a visible error; offline unsynced device activity is disclosed.

## M9 — Product performance and dependable profit

**Owners:** reporting/backend/frontend/QA. **Demo:** owner opens ranked products and historical-cost details, then sees profit become unavailable when the selected set contains missing costs.

- **A — Calculations:** extend M8 definitions with net product revenue, one proportional allocation of invoice discount, deterministic minor-unit rounding, historical COGS and dependable cost/line coverage.
- **B — Merchant view:** deliver ranked bars/tables and product drill-downs plus gross-profit/margin cards/reasons together. Missing historical costs remain null; vendor cost gaps cannot borrow current catalog costs. Explain unavailable net profit because expense data is absent from the inspected schema.
- **C — Proof:** independent SQL reconciles line/invoice discounts, tax separation, missing lines, zero/unknown costs, vendor gaps, zero revenue and product identities. Cards, ranking and details share identical filters/refresh semantics.

**Completion gate:** complete-cost fixtures reconcile to exact supported currency precision; incomplete fixtures never show invented profit. Business cost definitions are accepted, and accessibility/refresh states pass.

**Recovery:** a missing-cost subset remains inspectable with coverage; it does not become an unlabeled whole-business profit estimate.

## M10 — Inventory, stock alerts and outstanding balances

**Owners:** reporting/backend/frontend/QA. **Demo:** post a receipt, observe refreshed current valuation/alerts, open the authoritative movement and inspect current unpaid invoices without counting a vendor mirror twice.

- **A — Snapshot/read paths:** implement current-cost valuation/coverage, per-location low/out-of-stock positions, signed authoritative ledger detail and current open invoice balances under M8 canonical definitions.
- **B — Merchant view:** ship cards/panels and paginated drill-downs together, with current snapshot labels separate from sales periods. Preserve explicit zero thresholds and unallocated location disclosures. Connect intake/sales/payment/reversal/cost/inventory invalidation to affected metrics.
- **C — Proof:** reconcile quantity × current cost, unknown-cost coverage, ledger-only sums, thresholds, current balances and vendor deduplication. Exercise period/location filters, concurrent receipt/sale/payment, reconnect, stale data and authorized detail links.

**Completion gate:** current inventory/operations BI is complete, accessible and consistent with M8/M9 definitions; snapshot data is not presented as a historical reconstruction or complete customer-credit ledger.

**Recovery:** preserve last successful snapshots with timestamps; withheld or partial metrics retain reasons. Disabling BI restores existing role routing without affecting stock.

## M11 — Complete-workflow evaluation and approved pilot

**Owners:** QA/product/merchants/infrastructure with the feature team. **Demo:** representative merchants finish a mixed delivery and inspect resulting BI using authorized pilot tenants.

- **A — Release readiness:** consolidate evidence from M0–M10; verify deployed grants/permissions and shared-stock writers, funded worker/provider budgets, evidence retention, language enablement and business metric policies. Keep capacity/speed claims tied to measurements.
- **B — Controlled pilot:** enable tested flags only for approved pilot tenants; exercise complete workflows and failure recovery with actual supplier inputs, recordings and merchant review sessions.
- **C — Measure and close:** compare median preparation/review time with manual entry (proposed ≥50% reduction), report per-modality accuracy/cost and the 30-minute benchmark, and measure BI summary p95 against the proposed two-second target on the agreed dataset/load. Record defects, operating ownership and tested rollback.

**Completion gate:** agreed release evidence passes and pilot outcomes are accepted. No universal scanner/device/language support, zero-error extraction or two-minute/2,000-item guarantee may be inferred from the reference architecture document.

**Recovery:** disable new feature work and safely pause/drain accepted jobs; preserve committed receipts, inventory effects, approvals and evidence. A feature rollback is not a stock reversal or a destructive database rollback.

## Milestone closeout and next-run instruction

Use this record after each execution batch; fill actual values rather than marking success in advance:

```text
Milestone / batch: Mx-A, Mx-B or Mx-C
Status: not started | in progress | awaiting evidence | complete
Environment / revision:
Changed files and migrations:
Demonstrated merchant path and persisted result:
Verification commands and actual results:
Open acceptance conditions / external requirements:
Feature flag and rollback state:
Next batch; or next milestone only after the current gate passes:
```

For example: “Implement M2-A only, using the spec and handoff. Verify M1 is complete first. Record the checkpoint and leave M2 incomplete until M2-B/C pass.” A later run resumes that exact batch; it does not restart the plan or begin another feature to avoid a failing gate. The prior instruction to proceed is preserved; this planning update does not itself start application work or authorize unrelated production operations.
