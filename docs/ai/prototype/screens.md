# Screen inventory and feasibility

Open **[index.html](index.html)** directly; keep the adjacent CSS, JS and assets folders together. No server, build, account, model or network is required. The guide links all 36 views. The four example links start the scripted journeys; state-directory links marked `preview=1` may prefill a clearly labelled synthetic state. The prototype controls select scenario, language, theme, width, role, plan and apply outcome. Reset clears only this prototype's local browser storage.

**Status:** Gate 1 answers remain pending. This is an exploratory Gate 2 prototype, not a signed product or architecture. Every Q01–Q13 appears with an **ASSUMPTION** tag in the persistent header register; relevant assumptions also appear inline. All records and market sources are **SYNTHETIC**, and all prices illustrative. The app source is untouched.

**4 November refinement:** [receiving critique and decision map](receiving-review.md) precedes the visual changes. Conclusions remain provisional: the user confirmed no raw merchant corpus or participants. AI-2–AI-5 are unchanged. The test fixture/Wizard-of-Oz controls now live in the developer panel, separate from merchant content.

## Candidate batch mapping

These labels refer to the earlier [codebase map](../AI_ASSISTANT_CODEBASE_MAP.md), not approved build prompts: B0 roles/plans/consent/cost; B1 bound/resumable proposal; B2 safe existing-stock addition; B3 new products/units; B4 pasted interpretation; B5 large spreadsheet; B6 document extraction; B7 offline approval; B8 price evidence; B9 safe PO receiving; B11 analytics. B10 inward consignment is excluded. Architecture and implementation sequencing wait for prototype review and a signed cut list.

Paths below start at the repository root. **“Uses existing components” describes UI primitives only**, not backend readiness. **“Needs new component” means a new composed UI**, built from the existing Button, Dialog, Table, Badge, Input, Checkbox, Skeleton and state primitives. No production component has been created.

