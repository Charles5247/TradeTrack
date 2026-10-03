# Expanded Retail UI/UX pass

Date: 3 October 2026. Continues the original six-page migration at `fd368c0` after Xavier identified unfinished Settings and platform-owner views. Scope was then expanded to a UI/UX audit of the existing codebase, with functional improvements where needed.

## Implemented

| Area | Result | Main files |
| --- | --- | --- |
| Settings | Retail page and section typography, desktop settings rail, compact mobile navigation, responsive fields, visible theme selection, consistent iconography. Platform owners see profile/display/security; merchant accounts retain Business settings. Existing profile caching, save, password, language and theme behavior retained. | `src/app/(dashboard)/settings/page.tsx` |
| Platform dashboard | `/dashboard` renders the platform overview for platform owners without mounting merchant queries or POS/stock actions. Both owner dashboard URLs use the Admin density. Merchant view remains available to business roles; cashier shortcuts now lead only to permitted workflows. | `dashboard/page.tsx`, `admin/page.tsx`, `components/layout/dashboard-layout.tsx` |
| Platform overview | Shared Retail stat cards, responsive actions/tabs, token-based charts, merchant/plan management links, exact platform-wide merchant status counts. The bounded recent directory no longer determines totals. Removed hardcoded growth and unverified operational-health claims. Invoice collections are no longer labeled MRR. Read failures render retry, rather than zero activity. | `admin/page.tsx` |
| Platform plans | Owner accounts open the plan catalog directly. No merchant subscription status, billing-history tab, checkout selection, or sales-contact CTA in the owner catalog. Existing add/edit/delete dialogs remain. Merchant and public plan CTAs remain available. | `subscriptions/page.tsx`, `components/subscriptions/plan-card.tsx` |
| Shared navigation | Platform workspace identity, active dashboard breadcrumb, platform-specific command search, no merchant queue-upload controls in owner header. Added existing Warehouses, Imports, Accounting and Assistant routes for business owners/admins. | `components/layout/{sidebar,header,nav-config,command-palette}.tsx` |
| Reports | Retail stat cards/chart palette, wrapping mobile filters/actions, explicit chart/table empty states, retry on failed reads. Report calculations and export handlers retained. | `reports/page.tsx` |
| Vendors and transfers | Retail headings, semantic status colors, phone-sized row actions, stacked form grids, bounded scrolling dialogs. Offline transaction handlers and queries retained. | `vendors/page.tsx`, `transfers/page.tsx` |
| Accounting | Shared input/button/select controls, responsive filter card and table, explicit empty state. Focus-managed review dialog with readable entry fields, reason requirement, cancel and pending state; existing accounting request/confirmation semantics retained. | `accounting/page.tsx` |
| Imports | Retail upload/mapping section, native select behavior, shared controls, readable preview values, bounded table, empty history message and reversal section. Original parsing, mapping, validation, explicit confirmation and offline writer retained. | `imports/page.tsx`, `components/imports/import-workbench.tsx` |
| Assistant | Retail forms, readable preview-mode explanation, working/loading states, mobile button wrapping, preserved proposal/insight/preference flows and explicit delivery consent. No external model was connected. | `assistant/page.tsx` |
| Notifications | Wrapping mobile layout, keyboard read action, constrained skeletons, error/retry state. | `notifications/page.tsx` |
| Form primitive | A token-styled native select for existing native-select workflows, retaining browser keyboard/mobile behavior. | `components/ui/native-select.tsx` |

Page paths above are under `src/app/(dashboard)` unless otherwise specified.

## Codebase audit boundary

All existing page routes were inventoried. Public Landing, Features, Pricing and Download already use the Retail marketing components and responsive grids; Login, Signup, Forgot Password and Change Password already use the shared auth shell. Their layouts were retained. Public pricing benefits from the shared PlanCard token update.

Products, Inventory, Audit, Purchase Orders, Warehouses, Receipts, Sales, Users and Merchants retain their previously migrated layouts. `/receipts` remains its existing redirect. The four-option product image menu remains intact. Shared navigation improvements apply across the dashboard routes.

