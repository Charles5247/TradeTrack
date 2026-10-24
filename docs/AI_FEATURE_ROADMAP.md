# TradeTrack AI and Retail BI roadmap

**Implementation roadmap · updated 21 October 2026.** Programme scope and batch approval are confirmed. M0's isolated gate passed; M1 is in progress. Production release remains blocked pending credential disposition and hosted verification. Examples are fictional. Milestones describe order, not delivery dates or measured capabilities.

## Current programme

Extend the production app to reduce merchant stock-entry effort and provide dependable owner/admin reporting. Do not rebuild existing workflows.

- [Build-first team brief](AI_TEAM_BRIEF_BUILD_FIRST.md)
- [Complete stock-intake and Retail BI specification](STOCK_INTAKE_AND_RETAIL_BI_SPEC.md)
- [Sequential milestones and execution batches](AI_AND_BI_MILESTONES.md)
- [Ordered engineering handoff](AI_AND_BI_IMPLEMENTATION_HANDOFF.md)
- [Candidates outside this programme](AI_TEAM_BRIEF_BUILD_LATER.md)
- [Separate reliability/security review](AUDIT_REMEDIATION_REVIEW_2026-10-15.md)

| Priority / ID | Deliverable | Merchant outcome |
| --- | --- | --- |
| 1 / AI-01 | Bulk stock intake, catalog matching and reviewed product drafts | Combine printed photos, digital/scanned PDFs, handwritten notes, complete selected CSV/XLSX sheets, pasted lists and recorded stock dictation/corrections in one batch. Resolve exceptions, inspect any row, review the summary and approve selected ready receipts once. |
| 2 / BI-01 | Retail BI dashboard and shared reporting API | Authorized revenue, transaction count, recorded payments, trends, top products, inventory valuation/alerts/movements, outstanding balances and activity, with consistent drill-downs and coverage warnings. |

PDF, handwriting, voice and bulk processing are included delivery stages, not deferred enhancements. Stock voice starts with English validation; Pidgin/Hausa enablement requires separate acceptance. Conversational voice POS remains outside this programme.

Reuse the current barcode/QR renderers, typed lookup, still-photo barcode/QR detection and product prefilling, structured imports and text AI. The review of the external barcode/inventory architecture found proposals rather than a completed scanner/UOM/intake implementation. `C:\TradeTrack` contains product-photo lookup/import/AI modules absent from that other checkout. Current imports read the first worksheet, display 200 rows and execute 50-row chunks; text AI caps at 1,000 rows. These are starting points to extend, not proof that bulk intake is done. The 19 October review's 24 focused passing tests across seven existing suites cover that baseline only.

For intake, distinguish still-initial opening stock from additive deliveries. Preserve source evidence, confirmed conversions and receipt costs; do not silently change catalog costs/prices. Correct receipt grouping across files/pages before approval. Each receipt posts atomically; partial batch outcomes and safe retries are explicit. Concurrent quantity changes alone do not invalidate an approved delivery increment. Manual and AI entry use the same validated command.

Proposed pilot limits are 100 files, 500 PDF/image pages, 20,000 prepared rows, 250 MiB total, 20 MiB/file and ten minutes/recording. These are unmeasured; enforce/test boundaries without silent truncation. Use private uploads, PostgreSQL durable jobs and a dedicated Node worker, initially two tenant/four global concurrent extraction jobs and three total transient attempts. Display estimated usage and a batch spending limit; pause without discarding results when exhausted.

BI uses complete authorized server data and precise arithmetic. Revenue excludes separately recorded retail tax, includes issued credit and counts vendor mirrors once. Full reversals restate original periods; payment corrections do not create revenue. Historical cost gaps make gross profit unavailable; net profit is unavailable without expenses. Inventory/alerts/open balances are labeled current snapshots. Use organization timezone/currency, seven business-calendar days by default and comparable elapsed periods. Preserve cashier and platform-owner experiences.

## Sequential milestones and release gates

Complete one end-to-end feature before starting the next milestone. Each milestone has A/B/C execution batches, a merchant demonstration, acceptance tests and recovery requirements in the [milestone plan](AI_AND_BI_MILESTONES.md). All new milestones are **not started**; existing foundations are not counted as completed new work. M0/M11 are readiness/release gates; M1–M10 deliver usable features.

| Milestone | Feature completed before moving on |
| --- | --- |
| M0 | Verify/repair scoped stock, security, account-isolation and parser readiness. |
| M1 | Manual stock receipt: enter, review, approve, post and reconcile. |
| M2 | Complete spreadsheet batch intake, including private upload, worker execution, full review, approval and outcomes. |
| M3 | AI pasted-list intake through reviewed stock posting and budget/retry recovery. |
| M4 | Printed invoice photos and digital/scanned PDFs through reviewed stock posting. |
| M5 | Handwritten notes through correction, approval and stock posting. |
| M6 | Recorded English dictation/corrections through stock posting; other languages individually evaluated/gated. |
| M7 | Mixed-format bulk grouping, approval, partial recovery and programme capacity proof. |
| M8 | Reconciled sales/payment BI: cards, trends, transactions, drill-downs and refresh together. |
| M9 | Product performance and dependable historical-cost/profit views with matching details. |
| M10 | Inventory valuation, alerts, movements and current open balances with matching details. |
| M11 | Complete evaluation and approved merchant pilot with measured results. |

