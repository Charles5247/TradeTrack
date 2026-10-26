# AI-assisted normal and bulk stock intake — specification

**26 October 2026 · Active specification · AI-1 through AI-5 not started.**

The filename is retained for link compatibility. Retail BI is outside this programme; its previous definitions/interfaces are preserved in the [deferred reference](reference/RETAIL_BI_DEFERRED_REFERENCE.md). The [agreed plan](AI_STOCK_INTAKE_PLAN.md) governs scope; [milestones](AI_AND_BI_MILESTONES.md) govern delivery; the [handoff](AI_AND_BI_IMPLEMENTATION_HANDOFF.md) governs execution. Earlier M0–M11 ordering is superseded.

## 1. Evidence and baseline

- Application baseline at discovery: `6f11e6a`, branch `feat/m2-spreadsheet-batches`. Revalidate Git and draft PR state when starting. No AI milestone is complete.
- Historical manual branch baseline: `c5291a9`, parent of combined M0/M1 commit `e30380f`. Product creation used the product form; stock entry used Inventory's stock-in dialog. Preserve that experience and legitimate upstream changes. Preserve safe writes rather than reintroducing the historical read-then-overwrite stock writer.
- Product unit/variant fields also arrived through upstream commit `fb3cb03`; they are not grounds for a broad rollback of the AI work.
- Existing Assistant: text/spreadsheet-derived text → `/api/ai` → provider `mapInventory(text)` → import workbench → `/api/imports` → import RPCs. It does not pass the merchant catalog to the inventory model request; the output contract caps at 1,000 rows. The ordinary importer reads the first worksheet and cannot receive additional quantities into an existing product.
- M0 adds stock/access/account-safety foundations. M1 adds reviewed receipt commands. M2 adds private CSV/XLSX originals, complete selected sheets, durable jobs, matching/review/grouping and receipt-level posting. These are reuse candidates, not an implemented multimodal AI feature.
- Historical artifacts include 54 focused passing tests and a synthetic 20,000-row spreadsheet pipeline. Inspect reports and their environment/limitations; they are not new AI acceptance or measured multimodal capacity.
- Real merchant examples and an independent reviewer are unavailable. The user accepted the synthetic walkthrough as product intent, not extraction/stock-posting evidence.

### Missing-product discovery, 26 October

Read-only development queries showed the new batch `b6887c38-e287-446b-9f1e-6bce7a4aeb06` has configured worksheets but no parse job and zero prepared rows. The guidance condition catches `select_sheets` even when a plan exists and directs users toward setup again. The source also repeats an earlier original without a duplicate acknowledgement, which would block processing later.

The earlier batch `e0ae26ee-2325-4d15-b9f7-a1b554fcb077` still contains two rows. Its reported disappearance from the screen is not explained conclusively. Logs include failed requests and DNS errors. No app or worker was running at inspection. Fix the confirmed guidance defect; do not label the older symptom resolved without response/render evidence.

## 2. Merchant workflow

- Place **Add with AI** beside normal product entry and **Receive with AI** beside Inventory stock entry, including its dialog. Existing manual actions remain available. Owner/admin boundaries remain; no new cashier or platform-owner permissions are implied.
- Both entry points open one AI workflow for single-item and mixed-batch intake. Carry available product/location/operation context. Product setup starts with opening-stock intent; receiving defaults to additional delivery. The merchant can review/change the intended operation before preparation.
- Visible stages: **Provide inputs → Review entries → Review and save**. Use existing design tokens/components. Internal stages are not merchant tasks.
- Choose a default location; allow explicit receipt-level location changes before approval.
- Add files, paste text or record/upload dictation, then submit **Prepare entries**. Automatically inspect, parse/transcribe, extract, match and prepare review snapshots. Spreadsheet selection/mapping becomes a question only where interpretation needs review; all chosen sheets are read completely.
- Show meaningful progress and counts. Distinguish processing, filtered, excluded, blocked, failed and empty states. A configured source must have an actionable next step; never imply completion before entries exist.
- Show original evidence beside reviewed values, including audio playback and editable transcripts. All rows remain inspectable with bounded pagination/virtualization. Keep current filters obvious and reset stale batch-specific filters when opening another batch.
- Focus required input on unresolved identity, quantity, conversion, cost, duplicate and new-product questions. Bulk edits apply only to explicitly selected entries. Clear rows do not need individual confirmation checkboxes.
- Show proposed receipts, location, stock additions, costs, exclusions and failures before one approval of the selected ready receipts. Grouping is inspectable/correctable: one invoice can span sources and one source can contain multiple invoices.
- Report per-receipt saved/failed/needs-review results. Reconnect retrieves authoritative state, not a new submission. Accepted work continues without the browser. Preserve recoverable drafts and evidence when cancelled or paused.

