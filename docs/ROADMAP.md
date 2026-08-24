# TradeTrack — Roadmap

What's shipped, what's explicitly deferred on features that already exist,
and what's not started yet. This is a living document — update it whenever
a feature's status changes, especially when something moves out of
`PENDING_FEATURES` in `src/lib/subscriptions/plan-limits.ts`.

## Shipped

- Multi-role POS & inventory management (Platform Owner / Business Owner /
  Admin / Cashier), multi-tenant via org-scoped Row Level Security.
- Offline-first architecture: IndexedDB cache, background `SyncEngine`,
  installable PWA.
- Warehouse transfers, vendor consignment tracking, audit trail, reports
  with PDF/Excel/CSV export.
- Zainpay subscription billing: dedicated virtual account (NUBAN) per
  merchant, webhook-based auto-reconciliation.
- 5-tier subscription ladder (Free/Starter/Growth/Business/Enterprise) with
  feature-flag gating (`hasFeature()` in `plan-limits.ts`).
- Native distribution shells: Electron Windows desktop app, Android WebView
  app, public `/download` page with OS detection (see
  `docs/DOWNLOAD_FLOW.md`).
- Multilingual UI: English and Hausa fully translated; Yoruba, Igbo, and
  Pidgin English scaffolded (currently re-export English strings).
- **Purchase Orders** (minimal): create → send → receive workflow at
  `/purchase-orders`, gated to the Business tier, updating inventory on
  receipt. See "Explicitly deferred" below for what this intentionally
  does *not* cover yet.

## Explicitly deferred (on features that already exist)

These are scope boundaries called out in the shipped feature's own code
comments — not silently missing, but consciously left for later:

- **Purchase Orders**: partial receiving (a PO is currently all-or-nothing
  on receipt), PO approval workflows, PDF export of a PO, purchasing
  analytics (e.g. spend-by-supplier reports), and supplier payment
  automation.
- **Native shells**: no code signing yet (Windows installer is unsigned,
  Android APK is signed with a throwaway sandbox keystore — see
  `docs/DOWNLOAD_FLOW.md`), no automatic update installation (check-only),
  no macOS build.
- **Barcode label printing** (`barcode_label_printing` flag): only
  barcode/QR codes on printed receipts exist today; a dedicated label-sheet
  printing surface does not exist yet. Correctly listed in
  `PENDING_FEATURES` and shown with a "Rolling out soon" badge rather than
  as a live checkmark.

## Not started

Carried over from the pre-existing README roadmap, not yet scoped or
scheduled:

- [ ] Accounting module
- [ ] Payroll management
- [ ] Customer portal
- [ ] Mobile app (React Native) — note: Android already has a WebView
      shell (see `docs/DOWNLOAD_FLOW.md`); this item refers to a fuller
      native rewrite if the WebView approach ever needs to graduate (e.g.
      for push notifications or background sync outside the browser).
- [ ] AI sales insights
- [ ] OPay / Moniepoint integration
- [ ] WhatsApp notifications
- [ ] Barcode scanner hardware support
- [ ] Thermal receipt printer (80mm/58mm)
- [ ] `custom_role_permissions` (Business tier) — no scheduled
      implementation; deliberately omitted from the displayed feature list
      rather than shown as "coming soon" with a false timeline (see
      `PENDING_FEATURES` doc-comment in `plan-limits.ts`).
- [ ] `api_access`, `webhooks` (Enterprise tier) — Enterprise is a
      "Talk to Sales" custom negotiation, not a self-serve plan; these
      flags are intentionally out of scope for automated feature-honesty
      enforcement until Enterprise gets a self-serve surface at all.

## Process note

When a `PENDING_FEATURES` entry in `plan-limits.ts` ships a real product
surface (as `purchase_orders` just did), update **three** places in the
same change: the code (remove it from `PENDING_FEATURES`), this roadmap
(move it from "shipped" wording to actually shipped), and
`docs/SUBSCRIPTION_SYSTEM.md`'s Feature Matrix + Plan Feature Enforcement
sections (remove it from the "not yet built"/"not yet wired in" callouts).
