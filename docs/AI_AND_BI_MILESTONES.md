# AI stock intake — end-to-end milestones and execution batches

**26 October 2026 · AI-1 through AI-5 not started. Next: AI-1/A in a fresh session.**

This file supersedes the former M0–M11 order. M0/M1/M2 checkpoints remain historical foundation evidence. Retail BI and business insights require a separate future plan. Read the [active plan](AI_STOCK_INTAKE_PLAN.md), [specification](STOCK_INTAKE_AND_RETAIL_BI_SPEC.md), [handoff](AI_AND_BI_IMPLEMENTATION_HANDOFF.md) and [next-session instructions](AI_STOCK_INTAKE_NEXT_SESSION.md).

## Delivery rules

- Finish the current feature end to end before starting the next milestone. A/B/C are resumable engineering batches, not separate completed features.
- Every milestone includes required contracts/data work, private inputs, catalog matching, exception review, one selected-receipt approval, actual saving, outcomes, recovery and evidence. Do not deliver infrastructure instead of the AI feature.
- All input formats remain required. Staging is not permission to defer handwriting, voice or mixed input indefinitely.
- Keep manual product entry/Inventory stock-in available. AI entry is beside those existing actions and opens the same single-item/bulk flow.
- Every completion record identifies commit, changed files, test target, fixture/model versions, commands/results, actual journey, limitations, flag state and exact next batch. Do not claim mock or synthetic data establishes real-world quality.
- Development gates and external production gates differ. No real corpus/reviewer is available currently. That does not stop controlled development, but it blocks claims of real-world quality/merchant acceptance and production enablement.

## Status

| Milestone | End-to-end feature | Depends on | Status |
| --- | --- | --- | --- |
| AI-1 | Printed invoice photos and digital/scanned PDFs through reviewed stock posting | Applicable stock/access safety reverified within this feature | Not started; begin A |
| AI-2 | Complete CSV/XLSX and pasted-list AI intake through saving | AI-1 | Not started |
| AI-3 | Photographed handwriting through explicit correction and saving | AI-2 | Not started |
| AI-4 | English recorded/uploaded dictation and selected-entry recorded corrections through saving | AI-3 | Not started |
| AI-5 | Combined sources, cross-source grouping, shared drafts, duplicates, partial recovery and tested pilot limits | AI-4 | Not started |

## AI-1 — Printed invoices through saved stock

**Demo:** From Inventory's familiar entry action, choose Receive with AI, provide a printed invoice, inspect a source-linked proposal, resolve any required question, review totals, approve once and see the committed receipt/stock outcome. Product entry also offers Add with AI for reviewed starting-stock setup.

- **A — Small working vertical slice:** Establish current Git/isolated test target and manual baseline, create a fixed synthetic printed-invoice fixture plus independent expected answers, and extend provider/source/review contracts. Connect one printed PDF and an existing product through the AI entry point, durable extraction, tenant catalog matching, review snapshot, one approval and shared atomic posting. Add targeted decimal purchase compatibility/approval-consent handling instead of bypassing validators. Prove the slice with database/API tests; distinguish mock and live-provider evidence.
- **B — Complete printed-input feature:** Add printed photos and scanned PDFs, complete page coverage/grouping, both entry-point contexts, new products with generated internal SKUs, explicit catalog-price review, fractional purchases/base-unit conversions and clear progress/recovery. Preparation is automatic after submission; no manual worker/configuration stages in the merchant journey. Fix the confirmed configured-file guidance defect. Retain the older disappearing-row report as unresolved until a trace explains it.
- **C — Acceptance:** Exercise actual provider, private input transport, route/worker/database and browser path on controlled fixtures. Prove no silent page/row loss, receipt atomicity/replay, opening-stock conflicts, concurrent sales/deliveries, actor/unit changes, tenant isolation, browser closure, worker restart, keyboard/mobile behavior and original manual entry. Record costs/latency and remaining external production gates.

**Gate:** Both familiar entry points lead to a usable printed-photo/digital/scanned-PDF feature with review, approved saving, outcomes and recovery. Controlled live-provider evidence is required; source files and expected answers are separate. A missing provider/budget/hosted prerequisite is recorded, not disguised as a pass. Do not start AI-2 until the AI-1 development gate passes.

## AI-2 — Spreadsheets and pasted lists

**Demo:** Upload a workbook with two selected sheets and paste a separate delivery list; AI interprets messy headings/descriptions, deterministic code reads complete selected data, and the merchant reviews/approves saved receipts in the same workspace.

