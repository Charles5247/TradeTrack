# Retail follow-up — 6 October 2026

This supplements the earlier replacement report. Shared styling alone did not complete the operational page bodies; this pass adds the following implementations.

| Screen | Implemented behavior |
| --- | --- |
| Settings | Business profile, registration, brand upload, localization and date preferences persist to the organization; responsive section navigation; existing profile/security controls; printer pairing, sync status/actions, receipt preview and export destinations. |
| Subscriptions | Current-plan hero, real assigned bank account, compact plan cards, billing export, payment-account and usage panels, cancellation confirmation, proper billing references and load errors. Platform catalog controls retained. |
| Suppliers | New directory and create/edit form, contact details, multiple suppliers per product, link/unlink controls, primary supplier indication and purchase-order supply history. |
| Warehouses | Main-shop/location cards, stock counts, inventory links and business-owner staff assignments. Existing admin accounts can be assigned as managers and cashier accounts as cashiers to multiple locations. Assignments record responsibility; they do not change account roles or restrict existing POS access. |
| Vendor sales | Outstanding/paid/all filtering, contact search and transaction/collected/outstanding summaries; existing collection and offline behavior retained. |
| Receipts | New paginated receipt library, invoice/payment filters, real receipt lookup links. |
| Receipt lookup | Two-column search/detail layout, supported-browser barcode image lookup, account-scoped recent lookups, invoice URL lookup, browser print and PDF for sale receipts; stale request protection. |
| Other pages | Notifications filters and read-action errors; query failure/retry states on products, sales, transfers, users, audit and merchants; centered responsive content width; warehouse-filter navigation into inventory. |

## Database

`20261006092523_retail_supplier_warehouse_workflows.sql` adds supplier-product links and warehouse staff assignments, same-organization foreign keys, indexes, row-level policies, authenticated grants and audit triggers. It was applied to the linked database. Remote inspection confirms RLS and two policies on each new table. Database tests exercise owner assignments, cashier restrictions and cross-organization rejection.

The linked database lacks the migration-history table despite already having the existing schema. Only this specific additive migration was executed; the historical migrations were not replayed. Reconcile history before a future bulk migration push.

## Verification

- Full Vitest suite: **48 files, 334 tests passed** (90.09 seconds).
- Follow-up workflow regression: **3 tests passed** after final integration corrections.
- Follow-up platform settings/catalog regression: **5 tests passed**.
- TypeScript: `tsc --noEmit` passed. Production build also completed its TypeScript check.
- Production: `next build --webpack` passed; all 46 build entries generated, including `/suppliers` and the receipt routes.
- Retail verifier: **46 exact palette values, four protected source hashes unchanged, 17 supplied photos decoded and byte-matched, 36 page routes inventoried**.
- `git diff --check`: passed. Logs are in `build-evidence/retail-completion/` locally.

## Verification limits and existing behavior

- Browser inventory returned no enabled browser. No screenshot comparison or physical USB/Bluetooth printer test was possible. The tests above establish build/workflow behavior, not pixel-perfect visual approval.
- Subscription plan selection retains the existing direct subscription mutation. This pass does not implement or certify paid checkout, automatic renewal, or payment-provider reconciliation. The UI describes renewal as manual.
- Settings receipt preview uses the existing fixed receipt template; it is not a custom receipt-template designer. Tax-rule management and API-key issuance are not implemented by this change.
- Supabase security advisors reported existing security-definer views (`v_subscription_revenue`, `v_merchant_summary`), mutable search paths on older functions, and leaked-password protection disabled. No finding named the new tables or their audit function. Those older issues remain outstanding.
- No code was pushed. The database migration above was applied separately under the user's authorization to connect the workflows to the backend.
