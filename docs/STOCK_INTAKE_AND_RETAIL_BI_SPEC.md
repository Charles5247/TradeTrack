# Bulk stock intake and Retail BI specification

**Planning handoff · updated 19 October 2026. This revision updates documents only; new programme milestones remain unimplemented.**

Priority one is bulk stock intake across photos, PDFs, handwriting, spreadsheets, text and voice; priority two is Retail BI. Confirmed approval: **prepare batch → resolve exceptions → review summary → approve selected ready receipts once**. Every row is inspectable. Limits, thresholds and worker configuration below are proposed pilot defaults, not measured results.

This specification supersedes older single-document/deferred-modality planning. See the [team brief](AI_TEAM_BRIEF_BUILD_FIRST.md), [milestones](AI_AND_BI_MILESTONES.md) and [engineering handoff](AI_AND_BI_IMPLEMENTATION_HANDOFF.md). The user's earlier instruction to proceed remains recorded; the present request updates planning and execution order, not application code or production resources.

## 1. Current evidence

The 17 October source review and 19 October barcode/inventory comparison establish the baseline below for `C:\TradeTrack`. Neither verifies deployed schema/grants, device compatibility, hosted permissions or capacity.

| Existing source / symbol | Evidence and implication |
| --- | --- |
| `supabase/migrations/001_initial_schema.sql`, `src/lib/offline/db.ts` | Product barcode field/index and a nonunique local barcode index exist. Exact codes are not guaranteed globally unique and do not prove a conflict-free match. Inventory/sale quantities remain integers. |
| `src/lib/barcode/render-barcode.ts`, `src/lib/qr/render-qr.ts`, `src/lib/printer/{receipt-to-escpos,transfer-receipt-to-escpos}.ts` | Barcode/QR generation and printer command builders exist; physical compatibility has not been verified by this review. |
| `src/app/(dashboard)/pos/page.tsx`, `src/app/api/receipts/lookup/route.ts` | Typed product barcode/SKU search and receipt lookup exist; they do not establish global scan interception or automatic stock intake. |
| `src/lib/products/{detect-code,lookup-code}.ts`, `src/components/products/product-code-lookup.tsx` | Still-photo barcode/QR detection using native `BarcodeDetector`, exact tenant catalog lookup, ambiguity handling and manual fallback exist. This is not continuous camera scanning, invoice OCR or a cloud product directory. |
| `src/components/products/{image-upload,product-form}.tsx` | Lookup can prefill an existing product or use an unmatched code in the form. Cached matches are previews; saving requires reconnect/relookup. Scanning does not automatically add stock. |
| `src/components/imports/import-workbench.tsx`, `src/lib/imports/preview.ts` | CSV/XLSX mapping, validation, confirmation, outcomes/history and reversal controls exist. Only the first 200 rows are displayed; the new intake needs complete inspectable rows. |
| `src/lib/ai/openai.ts::OpenAIProvider.mapInventory`, `generate` | Synchronous text mapping: 60-second timeout, 12,000 output tokens and at most 1,000 rows. Larger input alone cannot provide complete intake. |
| `src/lib/ai/provider.ts::getAIProvider`, `types.ts::AIProvider` | Reusable provider/mock boundary; current text mapping does not implement photo/PDF/transcription. |
| `src/lib/imports/parse.ts::parseImportFile` | CSV/XLSX up to 20 MiB, but only `SheetNames[0]` is read. |
| `src/lib/imports/execute.ts::executeImport` | Chunks of 50 and individual row outcomes, including offline import; no atomic receipt or durable extraction guarantee. |
| `supabase/migrations/015_business_imports.sql::apply_import_row` | New products may receive opening inventory; product updates do not add delivery stock. Do not reuse unchanged for deliveries. |
| `src/app/api/ai/route.ts`, `src/lib/ai/entitlement.ts`, `016_ai_assistant_plumbing.sql` | Existing entitlement/job/approval primitives; `reserve_ai_job` request limits are not a leased queue or batch budget. |
| `src/lib/auth/api-context.ts::apiContext` | Resolves authenticated user, active profile, organization and owner/admin role; reuse server enforcement. |
| `src/store/index.ts::getSubtotal`, `getDiscountAmount`, `getTotal` | Subtotal already includes line discounts; invoice discount is separate; tax is added afterward. |
| `src/app/(dashboard)/reports/page.tsx::fetchReport` | Sale items capped at 200, inconsistent header/item filters, tax-inclusive revenue and missing-cost zero fallback. |
| `src/app/(dashboard)/dashboard/page.tsx::fetchDashboardData`, `src/lib/accounting/reconciliation.ts::dailySales` | Separate existing calculations/date/status policies; reference points rather than the new BI contract. |
| `src/lib/offline/vendor-transactions.ts::persistOfflineVendorTransaction` | Mirror sale uses `notes = 'Vendor transaction <uuid>'`; mirror warehouse is not dependable vendor location. |
| `001_initial_schema.sql`, `014_accounting_controls.sql::reverse_financial_sale` | Retail historical line costs exist; inspected vendor item schema lacks historical cost/location and inspected schema lacks operating expenses. Full reversals differ from payment corrections. |
| `014_accounting_controls.sql::track_private.record_stock_change` | Inventory changes create signed `inventory_ledger` movements; requested movement rows must not be counted again. |
| `src/lib/offline/sales.ts::persistOfflineSale`, `db.ts::addToSyncQueue`, `sync-engine.ts::{pushChanges,executeSyncOperation,pullData}` | Stock snapshots, queue deduplication and conflict/recovery remain shared-stock release gates. |
| `src/components/layout/nav-config.ts`, `src/app/globals.css`, `src/components/ui/*`, `src/hooks/use-realtime-sync.ts` | Extend existing role navigation, Retail tokens/components and scoped invalidation. |
| `render.yaml` | One Node 22 web service; worker hosting is an additional service/cost. |

