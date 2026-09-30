# TracKasuwa consolidated build handoff

This report records the original local Phases A–E handoff. At that handoff, no migrations had been applied to live Supabase. **Deployment update, 30 September 2026:** the live schema rollout is recorded in [LIVE_MIGRATION_RECEIPT.md](LIVE_MIGRATION_RECEIPT.md), including compatibility migration 018 and explicit-grant migration 019. No external deliveries, application deployment, or push were performed. The six-page redesign and mobile work were excluded.

## A — Authentication and sync

- Removed the dead POS profile stub. Subscription queries now require a real organization; an organization-less platform owner uses only the global plan catalog. Other missing memberships receive a plain-language error.
- Queue flushes require a successful, bounded session refresh. Offline/transient failures and invalid sessions retain queued records; invalid sessions display a sign-in prompt and prevent flushing until authentication succeeds.
- Bounded `getUser()` calls: auth provider, product form, image upload, users collection API, individual-user API, audit API, receipt lookup API, merchant onboarding API, vendors page, subscriptions page, and both auth session helper calls. The auth provider retains its cached-auth fallback. Components without an auth cache report failure rather than inventing authentication.
- `lib/offline/auth-cache.ts`: no `getUser()` call to wrap. POS: existing `getUser()` is audit-only and remains unwrapped because further POS edits were prohibited.
- Local commit: `72c86d1`. Full suite: 24 files / 229 tests; typecheck passed.

## B — Two separate subscription clocks

- IndexedDB version 6 introduces `app_meta`, with organization-scoped last verification, monotonic last-seen time, active state, and a sticky clock-rollback flag. Fresh devices have no grace. Confirmed inactivity blocks immediately; warnings begin on day 23; the offline window ends at day 30. Clock rollback tolerance is two minutes.
- POS uses the minimal checkout guard. PO/vendor creation is guarded through the existing shared mutation layer, preserving the protected modules. Viewing and queued synchronization remain available.
- Database activation requires a successful payment record, starts new organizations' introduction using database time, and places paid period start 30 days later. Existing organizations retain their prior eligibility. The shared banner, including on Subscriptions, shows introduction days as of the last server verification.
- Final hardening denies legacy unpaid signup trials for new organizations. It also makes the displayed introduction countdown use server timestamps exclusively.
- Local commit: `02f59c7`; final hardening is included with Phase E. Full suite: 25 files / 239 tests; typecheck passed.

## C — Accounting controls

- **Completeness:** database triggers capture sales, sale items, inventory, stock movements, purchase orders, vendor transactions, subscriptions, user/role changes, and products; later import/AI tables also have triggers. Every changed inventory quantity produces a canonical stock movement.
- **Immutability:** audit rows and financial deletions are blocked by database triggers. Sales are corrected by linked, reasoned reversal/correction entries. Cash-up closes and import row/reversal records are immutable. The new official invoice number cannot be updated, including by an owner.
- **Traceability:** organization-local audit sequence and SHA-256 chain are serialized through a locked counter. Entries contain actor/role, device, server and original device time, before/after values, and correlation information. Official sales invoice numbers are allocated serially on the server; repeated offline sale IDs do not consume another number. Existing receipt references remain intact.
- **Segregation:** owner/admin roles perform accounting controls; cashiers cannot access audit exports, reverse sales, make ad-hoc stock adjustments, change catalog prices on sale items, apply discounts, or promote themselves. The cashier discount threshold is zero, pending a product decision.
- **Reconciliation:** `/accounting` supplies daily sales, cash-up expected/count/variance, exceptions, canonical stock movements, and vendor-payment mismatch reports. Reports use CSV/PDF export. Corrections require preview, explicit confirmation, and a reason. `/audit` retains filters and exports and reads all pages rather than silently limiting to 200 records.
- Reversals restore the actual canonical stock delta. Legacy sales with no stock link and sales with ambiguous timestamp links are blocked for reconciliation rather than guessed.
- Local commit: `cf8ecf9`; invoice/link hardening is included with Phase E. Full suite: 27 files / 250 tests; typecheck passed.

These are application controls, not a compliance certification. A qualified accountant familiar with Xavier's business and Nigerian jurisdiction should sign off the accounting treatment, permissions, tax/invoice requirements, cash procedures, retention, and reports.

## D — Imports