## 3. Input adapters and completeness

| Kind | Required preparation and provenance |
| --- | --- |
| Printed photo | JPEG/PNG/WebP content validation, visual extraction and original image/source reference. Unsupported encodings fail clearly. |
| Digital/scanned PDF | Validate actual PDF/page count, reject unreadable/encrypted inputs explicitly, extract all included pages in bounded jobs and retain original page identity. Scans require visual interpretation, not text-only extraction. |
| Handwriting photo | Same private-image path, separate evaluation/issue handling. Unreadable values stay unknown; artificial handwritten-style fixtures do not establish real handwriting accuracy. |
| CSV/XLSX | Parse complete selected worksheets deterministically; preserve sheet/row/cell evidence and identifiers. AI can interpret headings/messy text. The provider is not the authoritative spreadsheet parser. |
| Pasted list | Preserve original text, parse/extract editable rows and retain line/source references. |
| Recorded dictation | English initially; record or upload bounded audio (MP3/M4A/WAV/WebM), transcribe, then extract entries. Preserve recording and transcript revisions. Corrections target explicitly selected entries; do not guess which receipt an ambiguous correction changes. |
| Mixed batch | Share matching, drafts, grouping, review and approval across all adapters. Identical descriptions alone do not establish duplicates. |

Retain private immutable originals and tenant-scoped hashes. Verify uploaded bytes, not only filename/client MIME. Enumerate every selected page/sheet and emitted row; detect overflow/incomplete/refused outputs and block readiness of affected receipts. Never accept a truncated provider/parser result as complete. Preserve prepared results and report what could not finish.

Use bounded PDF page inspection/splitting in a worker child rather than a synchronous web request. Reuse parser expansion/heap/time limits where applicable. Interpret fresh references through original source/page indices even when provider requests contain chunks.

## 4. Catalog, quantities, prices and duplicates

- Match only the active merchant catalog. Use exact unambiguous merchant identifiers first, with name/variant/unit validation. Supplier item codes are not automatically merchant SKUs. Conflicting identifiers block automatic matching.
- For messy descriptions, application code supplies bounded tenant catalog candidates to AI. Accept candidate IDs only from that set; offer existing catalog search or an explicit new draft where unresolved. Do not add a vector database for this prototype.
- A genuinely new product receives an application-generated internal SKU stable for its shared draft, e.g. `TT-<draft UUID>`. Enforce uniqueness server-side; collisions require review. Preserve supplied manufacturer barcodes; never synthesize them. Repeated appearances can share one reviewed draft only when their identities/units agree.
- Review new-product identity, unit, cost and selling price before its receipts become ready. Missing prices are not zero. Explicit zero remains distinguishable from missing. Receipt costs are separate from catalog pricing; receiving existing products never changes catalog prices implicitly.
- Versioned AI quantities/conversion factors are positive decimal strings: at most 18 integer digits and six fractional digits. Use exact decimal/integer-ratio arithmetic and PostgreSQL numeric storage; do not rely on binary floating-point products. Reject unsupported precision explicitly.
- Final `stock_units = purchase_quantity × units_per_purchase_unit` must be an exact positive integer within the existing stock range, and the resulting balance must fit. Preserve original purchase quantity/unit, confirmed conversion and final units. Support fractional purchase storage with targeted receipt compatibility changes; do not change core inventory/POS quantity storage.
- Built-in physical conversions are exact (kg/g, L/mL, m/cm). Pack/carton/bag conversions are product-specific and require explicit source/catalog support or merchant clarification. Unit incompatibility blocks readiness; do not silently migrate an existing SKU's unit.
- Money is exact decimal currency arithmetic. Calculate product-line receipt cost as purchase quantity × cost per purchase unit, round half-up to currency precision per line, then sum. Retain the source amount; arithmetic discrepancies require review. Tax, freight and discounts are not silently allocated into product costs. Conflicting currencies require review; no automatic FX conversion.
- Additional deliveries add approved quantities to current stock under locks; never replace balances. Opening stock is permitted only with no existing product/location inventory or movement history.
- Detect repeated originals with tenant-scoped hashes and proposed invoice duplicates with fingerprints. Offer returning to an existing draft or an explicit legitimate-repeat acknowledgement/reason. Keep line-level source evidence; do not deduplicate legitimate items just because descriptions match.

## 5. Versioned API, review and posting

Reuse `/api/stock-intake-batches` create/read/edit/process/approve/retry/cancel operations and the current batch/job engine. Extend the typed contract with an AI workflow version; preserve existing integer documents and immutable hashes without rewriting historical approvals. Legacy editors must not open AI decimal payloads as if they were integer spreadsheet drafts. Route them to the shared AI view or retain a read-only compatible history.

