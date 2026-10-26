# TradeTrack AI stock intake — agreed delivery plan

**26 October 2026 · Active plan · AI implementation not started.**

This replaces the M0–M11 execution order. Existing M0/M1/M2 code and checkpoints remain reusable foundation and historical evidence, not proof that AI intake is delivered. The user requested documentation now and implementation in a fresh session. This revision changes no application code, database, runtime flags or deployment.

## 1. Agreed outcome

Build one journey for one item, one document or a mixed batch:

**Provide inputs → AI prepares entries → resolve unclear details → review the summary → approve selected ready receipts once → inspect saved, failed or needs-review outcomes.**

- Inputs: printed invoice photos, digital/scanned PDFs, photographed handwriting, CSV/XLSX worksheets, pasted lists and recorded stock dictation/corrections. All remain required programme scope.
- Outcomes: new products with starting stock and additional deliveries for existing products. Opening stock never replaces an existing balance or movement history.
- Entry points: **Add with AI** beside normal product entry; **Receive with AI** beside normal Inventory stock entry and inside its stock-in dialog. Both open the shared AI flow with available product, location and operation context.
- Preserve familiar manual entry. Historical branch baseline: `c5291a9`, parent of combined M0/M1 commit `e30380f`. Preserve legitimate later upstream application changes as well.
- Every prepared entry stays inspectable. Clear entries need no individual confirmation checkbox; final approval records consent for the reviewed selected receipts and conversions.

## 2. Locked decisions

| Decision | Required behavior |
| --- | --- |
| Normal versus bulk | Same AI flow; input count/type changes, not approval semantics. |
| Fractions | Preserve fractional purchase quantities and conversions exactly, up to six decimal places. Final stock additions remain whole units in the product's catalog stock unit. |
| Base units | Preserve 2.5 L on the receipt and save 2,500 mL where the catalog uses mL. Never silently change an existing unit or round an inexact stock addition. |
| Identifiers | Application code generates one stable unique internal SKU per reviewed new-product draft. AI never invents manufacturer barcodes. |
| Unknowns/prices | Missing or unreadable values stay unknown. Review new-product identity/unit/required catalog prices. Receiving existing products preserves their catalog costs and selling prices. |
| Dictation | English initially. Additional languages require explicit scope and individual evaluation. Recorded intake/corrections are included; conversational voice POS is excluded. |
| Initial ceilings | 10 input sources, 1,000 prepared rows, 20 MiB/file, 50 combined PDF/image pages and ten minutes/recording. Enforce/test them; they are not measured throughput claims. |
| Evidence available | The user clarified that real merchant examples and an independent reviewer are **not currently available**. Begin with labelled synthetic fixtures and fixed expected answers. |
| Initial release | A development prototype; real-world extraction, handwriting/dictation quality and merchant usability remain unverified. |

BI/dashboard work, forecasting, supplier messaging, shelf counting, autonomous pricing, general accounting, global scanner changes, fractional inventory balances and broader redesign are outside this programme. [Retail BI definitions](reference/RETAIL_BI_DEFERRED_REFERENCE.md) are retained for a separately agreed future plan.

## 3. Implementation rules

- Preserve draft branches and historical receipts/evidence. Reuse verified M0 stock/access safeguards, M1 receipt commands and M2 private originals/durable jobs. Avoid broad reverts, resets and parallel stock systems.
- The primary experience is the shared AI flow. The M2 spreadsheet workspace and M1 manual receipt screen are historical tools, not replacements for familiar manual entry.
- Extend the existing provider abstraction and batch engine. Use Responses PDF/image/text inputs with structured extraction and recorded-file transcription. Parse complete selected worksheets in application code. Add no agent framework or vector database.
- Application code owns authorization, tenant catalog access, exact arithmetic, validation, review revisions, approval, posting, audit, retries and completion. AI interprets sources and proposes matches only.
- Introduce a versioned AI batch/review contract. Keep legacy integer receipt payloads readable. Add targeted fractional purchase compatibility without changing inventory/POS quantities to fractional storage.
- Preparation is automatic after input submission. Reuse Node/PostgreSQL jobs, leases, heartbeats and checkpoints, two tenant/four global concurrent-job ceilings and three automatic attempts. Accepted work survives browser closure.
- An immutable approval binds actor, revision, selected receipt hashes and acknowledged exclusions. Editing reviewed data invalidates the affected approval. Recheck active actor, entitlement and location permissions before posting.
- Post each receipt atomically. Additional deliveries increment locked balances; a quantity-only concurrent sale does not invalidate the delivery. Identity/unit conflicts need renewed review. Replays return the committed result.
- Retain originals, hashes, page/sheet/row/audio references, transcripts and merchant corrections. Incomplete coverage blocks readiness for the affected receipt.
- Add disabled-by-default AI flags in UI, API and worker. Require configured processing budgets before live calls; reserve merchant usage once per batch and account for subjobs/retries internally. Pause without discarding results. Unavailable usage is unknown, not zero.