- `/imports` supports products/opening stock with a warehouse, suppliers, customers, separate historical sales, and owner-only pending staff invitations through the existing users API. Password fields are never imported.
- Existing `xlsx` parses CSV/XLSX locally. Mapping auto-detects aliases; saved templates are scoped to organization and record type. Validation, duplicate policies, full validation download, preview, explicit confirmation, 50-row write chunks, progress, and downloadable row outcomes are implemented. All rows are validated; the UI displays the first 200 to keep the preview bounded.
- Product matching uses SKU/barcode; people use normalized email/phone. Ambiguous matches and repeated identifiers within one file require correction. Creating another product requires a unique SKU. Opening stock applies only to new products.
- Each import has a batch, immutable row results and snapshots, references on affected entities, and audited reversal. Reversal preserves records and refuses to overwrite later changes or consumed opening stock.
- Products/suppliers and their opening stock can queue atomically in IndexedDB, including a false-online catch fallback. Other targets require connectivity explicitly. Server replay validates each row again, is idempotent, and reconciles provisional local cache results.
- Historical imports never call `persistOfflineSale` or change stock; reports include them only when selected.
- Local commit: `75021b7`. Full suite: 30 files / 263 tests; typecheck passed. The offline test covers 1,001 rows across 21 chunks.

## E — AI plumbing

- `/assistant`, `/api/ai`, and `src/lib/ai/` provide a server-only, provider-agnostic interface with a deterministic mock default. Unknown providers fail closed. No live model or external market source is claimed.
- Every AI route and the database action RPCs enforce active membership and entitlement. Catalog order from migration 010 is **Free → Starter → Growth → Business → Enterprise**; only exact catalog IDs for the final three tiers qualify outside the paid introduction. Legacy plan names do not confer access.
- Product uploads/pasted text produce proposals that enter the same import mapping, validation, preview, and confirmation workflow. The AI has no delete endpoint or automatic inventory execution. Recognizable contact details are stripped from product text; insight generation receives product/stock/sales aggregates and a bounded low-stock list, not customer/staff records.
- Insights are explicitly labeled stubs and use only the caller's organization. In-app delivery uses the existing notifications table. Email/SMS adapters remain disabled without server configuration and address only the approving user's profile contact.
- Per-user/channel opt-ins default off. Delivery requires approval of the displayed insight. Database quotas are 20 AI requests/hour and 5 delivery reservations/channel/hour; an insight is delivered once per channel. Failed/uncertain external deliveries are not automatically retried.
- Requests, suggestions, approvals, import outcomes, and delivery results are audited. AI tables use organization-and-user scoped RLS, with no direct authenticated writes.
- `.env.example` now contains placeholders instead of the previously tracked Supabase service-role credential. **Rotate that exposed credential in Supabase; replacing the example does not remove it from Git history.** Live environment files were not changed.
- Local commit: `9dbec4b`. Full suite: 32 files / 282 tests; typecheck and production build passed.

## Apply these migrations in order

Initial migrations 001–012 are unchanged. Apply all new files before using the new client:

1. `013_subscription_verification_intro.sql`
2. `014_accounting_controls.sql`
3. `015_business_imports.sql`
4. `016_ai_assistant_plumbing.sql`
5. `017_invoice_number_immutability.sql` — also denies unpaid legacy signup trials for new organizations and blocks ambiguous reversal stock links.

Migration 013 was authored in this batch; its UTF-8 BOM was removed during local SQL verification. No previously applied migration was edited. All migrations were exercised together in local PGlite, using test auth functions; this is not a live Supabase migration rehearsal or a concurrency/load test.

## Environment

- Keep real Supabase URL/publishable key and server-only service-role key in deployment secrets, not the example file.
- `AI_PROVIDER=mock` is the supported default. `AI_API_KEY` is reserved for a future implemented server adapter; a key alone does not connect a model.
- Optional `AI_EMAIL_URL`/`AI_EMAIL_KEY` and `AI_SMS_URL`/`AI_SMS_KEY` enable HTTPS adapters. The adapter service must accept JSON `{recipient,title,message,idempotencyKey}`, a bearer credential, and an `Idempotency-Key` header, and should implement deduplication. Never use `NEXT_PUBLIC_` for these keys.
- Existing Zainpay configuration remains necessary for live payment confirmation. No payment credentials or live payment transactions were tested.

## Decisions and limitations

