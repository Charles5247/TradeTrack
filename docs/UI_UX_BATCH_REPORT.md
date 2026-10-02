# TracKasuwa UI/UX batch

## Part 1 — Six-page Retail migration

The pages retain their existing shared Card, Button, Input, Table, Badge and
Dialog components. Headings now use Retail typography; status colors use the
semantic palette in light and dark themes. Page headers stack on phones,
dialogs fit within the viewport and scroll vertically, and existing tables
retain their horizontal scrolling containers. No new palette was introduced.

| Page / changed file | Changes |
|---|---|
| `src/app/(dashboard)/purchase-orders/page.tsx` | Retail heading and muted text, responsive header and line-item form, larger phone action targets, semantic cancel/receive colors, bounded dialogs; all lifecycle/offline handlers unchanged. |
| `src/app/(dashboard)/warehouses/page.tsx` | Retail heading and numeric typography, wrapping card headers, responsive page header and bounded editor. |
| `src/app/(dashboard)/receipts/lookup/page.tsx` | Retail heading and receipt headings, stacked mobile lookup controls and metadata, token-based item-list surfaces and scroll containment. `/receipts` still redirects here. |
| `src/app/(dashboard)/sales/page.tsx` | Retail heading, wrapping export controls, responsive filter grid/date range, token-based totals, bounded detail dialog. |
| `src/app/(dashboard)/users/page.tsx` | Retail heading, responsive header/forms/dialogs, semantic role-action colors, existing shared table and badges retained. |
| `src/app/(dashboard)/merchants/page.tsx` | Retail headings, shared semantic Badge for statuses, semantic onboarding colors, responsive wizard/detail grids and filters, removed duplicate outer padding. |

AST comparison against batch baseline `cd0f825` confirms unchanged event
handlers and query/mutation definitions across all six pages. No existing
offline behavior was removed. Purchase Orders' cached-data/lifecycle regression
test remains part of the test run. Pages that already require server access
still require it; this batch does not invent offline persistence for them.

## Part 2 — Product photo, scan and import menu

Changed `src/components/products/image-upload.tsx` and `product-form.tsx`.
Added `product-code-lookup.tsx`, `src/lib/products/lookup-code.ts`, and
`src/lib/products/detect-code.ts`.

The image area is keyboard accessible. One grouped dialog contains four
vertically stacked, icon-led choices, each with explanatory text and at least
a 44px touch target. Existing image replacement/removal controls are visible
without hover. Existing file validation, compression, storage and drag/drop
upload behavior remain in use.

**Mobile (375px):** the dialog is viewport width minus 32px, capped at 90dvh,
with vertical scrolling. **Desktop (1280px):** the same dialog caps at 448px
wide. The options retain the same order and text at both widths.

1. **Take a photo:** opens a separate `image/*` file input with
   `capture="environment"`. Supported mobile browsers offer rear-camera
   capture; desktop can fall back to a file picker. A selected photo uses the
   existing upload/preview flow. Cancellation leaves the form untouched.
2. **Scan barcode / QR:** opens the code-lookup view. Supported browsers show
   “Scan with a photo”; decoded data is searched as an exact barcode or SKU
   within the current business. This photo is never attached to the product.
   Unsupported browsers explicitly show manual entry instead. Manual entry is
   always available. Errors, no match and ambiguous matches are explained.
   A match requires “Use this product” before replacing form fields; the form
   then updates that existing product ID rather than creating a duplicate.
   Category/status controls and image preview follow the matched record.
3. **Upload a photo:** opens the original device-photo picker without a capture
   hint. Existing JPEG/PNG/WebP/AVIF validation and 2MB limit remain. Preview,
   upload spinner, success, failure rollback and removal use the existing flow.
4. **Upload an inventory list:** opens `/imports` in a new tab, preserving the
   current form. The existing Phase D workbench defaults to products and handles
   CSV/Excel mapping, validation, preview, confirmation and offline queuing.
   No import parser or persistence system was duplicated.

Code lookup uses the current account's IndexedDB catalog when offline. Cached
matches may prefill a preview, but saving remains disabled until a fresh online
lookup confirms the complete record. A cache miss is not presented as proof
that a product does not exist. This preserves the original product form's
online-save behavior and prevents partial cached records overwriting full data.

## Validation and evidence

Added behavior tests for camera/gallery separation, keyboard access, touch-visible
removal, import destination, unsupported scanning fallback, confirmed matches,
no-match/error states, organization scoping, bitmap cleanup, existing-ID updates,
cached-save prevention, page shells, and receipt lookup/reset. Tests run with
375px and 1280px window widths where applicable.

The full, unabridged command outputs are included in this report's verification
appendix and in `build-evidence/ui-ux/`. TypeScript emits no diagnostics on a
successful check; the recorded exit code is explicit.

**Visual verification limitation:** no browser surface was available in this
session (`iab` returned “Browser is not available”). The width tests use jsdom;
they do not measure CSS layout or constitute screenshot/device-camera tests.
The layout descriptions above specify the implemented responsive classes.
Real-browser layout, dark-mode screenshots and native-camera behavior still
need the Render/device smoke test described in the deployment guide.

Protected-file SHA-256 comparison is in
`build-evidence/ui-ux/protected-check.json`. It includes the entire
`src/lib/offline/sync-engine.ts`, a stronger check than only `pullPurchaseOrders()`.
Run `node scripts/verify-ui-protected.cjs` to reproduce it.

The initial production build compiled successfully, then encountered a malformed
generated `.next/dev/types/routes.d.ts` with a duplicate trailing declaration.
The valid generated production route declarations were copied over that stale
development-cache file before repeating typecheck/build. No tracked application
code or TypeScript configuration was changed for this cache repair. The original
failure output is retained as `build-evidence/ui-ux/build-initial.txt`.

Existing React `act(...)` warnings in offline component tests and Next's
middleware-to-proxy deprecation are retained in the raw output rather than
hidden. They were not used to waive failing tests.

## Render deployment follow-up