The [audit review](AUDIT_REMEDIATION_REVIEW_2026-10-15.md) records scoped dependencies, especially F01–F03, F13–F17, F22 and F29. These are historical findings pending revalidation, not a declaration of remediation. The older 28 focused tests remain historical baseline evidence. The 19 October comparison additionally passed 24 focused tests across seven existing product-code/product-form/receipt/import suites; a worker-start timeout passed on an isolated single-worker retry. These results do not validate new intake/BI milestones, live extraction, real devices or deployment; they were not rerun for this documentation revision.

### Reference architecture reconciliation

The reviewed file `C:\TradeTrack-main\TradeTrack-main\docs\ai-ml-integration\BARCODE_AND_INVENTORY_INTEGRATION_SPEC.md` belongs to a different checkout. That checkout lacks the current product-photo lookup, import and text-AI modules above. Its architecture/examples are useful input, not an implementation completion report or authority over this specification.

- Reuse the actual barcode/photo lookup and import/AI foundation instead of rebuilding or describing it as absent. Preserve exact identifier conflicts as exceptions; an exact match is not automatically “100% confidence.”
- Global HID interception, continuous camera scanning/decoder fallback, rapid scan-to-stock, full fractional UOM, serial/IMEI tracking, supplier-channel ingestion and the legacy migration studio were not found implemented in either inspected checkout. They are separate scope candidates, not hidden prerequisites of the current programme.
- The reference's 100-row bulk RPC and named UOM/OCR/migration files are proposals, not existing contracts. Current imports use 50-row chunks. Do not copy its example migration filename or assume the RPC exists.
- Keep this specification's one batch approval and atomic posting per receipt. The reference mixes whole-import rollback and partial row success without a settled boundary; neither replaces this contract.
- Two-minute/2,000-item, zero-error, universal compatibility and “100% offline” claims have no acceptance evidence from this review. Keep measured limits, explicit online upload/posting and preserved offline drafts. Keep receipt costs separate and reject silent SKU/price inventions or autonomous stock changes.

### Delivery rule

Follow [M0–M11](AI_AND_BI_MILESTONES.md) sequentially. M1–M10 each include the merchant UI, server/command/data work, approval or drill-down, recovery and acceptance proof. Private upload/worker work is completed inside usable spreadsheet intake (M2), not delivered as a stand-alone unfinished feature. AI preparation is connected through reviewed posting in M3–M6; grouping/review must not wait until M7. Each BI calculation ships with its usable view and matching details in M8–M10.

Within a milestone, A/B/C execution batches provide resumable checkpoints. Do not start the next milestone until the current completion gate passes. Earlier single-modality milestones provide complete workflows; M7 proves mixed sources and programme capacity rather than becoming the first working intake. The full scope below remains required; incremental delivery does not defer requested modalities out of the programme.