- New organizations must reach payment-confirmed activation. The pre-existing signup/plan-selection experience is not a complete paid signup flow: signup can still attempt its old Free/14-day record, and direct self-service activation is now rejected. Complete and validate that payment journey before rollout; decide how Free accounts should satisfy the new paid-introduction rule. No payment gateway behavior was fabricated to bypass this.
- Manager means the existing `admin` role. Cashier discount allowance is zero. Xavier should decide any approved threshold and manager approval workflow.
- The hash chain starts with events written after migration; older audit rows are retained without pretending they were historically chained. Device IDs and original device timestamps are attribution metadata, not trusted time. Database administrators who can disable triggers remain outside application-level immutability guarantees.
- Official server invoice numbers are additional fields; protected POS/receipt behavior retains legacy/local invoice references. Decide how legal invoice presentation should reconcile/display both before rollout.
- Cash reconciliation uses the existing payment-method buckets, including `split`/`partial`; no missing per-tender breakdown is invented. Reversal reports preserve the original and linked correction; daily sales are a net operational view, not a full double-entry general ledger or tax return. Confirm refund timing and split-tender accounting with the accountant.
- Legacy/ambiguous stock links require manual reconciliation. No destructive historical repair was run. Import reversals also refuse unsafe changes rather than overwriting later business activity.
- Staff imports create pending invite records; sending invitations and an acceptance flow are not newly implemented. Email/SMS/model providers and external market data remain unconnected until separately configured and verified.
- Parsing reads the first worksheet, with a 20 MB limit. Writes are chunked; spreadsheet parsing itself uses the existing browser parser. Saved mappings are local to this device/browser. Offline import previews remain provisional until server replay succeeds.
- AI requires connectivity, including approval; previously approved offline-capable imports can queue through the shared import pipeline. Text contact redaction is heuristic; users must supply product data only.
- Verification consists of unit/mocked integration tests, actual local PostgreSQL-compatible SQL execution, and authenticated-role RLS checks for the new AI tables. It does not establish live Supabase parity, real provider delivery/payment behavior, browser visual acceptance, or production concurrency/performance.
- Existing user changes adding Caveman dependencies to `package.json` and `package-lock.json` remain uncommitted and were not overwritten. The PGlite test dependency added for this batch is committed separately from those changes.
- The TracKasuwa development server was temporarily paused to relieve test memory pressure, then restarted in a hidden process at `http://localhost:3000` (Next reported ready). The unrelated project server was not changed.

## Verification evidence

Final test run (including both existing 300 ms checkout assertions):

```text
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000
RUN  v4.1.10 C:/Users/PC/TradeTrack


 Test Files  32 passed (32)
      Tests  282 passed (282)
   Start at  13:56:02
   Duration  129.03s (transform 2.98s, setup 3.22s, import 14.88s, tests 20.18s, environment 75.71s)
```

Typecheck:

```text
node node_modules/typescript/bin/tsc --noEmit
Typecheck exit code: 0
```

The 120-second test/hook limits accommodate 30,000-row fixture seeding on this machine. The checkout assertions remain strictly below 300 ms; their thresholds were not changed. Earlier interrupted runs encountered host memory pressure; green runs above are the completion evidence.


### Protected SHA-256 values

`src/lib/offline/sales.ts`

```text
before 2a797642c5c4a0e4072ce1fb521b11ae966da737e15f1d4af77f2c2bbead41ef
after  2a797642c5c4a0e4072ce1fb521b11ae966da737e15f1d4af77f2c2bbead41ef
```

`src/lib/offline/purchase-orders.ts`

```text
before 3c6894381bdd2b0959dfcaa37e12a406641beb2afe197e977cf6e99f25f9a105
after  3c6894381bdd2b0959dfcaa37e12a406641beb2afe197e977cf6e99f25f9a105
```

`src/app/(dashboard)/purchase-orders/page.tsx`

```text
before ca80702efbe86f28b0202c6403c5cc47c3e5088f68b974de96e9a2c8a9eec0da
after  ca80702efbe86f28b0202c6403c5cc47c3e5088f68b974de96e9a2c8a9eec0da
```

`src/app/(dashboard)/pos/page.tsx`

```text
before a6b6fadd5f75dd4223d19105cff1ea94df4a148fb3eed0117114ca24bf1fba4c
after  da3ad8c4bf22bd6ce50504808b0cc4d0ffdd035aef11ce321a9e3ac706e4be93
```

`pullPurchaseOrders()` exact body unchanged: true.

```text
before b972be214ddf08b0f6e656dc9e42d72edb15214ecf4cc36616d63ce8ab9027c1
after  b972be214ddf08b0f6e656dc9e42d72edb15214ecf4cc36616d63ce8ab9027c1
```

### Exact POS diff

```diff
diff --git a/src/app/(dashboard)/pos/page.tsx b/src/app/(dashboard)/pos/page.tsx
index 84e8a81..a7a9e6a 100644
--- a/src/app/(dashboard)/pos/page.tsx
+++ b/src/app/(dashboard)/pos/page.tsx
@@ -320,7 +320,8 @@ function POSPageInner() {
     [cart],
   );
 
-  const handleCheckout = () => {
+  const handleCheckout = async () => {
+    if (!(await (await import("@/lib/subscriptions/verification")).allowCheckout(user?.organization_id || "", toast.error))) return;
     if (!user) return toast.error(t.pos.not_authenticated);
     if (cart.items.length === 0) return toast.error(t.pos.cart_is_empty_toast);
 
@@ -332,7 +333,6 @@ function POSPageInner() {
       return;
     }
 
-    const { data: profile } = { data: { organization_id: "" } };
 
     // Get org_id from user store
     const orgId = (user as unknown as { organization_id: string })
```

