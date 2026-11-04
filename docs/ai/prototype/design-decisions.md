# Design decisions and locked prototype tokens

## Intent and scope

Calm operational UI: the delivery is the work; AI appears as a proposal with evidence, never an animated personality. The four spec journeys lead to the same review/select/authorized Apply/result pattern. The 4 November revision is grounded in the [receiving-task critique](receiving-review.md), not new visual inspiration. All open questions stay assumptions, not design approval. This lock applies only to this review artifact. No production CSS, component, source, dependency or business data changed.

## Reference anchoring

The supplied dashboard images and MP4s are visual references, not merchant evidence. Earlier choices retained space, hierarchy and a restrained accent; decorative orbs, floating agents and dense dashboard grids were rejected. Their sampled frames remain in `qa/reference-*.png`. This revision starts from receiving decisions instead. Sources and effects stay in workflow; chat remains only in unchanged AI-4.

## Tokens

Source of truth: [app tokens](../../../src/app/globals.css), [font declarations](../../../src/app/fonts.css), [Button](../../../src/components/ui/button.tsx), [Dialog](../../../src/components/ui/dialog.tsx), [responsive Table](../../../src/components/ui/table.tsx), [NativeSelect](../../../src/components/ui/native-select.tsx), [Badge](../../../src/components/ui/badge.tsx). The app's font/palette takes precedence over generic skill recommendations. Copied local fonts retain their SIL license files in `assets/`.

| Token | Light | Dark |
|---|---|---|
| Background | `#f5f7fa` | `oklch(.18 .012 250)` |
| Surface | `#ffffff` | `oklch(.235 .016 250)` |
| Neutral inset | `#eef2f6` | `oklch(.27 .018 250)` |
| Main text | `#142438` | `oklch(.93 .006 250)` |
| Secondary text | `#4d5e73` | `oklch(.73 .01 250)` |
| Hairline border | `#cbd5e1` | `oklch(.40 .018 250)` — strengthened from `.32` |
| Accent | `oklch(.52 .22 255)` | `oklch(.66 .16 255)` |
| Primary foreground | `oklch(.99 .003 250)` | `oklch(.18 .012 250)` |
| Hover accent | `oklch(.46 .24 255)` | `oklch(.70 .16 255)` |
| Inset accent tint | 7% primary mixed into surface | Recomputed in dark scope, not inherited as a light color |

One chromatic accent: product blue. State distinctions use words, border shapes and hierarchy. Neutral surfaces, no gradients, no card shadows. Only dialogs/toasts use a restrained overlay shadow. Assumption tags use a dashed neutral outline; synthetic labels are always visible above the content. Control boundaries use secondary text color where identification needs higher contrast.

Four type sizes: **12 px** metadata/labels, **14 px** body/buttons, **20 px** section titles, **32 px** desktop page titles and important numeric values. AI-1 phone titles use the existing 20 px size. Body uses local Inter; headings local Space Grotesk at weight 500. Important numbers use tabular figures. Long Hausa strings wrap naturally; no fixed-height heading or truncated action text. Source product names, identifiers, original document terms and canonical lifecycle state names are preserved rather than translated as facts.

Spacing: **8, 16, 24, 32, 40, 48, 64 px**. Desktop sidebar 224 px; content padding 40–48 px; phone padding 16 px. Radius 8 px for controls, 12 px for panels/dialogs. Primary action 48 px minimum; text links, summaries and check labels have at least 44 px targets. Border/outline widths are optical exceptions to the spacing scale. Container queries, not user-agent assumptions, transform the layout when the preview itself is 360 px.

Motion: **200 ms** opacity/4 px transition on view change and color/focus responses. No decorative loops, animated charts or shimmer. Three 1.1-second simulated progress stages represent work rather than animation duration; stages advance automatically; rehearsal controls stay outside the merchant task. Reduced-motion removes animations/transitions. AI-1 action summaries stay in document flow. This avoids sticky overlap while editing; the tradeoff is more scrolling on long receipts.

## Copy and trust rules

One page asks one question and has at most one filled action. Alternatives are secondary. Copy says “Stock In”, “cost”, “selling price”, “not saved yet”, “check again”; it does not expose model internals. The confirmation names product, quantity, unit, warehouse, cost-quality flag and selected price change. Apply is the authorization event; there is no redundant blanket checkbox. Missing-cost and sheet-column decisions remain explicit because their meaning changes the receiving result. Editing a row clears its selection and restores focus. Existing catalog units are read-only; Gino’s explicit pack decision performs the conversion or creates a distinct carton SKU.

Prices always use `₦` and grouping. Document cost, existing selling price and suggested selling price never share a label. AI-1 confidence is qualitative, explicitly synthetic/unmeasured and accompanied by a reason. Numeric confidence percentages were removed. Confidence never permits an unresolved row to apply. Market evidence has pack/date/URL, with invalid-domain URLs visibly fictional. Missing cost becomes ₦0 only after an explicit choice and stays flagged/excluded from profit. Original known zero and unknown zero are distinct. Long-term historical cost correction remains ASSUMPTION Q06.

Consent starts off. Enabling a tier opens a review dialog; raw-document toggle only enables asking, not document sharing. Support previews the chosen context and never sends. Owner-only restrictions are interface demonstrations, not security proof. All 13 pending decisions are readable in the header assumption register. Numeric allowance/reset date and retention periods are illustrative assumptions, not pricing or legal commitments.

## State and interaction lock

