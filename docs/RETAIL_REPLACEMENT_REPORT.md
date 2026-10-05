# TracKasuwa Retail replacement — 5 October 2026

## Implementation and screen coverage

The existing Retail implementation was retained where it already matched the handoff. This pass corrects its shared foundations and completes missing routes and photography. All 46 canonical light/dark palette values match README §4 exactly. Comfortable/POS and Dense/Admin density values are checked against the specification. Radii now use 4/8/12/18px, and Tailwind dark variants follow the application's `.dark` class.

| Surface | Screens covered | Changes in this pass |
| --- | --- | --- |
| Public | Landing, Features, Industries, Pricing, Download | Shared tokens, dark variants, fonts, navigation; supplied hero, feature and industry photography; new Industries route; Download semantic colors |
| Authentication | Login, Signup, Forgot Password, Change Password | Shared tokens, inputs, fonts and photo carousel; reduced-motion and larger carousel controls |
| Operations | Dashboard, POS, Products, Inventory, Purchase Orders, Transfers, Vendors, Sales | Shared cards, buttons, tables, inputs, density and semantic colors; product edit and sale detail navigation; PO Create route |
| Insights and administration | Reports, Audit, Users, Subscriptions, Settings, Notifications | Shared dense treatment where applicable, typography, tables, tabs, dialogs and status colors; role-specific platform operations section |
| Platform | Admin overview, Merchants directory, Merchant detail, platform-owner Settings | Dense merchant pages, standalone Merchant Detail, operational settings links, preserved merchant-management dialog |
| Other existing screens | Warehouses, Receipt lookup, Receipts, Imports, Accounting, Assistant | Shared Retail components and shell; existing role restrictions and functionality retained |
| Added detail/form routes | `/sales/[id]`, `/merchants/[id]`, `/products/[id]/edit`, `/purchase-orders/new` | DetailTemplate/FormTemplate, loading/error states, existing product save and PO workflows reused |
| Mobile | Dashboard and POS responsive web surfaces used by Android WebView/PWA | Shared token/density corrections, dynamic viewport height, scrollable tabs, bounded dialogs, wrapping detail headers; POS page source unchanged |

Exact route inventory: `build-evidence/retail/audit.json` (35 page routes). Direct page edits and inherited shared-component changes are distinguished above; this does not mean every existing page body was rewritten.

## Extrapolation beyond explicit mocks

- Platform-owner Settings: added a Platform operations section for plans/subscriptions, merchant access and verification/device management, overview and notifications. Retained working profile, language, theme and password controls. Business-profile fields remain merchant-only. Links use existing operational controls rather than introducing nonfunctional global-setting switches.
- Merchant detail: business registration, verification, address, primary contact and platform notes use the detail pattern. The existing directory dialog retains subscription/device-limit management.
- Product edit: FormTemplate wraps the existing validated ProductForm, preserving image capture, lookup and save behavior.
- PO Create: the list and standalone creation route share the original query/form/mutation implementation. The protected offline writer and pull implementation are unchanged.
- Missing data: real product records without product photos retain their intentional product fallback. Handoff photos depict people/industries, not the merchant's actual products.
- Testimonials: the three supplied portrait assets appear with the existing accountability content. Invented named customer quotes were not presented as verified endorsements.
- Imports, Accounting, Assistant and role variants inherit the Retail shell and components while retaining their existing permissions and workflows.
- Fonts: the exact Inter, Space Grotesk and JetBrains Mono files already cached by Next.js are now self-hosted, preserving weights and Unicode subsets. SIL Open Font licenses are included. This removes a Google Fonts build-time network failure.

## Assets

All 17 supplied JPEGs were copied unchanged to `public/images/retail/`. Each was decoded and byte-compared with the design source; no supplied asset is missing or corrupt.

| Previous slot | Supplied file |
| --- | --- |
| Landing hero text placeholder | `photo-aba-traders.jpg` |
| Offline-first feature placeholder | `photo-testimonial-nigerian-woman.jpg` |
| Retail industry placeholder | `photo-market.jpg` |
| Restaurant industry placeholder | `photo-restaurant.jpg` |
| Bakery industry slot | `photo-bakery.jpg` |
| Hotel industry placeholder | `photo-african-hotel-women.jpg` |
| Grocery industry placeholder | `photo-african-spices-market.jpg` |
| Mall industry slot | `photo-mall.jpg` |
| Merchant/accountability portraits | `photo-testimonial-african-corp-woman.jpg`, `photo-testimonial-man1.jpg`, `photo-testimonial-african-man-restaurant.jpg` |
| Four auth carousel placeholders | `photo-market.jpg`, `photo-aba-traders.jpg`, `photo-african-spices-market.jpg`, `photo-testimonial-nigerian-woman.jpg` |

