# AI-1 receiving review — provisional design resolution

**Summary, 4 November 2026.** The proposal → review → authorized Apply model fits the inspected task better than open-ended chat or autonomous stock changes. That is a design judgment, not a merchant finding. The first prototype confused selection with authorization, emphasized confidence scores over checkable facts, and buried unresolved decisions. This revision addresses those problems within the four existing examples. AI-2–AI-5 remain unchanged. Gate 2 is unsigned.

## Evidence boundary

The user confirmed that consented merchant originals and participant sessions are unavailable. Repository searches for invoice/research/feedback/consent documents, CSV/XLSX/PDF and receiving recordings found migrations and a promotional preloader, not a consented receiving corpus. The earlier supplied dashboard images/videos are visual references, not receiving evidence. There is no paired catalog snapshot, physical delivery count, independently labelled expected result, manual receiving recording, verbatim Owner feedback, native Hausa review or actual-phone session.

Therefore **contextual inquiry has not occurred**. The following is a code-based task analysis and designer cognitive walkthrough. Browser rehearsals are controlled synthetic checks. No extraction accuracy, time saving, Owner mistake-detection rate or real-world trust claim follows from them.

## Acceptance criteria frozen before revision testing

1. Selecting rows causes no stock effect and never calls them approved. Apply explicitly authorizes the listed product identities, stock additions, units, costs, selling-price choices and warehouses. Only confirmed results say applied.
2. Unresolved decisions precede collapsed matched rows. All changes remain inspectable; source text stays unchanged when proposals are edited. Existing selling prices remain unchanged unless separately selected.
3. Non-integer/nonpositive quantities, negative/nonfinite costs, ambiguous matches and unresolved units cannot be included. Unknown cost requires explicit D6 acknowledgement. Changes clear selection. Reconnect conflicts clear earlier authorization.
4. All four examples, partial repair, duplicate/unreadable, pending response and remaining lifecycle views remain reachable. Rechecking a response never applies an arbitrary unselected row.
5. Browser checks: no JS errors or horizontal overflow at 360/1440 px, EN/HA and light/dark; tested controls ≥44 px; keyboard focus survives editing; no serious/critical axe findings in tested AI-1 states. Reduced-height checks are proxies, not software-keyboard proof.
6. **Proposed human gate, unmeasured:** each Owner completes all assigned safety-critical tasks accurately without hints; zero critical stock/price/warehouse errors; every assigned planted error detected before Apply; each explains selection, authorization and pending versus confirmed. Record failures individually, not just averages. Any critical miss blocks sign-off and prompts another round.
7. **Proposed comparison, unmeasured:** record per-person accurate completion, assistance, correction actions and time versus an equivalent manual task. No speed pass unless accurate paired AI runs are faster in the observed sample without more critical errors. Do not generalize from 3–5 Owners. Native Hausa reviewer and independent shop-staff expected-outcome reviewer must sign separately.

## Receiving decisions and consequences

| Decision | Software can check | Owner must judge | Wrong outcome / recovery |
|---|---|---|---|
| Product match | Exact IDs/barcodes, candidate ambiguity, duplicate SKU | Same brand, size and variant as delivered | Wrong SKU stock becomes available; hold/choose correct identity before Apply; after Apply use a new audited correction |
| Quantity | Positive whole base units; multiplication; PO outstanding | Physically delivered count, damaged/rejected goods | Over/understated availability; edit count, reselect; never infer physical delivery solely from invoice |
| Unit | Existing unit/history; exact conversion arithmetic | Carton contents and how shop sells this product | 1 carton versus 50 sachets can cause 50× error; resolve product-specific conversion; do not rename an existing unit silently |
| Cost | Nonnegative numeric value, totals, PO/last-cost differences | Unit price versus line total; missing/discounted value | Wrong valuation/margin; clarify basis or explicit zero + cost-needs-update; historical-profit policy remains Q06 |
| Selling price | Current versus suggested amount and source pack normalization | Whether/when to change the shelf price | Unwanted customer price; leave existing price, inspect optional proposal separately |
| Warehouse | Available destination and current stock there | Where goods actually arrived | Stock available at wrong branch; edit destination and reselect; after Apply create an explicit correction |
| Short/unordered PO goods | Invoice/PO deltas, remaining count, arithmetic | Receive or hold unexpected goods; accept changed cost | False full receipt or unauthorized item; hold row; keep short line outstanding |
| Apply / connection | Bound selected revision, role, retry result, changed facts (future business controls) | Authorization of this exact effect | Duplicate or unapproved effects; pending result lookup; changed facts require re-review; failed rows get fresh repair approval |