Added `docs/RENDER_LIVE_TEST.md` with exact Render setup, environment mapping,
source-defined demo login details, Supabase URL configuration, Zainpay sandbox
setup and the current payment limitations. `docs/DEPLOYMENT.md` points to it.
Updated `render.yaml` to use locked installs with build dependencies, environment
validation and Node 22. Added the two missing virtual-account environment names
to the blueprint and `.env.example`. No secret values were committed and no
demo users, passwords, live records or payment settings were changed.

## Assumptions and decisions for Xavier

- Barcode/QR values are matched to this business's barcode/SKU catalog, not an
  external product directory. A QR URL is treated as data, never opened.
- Scanning uses a captured/selected photo rather than a continuous video stream.
  This reuses native mobile capture and requires no extra scanner dependency.
- Existing image size/type limits were retained. Large camera photos and HEIC
  can still require resizing/conversion; expanding those limits is a separate
  product decision.
- New capture-menu copy is English, matching the existing product form. Hausa
  and Yoruba translation of this new copy needs product review.
- Confirm whether a scanned match should edit the existing item (implemented)
  or support an explicit future “duplicate product” workflow.
- Choose a private test deployment or public demo, an isolated test database or
  controlled live data, and the Render instance plan. Existing seed passwords
  are documented as source defaults, not verified current credentials.
- Paid signup/checkout is not complete: the current subscription page does not
  invoke Zainpay initialization. Payment binding/amount verification and callback
  signing need a separate integration pass before real-money use. The guide
  gives the current variables without claiming that keys alone complete billing.

Browser references: [BarcodeDetector](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector)
and [capture attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture).

## Verification appendix ? actual output

Final result: 305 tests passed across 39 files; standalone typecheck exit 0; production build exit 0; protected checks passed. Local runtime: Node 24.15.0. The Render blueprint selects Node 22; the hosting build remains the deployment-environment check.

### node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000 --reporter=verbose