| Contract | Required content |
| --- | --- |
| Source | Kind (PDF/image/spreadsheet/text/audio), immutable identity/hash, selected coverage and private original reference. |
| Prepared entry | Nullable source values, decimal purchase/conversion strings, product candidates or shared new draft, issue reasons, warnings, source/page/sheet/row/audio references and corrections. |
| Review snapshot | Batch/review version, canonical values, selected receipt grouping/location, exact totals, exclusions and immutable payload hashes. |
| Approval | Active approving actor, expected revision, selected receipt IDs/hashes, recorded consent and acknowledged exclusions. |
| Outcome | Receipt identity, saved/failed/needs-review result, recoverability and committed stock references. |

Preview arithmetic and validation must be available before approval without falsely marking each line merchant-confirmed. The final batch approval records conversion/identity consent for the complete reviewed selection. Worker preparation/posting consumes that recorded manifest; it cannot substitute another actor or payload or bypass the existing stock command by forging confirmation flags.

Editing an approved payload invalidates its affected approval. Recheck actor active status, entitlement, tenant, location and product/unit identity before posting. A quantity-only concurrent sale does not invalidate an additive delivery. Each receipt commits all its products/lines/stock/ledger/evidence together or none. A batch may partially finish. Retrying an already posted receipt returns its original result; retrying or cancelling never undoes committed stock.

## 6. Runtime, budgets and boundaries

Reuse the dedicated Node worker and PostgreSQL durable jobs. Retain leases, heartbeats, fencing, checkpoints, two tenant/four global concurrent-job ceilings, three automatic attempts and bounded backoff. Permanent/unknown/incomplete results remain available for correction. Expired leases recover on restart; unstarted work can be cancelled.

The current hosting file defines a web service only. Worker provisioning is an explicit deployment dependency, not evidence of an already running hosted worker. Require configured provider budgets and worker setup before enabling live processing. Reserve one merchant-initiated AI usage item per batch; record subjob usage/retries separately. Budget exhaustion pauses further calls without discarding results. Unavailable cost/usage is unknown, not zero. Inspect existing 20-requests/hour semantics when extending reservations so resume/retry cannot double-count the merchant action.

Initial AI ceilings: 10 sources (pasted inputs and recordings count), 1,000 prepared rows, 20 MiB/upload, 50 combined PDF/image pages, ten minutes/recording. Retain underlying legacy guards but do not expose their older 100-file/20,000-row ceiling as AI capacity. Validate actual size, pages and duration. Test each boundary and overflow; incomplete sources cannot become approved receipts.

Extend the existing provider abstraction. Use configured `OPENAI_MODEL` as the initial text/vision candidate and validate capability/access; never silently fall back to mock. Use `OPENAI_TRANSCRIPTION_MODEL`, initially `gpt-transcribe`, for recorded audio. Current references: [file inputs](https://developers.openai.com/api/docs/guides/file-inputs), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [file transcription](https://developers.openai.com/api/docs/guides/speech-to-text). Recheck official contracts before coding. No agent framework/realtime voice stack is required.

Enforce disabled-by-default AI flags in client, API and worker, plus current actor/tenant/location entitlements. Originals remain private; signed access is scoped/short-lived. Treat sources as untrusted content, not instructions. Account changes clear visible drafts/queries and fence late responses. Small local references may be account-scoped; large originals and AI processing require connectivity. Feature disablement preserves saved receipts, evidence and recoverable jobs.

## 7. Acceptance and limitations

Use the [agreed synthetic walkthrough and answers](AI_STOCK_INTAKE_PLAN.md#accepted-synthetic-walkthrough). Generate source artifacts from fixed reference records; keep answer manifests separate from provider inputs and compare with an independently implemented scorer/database reconciliation.

Test per modality and mixed batches: exact numeric fields, correct/missing product matches, omitted/invented rows, unknown values, pack ambiguity, missing prices, repeat originals, multi-page/file invoices, complete worksheets, fractions, source coverage, retries, crashes, lease recovery, partial posting, concurrent stock writes, opening-stock conflicts, changed actors/units, cross-tenant denial and account switching. Include original manual entry, keyboard/mobile behavior, reconnect and explicit progress/empty/error states.

Record mock versus live-provider results, fixture versions, model/configuration, expected/actual results, latency and measured/unknown costs. Artificial handwriting and synthesized speech test controlled plumbing; they are not evidence of actual merchant handwriting, accents or unassisted usability. Saved foundation tests are historical evidence only.

The user has no real examples or independent reviewer currently. Production remains blocked until those exist, quality thresholds are agreed from representative evidence, a merchant completes the journey without coaching, budgets/worker hosting are provisioned, credential disposition is resolved, and deployed permissions plus all relevant stock writers are verified. Development implementation proceeds milestone by milestone without pretending these external release requirements are met.