Source: [proposal lifecycle](../planning/proposal-lifecycle.md). Draft → reviewing → approval_pending → applying → applied/partially_applied. Lost response → confirmation_pending → original result lookup. Offline pending → recheck → reviewing on changed facts. Failed, expired and cancelled each explain recovery. Successful rows are not retried with repairs. PO failure means the selected receipt group rolls back, even if the delivery itself is partial (ASSUMPTION Q04).

Menus, edits, checkboxes, source panels, memory CRUD, consent review, role/plan/capability restrictions, fixture selection, stage progress and the four example transitions are clickable. The `prototypeDemo` object is a developer-only verification hook. No fetch, service worker, module loader, backend or external font/CDN is used. Local storage contains only synthetic demo choices and is namespaced to this artifact. Keep its folder together when sharing; moving it may create a fresh browser storage context.

## Verification boundary

The 3 November baseline reports in `qa/` are historical. The current revision reports below supersede them. Chromium checks of a standalone artifact cannot establish extraction accuracy, merchant comprehension, production security or native-device behavior.

## 4 November refinement — decisions and evidence ledger

**Readout:** clearer receiving decisions and less ambiguous authorization; merchant usability remains provisional. This pass used the receiving task, executable rules and the prototype itself as evidence. [The critique](receiving-review.md) records severity, consequences, the Owner/software decision map, the revised interaction and criteria declared before testing. No raw merchant originals or participants were available; the user explicitly confirmed this.

| Evidence | Observation / boundary | Artifact |
|---|---|---|
| Manual receiving code | Product/warehouse context, positive quantity and reason; PO path receives ordered quantity, not a safe partial receipt. Source inspected, not executed against production | `src/app/(dashboard)/inventory/page.tsx`, `src/lib/inventory/adjust-stock.ts`, `src/components/purchase-orders/purchase-orders-screen.tsx` |
| Before walkthrough | Selection called approval; precise confidence unsupported; optional price fields compete with receiving; unresolved rows below safe group | [Before phone](qa/refinement/before-phone.png), [before hashes](qa/refinement/before-hashes.txt), critique function references |
| Revision correction checks | 27 assertions: source preservation, invalid-value exclusion, selection/Apply separation, four planted-output corrections, sheet semantics, empty lookup and keyboard focus | [Controlled refinement report](qa/refinement/refinement-report.json) |
| Four journey/recovery checks | 12 synthetic assertion groups; explicit Apply, partial repair, PO short receipt, resume and D4 remain usable in the simulation | [Journey report](qa/refinement/journeys-report.json) |
| Layout inspection | 288 route/width/language/theme views plus 32 expanded fixture views; no tested overflow/undersized action heights; compact Edit width separately checked at 44 px; all 13 assumptions present | [Layout](qa/refinement/layout-report.json), [expanded](qa/refinement/expanded-report.json) |
| Accessibility | axe-core 4.14.0: 88 AI-1 state/width/language/theme combinations; zero reported violations or incomplete checks in the final run. Keyboard: 16 focus steps at 360×420 reduced-height proxy; not an actual software keyboard. 14 representative contrast pairs pass, minimum text 5.31:1 | [axe](qa/refinement/accessibility-report.json), [contrast](qa/refinement/contrast-report.json) |
| Problems found during verification | Initial focus restoration caused blur/re-render reentrancy; corrected and rechecked. Axe's manual-review result identified a generic div with aria-label; changed to a labelled group. Removed decorative control glyph with incomplete contrast detection. Stricter keyboard testing found transient-toast overlap; feedback now dismisses when editing resumes. Compact Edit targets widened to 44 px | [Initial failed correction run](qa/refinement/initial-refinement-cli.txt); final reports above |
| Scope | AI-2–AI-5 renderer bodies unchanged; scoped CSS affects only AI-1; no application source/dependency changes | [Renderer hash comparison](qa/refinement/scope-report.json) |
| Human research | No observed receiving, unaided completion, critical-error rate, planted-error detection rate, manual/AI time comparison or independent answer-key review | User confirmed unavailable; [unfilled study protocol](usability-script.md) |
| Native/language/accessibility | No physical phone, software-keyboard or NVDA interaction; NVDA absent from checked standard install paths. Hausa was layout-tested only | Native Hausa/assistive-tech reviewer and actual devices still required |

Browser rehearsals use designer-authored synthetic expected values. Those are **not independently established merchant ground truth**. Automated results demonstrate local interactions only. No screenshot, axe pass or script establishes that an Owner understands Apply or will notice a wrong high-confidence match.

Revised copy rules: **Select** means include in the draft selection; **Apply** authorizes exact listed effects; **approval_pending/confirmation_pending** never means applied; **applied** requires a confirmed simulated effect. The pre-Apply preview remains `reviewing` to match the planning lifecycle. Unresolved choices precede matched rows. Immutable source excerpts remain beside editable proposals; optional selling-price disclosure retains sources and selected effect. The four examples and recovery states remain intact.

Remaining compromises: review is still lengthy on a phone; non-sticky actions require scrolling. Qualitative confidence is unmeasured and can still overpersuade; planted-error sessions must test it. Product lookup is a finite synthetic choice, not a complete catalog search. No physical-delivery truth can be inferred from a document. The manual PO baseline is not functionally equivalent until partial receiving exists. Single Apply versus the old blanket checkbox is a design hypothesis pending comprehension tests. All Q01–Q13, production write safety, extraction/pricing quality and Hausa wording remain unresolved.

**Proposed cut list, unsigned:** remove numeric confidence, blanket confirmation checkboxes and rehearsal controls from merchant content; keep optional repricing secondary; retain every required state. AI-2–AI-5 unchanged. Boss ____ · Owners ____ · Native Hausa reviewer ____ · Independent outcome reviewer ____. Stop for review; no full architecture/build prompts.
