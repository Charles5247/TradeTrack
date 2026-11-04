# AI-1 study script — prepared, not conducted

**Summary.** Test the four existing receiving examples and their recovery paths against manual entry. The user confirmed that merchant documents and participants are unavailable. No contextual inquiry, Owner session, manual comparison or native Hausa review has occurred. This is a ready-to-run protocol with **SYNTHETIC** data and illustrative prices, not research findings. [Acceptance criteria](receiving-review.md#acceptance-criteria-frozen-before-revision-testing) were written before browser testing. All human result fields remain blank.

## Raw evidence and independent expected outcomes

Before real sessions, obtain consent for original invoice/list/PO, corresponding catalog/warehouse snapshot, physical count and recording. A shop staff member other than the designer/operator labels correct identity, quantity, base unit, cost basis, selling-price decision and warehouse. A second person resolves disagreements; preserve unknowns. Freeze that answer key before exposing the AI draft. Neither AI output nor this prototype is ground truth.

The current rehearsal key below is **designer-authored from spec 6.5–6.8, not independently validated**. Native Hausa review, equivalent manual datasets and independent adjudication remain unavailable. Do not substitute a model review for these gates.

Contextual inquiry, when available: observe an ordinary delivery from arrival/counting through records on the Owner's usual equipment. Ask afterwards what interruptions, rejected goods, shorthand and unit conventions meant. Record exact words/actions separately from interpretation. Code inspection cannot establish actual merchant behavior.

## Setup, comparison and measurement

Recruit Boss plus 3–5 real Owners, including Hausa-speaking phone and desktop users. Separate Boss results from Owner results. Include actual phones, dark mode and software keyboards; run NVDA with a competent user. Record browser/device/language/assistive technology. This local prototype calls no model and changes no business stock.

Counterbalance manual-first and AI-first across people and equivalent deliveries; avoid memorized answer keys. Manual baseline uses the actual workflow in an approved disposable test workspace, not an invented comparator. Current PO receiving cannot express partial receipt: mark this comparison **unsupported**, measure any existing workaround separately, and do not pretend full receipt is equivalent. No production writes are part of this review.

Read only the task card; do not point or explain controls. A hint makes the attempt assisted; preserve the unaided result first. Ask “What do you expect to change?” before Apply, using the same neutral probe in the baseline; record interruption time. Ask afterwards whether records are confirmed or pending. Collect think-aloud comments separately from timed runs if speaking materially slows the participant.

Record participant/task/variant/order, accurate completion, incorrect committed fields, critical errors, planted mistakes detected/assigned, Apply explanation, changed fields, edit actions, backtracks, hints, total time, correction time and system-wait time. **Critical error:** wrong identity/quantity/unit/warehouse, unintended cost/price change, duplicate receipt or pending mistaken for success. Stop after 5 minutes stuck on a three-line task or 10 on the sheet; record censored time. These limits are study assumptions.

## Wizard-of-Oz setup — facilitator only

Use **Prototype controls → Example → Wizard-of-Oz output**, then close the panel. Correct/planted outputs share the same four documents; source lines are immutable. Explain that the simulated assistant may make mistakes, without disclosing which output is planted. Debrief afterwards. Scripted correction is not Owner error detection.

| Example | Correct synthetic target / planted variant |
|---|---|
| Oil | Power Oil **5L**, 12 pieces, ₦9,800 each, Main; existing selling ₦11,500 stays. Kings 10 at ₦6,200; Owner decides new price. Gino 50 sachets at ₦190 when selling singly. Plant: match **Power Oil 3L / POWER-3L** while source says 5L. Correct via Catalog match. |
| WhatsApp | Indomie 5 cartons at ₦8,500 after unit-price clarification; Peak 2 at ₦31,000; spaghetti 10 bags with unknown cost flagged. Plant: Peak cost **₦3,100**, source stays “31k.” |
| Sheet | Confirm Price=selling, Qty left=opening stock; 240 resolved rows, +10 each to Main, catalog cost ₦100, selling ₦140 stays unless selected. Leave 40 new, 15 duplicate, 5 invalid. Plant: first row destination **Kano**; task delivery is at Main. |
| PO | Indomie 20×₦8,500, Peak **4**×₦31,000 with 1 outstanding, Power 12×₦9,800; hold Kings. Selected receipt ₦411,600; full invoice ₦473,600 versus PO ₦431,300, difference ₦42,300. Plant: Peak quantity **5** although source says 4. |

Variants deliberately share confidence styling. Measure detection; do not assume labels make wrong output safe. The sheet is generated, not a real onboarding corpus.

## Ten unaided tasks

| # | Participant task card | Observer pass condition | Result |
|---|---|---|---|
| 1 | “This oil receipt arrived at Main. We sell Gino singly. Record the delivery; keep current selling prices.” | Correct three identities, 12/10/50 quantities, costs/units/Main; no unintended existing price change; understands Apply | Pass/fail ___ time ___ help ___ |
| 2 | “Record this supplier message at Main. The supplier says 8500 is for one carton; spaghetti cost is not known yet.” | Correct shorthand/basis; explicit unknown-cost flag, no invented value; explains profit exclusion | Pass/fail ___ time ___ help ___ |
| 3 | “Set up Main from this sheet. Price is our selling-price column. Record rows you can safely resolve; leave questionable records for later.” | Confirms column meaning; 240 rows only; no duplicate/negative stock or accidental branch/price change; remainder retained | Pass/fail ___ time ___ help ___ |
| 4 | “Compare this delivery and our order. Accept only ordered goods actually delivered. Tell me what is still owed and what costs changed.” | 4/5 Peak; hold Kings; three cost increases; one carton outstanding; no supplier payment implied | Pass/fail ___ time ___ help ___ |
| 5 | “Record this oil delivery at Main. Keep existing selling prices.” (Plant match.) | Detects 3L/5L before Apply; corrects catalog identity; source inspectable | Pass/fail ___ detected ___ edits ___ |
| 6 | “Record this supplier message using agreed per-carton costs.” (Plant cost.) | Detects ₦3,100/₦31,000 before Apply; corrects cost without changing source | Pass/fail ___ detected ___ edits ___ |
| 7 | “This opening stock belongs at Main. Record only resolved sheet rows.” (Plant warehouse.) | Detects Kano before Apply; corrects/reselects; no wrong-warehouse effect | Pass/fail ___ detected ___ edits ___ |
| 8 | “Receive what this delivery document shows; leave missing goods outstanding.” (Plant PO quantity.) | Detects 5 versus 4 before Apply; one carton remains outstanding | Pass/fail ___ detected ___ edits ___ |
| 9 | “Finish this delivery after connection returns. Explain whether stock is saved. If the reply disappears, find the original outcome.” | Offline recheck finds 20→18; re-review +12=30; pending reply does not mean success or repeat write | Pass/fail ___ errors ___ time ___ |
| 10 | “Some rows saved and one did not. Finish the failed row without receiving the others twice. Pause an unfinished edit and return to it.” | Recognizes partial outcome; fresh repair approval; no replay; audit distinguishable; retained draft edits do not imply stock saved | Pass/fail ___ errors ___ time ___ |

Tasks 1–4 get equivalent manual counterparts; 5–8 test AI error recovery; 9–10 use preset recovery states. After task 1, optionally ask why the Kings price is credible and whether receiving required accepting it. Avoid priming the planted-error tasks.

## Reporting and sign-off

Human results: accurate completion ___/___; critical errors ___; planted detection ___/___; correct Apply explanations ___/___; median correction actions ___; assistance ___/___; paired manual/AI times ___/___; censored attempts ___; language/device differences ___. Preserve individual task rows. **All currently unmeasured.**

Independent reviewer can reject an expected outcome; reconcile before scoring. Any critical error or undetected assigned plant blocks the proposed gate even if fast. Native Hausa reviewer records terminology/comprehension separately from layout. Browser checks are not Owner sessions.

Proposed cuts: percentage confidence, redundant blanket approval, rehearsal controls in merchant content. Keep optional repricing secondary and retain all required recovery states. Final retained/deferred/disputed list: ____

Boss: ____ Date: ____ · Owner codes/signatures: ____ · Native Hausa reviewer: ____ · Independent outcome reviewer: ____ · Prototype hash: ____

Stop at Gate 2 review. No full architecture or build prompts follow this unsigned study.
