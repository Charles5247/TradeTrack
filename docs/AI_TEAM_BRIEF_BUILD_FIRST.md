# Build first: bulk stock intake, then Retail BI

**Planning handoff · updated 19 October 2026.** Scope and batch approval are confirmed. This revision updates the plan only; new programme capabilities are not verified in production. The earlier instruction to proceed remains recorded.

## 1. Prepare a whole delivery batch with less typing

A merchant can combine printed invoice photos, digital or scanned PDFs, photographed handwritten notes, CSV/XLSX worksheets, pasted lists and stock dictation in one batch. AI prepares entries using that business's catalog. Manual entry stays available.

We already have barcode/QR generation, typed lookup, still-photo code scanning/product prefilling, basic CSV/XLSX imports and text AI drafts. Reuse them. Photo barcode lookup is not invoice reading or automatic stock receiving. Current imports read one worksheet and display 200 rows; the new workflow must process selected sheets completely and let merchants inspect every row.

**The merchant resolves exceptions, reviews the summary and approves selected ready receipts once. Every prepared row remains available for inspection.**

1. Choose **Opening stock** or **Additional deliveries**, and a default location. Explicitly change individual receipt locations when needed.
2. Add sources, select spreadsheet sheets and see upload/processing progress. Server-accepted processing continues if the browser closes.
3. Check proposed receipts: one file may contain several invoices, and one invoice may span files. Correct grouping before approval.
4. Resolve unclear products, quantities, costs, carton sizes, new-product drafts and duplicates. Inspect sources beside extracted values; play recordings and edit transcripts.
5. Review totals and excluded/failed receipts, approve the ready selection once, then see each receipt's saved, failed or needs-review result.

Each receipt saves all its lines together or none. A batch can partially succeed; retrying failed receipts never repeats saved stock effects.

### Example — fictional

A shop uploads two supplier PDFs, three handwritten delivery photos and a workbook with two selected sheets. AI groups receipts and flags an unreadable quantity and an uncertain carton size. The merchant corrects these exceptions, inspects any other rows and approves the batch once.

For **10 cartons of Peak Milk 170g**, a confirmed **12 units per carton** means **120 stock units**. With 30 units on hand, the preview shows 150. If another sale changes the balance before posting, the delivery still adds 120 to the then-current balance. The saved receipt shows the committed result.

Opening stock establishes a balance only where the product/location has no inventory or movement history. It cannot overwrite stock. Unreadable values stay unresolved; missing costs never become zero. Receipt costs are separate; catalog costs and selling prices change only through a separately approved, validated update.

### Voice and scale

Voice covers recorded stock dictation and corrections. English is the initial validation language. Evaluate Pidgin and Hausa separately and enable each only after accepted results. Conversational voice POS is outside this programme.

Proposed pilot limits: **100 files, 500 PDF/image pages, 20,000 prepared rows and 250 MiB per batch**; **20 MiB per file** and **ten minutes per recording**. These are unmeasured targets. Enforce and test limits visibly; never silently omit pages, worksheets or rows. Show estimated processing usage and a batch spending limit before starting; pause when the approved budget is exhausted.

## 2. Show dependable Retail BI

Next, extend the owner/admin dashboard with revenue, transaction count, recorded payments, trends, top products, current inventory value, stock alerts, movements, outstanding balances and recent activity. Figures open authorized supporting records.

Example: the owner selects seven business-calendar days and sees revenue excluding separately recorded tax. An issued credit sale contributes revenue even if unpaid; its balance appears under outstanding payments. A linked vendor mirror counts once. Gross profit appears only with dependable historical costs; net profit is unavailable because expense data is absent from the inspected schema.

Use business timezone/currency, explain incomplete data, show the last successful refresh and label current snapshots separately from period sales. Unsynchronized offline activity cannot appear in server totals. Preserve the cashier workflow and separate platform-owner dashboard.

## Delivery and exclusions

Backend/database owns authorized stock commands, durable jobs, approvals and reporting arithmetic. AI owns extraction, transcription, matching and evaluation. Frontend owns upload, review, outcomes and accessible BI. Infrastructure owns private storage and the additional worker service. Extend the existing application and design system.

PDF, handwriting, voice and mixed bulk processing are stages **inside this programme**. Forecasting, supplier messaging, shelf counting, autonomous price changes and general accounting remain outside it.

Production gates include shared stock-sync integrity, authorization/account isolation, a safe spreadsheet parser, modality tests, business approval of metric definitions and a funded pilot. Earlier focused tests do not prove these capabilities.

## Build one complete feature at a time

Follow the [milestone plan](AI_AND_BI_MILESTONES.md): readiness → manual receipt → spreadsheet batches → AI pasted lists → printed photos/PDFs → handwriting → recorded voice → mixed bulk intake → sales/payment BI → product/profit BI → stock/operations BI → pilot.

Each milestone has three execution batches and an end-to-end completion gate. Finish the usable feature, including saving or drill-downs, failures/recovery and tests, before starting the next milestone. Upload/worker infrastructure ships with spreadsheet intake; review and posting ship with every input type, rather than waiting for final integration.

Hardware-scanner interception, continuous camera scanning, fractional UOM and IMEI tracking from the reference architecture are separate candidates, not completed work or additions to this scope. Integer pack conversions stay included.

Read the [specification](STOCK_INTAKE_AND_RETAIL_BI_SPEC.md), [engineering handoff](AI_AND_BI_IMPLEMENTATION_HANDOFF.md) and [roadmap](AI_FEATURE_ROADMAP.md). Only planning documents change in this revision; production operations, hosting spend and rollout still require their applicable release requirements.