## 2. Inputs and merchant workflow

| Input | Processing and review |
| --- | --- |
| Printed JPG/PNG invoice photos | Extract descriptions, quantities, units and costs; retain originals and field references. |
| Digital PDFs | Process all selected pages; preserve page/document identity and evidence. Default selection is all pages. |
| Scanned PDFs | Visual extraction with explicit unreadable/ambiguous fields and page failures. |
| Handwritten notes/photos | Prepare readable rows; require corrections for uncertain numbers, names and units. Unreadable never means zero. |
| CSV/XLSX | Discover/select worksheets; parse complete selected sheets deterministically. AI may interpret messy headings/meaning. Preserve sheet/row/cell identity. |
| Pasted lists | Retain original text and line/span references. |
| Voice | Record/upload completed dictation or corrections, transcribe, then prepare editable rows linked to recording/transcript/time spans. |
| Mixed bulk sources | Multiple supported inputs in one tracked batch with per-source progress and outcomes. |

Voice means stock intake, not conversational voice POS. English is the initial validation language. Evaluate Pidgin and Hausa independently; enable/advertise each only after accepted results, never solely on provider capability.

1. Create a batch with mode `opening_stock` or `additional_delivery` and an authorized default location.
2. Upload sources, select sheets/pages, paste lists or add recordings; show selected/excluded source counts and progress.
3. AI proposes receipts and rows. One file can contain several invoices; one receipt can span files. Allow split/merge/reassignment before approval, preserving merchant grouping corrections on retries.
4. Resolve product, quantity, cost, conversion, duplicate and unreadable-input exceptions; explicitly change individual receipt locations where needed.
5. Review batch totals and receipt counts, including ready, excluded and failed receipts. Group quantities by meaningful unit and costs by currency; disclose incomplete cost totals.
6. Approve an explicit selection of ready receipts once. Unresolved/excluded receipts remain visibly outside the approval.
7. Track posting and reconcile saved/failed/needs-review receipt outcomes, committed quantities, evidence and eligible retries. Partial completion must never look wholly saved.

### Business rules

- Opening stock establishes an initial balance only where the product/location has no inventory row or movement history, even a zero balance. Recheck under lock at posting; zero is not proof of initial setup.
- Additional delivery increments the then-current stock; it never replaces a balance with extracted quantity.
- Match only within the merchant catalog. Exact conflicting SKU/barcode/identifiers block automatic matching. Ambiguous variants, sizes and units require confirmation.
- Preserve original quantity, purchase unit, confirmed conversion and resulting stock units. Initial posting accepts positive integer stock units within database range. Fractional stock requires an explicit supporting schema change before posting.
- New products remain reviewed drafts with required identifiers/prices validated. Repeated references may share a draft; atomically map it to one product. Uniqueness/race conflicts return to review, not silent merging.
- Keep receipt costs separate from catalog costs and selling prices. Missing costs remain null/unresolved. Retain currency and unit-cost basis; resolve mismatches explicitly without guessed exchange rates.
- Preserve catalog cost/price unless a separate validated update is approved. Document ordering must not choose which catalog cost wins.
- Retain original/extracted values, corrections, product identity, conversion and actor/time/source evidence on every posted line.
- Manual and AI entry use the same deterministic validated receipt command. AI proposes; application/database code owns permissions, arithmetic and mutations.

### Exception review

Show batch totals/stages and separate queues for unresolved products, quantities, costs, conversions, duplicates and unreadable inputs. Put source and extraction side by side; provide audio playback and transcript editing. Bulk correction applies only to explicitly selected rows with a visible preview. Provide the complete paginated/virtualized row view, including ready rows.

Combine deterministic validation, catalog conflicts, source-quality signals and measured extraction performance. Model self-reported confidence is not proof. Invoice arithmetic can flag discrepancies, but tax, discounts, freight and other charges may explain them. Preserve charges separately; do not force them into product costs.

## 3. Durable processing and capacity

**Upload → validate → group sources → parse/transcribe → extract → match → review → approve → post → reconcile outcomes.** Grouping can be refined after parsing; reconcile final source coverage before receipt readiness.