- **A:** Adapt complete selected-sheet/text parsing to the versioned fractional purchase contract. Preserve formatted identifiers and source cells/rows. Reuse archive/size/CPU guards; do not reuse integer-only parsing semantics unchanged.
- **B:** Connect AI interpretation where deterministic mappings are insufficient, source selection/coverage, shared product matching/drafts and review through existing approval/posting/outcome machinery. Ask useful heading/sheet questions only where needed.
- **C:** Prove all selected sheets, repeated headers, quoted CSV, fractional values, missing fields, >1,000-row explicit rejection under the AI pilot cap, malformed archives, replay and complete persisted outcomes. Existing ordinary imports continue working.

**Gate:** Both structured sources and pasted text work end to end without truncation; model spreadsheet-file augmentation is not the authoritative parser.

## AI-3 — Handwritten notes

**Demo:** A photographed note produces editable entries; an unreadable number stays unknown until corrected, then the selected receipt is approved and saved with source/correction evidence.

- **A:** Build labelled artificial handwritten-style fixtures and expected fields, reuse the image adapter and add source-quality/ambiguity issue handling. Mark fixture limitations explicitly.
- **B:** Complete handwriting source review/correction, catalog/variant questions, pack/price questions and posting. Never infer an unreadable number as zero or treat model confidence as proof.
- **C:** Run separate extraction/matching/correction and database/browser checks, including blurred/unreadable values and failed-source retention. Record artificial versus any independently reviewed human handwriting distinctly.

**Gate:** Controlled handwriting preparation/review/posting works. Artificial handwriting proves controlled plumbing, not human handwriting accuracy; real-world quality remains a release gate.

## AI-4 — English stock dictation

**Demo:** Record or upload English stock dictation, listen/edit its transcript, inspect the resulting entries, correct an explicitly selected entry by recording when needed, approve and see saved results.

- **A:** Add bounded recording/upload, private originals, English file transcription, duration/format limits and transcript revision/source references. Use configured `OPENAI_TRANSCRIPTION_MODEL`, initially `gpt-transcribe`; recheck official API contracts.
- **B:** Feed transcripts into the shared extraction/matching path, retain recording/transcript playback and corrections, and connect review/approval/saving. Recorded corrections target selected entries and invalidate affected reviews; they never silently create a second delivery.
- **C:** Verify permission-denied/unsupported microphone paths, uploads, ambiguous numbers/units, transcript edits, duplicates, duration boundaries, interrupted processing and no duplicate stock. Score business-critical fields as well as transcript quality. Separate synthesized/scripted audio from representative merchant recordings.

**Gate:** English dictation and recorded corrections work end to end on controlled evidence. No realtime voice-agent stack or conversational voice POS. Other languages need their own later scope/evaluation.

## AI-5 — Mixed batch and prototype completion

**Demo:** Complete the accepted eight-source [walkthrough](AI_STOCK_INTAKE_PLAN.md#accepted-synthetic-walkthrough) in one batch. Correct the unreadable beans quantity and confirm the new oil product, then approve once. Reconcile +40 rice, +15 beans, +2,500 mL oil and NGN 57,000; initial fixture balances become 70/35/2,500.

- **A:** Verify cross-format invoice grouping, multi-file/multi-invoice sources, repeated new-product drafts, corrected locations and duplicate-original/invoice handling. Keep all source evidence and excluded/failed work visible.
- **B:** Complete revision-bound approval, partial posting and restart/reconnect recovery across modalities. Verify cancellations preserve committed receipts and retries consume the original actor/payload approval.
- **C:** Run the whole controlled workflow, independent SQL/ledger reconciliation, authorization/account-switch checks, no-silent-loss coverage and 10-source/1,000-row/20-MiB-file/50-page/ten-minute boundaries plus overflow. Benchmark/report actual provider usage, latency and unknowns. Check that one item follows the same understandable journey.

**Gate:** All required adapters compose into a controlled development prototype; UI/API/worker/stock effects agree with fixed reference answers. Report real-world quality/usability as unverified until representative data and independent review exist. No automatic production enablement or expansion to BI.

## Historical foundation and external release gates

[M0](AI_AND_BI_M0_IMPLEMENTATION_CHECKPOINT.md), [M1](AI_AND_BI_M1_IMPLEMENTATION_CHECKPOINT.md) and [M2](AI_AND_BI_M2_IMPLEMENTATION_CHECKPOINT.md) document earlier commands, sources, tests and limitations. Their old references to M3/M11 are historical and do not govern current ordering.

Production requires representative inputs, independent labels and merchant sessions; language/modality quality thresholds; a configured processing budget and hosted worker; credential disposition; deployed grants/RLS/actor enforcement; and coordinated safe stock writers. A local flag or isolated test result does not establish these conditions. Preserve unsynced operations, originals and committed receipts throughout verification and rollback.