The other six supplied photographs remain available as standby assets. `public/logo.svg` and all existing PWA PNG icons now use the Retail TT mark; static icon colors are sRGB conversions of the canonical light palette. Prototype JSX remains documentation, not served production code. The pre-existing relocation from `public/design_handoff_trackasuwa/` to `docs/design_handoff_trackasuwa/` is included.

These photographs remain the handoff's Creative Commons/public-domain placeholder photography, **not final commissioned/licensed launch photography**. Product-image URLs supplied by merchants were not replaced with unrelated stock images.

## Verification and actual output

- Full test suite: `build-evidence/retail/tests-verified.log` contains the complete captured output. Command: `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=120000 --hookTimeout=120000`. Result: 45 files / 322 tests passed. Timeout flags accommodate slow fixture setup; test assertions, including offline performance budgets, were not weakened.
- Typecheck: `build-evidence/retail/typecheck-output.log` contains the exact command, output and exit code.
- Production build: `build-evidence/retail/build-output.log` contains the exact command, complete route output and exit code.
- Two focused UI/offline PO regression files also passed (3 tests).
- `node scripts/verify-retail.cjs`: 46 exact palette values; density profiles checked; four protected hashes unchanged; 17 photos decoded and byte-matched; 35 routes inventoried.
- HTTP checks: all nine public/auth pages and the hero JPEG returned 200. Initial compilation timeouts were retried; combined results are in `build-evidence/retail/http-final.json`.
- Earlier diagnostic logs are retained. The first sandboxed suite hit worker-startup errors; a full run outside the sandbox passed. The first build failed to fetch Google Fonts; self-hosting fixed that failure.

### Complete passing suite output

```text
RUN  v4.1.10 C:/Users/PC/TradeTrack


 Test Files  45 passed (45)
      Tests  322 passed (322)
   Start at  15:01:22
   Duration  256.04s (transform 19.28s, setup 13.95s, import 72.83s, tests 179.89s, environment 190.44s)
```

### Complete standalone typecheck output

```text
$ node node_modules/typescript/bin/tsc --noEmit

Exit code: 0
```

## Protected SHA-256 hashes — before and after identical

```text
src/lib/offline/sales.ts
2a797642c5c4a0e4072ce1fb521b11ae966da737e15f1d4af77f2c2bbead41ef

src/lib/offline/purchase-orders.ts
3c6894381bdd2b0959dfcaa37e12a406641beb2afe197e977cf6e99f25f9a105

src/lib/offline/sync-engine.ts
d0a8fcee54861a66b76fa2206957c18512e3436de3e017ee06920a0850a4420a

src/app/(dashboard)/pos/page.tsx
da3ad8c4bf22bd6ce50504808b0cc4d0ffdd035aef11ce321a9e3ac706e4be93
```

`persistOfflineSale()`, the purchase-order offline writer, and the entire file containing `pullPurchaseOrders()` have zero drift. POS received only inherited visual changes; its source is byte-identical.

## Fidelity limits and Xavier decisions

- No browser provider was available in this session. Source, build, HTTP and automated checks were completed, but screenshots, authenticated visual inspection, real Android hardware and pixel-by-pixel fidelity were **not verified**. This report does not certify those checks as passed.
- Production/Hospitality backend modules are not implemented by this UI replacement. Their industry cards accurately say Coming soon. Shipping those modules requires a separate schema/feature rollout; the handoff itself identifies their schema as out of scope.
- Decide final licensed photography and obtain approved customer testimonials before launch.
- Decide whether platform-wide locale enforcement, retention, MFA policy or other new global configuration is required. The Settings page exposes existing supported platform operations and account preferences; it does not pretend that unimplemented global controls persist.
- Merchant management remains available through the directory dialog as well as the new read-only detail page. This preserves existing administration behavior rather than duplicating mutations.
- Next.js emits its existing middleware-to-proxy deprecation warning. Migrating auth middleware is outside this visual change.