```text

 RUN  v4.1.10 C:/Users/PC/TradeTrack

 ✓ src/lib/offline/__tests__/sales-offline.test.ts > persistOfflineSale > stores a sale locally and queues it for sync 52ms
 ✓ src/lib/offline/__tests__/sales-offline.test.ts > persistOfflineSale > stays fast even with a large pending offline backlog 17126ms
 ✓ src/lib/offline/__tests__/sales-offline.test.ts > persistOfflineSale > stays fast even with a large historical synced sync_queue backlog 14648ms
 ✓ src/lib/offline/__tests__/sales-offline.test.ts > pruneSyncedQueueItems > deletes old synced rows and leaves pending/syncing/recent-synced rows untouched 369ms
 ✓ src/lib/offline/__tests__/sales-offline.test.ts > pruneSyncedQueueItems > is a no-op when there are no synced rows 4ms
 ✓ src/lib/accounting/__tests__/database.test.ts > saves a profile under authenticated RLS without allowing role escalation 262ms
 ✓ src/lib/accounting/__tests__/database.test.ts > removes hosted default anonymous grants while retaining authorized RPC access 30ms
 ✓ src/lib/accounting/__tests__/database.test.ts > captures and chains database changes, prevents log mutation and financial deletion 21ms
 ✓ src/lib/accounting/__tests__/database.test.ts > numbers retried sales once and rolls back failed allocations 24ms
 ✓ src/lib/accounting/__tests__/database.test.ts > rejects cashier reversals and cross-org operations 17ms
 ✓ src/lib/accounting/__tests__/database.test.ts > requires payment and starts trial with database time 11ms
 ✓ src/lib/accounting/__tests__/database.test.ts > activates the introductory window once using server time 31ms
 ✓ src/lib/accounting/__tests__/database.test.ts > reverses stock exactly once and records a reason 74ms
 ✓ src/lib/accounting/__tests__/database.test.ts > closes cash-up with variance and makes the close immutable 43ms
 ✓ src/lib/accounting/__tests__/database.test.ts > prevents cashier self-escalation, discounts and ad-hoc stock changes 17ms
 ✓ src/lib/accounting/__tests__/database.test.ts > imports opening stock idempotently and reverses without deleting records 118ms
 ✓ src/lib/accounting/__tests__/database.test.ts > imports history without changing stock and stores row-level validation failures 80ms
 ✓ src/lib/accounting/__tests__/database.test.ts > stores pending invitations with no password field and blocks cross-org imports 36ms
 ✓ src/lib/accounting/__tests__/database.test.ts > protects assigned official invoice numbers from owner edits 2ms
 ✓ src/lib/accounting/__tests__/database.test.ts > requires AI approval and opt-in before creating an in-app notification 133ms
 ✓ src/lib/accounting/__tests__/database.test.ts > requires an import batch for AI inventory approval and rejects inactive access 41ms
 ✓ src/lib/accounting/__tests__/database.test.ts > enforces the AI request quota in the database 160ms
 ✓ src/lib/accounting/__tests__/database.test.ts > isolates AI rows with real authenticated-role RLS and denies direct writes 34ms
 ✓ src/lib/accounting/__tests__/database.test.ts > does not count legacy unpaid signup trials as an introduction on new organizations 29ms
 ✓ src/lib/accounting/__tests__/hosted-migration.test.ts > supports the hosted extensions schema without exposing the digest wrapper 9101ms
node : stderr | src/lib/offline/__tests__/vendors-page.test.tsx > renders cached vendors and gates payment offline and 
until the linked sale has synced
At line:2 char:1
+ node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout= ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (stderr | src/li...sale has synced:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
An update to VendorsPageInner inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at 
https://react.dev/link/wrap-tests-with-act

 ✓ src/lib/offline/__tests__/vendors-page.test.tsx > renders cached vendors and gates payment offline and until the linked sale has synced 880ms
stderr | src/lib/offline/__tests__/vendors-page.test.tsx > records online payment 10 and surfaces failure at "''"
An update to VendorsPageInner inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at 
https://react.dev/link/wrap-tests-with-act

 ✓ src/lib/offline/__tests__/vendors-page.test.tsx > records online payment 10 and surfaces failure at "''" 1179ms
stderr | src/lib/offline/__tests__/vendors-page.test.tsx > records online payment 20 and surfaces failure at "''"
An update to VendorsPageInner inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at 
https://react.dev/link/wrap-tests-with-act

 ✓ src/lib/offline/__tests__/vendors-page.test.tsx > records online payment 20 and surfaces failure at "''" 408ms
stderr | src/lib/offline/__tests__/vendors-page.test.tsx > records online payment 20 and surfaces failure at "'sales'"
An update to VendorsPageInner inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at 
https://react.dev/link/wrap-tests-with-act

 ✓ src/lib/offline/__tests__/vendors-page.test.tsx > records online payment 20 and surfaces failure at "'sales'" 436ms
stderr | src/lib/offline/__tests__/vendors-page.test.tsx > records online payment 20 and surfaces failure at 
"'vendor_transactions'"
An update to VendorsPageInner inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at 
https://react.dev/link/wrap-tests-with-act

 ✓ src/lib/offline/__tests__/vendors-page.test.tsx > records online payment 20 and surfaces failure at "'vendor_transactions'" 377ms
 ✓ src/lib/offline/__tests__/inventory-adjust.test.tsx > runs immediately when React Query and the browser are offline, queuing stock, movement and audit 1050ms
 ✓ src/lib/offline/__tests__/inventory-adjust.test.tsx > falls back before writes when an online inventory read fails (thrown) 257ms
 ✓ src/lib/offline/__tests__/inventory-adjust.test.tsx > falls back before writes when an online inventory read fails (returned) 209ms
 ✓ src/lib/offline/__tests__/inventory-adjust.test.tsx > keeps successful online writes online (existing=true) 182ms
 ✓ src/lib/offline/__tests__/inventory-adjust.test.tsx > keeps successful online writes online (existing=false) 153ms
 ✓ src/lib/offline/__tests__/inventory-adjust.test.tsx > surfaces inventory write failure (thrown=false) without queuing a duplicate 182ms
 ✓ src/lib/offline/__tests__/inventory-adjust.test.tsx > surfaces inventory write failure (thrown=true) without queuing a duplicate 176ms
 ✓ src/lib/offline/__tests__/inventory-adjust.test.tsx > surfaces inventory_movements write failure (thrown=false) without queuing a duplicate 174ms
 ✓ src/lib/offline/__tests__/inventory-adjust.test.tsx > surfaces audit_logs write failure (thrown=false) without queuing a duplicate 183ms
 ✓ src/components/products/retail-pages.test.tsx > renders migrated page shells at 375px without changing receipt lookup/reset behavior 1611ms
 ✓ src/components/products/retail-pages.test.tsx > renders migrated page shells at 1280px without changing receipt lookup/reset behavior 392ms
 ✓ src/components/products/image-upload.test.tsx > presents all four grouped choices at 375px with camera/gallery separation and import shortcut 676ms
 ✓ src/components/products/image-upload.test.tsx > presents all four grouped choices at 1280px with camera/gallery separation and import shortcut 163ms
 ✓ src/components/products/image-upload.test.tsx > opens through the keyboard and exposes manual scanning fallback 208ms
 ✓ src/components/products/image-upload.test.tsx > keeps gallery selection separate from capture and makes removal available without hovering 224ms
 ✓ src/components/products/product-form.test.tsx > prefills an existing match and updates its ID rather than inserting a duplicate 1235ms
 ✓ src/lib/offline/__tests__/vendor-stock-version.test.ts > sends 20 → 17 → 14 using the exact raw server version from its predecessor 117ms
 ✓ src/lib/offline/__tests__/vendor-stock-version.test.ts > refreshes pending quantity without changing its original expected version 60ms
 ✓ src/lib/offline/__tests__/vendor-stock-version.test.ts > does not modify an in-flight entry when adding its successor 32ms
 ✓ src/lib/offline/__tests__/vendor-stock-version.test.ts > retains a real concurrent edit for review without burning retries or claiming success 29ms
 ✓ src/lib/offline/__tests__/vendor-stock-version.test.ts > does not guess completion or retry when the server commits but the response is lost 16ms
 ✓ src/lib/offline/__tests__/vendor-stock-version.test.ts > holds an interrupted in-flight record on restart instead of resending it 17ms
 ✓ src/lib/offline/__tests__/vendor-stock-version.test.ts > transfers the confirmed raw version before pruning a predecessor and syncs the persisted successor 36ms
 ✓ src/lib/offline/__tests__/vendor-stock-version.test.ts > protects unresolved local stock from pulls 21ms
 ✓ src/lib/offline/__tests__/vendor-stock-version.test.ts > retains a predecessor with no confirmed version when a successor still depends on it 56ms
 ✓ src/lib/offline/__tests__/vendor-stock-version.test.ts > holds a legacy pending snapshot for review rather than inventing its original server version 30ms
stderr | src/lib/offline/__tests__/purchase-orders-page.test.tsx > renders cached orders offline, keeps lifecycle 
disabled until synced, and survives false-online failures
An update to PurchaseOrdersPageInner inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at 
https://react.dev/link/wrap-tests-with-act

 ✓ src/lib/offline/__tests__/purchase-orders-page.test.tsx > renders cached orders offline, keeps lifecycle disabled until synced, and survives false-online failures 637ms
 ✓ src/components/products/product-code-lookup.test.tsx > handles match with explicit confirmation and no photo attachment 284ms
 ✓ src/components/products/product-code-lookup.test.tsx > handles missing with explicit confirmation and no photo attachment 50ms
 ✓ src/components/products/product-code-lookup.test.tsx > handles cached-missing with explicit confirmation and no photo attachment 41ms
 ✓ src/components/products/product-code-lookup.test.tsx > handles error with explicit confirmation and no photo attachment 39ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order drafts > rolls back the draft, items and queue together when queueing fails 55ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order drafts > creates normalized drafts and INSERTs without changing stock or creating sales 23ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order drafts > rejects invalid quantity 0 without partial writes 4ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order drafts > rejects invalid quantity -1 without partial writes 4ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order drafts > rejects invalid quantity 2.5 without partial writes 14ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order drafts > rejects invalid quantity NaN without partial writes 6ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order drafts > rejects invalid quantity  without partial writes 6ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order drafts > runs the IndexedDB mutation immediately while React Query is offline 13ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order drafts > rebuilds cached joins, scopes organizations and gates unsynced/offline orders 18ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order sync > recovers a lost parent response without resetting server status or duplicating items 12ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order sync > paginates catalogs beyond the first page 166ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order sync > sends parent before children and retries without overwriting server rows 15ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order sync > does not burn child retries when the parent fails 7ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order sync > blocks UPDATE of purchase_orders 3ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order sync > blocks UPDATE of purchase_order_items 3ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order sync > blocks UPDATE of sales 3ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order sync > blocks UPDATE of sale_items 2ms
 ✓ src/lib/offline/__tests__/purchase-orders.test.ts > Purchase Order sync > pulls scoped normalized records but preserves pending local drafts 11ms
 ✓ src/lib/offline/__tests__/db-v5.test.ts > upgrades v4 while preserving PO, POS and queued records 38ms
 ✓ src/lib/imports/__tests__/offline.test.ts > atomically stores products, opening stock and append-only import commands offline 57ms
 ✓ src/lib/imports/__tests__/offline.test.ts > requires connectivity for unsupported local tables and restricts staff to owners 4ms
 ✓ src/lib/imports/__tests__/offline.test.ts > handles false-online failure without losing the import 20ms
 ✓ src/lib/imports/__tests__/offline.test.ts > yields between chunks for more than a thousand rows 297ms
 ✓ src/lib/offline/__tests__/vendor-sync.test.ts > sends vendor parents first and does not burn child/sale retries when the parent fails 47ms
 ✓ src/lib/offline/__tests__/vendor-sync.test.ts > retries parent and mirrored sale without overwriting server payment state 32ms
 ✓ src/lib/offline/__tests__/vendor-sync.test.ts > blocks UPDATE for vendor_transactions 5ms
 ✓ src/lib/offline/__tests__/vendor-sync.test.ts > blocks UPDATE for vendor_transaction_items 3ms
 ✓ src/lib/offline/__tests__/vendor-sync.test.ts > claims the latest pending inventory payload even when refreshed after the flush snapshot 23ms
 ✓ src/lib/offline/__tests__/vendor-sync.test.ts > pulls organization-scoped data and only vendor-linked sales, preserving pending rows 12ms
 ✓ src/lib/offline/__tests__/vendor-sync.test.ts > applies a successor stock snapshot after an in-flight predecessor commits 53ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > atomically creates vendor, items, mirrored sale and decrements the most-stock warehouse from one read 163ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > refreshes the pending inventory payload to the cumulative quantity after two decrements 16ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > preserves an in-flight entry and creates a separate pending latest snapshot 15ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > serializes simultaneous writers without losing a decrement 10ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > reselects the maximum warehouse for repeated product lines and ignores other organizations 9ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > matches online behavior by leaving insufficient stock unchanged 8ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > rolls back every store and stock change when queueing fails 17ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > rejects invalid quantity 0 without writes 9ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > rejects invalid quantity -1 without writes 5ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > rejects invalid quantity 2.5 without writes 5ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > rejects invalid quantity NaN without writes 4ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > runs creation immediately with React Query offline 15ms
 ✓ src/lib/offline/__tests__/vendor-transactions.test.ts > requires the vendor, all items and exact linked sale to sync before payment 31ms
 ✓ src/lib/ai/__tests__/route.test.ts > enforces server entitlement on reads and every action 99ms
 ✓ src/lib/ai/__tests__/route.test.ts > requires explicit confirmation before approvals, preferences or deliveries 11ms
 ✓ src/lib/ai/__tests__/route.test.ts > only drafts inventory and records the suggestion, stripping recognizable contact data 5ms
 ✓ src/lib/ai/__tests__/route.test.ts > records provider failures without executing an import 3ms
 ✓ src/lib/validations/__tests__/index.test.ts > loginSchema > accepts a valid email and password 16ms
 ✓ src/lib/validations/__tests__/index.test.ts > loginSchema > rejects an invalid email 6ms
 ✓ src/lib/validations/__tests__/index.test.ts > loginSchema > rejects a password shorter than 6 characters 3ms
 ✓ src/lib/validations/__tests__/index.test.ts > loginSchema > allows the optional remember field to be omitted 3ms
 ✓ src/lib/validations/__tests__/index.test.ts > forgotPasswordSchema > accepts a valid email 2ms
 ✓ src/lib/validations/__tests__/index.test.ts > forgotPasswordSchema > rejects an invalid email 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > resetPasswordSchema > accepts matching passwords of sufficient length 2ms
 ✓ src/lib/validations/__tests__/index.test.ts > resetPasswordSchema > rejects mismatched passwords 4ms
 ✓ src/lib/validations/__tests__/index.test.ts > resetPasswordSchema > rejects passwords shorter than 8 characters 3ms
 ✓ src/lib/validations/__tests__/index.test.ts > createUserSchema > accepts a fully valid payload for each of the 4 roles 10ms
 ✓ src/lib/validations/__tests__/index.test.ts > createUserSchema > rejects an invalid role 2ms
 ✓ src/lib/validations/__tests__/index.test.ts > createUserSchema > rejects a full_name shorter than 2 characters 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > updateUserSchema > accepts business_owner role (regression test for role-gap bug) 2ms
 ✓ src/lib/validations/__tests__/index.test.ts > updateUserSchema > rejects the removed manager role 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > updateUserSchema > accepts a partial update with only status 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > updateUserSchema > rejects an invalid status 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > productSchema > accepts a minimal valid product 23ms
 ✓ src/lib/validations/__tests__/index.test.ts > productSchema > defaults status to "active" when omitted 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > productSchema > coerces string numeric prices to numbers 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > productSchema > rejects a negative selling price 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > productSchema > rejects a missing SKU 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > categorySchema > accepts a valid category 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > categorySchema > rejects an empty name 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > supplierSchema > accepts a valid supplier with all optional fields 8ms
 ✓ src/lib/validations/__tests__/index.test.ts > supplierSchema > accepts an empty string for email (optional-or-empty pattern) 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > supplierSchema > rejects an invalid email when non-empty 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > warehouseSchema > accepts a valid warehouse and defaults is_main to false 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > warehouseSchema > rejects an empty name 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > inventoryAdjustmentSchema > accepts a valid adjustment 2ms
 ✓ src/lib/validations/__tests__/index.test.ts > inventoryAdjustmentSchema > rejects a non-integer quantity 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > inventoryAdjustmentSchema > rejects an invalid movement_type 2ms
 ✓ src/lib/validations/__tests__/index.test.ts > warehouseTransferSchema > accepts a valid transfer between two different warehouses 3ms
 ✓ src/lib/validations/__tests__/index.test.ts > warehouseTransferSchema > rejects a transfer where from and to warehouses are the same 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > warehouseTransferSchema > rejects a quantity less than 1 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > warehouseTransferSchema > rejects a transfer missing the initiated_by / approved_by / coordinated_by fields 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > saleSchema > accepts a valid sale with at least one item 6ms
 ✓ src/lib/validations/__tests__/index.test.ts > saleSchema > rejects a sale with zero items 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > saleSchema > rejects an invalid payment_method 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > saleSchema > defaults discount and tax to 0 when omitted 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > vendorTransactionSchema > accepts a valid vendor transaction 2ms
 ✓ src/lib/validations/__tests__/index.test.ts > vendorTransactionSchema > rejects a missing vendor_name 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > organizationSchema > accepts a minimal valid organization and applies defaults 2ms
 ✓ src/lib/validations/__tests__/index.test.ts > organizationSchema > accepts a custom currency 1ms
 ✓ src/lib/validations/__tests__/index.test.ts > organizationSchema > rejects a name shorter than 2 characters 1ms
 ✓ src/lib/offline/__tests__/auth-cache.test.ts > offline auth cache > stores and restores a valid offline session 36ms
 ✓ src/lib/offline/__tests__/auth-cache.test.ts > offline auth cache > rejects remembered logins that are past the 30-day expiry 21ms
 ✓ src/lib/offline/__tests__/auth-cache.test.ts > offline auth cache > clears the offline session cache 2ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatCurrency > formats NGN by default when no currency and no org store present 56ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatCurrency > formats an explicit currency code (USD) 3ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatCurrency > formats an explicit currency code (GHS) 2ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatCurrency > falls back to NGN formatting for an unknown/invalid currency code 1ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatCurrency > formats zero and negative amounts without throwing 4ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatCurrency > rounds to whole units (no decimal places) 1ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatDate > formats an ISO date string 24ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatDate > formats a Date object 1ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatDate > respects custom Intl.DateTimeFormatOptions 1ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatDateTime > includes both date and time components 1ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatRelativeTime > returns "Just now" for a time less than 60 seconds ago 8ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatRelativeTime > returns minutes ago for a time within the last hour 2ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatRelativeTime > returns hours ago for a time within the last day 2ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatRelativeTime > returns days ago for a time within the last week 2ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatRelativeTime > falls back to a formatted date for anything older than a week 2ms
 ✓ src/lib/utils/__tests__/format.test.ts > generateInvoiceNumber > pads the sequence number to 6 digits 1ms
 ✓ src/lib/utils/__tests__/format.test.ts > generateInvoiceNumber > does not truncate sequence numbers longer than 6 digits 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > generateInvoiceNumber > handles zero 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > truncate > returns the original text if shorter than maxLength 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > truncate > returns the original text if exactly maxLength 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > truncate > truncates and appends ellipsis when longer than maxLength 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatFileSize > formats 0 bytes 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatFileSize > formats bytes under 1KB 1ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatFileSize > formats kilobytes 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatFileSize > formats megabytes 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatFileSize > formats gigabytes 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatPhone > formats an 11-digit Nigerian phone number 1ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatPhone > strips non-digit characters before formatting 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > formatPhone > returns the original string unmodified if not 11 digits 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > percentageChange > calculates a positive percentage increase 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > percentageChange > calculates a negative percentage decrease 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > percentageChange > returns 0 when current and previous are equal 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > percentageChange > returns 100 when previous is 0 and current is positive 0ms
 ✓ src/lib/utils/__tests__/format.test.ts > percentageChange > returns 0 when both current and previous are 0 0ms
 ✓ src/app/api/receipts/lookup/route.test.ts > looks up an invoice without a nonexistent column (found=true) 35ms
 ✓ src/app/api/receipts/lookup/route.test.ts > looks up an invoice without a nonexistent column (found=false) 6ms
 ✓ src/app/api/receipts/lookup/route.test.ts > rejects unauthenticated lookups before querying sales 2ms
 ✓ src/app/api/receipts/lookup/route.test.ts > surfaces database failure without retrying an unfiltered fallback 4ms
 ✓ src/lib/supabase/browser-fetch.test.ts > identifies failed auth requests without exposing tokens or bodies 75ms
 ✓ src/lib/supabase/browser-fetch.test.ts > redacts storage paths and signed query strings 6ms
 ✓ src/lib/supabase/browser-fetch.test.ts > preserves successful and HTTP-error responses unchanged 15ms
 ✓ src/lib/supabase/browser-fetch.test.ts > preserves intentional aborts unchanged 1ms
 ✓ src/lib/imports/__tests__/parse.test.ts > parses quoted CSV and Excel workbooks with the existing parser 79ms
 ✓ src/lib/imports/__tests__/parse.test.ts > rejects unsupported file types 5ms
 ✓ src/lib/subscriptions/__tests__/verification.test.ts > uses server time for the introductory countdown 5ms
 ✓ src/lib/subscriptions/__tests__/verification.test.ts > gives fresh devices no grace 1ms
 ✓ src/lib/subscriptions/__tests__/verification.test.ts > enforces day 0 4ms
 ✓ src/lib/subscriptions/__tests__/verification.test.ts > enforces day 22 2ms
 ✓ src/lib/subscriptions/__tests__/verification.test.ts > enforces day 23 1ms
 ✓ src/lib/subscriptions/__tests__/verification.test.ts > enforces day 29 0ms
 ✓ src/lib/subscriptions/__tests__/verification.test.ts > enforces day 30 0ms
 ✓ src/lib/subscriptions/__tests__/verification.test.ts > enforces day 31 1ms
 ✓ src/lib/subscriptions/__tests__/verification.test.ts > blocks inactive and rolled-back clocks 1ms
 ✓ src/lib/subscriptions/__tests__/verification.test.ts > persists rollback until a server confirmation 31ms
 ✓ src/lib/subscriptions/__tests__/verification.test.ts > records server-confirmed inactivity and isolates organizations 18ms
 ✓ src/lib/accounting/__tests__/reconciliation.test.ts > detects historical vendor mismatches and recognizes audited corrections 8ms
 ✓ src/lib/accounting/__tests__/reconciliation.test.ts > uses Lagos dates and excludes reversed sales 59ms
 ✓ src/lib/accounting/__tests__/reconciliation.test.ts > quotes CSV and neutralizes spreadsheet formulas 1ms
 ✓ src/lib/offline/__tests__/sync-auth.test.ts > preserves queue and retries after network failure: TypeError: Failed to fetch 106ms
 ✓ src/lib/offline/__tests__/sync-auth.test.ts > preserves queue and retries after network failure: AuthRetryableFetchError: Failed to fetch 15ms
 ✓ src/lib/offline/__tests__/sync-auth.test.ts > bounds stalled authentication and never flushes the queue after a late response 5ms
 ✓ src/lib/offline/__tests__/sync-auth.test.ts > keeps genuine authentication errors visible 10ms
 ✓ src/lib/offline/__tests__/sync-auth.test.ts > stays idle when there is no signed-in session 4ms
 ✓ src/lib/offline/__tests__/sync-auth.test.ts > does not request authentication when the browser is offline 5ms
 ✓ src/lib/offline/__tests__/sync-auth.test.ts > preserves queued records when refresh fails: network 10ms
 ✓ src/lib/offline/__tests__/sync-auth.test.ts > preserves queued records when refresh fails: invalid 9ms
 ✓ src/lib/offline/__tests__/sync-auth.test.ts > preserves queued records when refresh fails: timeout 10ms
 ✓ src/lib/offline/__tests__/db-v4.test.ts > upgrades a populated v3 database without losing POS rows or queue indexes 40ms
stdout | src/lib/offline/__tests__/sync-timestamp.test.ts > compares full precision 2026-09-25T12:00:00.123456+00:00 against 2026-09-25T12:00:00.123455Z (write=false)
[sync] Dropping stale local UPDATE for inventory:stock (server updated_at=2026-09-25T12:00:00.123456+00:00 is newer than local client_updated_at=2026-09-25T12:00:00.123455Z)

stdout | src/lib/offline/__tests__/sync-timestamp.test.ts > compares full precision 2026-09-25T13:00:00.123457+01:00 against 2026-09-25T12:00:00.123456Z (write=false)
[sync] Dropping stale local UPDATE for inventory:stock (server updated_at=2026-09-25T13:00:00.123457+01:00 is newer than local client_updated_at=2026-09-25T12:00:00.123456Z)

 ✓ src/lib/offline/__tests__/sync-timestamp.test.ts > compares full precision 2026-09-25T12:00:00.123456+00:00 against 2026-09-25T12:00:00.123455Z (write=false) 33ms
 ✓ src/lib/offline/__tests__/sync-timestamp.test.ts > compares full precision 2026-09-25T12:00:00.123455Z against 2026-09-25T12:00:00.123456+00:00 (write=true) 1ms
 ✓ src/lib/offline/__tests__/sync-timestamp.test.ts > compares full precision 2026-09-25T12:00:00.123000+00:00 against 2026-09-25T12:00:00.123Z (write=true) 1ms
 ✓ src/lib/offline/__tests__/sync-timestamp.test.ts > compares full precision 2026-09-25T13:00:00.123456+01:00 against 2026-09-25T12:00:00.123456Z (write=true) 1ms
 ✓ src/lib/offline/__tests__/sync-timestamp.test.ts > compares full precision 2026-09-25T13:00:00.123457+01:00 against 2026-09-25T12:00:00.123456Z (write=false) 1ms
 ✓ src/lib/offline/__tests__/sync-timestamp.test.ts > compares full precision 2026-09-25T11:59:59.999999Z against 2026-09-25T12:00:00Z (write=true) 1ms
 ✓ src/lib/offline/__tests__/sync-timestamp.test.ts > does not overwrite stock when a version cannot be compared 3ms
 ✓ src/lib/subscriptions/__tests__/get-plans.test.ts > getActiveSubscriptionPlans > returns EXACTLY 5 active plans with the current 5-tier names/prices, matching migration 010's own verification query 15ms
 ✓ src/lib/subscriptions/__tests__/get-plans.test.ts > getActiveSubscriptionPlans > returns null when the client is not available (caller falls back to FALLBACK_PLANS) 1ms
 ✓ src/lib/subscriptions/__tests__/get-plans.test.ts > getActiveSubscriptionPlans > returns null (not an empty array) when the query errors, so callers know to fall back 1ms
 ✓ src/lib/subscriptions/__tests__/get-plans.test.ts > getAllSubscriptionPlansForCatalogManagement > returns ALL 11 rows (active and inactive) for platform_owner catalog management, unfiltered 3ms
 ✓ src/lib/subscriptions/__tests__/get-plans.test.ts > getAllSubscriptionPlansForCatalogManagement > returns null when the client is not available 1ms
 ✓ src/lib/subscriptions/__tests__/get-plans.test.ts > consistency: both surfaces' active-plan queries return IDENTICAL data > getActiveSubscriptionPlans() output is a strict subset of getAllSubscriptionPlansForCatalogManagement() output, filtered only by is_active 2ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > resolveSubscriptionPlan > resolves an org still on a deactivated legacy plan via subscription.plan_id, not an is_active-filtered lookup 7ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > resolveSubscriptionPlan > still resolves an active-plan subscriber normally 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > resolveSubscriptionPlan > returns null for a null/undefined subscription 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > resolveSubscriptionPlan > returns null when the plan_id does not match any known plan 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > canAddProduct / FREE plan product-count enforcement > allows creating products #1 through #50 on the FREE plan 2ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > canAddProduct / FREE plan product-count enforcement > blocks creating product #51 on the FREE plan (max_products: 50) 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > canAddProduct / FREE plan product-count enforcement > allows well beyond 50 products on the Starter plan (max_products: 300) 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > canAddProduct / FREE plan product-count enforcement > never blocks on the Enterprise plan (max_products: -1 = unlimited) 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > canAddProduct / FREE plan product-count enforcement > fails open (allows the add) when no plan is resolved 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > isUnlimitedLimit > treats -1 as unlimited 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > isUnlimitedLimit > treats null/undefined as unlimited 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > isUnlimitedLimit > treats any non-negative finite number as a real limit 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > hasFeature > returns true when the plan includes the feature flag 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > hasFeature > returns false when the plan does not include the feature flag 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > hasFeature > returns false (fails closed) when no plan is resolved 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > feature-gate upgrade-prompt copy > reports the correct minimum tier for each new gated feature flag 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > feature-gate upgrade-prompt copy > returns null for unknown/unrestricted feature flags 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > feature-gate upgrade-prompt copy > builds an 'Available on the X plan and above — Upgrade' message 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > feature-gate upgrade-prompt copy > builds a limit-reached upgrade message for products/cashiers/warehouses 1ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > PENDING_FEATURES / isPendingFeature > flags barcode_label_printing as pending (actively being built, not yet usable) 2ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > PENDING_FEATURES / isPendingFeature > does NOT flag purchase_orders as pending — it has a real, live product surface 1ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > PENDING_FEATURES / isPendingFeature > does NOT flag custom_role_permissions as pending — it is hidden entirely, not 'coming soon' 1ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > PENDING_FEATURES / isPendingFeature > returns false for any feature flag not in the list 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > PENDING_FEATURES / isPendingFeature > simulates 'shipping' a pending feature: removing it from the array is the only change needed 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > HIDDEN_FEATURES / filterDisplayFeatures > hides custom_role_permissions — no scheduled implementation, must not appear at all 1ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > HIDDEN_FEATURES / filterDisplayFeatures > filters hidden features out of a feature list while preserving order of the rest 1ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > HIDDEN_FEATURES / filterDisplayFeatures > is a no-op when no hidden features are present 0ms
 ✓ src/lib/subscriptions/__tests__/plan-limits.test.ts > HIDDEN_FEATURES / filterDisplayFeatures > does not affect hasFeature() entitlement checks — filtering is display-only 0ms
 ✓ src/lib/products/lookup-code.test.ts > looks up exact codes within the current business and deduplicates barcode/SKU matches 19ms
 ✓ src/lib/products/lookup-code.test.ts > uses only current-business cached products offline and makes no network call 3ms
 ✓ src/lib/products/lookup-code.test.ts > does not interpret an incomplete offline cache as a confirmed missing product 2ms
 ✓ src/lib/products/lookup-code.test.ts > rejects ambiguous codes and missing business membership 8ms
 ✓ src/lib/products/lookup-code.test.ts > distinguishes a failed online request from no match 2ms
 ✓ src/lib/products/detect-code.test.ts > provides manual fallback when the detector is unsupported 13ms
 ✓ src/lib/products/detect-code.test.ts > decodes a photo and releases its bitmap: 123 4ms
 ✓ src/lib/products/detect-code.test.ts > decodes a photo and releases its bitmap:  1ms
 ✓ src/lib/products/detect-code.test.ts > releases the bitmap if native detection fails 2ms
 ✓ src/lib/utils/__tests__/cn.test.ts > cn > joins multiple class strings 23ms
 ✓ src/lib/utils/__tests__/cn.test.ts > cn > ignores falsy values 1ms
 ✓ src/lib/utils/__tests__/cn.test.ts > cn > supports conditional object syntax 1ms
 ✓ src/lib/utils/__tests__/cn.test.ts > cn > merges conflicting Tailwind classes, keeping the last one 2ms
 ✓ src/lib/utils/__tests__/cn.test.ts > cn > returns an empty string when given no meaningful input 1ms
 ✓ src/lib/imports/__tests__/preview.test.ts > maps common spreadsheet headers 16ms
 ✓ src/lib/imports/__tests__/preview.test.ts > reports malformed money, stock, email and privileged roles 10ms
 ✓ src/lib/imports/__tests__/preview.test.ts > matches SKU/barcode and refuses ambiguous identities 4ms
 ✓ src/lib/imports/__tests__/preview.test.ts > validates all rows and disallows duplicate SKUs and stock replacement 23ms
 ✓ src/lib/utils/__tests__/timeout.test.ts > withTimeout > resolves with the original value when the promise settles before the timeout 8ms
 ✓ src/lib/utils/__tests__/timeout.test.ts > withTimeout > rejects with the original error when the promise rejects before the timeout 7ms
 ✓ src/lib/utils/__tests__/timeout.test.ts > withTimeout > rejects with a timeout error when the promise never settles in time 12ms
 ✓ src/lib/utils/__tests__/timeout.test.ts > withTimeout > does not fire the timeout once the promise has already resolved 4ms
 ✓ src/lib/ai/__tests__/assistant.test.ts > AI entitlement > maps catalog tier b1000000-0000-0000-0000-000000000001 8ms
 ✓ src/lib/ai/__tests__/assistant.test.ts > AI entitlement > maps catalog tier b2000000-0000-0000-0000-000000000002 1ms
 ✓ src/lib/ai/__tests__/assistant.test.ts > AI entitlement > maps catalog tier b3000000-0000-0000-0000-000000000003 0ms
 ✓ src/lib/ai/__tests__/assistant.test.ts > AI entitlement > maps catalog tier b4000000-0000-0000-0000-000000000004 0ms
 ✓ src/lib/ai/__tests__/assistant.test.ts > AI entitlement > maps catalog tier b5000000-0000-0000-0000-000000000005 0ms
 ✓ src/lib/ai/__tests__/assistant.test.ts > AI entitlement > requires active state and server time, grants only an unexpired introduction 1ms
 ✓ src/lib/ai/__tests__/assistant.test.ts > mock assistant > maps inventory into the existing import contract without executing writes 8ms
 ✓ src/lib/ai/__tests__/assistant.test.ts > mock assistant > labels insights as stubs and limits claims to supplied business data 3ms
 ✓ src/lib/auth/__tests__/organization.test.ts > blocks missing business: null 6ms
 ✓ src/lib/auth/__tests__/organization.test.ts > blocks missing business: {} 1ms
 ✓ src/lib/auth/__tests__/organization.test.ts > blocks missing business: { organization_id: '' } 1ms
 ✓ src/lib/auth/__tests__/organization.test.ts > blocks missing business: { organization_id: '   ' } 1ms
 ✓ src/lib/auth/__tests__/organization.test.ts > preserves a real organization id 1ms
 ✓ src/lib/supabase/__tests__/middleware.test.ts > shouldForceLogin > does not force login for protected routes when an offline auth cookie is present 14ms
 ✓ src/lib/supabase/__tests__/middleware.test.ts > shouldForceLogin > does not force login when the live auth check resolves null but the offline cookie still exists 1ms
 ✓ src/lib/supabase/__tests__/middleware.test.ts > shouldForceLogin > forces login for protected routes when there is no session and no offline cookie 1ms
 ✓ src/lib/supabase/__tests__/middleware.test.ts > shouldForceLogin > allows auth routes to proceed for authenticated users 1ms
 ✓ src/lib/receipt/__tests__/receipt-layout.test.ts > wrapReceiptText > wraps long labels to fit the available width without dropping words 5ms
 ✓ src/lib/receipt/__tests__/receipt-layout.test.ts > wrapReceiptText > returns a single line for short content 1ms

 Test Files  39 passed (39)
      Tests  305 passed (305)
   Start at  08:25:00
   Duration  214.64s (transform 6.69s, setup 6.74s, import 26.06s, tests 70.27s, environment 80.74s)


EXIT_CODE=0

```