The ZIP was treated as a visual reference, not as an instruction to deploy its browser-Babel prototypes or implement every proposed business module. Restaurant, hotel, bakery and mall systems are not existing application workflows and were not fabricated. No schema migration, dependency, live database write, payment, or Render deployment was performed.

Connected Higgsfield capabilities were discovered. Its separate website hosting/media generation workflows were not needed to edit this existing Next.js/Supabase application. No connector media job or credit purchase was submitted.

## Verification

- Full suite: **45 files passed; 322 tests passed; exit 0**. This includes 17 new tests for role separation, settings saves/themes/passwords, platform catalog, exact-count reads/error retry, import confirmation, accounting review/confirmation, keyboard notifications, report failures and assistant preferences.
- TypeScript: `tsc --noEmit`, exit 0.
- Production: Next.js 16.2.12 production build, exit 0.
- Protected raw SHA-256 hashes match the original batch baseline for the entire POS page, offline sales writer, offline purchase-order writer and sync engine (including `pullPurchaseOrders()`). Existing six-page query/mutation and event-handler preservation checks also pass.
- `git diff --check` passes.

Complete, unabridged output is retained in these files:

- [Full test output](../build-evidence/expanded-ui-full-tests.txt)
- [Typecheck output](../build-evidence/expanded-ui-typecheck.txt)
- [Production build output](../build-evidence/expanded-ui-build.txt)
- [Protected hashes and preservation checks](../build-evidence/expanded-ui-protected.txt)

The first full test run caught a missing Admin error render branch; that was corrected and the entire suite passed on rerun. The first build failed fetching existing Google Fonts under restricted networking; the network-enabled build passed. Initial outputs are retained alongside the final evidence. React `act` warnings from test fixtures and Next's existing middleware-to-proxy deprecation remain visible in the logs.

Supabase reads continue to use the existing client and RLS. Exact `head` counts and returned-error handling follow the [Supabase select reference](https://supabase.com/docs/reference/javascript/select). Query tests exercise both failures and count results using mocks; this is not a claim of live-database browser verification.

## Mobile and desktop behavior

At desktop width, Settings uses a 220px left menu and flexible content panel; merchant fields use two columns. On phones, the menu becomes a two-column control grid, business fields and theme choices stack, and save buttons use the available width. Platform cards stack from four columns to two to one. Tables scroll within their container, and long dialogs scroll within the viewport.

The original image menu still presents camera, barcode/QR lookup, existing photo and bulk import together. This pass changes neither scanning nor photo capture behavior.

Tests exercise representative flows with 375px and 1280px window widths. These are jsdom interaction checks, **not pixel-layout or real-device tests**. Browser inventory returned no available browser, so no screenshots or live mobile/camera verification were possible. A deployment/device review is still required for visual acceptance.

## Remaining product/release decisions

1. Platform revenue charts retain the existing 200-record query limits, disclosed on screen. Genuine MRR, churn, plan-mix, uptime and webhook health require defined metrics and data sources; prototype values were not copied into production.
2. Reports retain the existing calculation scope (including a 200-row sale-item limit). A financial-report accuracy/pagination pass is separate from the UI migration.
3. The existing paid-subscription checkout integration is still incomplete, as documented in [Render live-test guidance](RENDER_LIVE_TEST.md). This UI pass does not authorize real-money testing or claim payment readiness.
4. Existing forgot-password mail points to a missing `/reset-password` recovery route. The auth UI was reviewed, but recovery completion remains a release item; existing signed-in password changes are preserved.
5. New navigation/platform wording is English, following existing structural section labels. Existing translated labels and locale selection remain intact; localization of added copy needs the supported-language translations.
6. New hospitality/production modules, approved marketing photography, legal content and live operational metrics need explicit product scope/content. No dummy workflows were shipped to imitate those prototype screens.

The implementation is verified by tests/typecheck/build; final visual acceptance remains subject to an available browser and real-device review.
