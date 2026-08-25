# Changelog

All notable changes to TradeTrack are recorded here. This project does not
yet publish tagged releases or follow strict semantic versioning (see the
[Assumptions & Inconsistencies](#assumptions--inconsistencies) note at the
bottom) — entries are grouped by feature milestone, reconstructed from the
git history and the corresponding `supabase/migrations/*.sql` files, newest
first.

## [Unreleased]

### Fixed
- **Subscription plan data-consistency bug**: the public `/pricing` page
  and the dashboard's Subscriptions ▸ Plans tab each wrote their own,
  independent Supabase query for `subscription_plans`. `/pricing`
  correctly filtered `is_active = true`; the dashboard's
  `fetchSubscriptionData()` did not filter at all. This, combined with a
  gap in migration `010`'s defensive legacy-plan deactivation (its
  name-based fallback checked for `'Basic'`/`'Standard'` but omitted
  `'Business'`), let a stray, non-canonical demo-seed row
  (`supabase/seed/001_seed_data.sql`'s own independent "Business"
  ₦20,000 row) stay `is_active = true` on any environment that had run
  that seed file — producing a 6th, duplicate "Business" card on
  `/pricing` and legacy "Basic"/"Standard" names on the dashboard.
  Fixed by:
  - extracting a single shared `getActiveSubscriptionPlans()` (plus a
    separate, explicitly-named `getAllSubscriptionPlansForCatalogManagement()`
    for `platform_owner`'s catalog-editing view) in the new
    `src/lib/subscriptions/get-plans.ts`, imported by both `/pricing`
    and the dashboard's Plans tab so the two surfaces can never diverge
    again;
  - migration `012_fix_stray_active_legacy_plans.sql`, closing the
    `'Business'` gap in `010`'s deactivation fallback (never edits
    already-applied migrations — see `010`'s own stated convention);
  - `scripts/verify-subscription-plans.ts` (`npm run verify:plans`) — a
    regression + consistency check asserting exactly 5 active plans
    with exact names/prices, and that both surfaces' code path returns
    identical data;
  - unit tests in `src/lib/subscriptions/__tests__/get-plans.test.ts`;
  - `docs/LOCAL_DEV_SETUP.md`, a new guide for getting a clean local
    database (and a documented caveat about the demo seed file's
    non-canonical plan rows).
  No pricing figures or feature flags changed in this fix — purely a
  data/query-consistency correction.

### Added
- **Purchase Orders** (`purchase_orders` / `purchase_order_items` tables,
  migration `011_purchase_orders.sql`) — a minimal Business-tier feature:
  create a PO (supplier, line items, expected date) → send it → receive it,
  with receiving updating `inventory` and logging an `inventory_movements`
  row via the same pattern already used by Inventory Adjustments, Warehouse
  Transfers, and Vendor Consignment. Gated behind
  `hasFeature(plan, 'purchase_orders')`. Available at `/purchase-orders`
  for `business_owner` and `admin` roles. Explicitly out of scope for this
  version: partial receiving, PO approval workflows, PDF export, purchasing
  analytics, and supplier payment automation.
- Honest "Rolling out soon" / hidden treatment for subscription-plan
  features that don't have a real product surface yet
  (`PENDING_FEATURES` / `HIDDEN_FEATURES` in
  `src/lib/subscriptions/plan-limits.ts`), so a plan's feature list never
  implies a customer can use something that doesn't exist yet.
- This documentation overhaul: `docs/CHANGELOG.md` (this file),
  `docs/ROADMAP.md`, `docs/DEPLOYMENT.md` (Render, replacing the
  Vercel-oriented `docs/DEPLOYMENT_GUIDE.md`), `docs/DOWNLOAD_FLOW.md`, and
  a simplified root `README.md`.

## Five-Tier Subscription Restructure

### Changed
- Restructured the subscription ladder from the original 3 tiers
  (Basic ₦3,000 / Standard ₦5,000 / Business ₦8,000) to 5 tiers — Free,
  Starter, Growth, Business, Enterprise — modeled on a Sortly-style
  pricing page and priced in Naira (migration
  `010_five_tier_subscription_plans.sql`). The original 3 rows were
  **deactivated**, not deleted, so existing subscribers keep working
  unaffected; only new self-serve subscriptions see the 5-tier catalog.
- Extracted a shared `PlanCard` component so the dashboard "Plans" tab and
  the public `/pricing` marketing page render pricing from one source of
  truth instead of two parallel implementations.
- Made the production domain build-time configurable instead of hardcoded,
  so desktop/Android shells and marketing links can point at a different
  domain without a source-code change (see `docs/DOWNLOAD_FLOW.md`).

### Added
- Public marketing site (`(marketing)` route group): landing page,
  `/features`, `/pricing`, and self-serve signup, separate from the
  authenticated `(dashboard)` route group.

## Merchant Onboarding, Roles & Payments Rework

### Changed
- Reworked the role model from `super_admin > owner > admin > manager >
  cashier` to `platform_owner > business_owner > admin > cashier`
  (migration `008_role_model_rework.sql`) — `platform_owner` merges the old
  `super_admin`/`owner` cross-org roles into one TradeTrack-staff-only
  role; `business_owner` is a new, single-org role auto-created for every
  merchant at onboarding.
- Merchant onboarding (`POST /api/merchants/onboard`) now always creates a
  **brand-new `organizations` row** per merchant instead of attaching a new
  owner to the onboarding platform_owner's own org — full data isolation
  from the first row written for that merchant.

### Added
- Forced password change on first login for newly onboarded
  `business_owner` accounts (`users.must_change_password`,
  `/change-password` gate).
- Dedicated Zainpay virtual account (NUBAN) created automatically per
  merchant organization at onboarding time (migration
  `009_merchant_onboarding_virtual_accounts.sql`), with best-effort/
  non-fatal failure if Zainpay isn't configured yet.
- Zainpay webhook reconciliation for both checkout-initiated payments and
  direct virtual-account deposits, with idempotency via
  `webhook_logs.idempotency_key`.
- Explicit, documented offline sync conflict-resolution rule: `sales`/
  `sale_items` are append-only; every other table uses last-write-wins by
  `client_updated_at` (see `src/lib/offline/sync-engine.ts`).

## Native Distribution Shells

### Added
- Electron-based Windows desktop shell (`desktop-app/`) — thin
  `BrowserWindow` wrapper around the deployed PWA, packaged as an NSIS
  `.exe` installer via `electron-builder`.
- Native Android WebView shell (`android-app/`) — thin `WebView` wrapper
  around the deployed PWA, packaged as a side-loaded `.apk`.
- `GET /api/version` update-check endpoint that both native shells poll to
  detect newer builds (metadata only — no binaries served, no
  auto-install).
- Public `/download` page with OS/browser detection to surface the right
  install path (native installer, PWA install prompt, or an honest
  "Coming soon" for iOS/macOS, which have no native build).

## Offline-First Foundation

### Added
- IndexedDB-backed local store (`idb`) caching products/inventory for
  offline reads, and a `SyncEngine` that queues writes made while offline
  and pushes them once connectivity returns.
- Installable PWA: `public/manifest.json` + a hand-rolled, dependency-free
  service worker (`public/sw.js`) — chosen over the `next-pwa` package
  because its latest release pins Webpack 4/Workbox 4, incompatible with
  this project's Turbopack build.
- PDF/print/export logic for receipts and reports, including scannable
  barcodes/QR codes on receipts.

### Fixed
- Stopped a checkout freeze caused by an unbounded `sync_queue` table scan
  on devices with a large offline backlog.
- Multiple rounds of receipt-layout, offline-sync, and role/permission
  policy fixes (see full `git log` for the complete list of intermediate
  fixes not itemized individually here).

## Initial Build

### Added
- Core POS & inventory management platform: products, categories,
  suppliers, multi-warehouse inventory with movement history, point of
  sale with barcode scanning/cart/discounts/tax/split payments, warehouse
  transfers, vendor consignment tracking, reports (daily/weekly/monthly/
  quarterly/yearly with PDF/Excel/CSV export), immutable audit trail,
  notifications, and multi-tenant organization isolation via Supabase Row
  Level Security.
- Multilingual UI scaffolding (English, Hausa, Yoruba, Igbo, Pidgin
  English) — Yoruba/Igbo/Pidgin currently re-export the English strings
  pending full translation (see `src/i18n/locales/`).
- Dark/light mode.

---

## Assumptions & Inconsistencies

- **No tagged releases exist in this repository** (`git tag -l` is empty)
  and `package.json`'s `"version": "0.1.0"` has not been bumped alongside
  feature work — it does not track what's actually deployed. This
  changelog is therefore organized by **feature milestone**, not by
  semantic-version number or release date, since neither exists reliably
  in the project's history yet. If/when the team starts cutting real
  releases, each new section here should be tied to an actual git tag and
  a bumped `package.json` version.
- Timestamps are intentionally omitted from each entry above (git commit
  dates in this repo's history do not reliably reflect calendar reality,
  since this history includes squashed/rebased AI-assisted development
  sessions) — group order is inferred from commit ancestry, not
  wall-clock time.