An execution batch is a resumable checkpoint within its milestone. Do not mark a feature complete after its database/API work or defer its UI, approval, saving, recovery or drill-downs to a later milestone. Grouping/review/posting are present in each applicable input workflow; M7 combines them rather than introducing the first usable intake. Record unmet conditions before moving on.

Use additive changes and disabled-by-default flags. Rollback preserves committed receipts/evidence. Existing `persistOfflineSale`, `addToSyncQueue` and sync conflict handling remain production gates: a new receipt command cannot compensate for another path losing stock changes.

Measure each modality separately, including held-out merchant inputs, >1,000 rows and the proposed 20,000-row boundary, retries/crashes, browser reconnection and cross-tenant access. Proposed targets: ≥99% printed numeric accuracy, ≥50% median preparation/review time reduction, 100 single-page documents/~1,000 rows within 30 minutes, and BI summary p95 ≤2 seconds on agreed staging data. Handwriting/language-specific voice thresholds, pilot budget/hosting, metric-policy sign-off and measured capacity remain external release requirements. The earlier 28 focused tests do not establish these capabilities.

## Candidates outside this programme

IDs from the earlier roadmap remain stable; they are not new approvals. Stock dictation formerly discussed under AI-04 and PDF/handwritten/bulk intake under AI-15 now belong to AI-01. BI is deterministic reporting; general AI business questions remain a separate candidate.

| ID | Candidate | Required foundation / example |
| --- | --- | --- |
| AI-02 | Ask business questions | Explain authorized shared BI definitions with periods and supporting records. |
| AI-03 | Guided actions | Prepare a transfer draft for review using a dependable authorized command. |
| AI-04 | Conversational voice POS/search | Separate cart/search workflow, language evaluation and approval policy; stock dictation is already in AI-01. |
| AI-05 | Delivery-to-PO matching | Compare reviewed receipts against a selected order; dependable partial receiving and human damage confirmation. |
| AI-06 | Supplier-cost/margin explanation | Calculate owner-reviewed price proposals from reliable costs; no autonomous price changes. |
| AI-07 | Restocking review | Explain thresholds and selling pace; reliable stock/history and explicit uncertainty. |
| AI-08 | Owner narrative summary | On-demand summary from shared definitions; schedules/external delivery need separate support. |
| AI-09 | Supplier-message drafts | Reviewed recipient/content plus a supported integration and explicit sending approval. |
| AI-10 | Demand forecasting | Reliable history, stockouts, lead times and evaluation against a simple baseline. |
| AI-11 | Cross-selling/slow-stock bundles | Useful basket history, dependable costs and owner pricing constraints. |
| AI-12 | Shelf-photo count suggestions | Reviewed count workflow, representative labeled images and measured accuracy. |
| AI-13 | Unusual-activity investigation | Complete linked events and measured false alarms; flags do not prove wrongdoing. |
| AI-14 | Customer/debt assistance | Customer identity, complete credit/payment history and communication preferences. |
| AI-15 | Additional legacy migration formats | Word tables and exported legacy data beyond the supported intake formats; separately evaluated. No external accounting integration is implied. |
| AI-16 | Payment-reference assistance | Trusted bank/provider reconciliation; a screenshot/SMS cannot prove payment. |

Forecasting, supplier messaging, shelf counting, autonomous price changes and general accounting remain excluded from the current programme. Global HID/live-camera scanner expansion, rapid scan-to-stock, fractional multi-UOM, serial/IMEI tracking, supplier-channel connections and broader migration studio from the reference architecture are also separate candidates; existing still-photo code lookup and reviewed integer pack conversion are reused/included. Select future work using pilot evidence and merchant benefit. Do not copy unsupported two-minute/2,000-item, zero-error or universal-device claims into acceptance results.

## Responsibilities and stop boundary

AI prepares/interprets/evaluates; deterministic application/database code owns permissions, calculations, stock, idempotency, audit and approvals. Backend owns reliable saving/reporting; frontend owns review/recovery; infrastructure owns secure storage/worker hosting. Keep manual workflows available. Cloud upload/AI/posting need connectivity; small local drafts require account isolation, and server-accepted jobs continue independently of the browser.

Implementation is now authorized and M0 is in progress; the [checkpoint](AI_AND_BI_M0_IMPLEMENTATION_CHECKPOINT.md) records local changes, verification and open gates. Continue through the milestone gates. Production operations, credential changes, worker/provider spending and pilot rollout retain their applicable release requirements; no hosted migration or deployment has been performed in this batch.
