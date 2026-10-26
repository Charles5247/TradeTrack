# Build first: AI-assisted normal and bulk stock intake

**26 October 2026 · Agreed direction · Implementation starts in a fresh session.**

A merchant can combine printed invoice photos, digital/scanned PDFs, photographed handwriting, complete CSV/XLSX worksheets, pasted lists and recorded stock dictation in one batch. AI prepares entries using that business's catalog. One item or document uses the same flow.

**AI belongs beside familiar entry.** Add **Add with AI** beside normal product entry and **Receive with AI** beside normal Inventory stock entry and inside the stock-in dialog. Carry the available product, location and operation. Keep the original manual product form and stock-in dialog available; the added M1 manual receipt screen is not their replacement.

## Merchant journey

1. Provide inputs and choose operation/location.
2. AI prepares entries and receipts; meaningful progress continues after browser closure once accepted by the server.
3. Resolve unclear products, quantities, packs, costs, new-product details and duplicates. Clear entries need no individual checkbox. Every entry/source stays inspectable.
4. Review totals, grouping, locations and failed/excluded work; approve selected ready receipts once.
5. See saved, failed or needs-review outcomes. Retry only unposted work without duplicate stock effects.

New-product starting stock and additional deliveries are included. Opening stock cannot overwrite inventory/history. Receipt costs are separate from existing catalog costs and selling prices.

Fractional purchases are included: half a carton can become six pieces; 2.5 L can become 2,500 mL where the catalog uses mL. Preserve the original quantity/unit and exact conversion. Final inventory remains whole catalog units. Incompatible units require review, not silent rounding or product-unit changes.

Application code generates stable internal SKUs for new products that lack them. AI never invents manufacturer barcodes or missing prices. New-product identity, unit and required catalog prices need explicit review. Dictation starts with English; other languages require their own scope and evaluation.

## Evidence and delivery

Real merchant examples and an independent reviewer are **not currently available**. Begin with labelled synthetic sources and fixed expected answers. A controlled prototype does not establish real-world accuracy or merchant usability. The [accepted eight-source walkthrough](AI_STOCK_INTAKE_PLAN.md#accepted-synthetic-walkthrough) expects +40 rice pieces, +15 beans pieces, +2,500 mL oil and NGN 57,000 after explicit simulated corrections.

Initial development ceilings: 10 sources, 1,000 prepared rows, 20 MiB/file, 50 combined PDF/image pages and ten minutes/recording. Enforce/test these without silent truncation. They are not measured throughput. Require a configured processing budget before live calls.

Deliver **AI-1 printed photos/PDFs → AI-2 spreadsheets/pasted lists → AI-3 handwriting → AI-4 English dictation → AI-5 mixed-batch completion**. Each includes review, authorized saving, recovery and evidence. Finish one feature before the next. All modalities remain programme requirements.

Reuse verified M0/M1/M2 commands, uploads and worker foundations. Their checks do not prove the AI feature. Preserve draft branches and evidence; avoid broad reverts and unrelated redesign.

Retail BI, business insights, forecasting, supplier messaging, shelf counting, autonomous pricing and general accounting are separate future work. Read the [plan](AI_STOCK_INTAKE_PLAN.md), [specification](STOCK_INTAKE_AND_RETAIL_BI_SPEC.md), [milestones](AI_AND_BI_MILESTONES.md), [handoff](AI_AND_BI_IMPLEMENTATION_HANDOFF.md) and [next-session instructions](AI_STOCK_INTAKE_NEXT_SESSION.md).