| Proposed pilot limit | Required enforcement |
| --- | --- |
| 100 files/batch | Reserve capacity across concurrent uploads; recordings count as files. |
| 500 PDF/image pages | Count actual PDF pages and individual images before extraction. |
| 20,000 prepared rows/batch | Count complete rows across receipts. Overflow preserves completed work, flags incomplete coverage and blocks affected receipt approval. |
| 250 MiB total upload | Server reservations and actual-byte accounting. |
| 20 MiB/file | Validate content/decoded shape as well as filename and bytes. |
| Ten minutes/recording | Verify decoded duration in addition to file size. |

These targets are unmeasured. Test exact boundaries and boundary-plus-one failures. Never silently truncate. Pasted text and decoded spreadsheet/image/PDF work also need resource bounds; small compressed files can expand greatly. Track selected, parsed, blank/header, failed and prepared segments so omissions are visible. An incomplete provider response is a failed task, not a valid shorter receipt.

Use a dedicated Node worker with PostgreSQL durable jobs. Web requests authorize/create/resume work and return promptly. Neither the browser nor an unawaited route task owns processing. The web-only `render.yaml` needs a separately approved worker service. Render supports continuously running background workers; PostgreSQL queue semantics remain TradeTrack's design responsibility. [Render background workers](https://render.com/docs/background-workers)

- Split page/row/audio extraction into bounded tasks with stable source ranges and processing versions; persist checkpoints/results.
- Atomically lease jobs with heartbeats and lease tokens. Recover expired leases after restart; stale workers cannot overwrite newer results.
- Start with two concurrent extraction jobs per tenant and four globally, coordinated durably across all worker instances, with fair scheduling.
- Retry transient failures with backoff up to three total attempts. Preserve permanent failures for correction; explicit subsequent retries remain visible and budgeted.
- Persist stage, attempt, available time, lease owner/token/expiry, heartbeat, result refs, provider/model/version, coverage and sanitized error/usage.
- Cancel unstarted work; fence in-flight results against changed revisions/cancellation. Posting/cancellation serialize on the receipt: cancellation wins before commit or the saved receipt remains saved. Cancellation never reverses posted stock.
- Distinguish budget-paused, needs-review, failed, cancelled, prepared and posted states. Batch rollups derive from actual job/receipt counts.

Reuse the provider boundary with document/image extraction and transcription adapters. Vision-capable PDF processing can use text plus page images. Provider spreadsheet augmentation reads up to the first 1,000 rows per sheet; it cannot be the authoritative bulk parser. Parse complete selected worksheets in application-controlled code. [Official OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs)