### node node_modules/typescript/bin/tsc --noEmit

```text
EXIT_CODE=0

```

### node node_modules/next/dist/bin/next build

```text
▲ Next.js 16.2.12 (Turbopack)
- Environments: .env.local
- Experiments (use with caution):
  · optimizePackageImports

node : ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead. Learn more: 
https://nextjs.org/docs/messages/middleware-to-proxy
At line:2 char:1
+ node node_modules/next/dist/bin/next build *> build-evidence/ui-ux/bu ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (⚠ The "middlewa...leware-to-proxy:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  Creating an optimized production build ...
✓ Compiled successfully in 57s
  Running TypeScript ...
  Finished TypeScript in 57s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/43) ...
  Generating static pages using 7 workers (10/43) 
  Generating static pages using 7 workers (21/43) 
  Generating static pages using 7 workers (32/43) 
✓ Generating static pages using 7 workers (43/43) in 3.6s
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /accounting
├ ƒ /admin
├ ƒ /api/accounting
├ ƒ /api/ai
├ ƒ /api/audit
├ ƒ /api/auth/signup
├ ƒ /api/imports
├ ƒ /api/merchants/onboard
├ ƒ /api/payments/initialize
├ ƒ /api/payments/verify
├ ƒ /api/receipts/lookup
├ ƒ /api/subscriptions/verification
├ ƒ /api/users
├ ƒ /api/users/[id]
├ ƒ /api/version
├ ƒ /api/webhooks/zainpay
├ ƒ /assistant
├ ƒ /audit
├ ƒ /change-password
├ ƒ /dashboard
├ ƒ /download
├ ƒ /features
├ ƒ /forgot-password
├ ƒ /imports
├ ƒ /inventory
├ ƒ /login
├ ƒ /merchants
├ ƒ /notifications
├ ƒ /pos
├ ƒ /pricing
├ ƒ /products
├ ƒ /purchase-orders
├ ƒ /receipts
├ ƒ /receipts/lookup
├ ƒ /reports
├ ƒ /sales
├ ƒ /settings
├ ƒ /signup
├ ƒ /subscriptions
├ ƒ /transfers
├ ƒ /users
├ ƒ /vendors
└ ƒ /warehouses


ƒ Proxy (Middleware)

ƒ  (Dynamic)  server-rendered on demand


EXIT_CODE=0

```

