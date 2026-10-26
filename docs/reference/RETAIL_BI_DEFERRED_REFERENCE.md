# Retail BI — deferred planning reference

Updated 26 October 2026. This preserves the reporting definitions and proposed interfaces from the specification at application commit `6f11e6a`. It is historical planning, not delivered or production-verified behavior. Retail BI and AI business insights are outside the active AI stock-intake programme. A future separately agreed plan must revalidate these definitions and evidence.

Active work: [AI stock-intake plan](../AI_STOCK_INTAKE_PLAN.md).

## 5. Retail BI definitions

All cards, charts, drill-downs, reports and AI consumers use one authorized server definition over complete eligible data. Use database numeric/currency-precision arithmetic; do not sum browser subsets or silently cap aggregate inputs. Details paginate independently of totals. Use a common read snapshot/as-of basis so figures can reconcile.

### Eligible records and deduplication

- Include completed retail invoices and issued vendor transactions in `pending`, `partial` or `completed` state; exclude cancelled vendor transactions. Issued credit is revenue before payment. Obtain business sign-off before release.
- Exclude full `void`, `refund` or `return` reversals from the original period, restating historical comparisons. A full reversal through a linked vendor mirror excludes its canonical vendor transaction. Payment correction does not create revenue or a full reversal.
- Resolve mirrors using the exact tenant-scoped vendor reference in current code. Count the vendor once, suppress every confirmed linked retail mirror and use canonical vendor amounts/items. Do not fuzzy-match names/totals. Missing/conflicting/malformed references create reconciliation warnings; withhold affected metrics if the eligible population cannot be established reliably.
- Exclude `historical_sales` aggregate imports from operational totals and disclose the exclusion.
- Vendor historical costs and dependable location attribution are incomplete. Preserve an unallocated segment; never borrow arbitrary mirror locations. Unfiltered reports include eligible unallocated vendors. Location-filtered reports exclude unattributable vendors and disclose omitted counts/values.

| Metric | Calculation and limitation |
| --- | --- |
| Transaction count | Eligible retail invoices plus canonical issued vendor transactions, after mirror deduplication and full reversals. |
| Revenue | Retail `subtotal - discount`, excluding separately recorded tax; vendor recorded `total_value`. Do not invent vendor tax components. |
| Recorded paid amount | Retail `amount_paid - change_amount` plus vendor `amount_paid`, once per eligible invoice. Reflect recorded corrections without adding correction rows as payments. This is not dated cash collection. |
| COGS | Eligible sale-line quantity × historical line cost. Missing lines/costs and unavailable vendor costs mean incomplete coverage. Never substitute current catalog cost or zero. |
| Gross profit / margin | Revenue minus complete dependable COGS; margin = gross profit / revenue × 100. Return null with reasons for incomplete selected-set costs; margin is null for zero revenue. A separately labeled covered subset is allowed, never an unlabeled whole-set profit. |
| Net profit / margin | Null/unavailable because inspected schemas lack expense data. Gross profit must not be called net profit. |
| Sales trends | Eligible revenue/count grouped by business date, with corresponding prior-period buckets and identical filters/reversal policy. Empty known buckets are zero; unavailable data remains null. |
| Top products | Units and net product revenue; allocate invoice discount once across already line-discounted totals. Canonical vendor item totals appear once. Retain unknown/deleted-product labels. |
| Inventory valuation | Current quantity × current catalog cost, labeled **current-cost estimate**, with valued/unvalued position/unit coverage. Unknown cost is not zero; verified genuine zero differs from a legacy default. |
| Stock alerts | Current per-location positions: out of stock at quantity ≤ 0; low stock at positive quantity ≤ configured minimum. Preserve explicit zero thresholds with null-aware fallback. Missing positions/history are not invented as measured zeros. |
| Stock movements | Authoritative signed `inventory_ledger` movements in selected interval/location; never add requested movements again. |
| Outstanding payments | Current recorded open invoices, deduplicated and excluding full reversals: retail `max(total - (amount_paid - change_amount), 0)` plus vendor `max(total_value - amount_paid, 0)`. Includes invoice tax where recorded; not a complete customer-credit ledger. Invalid payment data produces warnings. |
| Recent activity | Authorized, paginated canonical transactions with status, amounts, source type and underlying record links. Label reversals/payment events separately from sale revenue. |

Cost coverage detects invoices with no lines, missing historical costs and ambiguous legacy defaults, not just non-null fields. Return eligible/covered invoice and line counts plus missing/excluded/unallocated reasons. Inventory coverage is separate from historical COGS. UI formatting must preserve null/unavailable values.