Use file transcription for completed recordings, then validate prepared rows. Ordinary dictation needs no realtime voice-agent stack. Select supported formats/models during implementation and evaluate them under the application limits. [Official OpenAI transcription documentation](https://developers.openai.com/api/docs/guides/speech-to-text)

### Private sources and cost controls

Upload directly to private storage through short-lived sessions scoped to authenticated tenant/batch/source. Verify completion, actual bytes/content and server-computed hashes before enqueuing. Prevent arbitrary URL fetches and cross-tenant source attachment. Authorize previews/downloads; never expose public originals or log document bodies, keys or signed URLs. Use RLS, deliberate grants, tenant-consistent relations and restricted worker commands. Supabase Storage uses object policies; server service keys bypass them and stay server-only. [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)

Show estimated usage and an approved batch spending limit before processing. Extend current entitlement/rate controls with batch reservations; every page must not count as a separate merchant request without an explicit policy. Reserve headroom before dispatch, reconcile actual usage and disclose estimate differences. Record pages, audio duration, model usage, retries and cost; measure cost/page, audio minute and accepted row. Exhaustion pauses new work without discarding prepared results. Raising a limit requires an explicit updated spending approval.

Agree evidence retention/deletion before pilot; do not invent an expiry or purge posted evidence during cancellation/rollback.

## 4. Persistence and approval contracts

All entities below are proposed additive structures, not existing tables.

| Entity | Required persisted information |
| --- | --- |
| `stock_intake_batches` | Tenant/creator, mode/default location, revision, stage/outcome counts, capacity/usage reservations, budget, approval references and overall outcome. |
| `stock_intake_sources` | Tenant/batch, private original/hash/type/size/pages/duration, selected sheets/pages, segments/grouping, upload completion, recording/transcript refs and coverage. |
| `stock_intakes` | Receipt identity, source segments, supplier/invoice fingerprint, location, revision/readiness, exceptions, approval hash, command key and committed outcome/result. |
| `stock_intake_lines` and shared product drafts | Original/extracted/corrected fields, product/unit versions, quantities/conversions/stock units, receipt cost/currency, source refs and review/posting lineage. |
| `stock_intake_jobs` | Stage/range/version, attempt/available time, lease/token/expiry/heartbeat, status, result refs, usage and safe failures. |
| Immutable approval manifest | Tenant, approving actor/time, batch revision, selected receipt IDs/revisions/canonical hashes, reviewed draft/conversion versions, duplicate acknowledgments, exclusions and command IDs. |

Enforce tenant-consistent foreign keys, unique receipt command/job identities and one stock position per product/location. Preserve versioned evidence and approval/posting history. Reviewed payloads/conversions cannot be overwritten silently.

| Proposed API | Contract |
| --- | --- |
| `POST /api/stock-intake-batches` | Create draft and authorized upload sessions; return stable ID/revision/limits. |
| `GET /api/stock-intake-batches/{id}` | Bounded authoritative progress, exception/outcome counts, usage and approval references. |
| `PATCH /api/stock-intake-batches/{id}` | Edit unposted grouping/rows/drafts/locations using expected revisions; request additional upload sessions as needed. |
| `POST …/{id}/process` | Validate completed uploads/coverage, reserve budget and enqueue/resume preparation; return durable tracking and `202`. |
| `POST …/{id}/approve` | Validate expected revisions/readiness; persist immutable selected manifest and enqueue posting transactionally. Identical retries return the same manifest. |
| `POST …/{id}/retry` | Retry eligible failed work; never repeat posted effects. Changed payloads require renewed approval. |
| `POST …/{id}/cancel` | Cancel uncommitted work; return explicit saved/in-flight/cancelled outcomes. |

Add bounded child reads for `/receipts`, `/rows`, `/sources` and `/exceptions`, with stable cursors/filters/revision, and authorized source previews. All merchant writes use idempotency keys; reuse with a different canonical request is a conflict. Actor/tenant come from authenticated server context. Distinguish unauthenticated, denied, not-found, stale-revision, invalid-input, limit and retryable-service errors with stable codes and safe corrective actions. Never leak cross-tenant record existence. Long work returns promptly; pagination exposes revisions so changed grouping can restart inspection.

### Shared receipt command

One batch approval is not one enormous transaction. Each receipt commits all approved lines/product creation/evidence together or none; batches may partially succeed.

1. Lock receipt/command; validate the recorded approval and payload hash. Recheck approving user's active status, tenant, role/permissions and entitlement inside posting. Background execution consumes that approval; it cannot substitute another actor/payload.
2. Lock affected inventory/product rows in consistent order. Safely create missing delivery positions under the unique product/location constraint. Validate identity/unit versions, conversion, quantities and separately approved catalog updates.
3. Apply delivery quantities as locked database increments. Quantity changes from concurrent sales/deliveries alone do not invalidate approval. Product identity/unit changes and explicit catalog-cost conflicts require renewed review. Opening stock retains serialized still-initial checks against competing first movements.
4. Commit stock, reviewed product-draft mapping, evidence, audit attribution and durable result atomically. Reuse the authoritative stock-ledger trigger rather than duplicating movements. It currently uses `auth.uid()`; worker posting must preserve verified approving-actor attribution without enabling client impersonation.
5. Database uniqueness ensures repeated execution returns the original result. Recover response loss by command ID. Failed transactions leave no partial stock or product creation.

Editing approved unposted receipts invalidates approval; preserve previous manifests as history. Posted receipts are immutable in this workflow. Later approval selects only newly ready/corrected unposted receipts. Reprocessing cannot overwrite human corrections or approved revisions.

Detect duplicates with tenant-scoped source hashes and invoice fingerprints across batches/groupings. Legitimate repeat deliveries require acknowledgment/reason in the manifest. Identical descriptions alone are not duplicate proof. Serialize duplicate checks across concurrent approvals; source duplicate detection and command idempotency are distinct controls.

### Offline behavior

Save small drafts locally with tenant/account isolation. Protect/clear displayed caches on account switch without discarding recoverable unsynced business operations. Upload, AI and final stock posting need connectivity. Server-accepted jobs continue without a browser; reconnect by stable batch ID and retrieve authoritative status instead of resubmitting. Do not promise offline retention of hundreds of megabytes without device-storage measurement. Offline approval clicks are not server-approved or saved stock.

## 5. Retail BI definitions

All cards, charts, drill-downs, reports and AI consumers use one authorized server definition over complete eligible data. Use database numeric/currency-precision arithmetic; do not sum browser subsets or silently cap aggregate inputs. Details paginate independently of totals. Use a common read snapshot/as-of basis so figures can reconcile.

### Eligible records and deduplication

- Include completed retail invoices and issued vendor transactions in `pending`, `partial` or `completed` state; exclude cancelled vendor transactions. Issued credit is revenue before payment. Obtain business sign-off before release.
- Exclude full `void`, `refund` or `return` reversals from the original period, restating historical comparisons. A full reversal through a linked vendor mirror excludes its canonical vendor transaction. Payment correction does not create revenue or a full reversal.
- Resolve mirrors using the exact tenant-scoped vendor reference in current code. Count the vendor once, suppress every confirmed linked retail mirror and use canonical vendor amounts/items. Do not fuzzy-match names/totals. Missing/conflicting/malformed references create reconciliation warnings; withhold affected metrics if the eligible population cannot be established reliably.
- Exclude `historical_sales` aggregate imports from operational totals and disclose the exclusion.
- Vendor historical costs and dependable location attribution are incomplete. Preserve an unallocated segment; never borrow arbitrary mirror locations. Unfiltered reports include eligible unallocated vendors. Location-filtered reports exclude unattributable vendors and disclose omitted counts/values.

| Metric | Calculation and limitation |
| --- | --- |
| Transaction count | Eligible retail invoices plus canonical issued vendor transactions, after mirror deduplication and full reversals. |
| Revenue | Retail `subtotal - discount`, excluding separately recorded tax; vendor recorded `total_value`. Do not invent vendor tax components. |
| Recorded paid amount | Retail `amount_paid - change_amount` plus vendor `amount_paid`, once per eligible invoice. Reflect recorded corrections without adding correction rows as payments. This is not dated cash collection. |
| COGS | Eligible sale-line quantity × historical line cost. Missing lines/costs and unavailable vendor costs mean incomplete coverage. Never substitute current catalog cost or zero. |
| Gross profit / margin | Revenue minus complete dependable COGS; margin = gross profit / revenue × 100. Return null with reasons for incomplete selected-set costs; margin is null for zero revenue. A separately labeled covered subset is allowed, never an unlabeled whole-set profit. |
| Net profit / margin | Null/unavailable because inspected schemas lack expense data. Gross profit must not be called net profit. |
| Sales trends | Eligible revenue/count grouped by business date, with corresponding prior-period buckets and identical filters/reversal policy. Empty known buckets are zero; unavailable data remains null. |
| Top products | Units and net product revenue; allocate invoice discount once across already line-discounted totals. Canonical vendor item totals appear once. Retain unknown/deleted-product labels. |
| Inventory valuation | Current quantity × current catalog cost, labeled **current-cost estimate**, with valued/unvalued position/unit coverage. Unknown cost is not zero; verified genuine zero differs from a legacy default. |
| Stock alerts | Current per-location positions: out of stock at quantity ≤ 0; low stock at positive quantity ≤ configured minimum. Preserve explicit zero thresholds with null-aware fallback. Missing positions/history are not invented as measured zeros. |
| Stock movements | Authoritative signed `inventory_ledger` movements in selected interval/location; never add requested movements again. |
| Outstanding payments | Current recorded open invoices, deduplicated and excluding full reversals: retail `max(total - (amount_paid - change_amount), 0)` plus vendor `max(total_value - amount_paid, 0)`. Includes invoice tax where recorded; not a complete customer-credit ledger. Invalid payment data produces warnings. |
| Recent activity | Authorized, paginated canonical transactions with status, amounts, source type and underlying record links. Label reversals/payment events separately from sale revenue. |

Cost coverage detects invoices with no lines, missing historical costs and ambiguous legacy defaults, not just non-null fields. Return eligible/covered invoice and line counts plus missing/excluded/unallocated reasons. Inventory coverage is separate from historical COGS. UI formatting must preserve null/unavailable values.

If `L_i` is an already-discounted line total and `D` the invoice discount, allocate `D × L_i / sum(L)` once. Reconcile minor-unit rounding deterministically, with stable line-ID tie breaking. Allocated product totals must equal invoice net revenue. Missing lines or zero denominators yield incomplete allocation coverage, not guessed values.

### Worked example — fictional

Two retail lines have already-discounted totals of ₦900 and ₦1,000. Subtotal is ₦1,900, invoice discount ₦190 and tax ₦128.25. Revenue is **₦1,710**; product revenue is **₦810 + ₦900**, without subtracting line discounts again. With ₦2,000 paid and ₦161.75 change, recorded paid is **₦1,838.25**, including tax; it differs from revenue.

An issued vendor invoice for ₦5,000 with ₦1,000 paid contributes one transaction, ₦5,000 revenue and ₦4,000 open balance. Its mirror adds nothing. Without dependable vendor costs, whole-set gross profit is unavailable. A later full reversal removes the original invoice from original-period operating totals; payment correction alone does not.

### Dates, filters and comparisons

Use organization timezone/currency from `organizations`, default missing timezone to **Africa/Lagos**. Validate settings and return effective values; do not hardcode naira formatting for every business. Default to **seven business-calendar days including today**. Resolve local boundaries to UTC and query half-open `[start, end)` intervals. Retail recognition uses `created_at`; vendors use `date_issued`. Invalid/missing dates create coverage warnings, not guessed dates.

For the live default range, end at captured current time and compare the preceding seven-calendar-day block through corresponding elapsed local time. Example: at 15:00 on 17 October in Lagos, compare 11 October 00:00–17 October 15:00 with 4 October 00:00–10 October 15:00. Resolve calendar boundaries in the organization's timezone, including DST where applicable, rather than fixed 86,400-second days. Closed custom ranges compare complete equally sized calendar ranges. Return current/previous boundaries, aligned buckets and as-of time. A zero previous baseline produces null percentage change with a reason; valid absolute change may still be shown.

Inventory, alerts and open balances are **current snapshots**, independent of the sales date filter. Label their snapshot time separately. Movement/transaction periods and omitted location coverage remain explicit. Drill-downs share summary eligibility/comparison definitions.

## 6. BI API and interface

Proposed authenticated endpoints under `/api/retail-bi`:

| Endpoint | Response |
| --- | --- |
| `GET /summary` | Metric values/availability, trend/comparison, coverage and snapshot cards. |
| `GET /transactions` | Cursor-paginated canonical activity/invoices with record links. |
| `GET /products` | Ranked units/net product revenue and allocation/line coverage; optional product detail filter. |
| `GET /inventory` | Current valuation/alerts by product/location. |
| `GET /movements` | Signed authoritative ledger detail in selected period. |
| `GET /balances` | Current recorded open retail/vendor invoices with canonical links. |

Return `effective_filters` (timezone, currency, locations, UTC intervals and prior intervals), `generated_at`, `snapshot_at`, reporting-definition version, coverage warnings and availability. Each metric contains `value` (decimal string or null), `availability` (`available`, `partial`, `unavailable`), `reasons` and coverage. Counts may be integers; currency serialization must preserve precision. Details return stable next cursors and the same definition/as-of metadata. If intervening changes make an as-of detail irreproducible, require refresh rather than claiming equality.

Validate server filters and cap detail pages. Resolve active tenant/role server-side; owner/admin access, existing location permissions and separate platform-owner routing apply. Never authorize from user-editable metadata or a client organization ID. Keep responses private and outside shared public caches. Client query keys include account, tenant, filters and definition version; clear displayed results on account switch.

Extend owner/admin `/dashboard`; `/reports` and drill-downs consume the same definitions. Preserve the cashier experience and `/admin` platform overview. Use existing Retail tokens, typography, density, components and charts.

- Header: period/location filters, timezone, last successful refresh, stale/partial status and intake action.
- Clear revenue, transaction, recorded-payment and gross-profit/margin cards with reasons for unavailable figures, including net profit.
- Revenue/comparison chart and ranked product bars with accessible data-table equivalents.
- Current valuation/coverage, per-location alerts, signed movements, open balances and recent activity with consistent drill-down links.
- Responsive layout, keyboard access, focus handling, screen-reader status, contrast, reduced motion and usable mobile tables.
- Distinct loading, empty, partial, unavailable, error and stale states. Failed refresh retains the last successful result/timestamp with a visible error, never a new success timestamp.

Invalidate affected queries after committed intake, sales, payments, reversals, product-cost and inventory changes. Extend tenant-scoped realtime invalidation and invalidate directly after successful commands; debounce event bursts. Poll every **60 seconds while visible and online**, refresh on reconnect/return to visibility and retain manual refresh. Polling is the fallback when events/publication are unavailable. Explain that unsynchronized offline activity cannot appear in server totals.

## 7. Acceptance evidence

Use human-checked development and held-out inputs from different merchants/suppliers. Keep datasets separate; report denominators, supported conditions and unresolved cases. No target here has been measured by this documentation delivery.

| Area | Required proof |
| --- | --- |
| Modalities | Separate printed-photo, digital-PDF, scanned-PDF, handwriting, spreadsheet and voice results; English/Pidgin/Hausa evaluated independently. |
| Completeness/scale | Long PDFs, complete selected worksheets, repeated headers, overlapping pages, multi-file invoices/multi-invoice files, mixed batches, >1,000 rows, exact 20,000-row boundary and explicit overflow. All file/page/byte/duration boundaries tested; no silent truncation. |
| Matching/review | Pack conversions, ambiguous variants, conflicting identifiers, missing costs, unreadable fields, shared product drafts and inspection of every prepared row. |
| Durability | Duplicate uploads/approvals, transient/permanent failures, three-attempt policy, worker crashes, stale/expired leases, timeout/response loss, cancellation, budget pause/resume and partial recovery. Repeated jobs never duplicate stock. |
| Stock integrity | Concurrent sales/deliveries, repeated product/location lines, shared drafts, unit/catalog conflicts, opening-stock races and receipt rollback. Existing scoped offline write paths must also preserve stock. |
| Security/recovery | Cross-tenant IDs/private sources, suspension/permission/entitlement changes after approval, account switching, browser closure/reconnect, upload expiry and authoritative status retrieval. |
| BI reconciliation | Independent SQL with >200 sale items, tax, line/invoice discounts, partial/credit payments, multiple vendor mirrors, full reversals, payment corrections, missing costs/lines and imported history. Exact supported currency precision. |
| BI experience | Date boundaries, end-exclusive ranges, equal elapsed comparisons, zero baselines, unallocated locations, snapshot labels, empty/unavailable/stale/error states, responsive browser and accessibility checks. |

Proposed targets: **≥99% exact numeric extraction** for supported printed inputs; no automatic matching on conflicting identifiers; no silent resolution of known ambiguous conversions; **≥50% reduction in median preparation/review time** against manual entry. Report handwriting/voice separately and agree release thresholds from representative pilot data before enablement. Benchmark **100 single-page documents / approximately 1,000 rows within 30 minutes** under the stated worker configuration. BI summary **p95 ≤ two seconds** on an agreed staging dataset. Define sample sizes, scoring and load before claiming success.

Replace the older single-document cost target with modality-specific cost/page, audio minute and accepted row, plus visible batch spending limits. Advertise capacity only after measuring it. Use additive changes and disabled-by-default flags for intake processing/posting, modalities and BI, enforced server-side/worker-side as well as in UI. Rollback disables new work, safely pauses/drains accepted jobs and preserves committed receipts, approvals and evidence.

## 8. Specified choices and external release requirements

Already specified: one approval per ready selection; complete inspectable rows/grouping; receipt-atomic additive posting; shared manual/AI command; dedicated Node worker/PostgreSQL jobs; complete application spreadsheet parsing; integer-unit boundary; modality delivery stages; shared authorized BI definitions and snapshot labels. Do not repeatedly reopen these as missing preferences.

External requirements: representative documents/recordings and merchant sessions; agreed handwriting and language-specific voice thresholds; approved pilot budget/worker hosting; deployed permission/shared-stock-integrity verification; business sign-off on credit recognition, original-period reversals and cost definitions; measured capacity; and evidence-retention policy. These remain separate from completed implementation work.

Forecasting, supplier messaging, shelf counting, autonomous price changes, conversational voice POS and general accounting remain outside this programme. Global hardware/live-camera scanning expansions, full fractional UOM, serial/IMEI tracking, supplier-channel integrations and additional legacy-migration formats also require separate scope; existing photo-code lookup is reused. Reviewed pack conversions producing integer stock units remain included. PDF, handwriting, voice and bulk processing remain inside the sequential milestones.