### node scripts/verify-ui-protected.cjs

```text
{
  "passed": true,
  "hashes": [
    {
      "file": "src/lib/offline/sales.ts",
      "before": "2a797642c5c4a0e4072ce1fb521b11ae966da737e15f1d4af77f2c2bbead41ef",
      "after": "2a797642c5c4a0e4072ce1fb521b11ae966da737e15f1d4af77f2c2bbead41ef",
      "unchanged": true
    },
    {
      "file": "src/lib/offline/purchase-orders.ts",
      "before": "3c6894381bdd2b0959dfcaa37e12a406641beb2afe197e977cf6e99f25f9a105",
      "after": "3c6894381bdd2b0959dfcaa37e12a406641beb2afe197e977cf6e99f25f9a105",
      "unchanged": true
    },
    {
      "file": "src/lib/offline/sync-engine.ts",
      "before": "d0a8fcee54861a66b76fa2206957c18512e3436de3e017ee06920a0850a4420a",
      "after": "d0a8fcee54861a66b76fa2206957c18512e3436de3e017ee06920a0850a4420a",
      "unchanged": true
    },
    {
      "file": "src/app/(dashboard)/pos/page.tsx",
      "before": "da3ad8c4bf22bd6ce50504808b0cc4d0ffdd035aef11ce321a9e3ac706e4be93",
      "after": "da3ad8c4bf22bd6ce50504808b0cc4d0ffdd035aef11ce321a9e3ac706e4be93",
      "unchanged": true
    }
  ],
  "pages": [
    {
      "file": "src/app/(dashboard)/purchase-orders/page.tsx",
      "handlersUnchanged": true,
      "queriesAndMutationsUnchanged": true
    },
    {
      "file": "src/app/(dashboard)/warehouses/page.tsx",
      "handlersUnchanged": true,
      "queriesAndMutationsUnchanged": true
    },
    {
      "file": "src/app/(dashboard)/receipts/lookup/page.tsx",
      "handlersUnchanged": true,
      "queriesAndMutationsUnchanged": true
    },
    {
      "file": "src/app/(dashboard)/sales/page.tsx",
      "handlersUnchanged": true,
      "queriesAndMutationsUnchanged": true
    },
    {
      "file": "src/app/(dashboard)/users/page.tsx",
      "handlersUnchanged": true,
      "queriesAndMutationsUnchanged": true
    },
    {
      "file": "src/app/(dashboard)/merchants/page.tsx",
      "handlersUnchanged": true,
      "queriesAndMutationsUnchanged": true
    }
  ]
}

```