Manual flow evidence: [inventory dialog and handleAdjust](../../../src/app/(dashboard)/inventory/page.tsx) use the selected product/warehouse, quantity, reason and notes; `handleAdjust` parses an integer. [Shared adjustment helper](../../../src/lib/inventory/adjust-stock.ts) requires a safe whole-number delta and writes stock/movement/audit separately. [PO receive](../../../src/components/purchase-orders/purchase-orders-screen.tsx), `receivePurchaseOrder`, adds `quantity_ordered`, sets `quantity_received` to ordered and marks received; intermediate errors are not consistently checked. This contradicts the desired partial/atomic receipt experience. [Import rules](../../../supabase/migrations/015_business_imports.sql) are executable SQL definitions, not proof they are deployed or safe for every proposed stock command. [Unit migration](../../../supabase/migrations/20261021140715_industry_product_units.sql) protects existing unit history. The static prototype cannot repair these production gaps.

## Cognitive walkthrough and heuristic findings

Severity: **high** can authorize a wrong effect or hide failure; **medium** increases ambiguity/correction effort; **low** affects presentation. Findings refer to the pre-revision `prototype.js` functions; before screenshots and hashes are recorded in `qa/refinement/`.

| Finding and exact evidence | Status / severity / consequence | Resolution |
|---|---|---|
| `rowUI` checkbox said “Approve”; review footer “rows approved”; `editFields` emitted `approved` before final checkbox/Apply | Verified / high: three meanings of approval | Selection language throughout; final Apply alone authorizes; pending and confirmed stay separate |
| `reviewRows` rendered collapsed confident group before Gino's unresolved unit; sheet groups began with 240 clean | Verified / medium: first action steers toward easy rows before risky decisions | Unresolved first; ready group follows, still selectable together |
| `rowUI` and confirm showed 96/98/100% with no calibration data | Verified display; false-trust effect is a hypothesis / high | Qualitative confidence with reason and explicit uncalibrated label; check source and catalog identity |
| `price-strip` displayed three prices at equal weight on every row; phone stacks all three | Verified / medium: optional repricing competes with quantity/cost check | Receiving effect first; selling-price detail disclosure; exact selected price effect remains visible |
| `valid` allowed 0.5 units and negative cost; `commit` could auto-select row 1 if nothing chosen | Verified / high: mock could demonstrate an unsafe success | Validate whole units/cost; remove implicit fallback; test empty pending lookup |
| `updateRow` and selection rebuilt main DOM without restoring focus; transient feedback could cover a newly focused field | Verified code / medium: keyboard correction loses place | Restore matching control and scroll position; preserve opened groups; dismiss transient feedback on resumed editing |
| Upload's “Example to rehearse” and progress's “Show next stage” were merchant controls | Verified / medium: study machinery contaminates task | Fixture/Wizard controls move into developer panel; automatic progress remains |
| Phone page duplicated brand/breadcrumb, stage labels and a promotional title before decision | Verified hierarchy; effort effect provisional / medium | Functional title, compact stage indicator and sample label on AI-1 only |
| No raw originals, Owner observations, independent expected results or Hausa review | Missing evidence / high for validation | Prepare controlled correct/wrong variants; leave human measures empty |

## Revised interaction model

**Retain** contextual Inventory/PO/Bulk Add entry, input/progress, review, exact-effect authorization and confirmed result. A bounded receiving workflow is sufficient for these examples; an autonomous agent or chat would add no demonstrated value. Code must own validation and mutations; AI drafts interpretations.

**Simplify** review to: resolve questions → inspect/select rows → review exact effects → Apply. Selection is a reversible draft choice, not approval. Remove the redundant blanket final checkbox: Apply is the deliberate authorization event. This is a proposed copy/interaction deviation from spec 6.4's “approve a row,” not a change to the human-authorization contract. The final exact-effects view stays because it consolidates several editable rows into one bounded command.

**Consolidate** optional selling-price values into disclosure; receiving cost and stock effect stay exposed. Require the sheet column-meaning choice because it resolves a substantive ambiguity rather than repeating authorization. Keep price sources reachable and changed price amounts in the final summary. Keep explicit missing-cost acknowledgement because it authorizes a materially different accounting treatment. Keep a fresh repair Apply because the proposed effect has changed; remove its redundant blanket checkbox too.

**Recover** in place before Apply; after Apply distinguish pending confirmation, partial success and confirmed result. Never equate saving a draft, selecting a row or recording offline intent with stock saved. No new production endpoints, architecture or feature scope is proposed here.

Methods grounding: [Microsoft human–AI guidance](https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/) informs correction and explanation checks; [GOV.UK usability guidance](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing) informs realistic tasks without hints; [W3C focus guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) informs overlay/keyboard checks. These sources guide methods; they do not validate this product.

## Results and proposed cut list

Revision verification and unresolved evidence will be recorded in [design-decisions.md](design-decisions.md). Proposed cuts for review: remove numeric confidence percentages, blanket approval checkbox, and test-fixture/progress controls from merchant content. Retain every required state and the four examples; keep optional repricing secondary. Defer claims of speed, extraction quality, fluent Hausa and production readiness until evidence exists. These are proposed cuts, not signed decisions.

Boss: ____  Owners: ____  Independent outcome reviewer: ____  Native Hausa reviewer: ____
