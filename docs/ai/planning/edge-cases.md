# Edge cases and proof matrix — Gate 1 draft

## One-page summary

These **48 planned tests** have not run. Require database/audit assertions: zero unapproved writes, zero tenant leaks and one effect per command. D3 partial success, D4 reconnect re-review, D5 spend, D6 profit and D8 consent need executable proof. Real merchant-labelled English/Hausa inputs must supplement synthetic fixtures.

All outcomes are **proposed acceptance conditions** from [v0.3](../track-kasuwa-ai-assistant-spec.md). Components are responsibilities, not endpoints. See [lifecycle](proposal-lifecycle.md), [agent boundaries](agent-design.md) and [unconfirmed assumptions](open-questions.md).

## Matrix

| Test | Trigger | Expected behavior | Handles it | Proof to run |
|---|---|---|---|---|
| E01 | Blurred/cropped invoice | Identify unreadable fields; offer retake/manual | Parser/review | Labelled crop: unresolved cells, zero writes |
| E02 | Spoofed MIME/huge archive | Reject before parsing | Upload/sandbox | Bound memory/time; no model call |
| E03 | Formula/macro/multiple sheets | No execution or silent omissions | Parser | Malicious workbook; explicit sheet rejection/choice |
| E04 | Hausa/Pidgin, ctn, 31k | Expand with evidence; clarify ambiguity | Extraction/review | Merchant-labelled shorthand fixtures |
| E05 | Duplicate upload | Warn; reopen draft/result before regeneration | Deduplication | Upload twice: no duplicate stock |
| E06 | Rephotographed invoice/repeat delivery | Ask about duplicate; distinguish genuine deliveries | Deduplication/review | Same invoice/different bytes versus separate receipts |
| E07 | 300 rows/truncated output | Account for every row; resume unprocessed | Harness/validator | 240/40/15/5 fixture counts preserved |
| E08 | Totals mismatch | Explain exact discrepancy; clarify | Validator | Alter total; no auto-balancing |
| E09 | Ambiguous 8500 price | Ask cost/total/selling meaning | Review | §6.6 unresolved until answered |
| E10 | Conflicting carton memory | Ask again; conventions product/org-specific | Memory/validator | Gino 50/48: no silent reuse |
| E11 | 429/timeout/invalid JSON | Bound retries/steps/time; preserve draft | Harness | Fake clock: ceilings enforced |
| E12 | 1.5 cartons ×50 pieces | Preserve source; exact conversion only | Unit validator | 75 passes; 1.5×3 unresolved |
| E13 | Barcode/SKU conflict | Block match; ask Owner | Catalog/review | Two candidates: no write |
| E14 | Missing SKU/inactive match | Review identifier/reactivation explicitly | Catalog/review | Both fixtures require decisions |
| E15 | No warehouse default | Ask; validate target ownership | Review/commit | Foreign/deleted warehouse rejected |
| E16 | Missing cost/true zero | Missing: zero+flag, reminder, profit exclusion | Commit/metrics | Zero rows retain distinct cost quality |
| E17 | Suggested selling price | Apply only explicitly selected price | Approval/commit | Stock-only approval leaves price unchanged |
| E18 | Different market pack/currency | Normalize evidenced comparables only | Price tool | Correct range, conversion and citations |
| E19 | Stale/absent/conflicting prices | Label uncertainty; margin fallback advisory | Price/review | Controlled sources; no invented quotation |
| E20 | Peak delivery 4/5 | Receive 4; outstanding 1 | Reconciliation/receipt | §6.8 quantities; PO stays open |
| E21 | Unordered Kings Oil | Hold unless explicitly included | Reconciliation/review | Held item changes no stock |
| E22 | Concurrent PO receipt | Lock outstanding; replay stable key | Receipt commit | Race cannot overreceive |
| E23 | Receipt/audit failure | Whole approved group rollback (**assumption**) | Receipt transaction | Inject failures: zero partial effects |
| E24 | Unapproved tool/client write | Deny business mutation | Authorization | Direct tool/RPC attacks: zero writes |
| E25 | Post-approval edit | New revision invalidates approval | Proposal service | Change cost/warehouse; reject old hash |
| E26 | Confident but ambiguous row | Exclude from bulk approval | Review/validator | Conflicting identifiers remain blocked |
| E27 | Batch B fails | Keep A/C; reapprove repair (**assumption**) | Commit/repair | A/C once; B zero until approved |
| E28 | Lost commit response | Confirmation pending; same-key lookup | Recovery | One delta; original receipt returned |
| E29 | Changed payload/repaired error | Reject reused key; link new repair | Command receipts | Identical replay returns original result |
| E30 | Offline stock 20→18 | Re-review +12; no silent drop | Approval outbox | Neither unapproved +12 nor snapshot 32 |
| E31 | Offline price/unit change | Invalidate affected approval | Reconnect validator | Change each field: zero writes |
| E32 | Timestamp equality/skew | Compare approved facts | Conflict validator | Equal time/different facts conflicts |
| E33 | Target disappears | No silent recreation/rematching | Commit validator | Missing target returns review |
| E34 | Plan/role/switch revoked | Recheck; retain draft | Authorization | Revoke before apply: denied |
| E35 | Account/org switch | Hide old data; suspend replay | Cache/outbox | Cross-account and same-user/org-switch tests |
| E36 | Worker/commit crash | Resume checkpoint/budget/unknown outcome | Recovery | Kill each boundary; no duplicate effects |
| E37 | Admin/Cashier/Platform AI access | Deny; no default platform outputs | UI/API/RLS/RPC | Role matrix includes old-job/direct reads |
| E38 | Foreign related IDs | Deny every NEW table/storage path | Database/tools/storage | Two-org reads/writes/joins/cache/signed-URL attacks |
| E39 | Absent/revoked sharing consent | Block improvement export; recheck pending | Consent/export | Scope/item toggles: zero unauthorized payloads |
| E40 | Document/web injection | Deny escalation/exfiltration/private-network fetch | Sandbox/broker | Injection corpus; capture outbound traffic |
| E41 | Memory deletion/expiry/edit | Purge retrieval/cache; invalidate approval | Memory/proposal | Regenerate/reconnect cannot reuse deleted value |
| E42 | Budget exhausted/concurrent jobs | Reserve atomically; stop; retain uncertain charges | Meter/harness | Last-allowance race/retries never overspend |
| E43 | Refund/discount/tax/split analytics | Exact metrics; disclose missing tenders | Metrics/validator | Seeded ledger reconciles periods/amounts |
| E44 | Cost corrected after sale | Exclude unknown profit; preserve history | Metrics/snapshots | Mixed-cost coverage, no sale rewrite |
| E45 | Thin history/stock elsewhere | Uncertainty; transfer before reorder | Stock analysis | Sparse-history/multi-warehouse fixture |
| E46 | Unequal shifts/reversal actors | No efficiency ranking/accusation | Staff metrics | Attribute original cashier separately from manager |
| E47 | Hausa/English identifiers/invalid locale | Chosen language; retain identifiers | Locale/harness | Native Hausa review; invalid-locale fallback |
| E48 | Off-topic/ambiguous follow-up | Refuse or clarify period | Query scope/context | Multi-turn period/org/citation fixtures |

## Source anchors and current limits

* Input baseline: [parser](../../../src/lib/imports/parse.ts), [provider](../../../src/lib/ai/openai.ts). Text/CSV/XLSX support does not prove image/pricing/language quality.
* Apply baseline: [015](../../../supabase/migrations/015_business_imports.sql), [016](../../../supabase/migrations/016_ai_assistant_plumbing.sql), [PO receipt](../../../src/components/purchase-orders/purchase-orders-screen.tsx). Binding/atomicity remain gaps.
* Offline: [engine](../../../src/lib/offline/sync-engine.ts), [timestamp tests](../../../src/lib/offline/__tests__/sync-timestamp.test.ts), [vendor tests](../../../src/lib/offline/__tests__/vendor-sync.test.ts). Equality/precision tests are extension points.
* Analytics/access: [analysis](../../../src/lib/ai/analysis.ts), [reports](../../../src/app/(dashboard)/reports/page.tsx), [API](../../../src/app/api/ai/route.ts), [locales](../../../src/i18n/locale.ts), [database harness](../../../src/lib/accounting/__tests__/database.test.ts). None establishes these future outcomes.
