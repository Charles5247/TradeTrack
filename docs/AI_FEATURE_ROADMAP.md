# TradeTrack AI stock-intake roadmap

**26 October 2026 · Active programme: AI-assisted normal and bulk stock intake only. AI-1–AI-5 are not started.**

The user's assignment is to add AI to the existing application's stock-entry experience. Optional **Add with AI** and **Receive with AI** actions sit beside familiar product/stock entry, including the stock-in dialog. One item, one document and mixed batches use the same AI flow. Manual entry stays available.

## Active authority

- [Agreed plan and synthetic walkthrough](AI_STOCK_INTAKE_PLAN.md)
- [Build-first brief](AI_TEAM_BRIEF_BUILD_FIRST.md)
- [Current specification](STOCK_INTAKE_AND_RETAIL_BI_SPEC.md)
- [Milestones and A/B/C gates](AI_AND_BI_MILESTONES.md)
- [Engineering handoff](AI_AND_BI_IMPLEMENTATION_HANDOFF.md)
- [Fresh-session starting instructions](AI_STOCK_INTAKE_NEXT_SESSION.md)

The retained filenames containing BI do not put BI into the current programme. The former M0–M11 order is superseded; M0/M1/M2 checkpoints are historical foundation evidence, not new AI completion.

## Current deliverable

Combine printed photos, digital/scanned PDFs, photographed handwriting, complete selected CSV/XLSX sheets, pasted lists and recorded stock dictation/corrections in one batch. Prepare entries against the merchant's catalog; resolve unclear details; inspect any row; review and approve selected ready receipts once; retain saved/failed/needs-review outcomes.

Include new-product starting stock and additive deliveries. Preserve original fractional purchases and exact base-unit conversions, while final stock remains whole catalog units. Generate stable internal SKUs for new drafts; do not invent manufacturer barcodes or prices. Dictation starts with English.

Initial controlled-development ceilings are 10 sources, 1,000 rows, 20 MiB/file, 50 combined PDF/image pages and ten minutes/recording. They are enforced/testable boundaries, not measured performance. The older 100-file/20,000-row spreadsheet guard and synthetic benchmark do not define new AI capacity.

## Delivery order

| Milestone | Complete before moving on |
| --- | --- |
| AI-1 | Printed photos and digital/scanned PDFs through reviewed stock saving from familiar entry pages. |
| AI-2 | Complete worksheets and pasted lists through the same AI journey. |
| AI-3 | Handwriting through correction, approval and saving, with separate quality results. |
| AI-4 | English stock dictation/transcript edits and explicitly targeted recorded corrections through saving. |
| AI-5 | All formats together, grouping, shared drafts, duplicates, partial recovery and controlled capacity proof. |

Each milestone includes its required contracts/database work, UI, approval, actual saving, recovery, tests and demonstration. A/B/C execution batches are checkpoints. All modalities remain required; none is moved to an unspecified later roadmap.

Reuse applicable stock/access safeguards, receipt commands, private sources and durable Node/PostgreSQL jobs. Extend existing provider interfaces rather than add an agent framework, vector database or parallel inventory engine. Preserve historical receipts/approvals and manual behavior; use additive, versioned changes and disabled-by-default AI flags.

## Evidence and release

The user has no real examples or independent reviewer currently. Start with labelled synthetic artifacts and fixed expected answers, including the accepted +40 rice/+15 beans/+2,500 mL oil walkthrough. A model call on these fixtures is synthetic live-provider evidence, not actual merchant accuracy/usability. Earlier foundation tests are not proof of the new AI feature.

Production needs representative inputs, independent reference checking, agreed modality thresholds, unassisted merchant completion, processing budget/hosted worker, credential disposition and deployed permissions/shared stock-integrity verification. Preserve originals and committed receipts when paused or disabled. Record unknown usage as unknown, not zero.

## Separate future work

Retail BI and AI business insights will have their own future plan. Existing proposed [reporting definitions](reference/RETAIL_BI_DEFERRED_REFERENCE.md) are preserved as reference, not active milestones. Forecasting, supplier messaging, shelf counting, autonomous pricing, conversational voice POS, general accounting, hardware-scanner expansion, fractional inventory balances and broader migration tools remain outside this programme. See the [later-feature brief](AI_TEAM_BRIEF_BUILD_LATER.md).