| Linked view | One question / dominant action | Feasibility tag and file it would extend | Candidate batch |
|---|---|---|---|
| [Guide](index.html#home) | Which journey should I try? / Start Stock In | **uses existing components** — `src/components/ui/app-screen.tsx`; prototype-only directory is not a proposed product page | Review only |
| [Inventory](index.html#inventory) | Where does a delivery start? / Stock In | **uses existing components** — `src/app/(dashboard)/inventory/page.tsx` | B2 |
| [PO entry](index.html#po-entry) | Which PO am I receiving? / Receive with AI | **uses existing components** — `src/components/purchase-orders/purchase-orders-screen.tsx` | B9 |
| [Bulk Add](index.html#bulk-entry) | How do I set up my catalog? / Add with AI | **uses existing components** — `src/app/(dashboard)/products/page.tsx`; `src/components/imports/import-workbench.tsx` | B3/B5 |
| [Upload](index.html#upload) | What document should be read? / Prepare draft | **needs new component** — `src/app/(dashboard)/assistant/page.tsx`, `src/components/ui/dialog.tsx`; contextual upload sheet | B4–B6 |
| [Progress](index.html#processing) | What is happening? / Automatic stage completion | **needs new component** — `src/components/ui/loading-state.tsx`; compose existing Skeleton into three named stages | B1/B6 |
| [Review](index.html#review) | Which rows can I receive? / Continue to Apply | **needs new component** — `src/components/imports/import-workbench.tsx`, `src/components/ui/table.tsx`; field evidence, edit/selection and grouped review | B1–B5/B8 |
| [Confirmation](index.html#confirm?preview=1) | What exactly will Apply do? / Apply these changes | **uses existing components** — `src/components/ui/dialog.tsx`; exact effect summary; Apply is the authorization event | B1/B2 |
| [Applying](index.html#applying?preview=1) | Is the write confirmed? / Automatic confirmation | **uses existing components** — `src/components/ui/loading-state.tsx`; server confirmation remains future work | B2 |
| [Result](index.html#result?preview=1) | What changed? / Continue remaining rows or return to inventory | **needs new component** — `src/components/imports/import-workbench.tsx`; exact per-row outcome summary | B1–B3 |
| [Partial result](index.html#partial?preview=1) | Which row still needs help? / Review proposed fix | **needs new component** — `src/components/imports/import-workbench.tsx`; independent successful/failed results | B1–B3 |
| [Repair](index.html#repair?preview=1) | Is the proposed fix right? / Apply this fix only | **needs new component** — `src/components/imports/import-workbench.tsx`; before/after repair and fresh approval | B1/B3 |
| [Customer care](index.html#support?preview=1) | What context would I share? / Preview support message | **needs new component** — `src/components/ui/dialog.tsx`; field and per-item sharing review, no sending integration | B0/B1 |
| [Offline](index.html#offline) | Is my choice safe here? / Reconnect in demo | **needs new component** — `src/components/shared/sync-provider.tsx`, inventory page; durable approval-intent UI | B7 |
| [Recheck](index.html#recheck) | What must be checked online? / Check current records | **needs new component** — `src/components/shared/sync-provider.tsx`; role/plan/version checks | B7 |
| [Conflict](index.html#conflict) | What changed since approval? / Re-review current stock | **needs new component** — inventory page and import workbench; old/current/proposed facts | B7 |
| [Lost response](index.html#pending?preview=1) | Did the exact command save? / Check original result | **needs new component** — import workbench; confirmation-pending receipt lookup | B1/B7 |
| [Unreadable photo](index.html#unreadable) | What could not be read? / Retake or choose photo | **uses existing components** — `src/components/ui/error-state.tsx`, `src/components/ui/empty-state.tsx` | B6 |
| [Duplicate](index.html#duplicate) | Was this already received? / Open existing draft | **needs new component** — import workbench; document-level duplicate evidence | B1/B6 |
| [Totals mismatch](index.html#totals) | Why do totals differ? / Review source lines | **uses existing components** — `src/components/ui/stat-card.tsx`, import workbench | B4/B6 |
| [Failed](index.html#failed) | How do I recover? / New attempt | **uses existing components** — `src/components/ui/error-state.tsx` | B1/B6 |
| [Expired](index.html#expired) | Can I reuse old approval? / Fresh draft | **uses existing components** — `src/components/ui/empty-state.tsx` | B1/B7 |
| [Cancelled](index.html#cancelled) | What remains saved? / Inventory | **uses existing components** — `src/components/ui/empty-state.tsx` | B1 |
| [Empty](index.html#empty) | How do I begin? / Prepare draft | **uses existing components** — `src/components/ui/empty-state.tsx` | B1 |
| [Drafts](index.html#drafts) | Where did I stop? / Continue draft | **needs new component** — assistant page and `src/components/ui/detail-template.tsx`; durable revision listing | B1 |
| [Sources](index.html#sources) | Why this suggested price? / Return to draft | **needs new component** — import workbench; comparable pack, date, URL and history evidence | B8 |
| [Audit](index.html#audit) | Who approved what? / Return to result | **uses existing components** — `src/components/ui/detail-template.tsx`, assistant page; new provenance data needed | B1 |
| [AI-2](index.html#insights) | What happened this week? / Export summary | **uses existing components** — `src/components/ui/stat-card.tsx`, `src/components/ui/sales-chart.tsx`, `src/app/(dashboard)/reports/page.tsx` | B11 |
| [AI-3](index.html#restock) | Can I move stock first? / Review transfer | **needs new component** — `src/app/(dashboard)/transfers/page.tsx`, assistant page; staged action proposal | B11 |
| [AI-4](index.html#analytics) | What does a follow-up mean? / Ask | **needs new component** — assistant page; bounded conversation and cited answer | B11 |
| [AI-5](index.html#staff) | Which trend merits a fair look? / Supporting sales | **uses existing components** — `src/components/ui/table.tsx`, reports page; hours/shift coverage is unresolved | B11 |
| [Settings](index.html#settings) | What may AI do/share? / Manage learned items | **needs new component** — assistant page, `src/components/ui/checkbox.tsx`; org-level settings and consent, not existing delivery preferences | B0 |
| [Learned items](index.html#memory) | What is remembered? / Add convention | **needs new component** — assistant page, Dialog/Input; editable typed memory list | B0/B3 |
| [Allowance limit](index.html#limit) | What can I do now? / Saved drafts | **uses existing components** — EmptyState, assistant page; metering data is new | B0 |
| [Unavailable plan](index.html#plan) | Why no AI? / Eligibility preview | **uses existing components** — EmptyState, assistant page; no billing changes | B0 |
| [No access](index.html#no-access) | Who can use AI? / Normal workspace | **uses existing components** — `src/components/shared/access-guard.tsx`; server/read-policy changes still required for D1 | B0 |

## Containers, state coverage and navigation

Production intent is contextual: upload/review/results belong in Inventory, Bulk Add and PO receiving. The hash views separate prototype states for inspection; they do not imply 36 new application routes. Short confirmations, consent, source-record detail, learned-item editing and navigation handoffs use dialogs. Long review uses a page-width work area. At 360 px, rows become readable item lists, never a sideways financial table.

Canonical proposal states are `draft`, `reviewing`, `approval_pending`, `applying`, `confirmation_pending`, `partially_applied`, `applied`, `failed`, `expired`, `cancelled`. Review classifications are separate: Matched, New product, Needs your decision, Possible duplicate. Row details show unresolved/ready/applied; selection remains a draft choice. Row approval begins only at Apply. The final effect preview stays `reviewing`; `approval_pending` is reserved for submitted/offline intent, consistent with the lifecycle. Unreadable, limit, plan and no-access experiences have explicit recovery actions. The owner-only switch-off state is reachable by disabling a capability then visiting it.

Back/reload keeps this browser's edits and selection. Editing clears the affected row's selection. Apply requires valid selected rows and authorizes their exact revision. The redundant blanket checkbox is removed. Spreadsheet column meaning and unknown-cost treatment still need specific Owner decisions. Repair Apply is a fresh authorization for only the failed row. Offline approval is pending, never success. Reconnect demonstrates changed stock 20 → 18; +12 now means 30 and asks for approval again. Unknown response looks up the same synthetic action before displaying a result. No optimistic stock success. Browser storage is a convenience for this prototype, not an offline/security implementation.

## Library deviations to review

- Native Dialog/details/file controls emulate existing React primitives; no existing Sheet, Accordion or Collapsible component was found. Disclosure composition needs new UI, not a claimed existing component.
- Mobile navigation omits the app drawer; the brand returns to the guide. Production integration remains unresolved.
- Prototype controls target 48 px/minimum 44 instead of balanced 38 px. Spacing uses 8 px rather than the app's 4 px base; section type uses 20 rather than 22 px. Product palette/fonts remain fixed.
- Stronger control boundaries and dark borders use existing neutral colors. Mobile item lists, source/effect presentation, consent and allowance compositions extend existing primitives.

## Critique and review status

The earlier inventory-level critique is superseded for AI-1 by the [receiving walkthrough](receiving-review.md). It names exact interactions, severity, consequences and evidence limits. The per-screen refinement below records final changes. Other capabilities retain their earlier medium-fidelity design.

## Confirm checklist and remaining compromises

- [ ] Boss answers or explicitly accepts Q01–Q13; no assumption is silently treated as approved.
- [ ] Boss and 3–5 real Owners attempt [10 tasks](usability-script.md) unaided on both widths; record outcomes, hesitations and actual language.
- [ ] Native Hausa reviewer validates wording; current checks establish layout, not fluency.
- [ ] Signed cut list names retained/deferred screens and disagreements; then freeze prototype version.
- [ ] Only after that sign-off: architecture and build prompts, against approved behaviors and real invoices.

Remaining compromises: no real extraction, pricing lookup, provider calls, tenant security, transactions, native capture, real offline replay, support sending or reporting integration. AI-2–AI-5 use key screens and scripted answers, not general analytics. Market URLs use reserved `.invalid` domains; no vendor quote is claimed. The 300-row fixture is generated; virtualized production rendering is unproved. Print invokes the browser print dialog. Browser/device/screen-reader coverage and merchant task success must not be inferred from Chromium checks. See [design-decisions.md](design-decisions.md) for recorded verification and token choices.

## AI-1 refinement feasibility and screen critique

No new merchant screen, feature or palette was added. Existing screen tags and candidate batches above still apply.

| Affected views | Refined behavior / existing file to extend | Remaining compromise |
|---|---|---|
| Upload / progress | **uses existing components** — `src/components/ui/dialog.tsx`, `src/components/ui/loading-state.tsx`; rehearsal choice outside merchant task, automatic stages | Parser/camera/provider still simulated |
| Review / row editing | **needs new component** — `src/components/imports/import-workbench.tsx`; unresolved-first row composition, immutable source excerpt, selected/unapplied language, focus restoration, quantity/cost validation | Catalog is synthetic; not a full catalog search; confidence is unmeasured |
| Optional price disclosure | **needs new component** — `src/components/imports/import-workbench.tsx`, `src/components/ui/button.tsx`; source/price disclosure within existing review | No Accordion/Collapsible component was found; native details is a documented deviation, not claimed library reuse |
| Confirmation / repair | **uses existing components** — `src/components/ui/dialog.tsx`; exact-effect Apply, no blanket checkbox; changed repair gets fresh Apply | Command binding is a local simulation, not production authorization |
| Result / pending / offline | **needs new component** — import workbench and sync provider; no synthetic write from empty lookup, dynamic PO balance, no zero-row success | No actual server receipt or reconnect |
| Inventory / PO entry / Bulk Add / other recovery states | **uses existing components** as inventoried above; entry points and required state coverage retained | Manual comparator still needs safe test workspace |
| AI-2–AI-5 | No design changes; renderer bodies compared with before snapshot | Prior medium fidelity remains |

AI-1-only library deviations: phone titles use existing 20 px token; inactive progress labels collapse at narrow widths; action footer is in document flow rather than sticky, avoiding overlap with editing. This trades more scrolling for unobscured fields. Inline source/effect composition remains new UI over existing primitives. The full source preview is desktop-only; every phone row retains its original source line and price evidence link.

**Review outcome:** stronger selection/authorization language, correction path and source comparison; premium usability remains a hypothesis. Browser results and evidence ledger are in [design-decisions.md](design-decisions.md). Proposed cuts and empty Boss/Owner sign-off are in [usability-script.md](usability-script.md).