If `L_i` is an already-discounted line total and `D` the invoice discount, allocate `D × L_i / sum(L)` once. Reconcile minor-unit rounding deterministically, with stable line-ID tie breaking. Allocated product totals must equal invoice net revenue. Missing lines or zero denominators yield incomplete allocation coverage, not guessed values.

### Worked example — fictional

Two retail lines have already-discounted totals of ₦900 and ₦1,000. Subtotal is ₦1,900, invoice discount ₦190 and tax ₦128.25. Revenue is **₦1,710**; product revenue is **₦810 + ₦900**, without subtracting line discounts again. With ₦2,000 paid and ₦161.75 change, recorded paid is **₦1,838.25**, including tax; it differs from revenue.

An issued vendor invoice for ₦5,000 with ₦1,000 paid contributes one transaction, ₦5,000 revenue and ₦4,000 open balance. Its mirror adds nothing. Without dependable vendor costs, whole-set gross profit is unavailable. A later full reversal removes the original invoice from original-period operating totals; payment correction alone does not.

### Dates, filters and comparisons

Use organization timezone/currency from `organizations`, default missing timezone to **Africa/Lagos**. Validate settings and return effective values; do not hardcode naira formatting for every business. Default to **seven business-calendar days including today**. Resolve local boundaries to UTC and query half-open `[start, end)` intervals. Retail recognition uses `created_at`; vendors use `date_issued`. Invalid/missing dates create coverage warnings, not guessed dates.

For the live default range, end at captured current time and compare the preceding seven-calendar-day block through corresponding elapsed local time. Example: at 15:00 on 17 October in Lagos, compare 11 October 00:00–17 October 15:00 with 4 October 00:00–10 October 15:00. Resolve calendar boundaries in the organization's timezone, including DST where applicable, rather than fixed 86,400-second days. Closed custom ranges compare complete equally sized calendar ranges. Return current/previous boundaries, aligned buckets and as-of time. A zero previous baseline produces null percentage change with a reason; valid absolute change may still be shown.

Inventory, alerts and open balances are **current snapshots**, independent of the sales date filter. Label their snapshot time separately. Movement/transaction periods and omitted location coverage remain explicit. Drill-downs share summary eligibility/comparison definitions.

## 6. BI API and interface

Proposed authenticated endpoints under `/api/retail-bi`:

| Endpoint | Response |
| --- | --- |
| `GET /summary` | Metric values/availability, trend/comparison, coverage and snapshot cards. |
| `GET /transactions` | Cursor-paginated canonical activity/invoices with record links. |
| `GET /products` | Ranked units/net product revenue and allocation/line coverage; optional product detail filter. |
| `GET /inventory` | Current valuation/alerts by product/location. |
| `GET /movements` | Signed authoritative ledger detail in selected period. |
| `GET /balances` | Current recorded open retail/vendor invoices with canonical links. |

Return `effective_filters` (timezone, currency, locations, UTC intervals and prior intervals), `generated_at`, `snapshot_at`, reporting-definition version, coverage warnings and availability. Each metric contains `value` (decimal string or null), `availability` (`available`, `partial`, `unavailable`), `reasons` and coverage. Counts may be integers; currency serialization must preserve precision. Details return stable next cursors and the same definition/as-of metadata. If intervening changes make an as-of detail irreproducible, require refresh rather than claiming equality.

Validate server filters and cap detail pages. Resolve active tenant/role server-side; owner/admin access, existing location permissions and separate platform-owner routing apply. Never authorize from user-editable metadata or a client organization ID. Keep responses private and outside shared public caches. Client query keys include account, tenant, filters and definition version; clear displayed results on account switch.

Extend owner/admin `/dashboard`; `/reports` and drill-downs consume the same definitions. Preserve the cashier experience and `/admin` platform overview. Use existing Retail tokens, typography, density, components and charts.

- Header: period/location filters, timezone, last successful refresh, stale/partial status and intake action.
- Clear revenue, transaction, recorded-payment and gross-profit/margin cards with reasons for unavailable figures, including net profit.
- Revenue/comparison chart and ranked product bars with accessible data-table equivalents.
- Current valuation/coverage, per-location alerts, signed movements, open balances and recent activity with consistent drill-down links.
- Responsive layout, keyboard access, focus handling, screen-reader status, contrast, reduced motion and usable mobile tables.
- Distinct loading, empty, partial, unavailable, error and stale states. Failed refresh retains the last successful result/timestamp with a visible error, never a new success timestamp.

Invalidate affected queries after committed intake, sales, payments, reversals, product-cost and inventory changes. Extend tenant-scoped realtime invalidation and invalidate directly after successful commands; debounce event bursts. Poll every **60 seconds while visible and online**, refresh on reconnect/return to visibility and retain manual refresh. Polling is the fallback when events/publication are unavailable. Explain that unsynchronized offline activity cannot appear in server totals.