### Files by phase

Phase A (`72c86d1`):

```text
build-evidence/protected-before.json
build-evidence/pullPurchaseOrders-before.txt
src/app/(dashboard)/pos/page.tsx
src/app/(dashboard)/subscriptions/page.tsx
src/app/(dashboard)/vendors/page.tsx
src/app/api/audit/route.ts
src/app/api/merchants/onboard/route.ts
src/app/api/receipts/lookup/route.ts
src/app/api/users/[id]/route.ts
src/app/api/users/route.ts
src/components/auth/auth-provider.tsx
src/components/products/image-upload.tsx
src/components/products/product-form.tsx
src/components/shared/sync-provider.tsx
src/lib/auth/__tests__/organization.test.ts
src/lib/auth/organization.ts
src/lib/auth/session.ts
src/lib/offline/__tests__/sync-auth.test.ts
src/lib/offline/sync-engine.ts
```

Phase B (`02f59c7`):

```text
src/app/(dashboard)/pos/page.tsx
src/app/api/subscriptions/verification/route.ts
src/components/shared/query-provider.tsx
src/components/shared/sync-provider.tsx
src/components/subscriptions/verification-banner.tsx
src/lib/offline/__tests__/db-v4.test.ts
src/lib/offline/__tests__/db-v5.test.ts
src/lib/offline/db.ts
src/lib/subscriptions/__tests__/verification.test.ts
src/lib/subscriptions/verification.ts
supabase/migrations/013_subscription_verification_intro.sql
```

Phase C (`cf8ecf9`):

```text
build-evidence/check-protected.cjs
package-lock.json
package.json
src/app/(dashboard)/accounting/page.tsx
src/app/(dashboard)/audit/page.tsx
src/app/api/accounting/route.ts
src/app/api/audit/route.ts
src/lib/accounting/__tests__/database.test.ts
src/lib/accounting/__tests__/reconciliation.test.ts
src/lib/accounting/reconciliation.ts
src/lib/auth/api-context.ts
src/lib/offline/__tests__/sync-timestamp.test.ts
src/lib/offline/sync-engine.ts
src/lib/supabase/client.ts
src/lib/utils/device-id.ts
supabase/migrations/013_subscription_verification_intro.sql
supabase/migrations/014_accounting_controls.sql
```

Phase D (`75021b7`):

```text
src/app/(dashboard)/accounting/page.tsx
src/app/(dashboard)/imports/page.tsx
src/app/api/accounting/route.ts
src/app/api/imports/route.ts
src/app/api/users/route.ts
src/components/imports/import-workbench.tsx
src/lib/accounting/__tests__/database.test.ts
src/lib/imports/__tests__/offline.test.ts
src/lib/imports/__tests__/parse.test.ts
src/lib/imports/__tests__/preview.test.ts
src/lib/imports/execute.ts
src/lib/imports/parse.ts
src/lib/imports/preview.ts
src/lib/offline/sync-engine.ts
supabase/migrations/015_business_imports.sql
```

Phase E (`9dbec4b`):

```text
.env.example
src/app/(dashboard)/assistant/page.tsx
src/app/(dashboard)/imports/page.tsx
src/app/api/ai/route.ts
src/components/imports/import-workbench.tsx
src/components/subscriptions/verification-banner.tsx
src/lib/accounting/__tests__/database.test.ts
src/lib/ai/__tests__/assistant.test.ts
src/lib/ai/__tests__/route.test.ts
src/lib/ai/delivery.ts
src/lib/ai/entitlement.ts
src/lib/ai/mock.ts
src/lib/ai/provider.ts
src/lib/ai/types.ts
src/lib/subscriptions/__tests__/verification.test.ts
src/lib/subscriptions/verification.ts
supabase/migrations/016_ai_assistant_plumbing.sql
supabase/migrations/017_invoice_number_immutability.sql
```

### Production build

`node node_modules/next/dist/bin/next build` passed (exit 0). The first sandboxed attempt could not download the existing Google Fonts; the network-enabled retry compiled and generated all routes. Existing middleware-to-proxy deprecation remains a warning. Selected actual output:

```text
✓ Compiled successfully in 64s
  Finished TypeScript in 46s ...
✓ Generating static pages using 7 workers (43/43) in 2.2s
├ ƒ /api/ai
├ ƒ /assistant
Build exit code: 0
```