The [specification](STOCK_INTAKE_AND_RETAIL_BI_SPEC.md) owns detailed contracts; [milestones](AI_AND_BI_MILESTONES.md) own gates; the [engineering handoff](AI_AND_BI_IMPLEMENTATION_HANDOFF.md) owns execution instructions.

## 4. End-to-end milestones

| Milestone | Merchant-visible result | Status |
| --- | --- | --- |
| AI-1 | Printed photos and digital/scanned PDFs from familiar entry pages through catalog matching, exceptions, approval and saved outcomes; includes new products and fractional purchases. | Not started |
| AI-2 | Complete CSV/XLSX worksheets and pasted lists through the same flow, with deterministic completeness and AI interpretation where needed. | Not started |
| AI-3 | Photographed handwriting through correction, approval and saving, with separate quality reporting. | Not started |
| AI-4 | English recorded/uploaded dictation, editable transcripts and explicitly targeted recorded corrections through saving. | Not started |
| AI-5 | All inputs together: grouping, shared drafts, duplicates, partial posting, restart/reconnect recovery and tested pilot boundaries. | Not started |

Each milestone has A/B/C execution batches. A batch is a checkpoint, not a completed feature. Finish the usable saving/recovery journey and evidence before the next milestone. Staging does not remove any modality from scope.

## 5. Acceptance and release

Build versioned synthetic sources and a separate expected-answer manifest before provider execution. Keep expected answers out of model inputs. Distinguish mock, deterministic, synthetic live-provider and representative real-world evidence.

The [accepted walkthrough](#accepted-synthetic-walkthrough) must reconcile after explicit simulated corrections: **+40 rice pieces, +15 beans pieces, +2,500 mL oil**, balances **70 / 35 / 2,500**, receipt cost **NGN 57,000**. Independently calculate expected ledger/stock changes; do not reuse the posting implementation as its own oracle.

Cover missing/invented entries, unknowns, identifier conflicts, ambiguous packs, missing prices, duplicates, multi-file/multi-invoice grouping, complete worksheets/pages, fractions, partial failures, concurrency, replay, permission changes, account/tenant isolation and browser/worker restart. Check keyboard/mobile behavior and original manual entry. Report extraction, matching, conversion, saving, review effort, latency and cost separately by modality.

Saved 54-test results and the synthetic 20,000-row spreadsheet run are historical foundation checks. They do not certify the new multimodal flow or real handwriting/merchant usability. AI-5 can finish a controlled development prototype while external production gates remain open.

Production enablement needs representative inputs, independent reference checking, agreed quality thresholds, observed merchant completion, budget/worker hosting, credential disposition, deployed permissions and coordinated verification of relevant stock writers. Disabling AI preserves posted receipts, evidence and recoverable work.

## Accepted synthetic walkthrough

All content is invented. Each source represents a distinct delivery. There are no taxes, discounts or freight in this fixture. Starting stock: 30 rice pieces, 20 beans pieces. Cooking oil is a new reviewed product stored in mL.

| Source / receipt | Content | Cost per purchase unit | Addition after review |
| --- | --- | --- | --- |
| Printed photo / DEMO-101 | Rice, 2 cartons × 12 pieces | NGN 12,000/carton | 24 pieces |
| Digital PDF / DEMO-102 | Beans, 1 carton × 10 pieces | NGN 8,000/carton | 10 pieces |
| Scanned PDF / DEMO-103 | Rice, half a carton × 12 pieces | NGN 12,000/carton | 6 pieces |
| Handwriting / DEMO-104 | Beans, unreadable piece quantity | NGN 800/piece | Unknown until merchant supplies 3; then 3 pieces |
| CSV / DEMO-105 | Rice, 4 pieces | NGN 1,000/piece | 4 pieces |
| XLSX / DEMO-106 | Cooking oil, 2.5 L | NGN 2,000/L | 2,500 mL after new-product review |
| Pasted list / DEMO-107 | Beans, 2 pieces | NGN 800/piece | 2 pieces |
| Dictation / DEMO-108 | Receive six pieces of Rice 1kg | NGN 1,000/piece | 6 pieces |

For this fixture only, the simulated merchant confirms oil cost NGN 2/mL and selling price NGN 3/mL. These are fixture values, not market prices or inferred defaults. Until clarification/product confirmation, affected receipts are blocked. After review, select eight receipts and approve once. Expected total: NGN 57,000. This written example is accepted product intent; this mixed batch has not been extracted or posted.
