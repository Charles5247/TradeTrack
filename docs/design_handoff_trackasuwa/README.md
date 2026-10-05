# TradeTrack — UI/UX Handoff

> **For:** Charles / TradeTrack engineering
> **Project:** [github.com/Charles5247/TradeTrack](https://github.com/Charles5247/TradeTrack)
> **Approved direction:** **Retail** — Bold POS · cashier-friendly · electric-blue primary
> **Modes:** Light + Dark (both required)
> **Status:** High-fidelity, ready to implement

---

## 1. Overview

Complete UI/UX refresh for the TradeTrack platform — a Nigerian POS + inventory + hospitality SaaS on **Next.js 16 / React 19 / Tailwind 4 / Supabase**. This handoff replaces the current generic shadcn-blue theme with a distinct, cohesive design system that spans:

- Public marketing site (Landing, Features, Industries, Pricing, Download)
- Authentication (Login, Signup, Forgot, Change password)
- Business Owner dashboard app (POS, Inventory, Products, POs, Transfers, Vendors, Sales, Reports, Audit, Users, Subscriptions, Settings, Notifications)
- Platform Owner surface (Admin overview, Merchants directory, Merchant detail)
- **New: Production & Hospitality Extension** (Restaurant KDS, Bakery, Hotel Front Desk, Mall Manager)
- Mobile POS + Dashboard (for the existing Android WebView shell)

The design was iterated across four visual directions (Ledger, Market, Operator, Retail). **The user selected Retail** — bold electric-blue primary, high-contrast, oversized touch targets, transaction-optimized.

---

## 2. About the Design Files

The files in this bundle are **design references created in HTML/React (Babel in-browser)** — high-fidelity prototypes showing exact look, spacing, colors, typography, states, and behavior. They are **not production code to ship as-is.**

**Your job as the developer:** recreate these designs in TradeTrack's existing Next.js 16 + Tailwind + shadcn/Radix codebase, replacing/augmenting the current shadcn tokens with the Retail direction's token set. Keep the existing shadcn component API surface (Button, Card, Input, Dialog, Table, Tabs, etc.) — just re-skin them with the new tokens.

Do **not** ship the raw `.jsx` files from this bundle; they use inline Babel and are designed for preview, not production bundling.

---

## 3. Fidelity

**High-fidelity (hifi)** across the board. Every color is an exact `oklch()` value; every spacing, radius, font size, weight, and animation timing is specified.

There is one non-visual "wireframe-like" element to be aware of: **AI/stock imagery placeholders**. Photos in the mocks (`assets/photo-*.jpg`) are placeholders sourced from Creative Commons / public domain for demonstration. **Replace with your own commissioned/purchased photography or partner-supplied assets** before launch. See §11 Assets.

---

## 4. Design Tokens (Retail direction)

Copy this token set into `src/app/globals.css`, replacing the current `:root` and `.dark` blocks. All values are `oklch()` — modern, wide-gamut, and perceptually uniform. Convert to hex for legacy tools using any oklch → hex converter.

### 4.1 Colors — Light mode

```css
:root {
  /* Surfaces */
  --c-bg:            oklch(0.985 0.003 250);
  --c-bgAlt:         oklch(0.96  0.006 250);
  --c-surface:       oklch(1     0     0);
  --c-surfaceAlt:    oklch(0.97  0.005 250);
  --c-border:        oklch(0.9   0.008 250);
  --c-borderStrong:  oklch(0.8   0.01  250);

  /* Text */
  --c-text:          oklch(0.15  0.02  250);
  --c-textMuted:     oklch(0.48  0.015 250);
  --c-textFaint:     oklch(0.65  0.012 250);

  /* Brand */
  --c-primary:       oklch(0.52  0.22  255);   /* electric blue */
  --c-primaryFg:     oklch(0.99  0.003 250);   /* on-primary text */
  --c-primaryHover:  oklch(0.46  0.24  255);
  --c-accent:        oklch(0.72  0.19  55);    /* warm gold accent */
  --c-accentFg:      oklch(0.15  0.02  250);

  /* Semantic */
  --c-success:       oklch(0.58  0.16  155);
  --c-warn:          oklch(0.72  0.19  55);
  --c-danger:        oklch(0.58  0.22  25);
  --c-info:          oklch(0.52  0.22  255);

  /* Charts */
  --c-chart1: oklch(0.52 0.22 255);
  --c-chart2: oklch(0.72 0.19 55);
  --c-chart3: oklch(0.58 0.16 155);
  --c-chart4: oklch(0.58 0.22 25);
  --c-chart5: oklch(0.55 0.17 300);
}
```

### 4.2 Colors — Dark mode

```css
.dark {
  --c-bg:            oklch(0.18  0.012 250);   /* soft dark, NOT pure black */
  --c-bgAlt:         oklch(0.21  0.014 250);
  --c-surface:       oklch(0.235 0.016 250);
  --c-surfaceAlt:    oklch(0.27  0.018 250);
  --c-border:        oklch(0.32  0.016 250);
  --c-borderStrong:  oklch(0.4   0.018 250);

  --c-text:          oklch(0.93  0.006 250);   /* off-white, easier on eyes */
  --c-textMuted:     oklch(0.73  0.01  250);
  --c-textFaint:     oklch(0.59  0.012 250);

  --c-primary:       oklch(0.66  0.16  255);   /* softer chroma for dark */
  --c-primaryFg:     oklch(0.18  0.012 250);
  --c-primaryHover:  oklch(0.7   0.16  255);
  --c-accent:        oklch(0.75  0.14  55);
  --c-accentFg:      oklch(0.18  0.012 250);

  --c-success:       oklch(0.68  0.13  155);
  --c-warn:          oklch(0.75  0.14  55);
  --c-danger:        oklch(0.68  0.16  25);
  --c-info:          oklch(0.66  0.16  255);

  --c-chart1: oklch(0.66 0.16 255);
  --c-chart2: oklch(0.75 0.14 55);
  --c-chart3: oklch(0.68 0.13 155);
  --c-chart4: oklch(0.68 0.16 25);
  --c-chart5: oklch(0.68 0.13 300);
}
```

**Rebalance note:** Dark mode intentionally uses **softer near-black** (bg ~0.18 lightness) instead of pure black, and **off-white text** (~0.93) instead of pure white. Primary chroma is reduced ~25% vs. light mode. This is a deliberate accessibility choice — do not "restore" harsher values.

### 4.3 Typography

```css
:root {
  --font-head: 'Space Grotesk', 'Inter', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --font-display-weight: 700;
  --letter-tight: -0.03em;
}
```

Load via next/font/google or a `<link>` in your root layout.

**Scale** (semantic, use as CSS classes / Tailwind extensions):

| Token | Size | Weight | Line-height | Use |
|---|---|---|---|---|
| `.tt-page-title` | 32px | 700 | 1.05 | Page H1 |
| `.tt-section-title` | 22px | 700 | 1.15 | Section H2 |
| `.tt-head` (default) | 20px | 700 | 1.15 | Card titles |
| body (default) | 14px | 400 | 1.5 | Prose |
| `.tt-eyebrow` | 11px | 600 | 1.4 | UPPERCASE labels, letter-spacing 0.1em |
| `.tt-mono` | inherit | 500 | 1.5 | Numbers, SKUs, receipts |

Body defaults to 14px in **Balanced** density (see §4.6), 15px in **Comfortable** (POS), 13px in **Dense** (Reports/Admin).

### 4.4 Radius scale

```css
:root {
  --radius:      8px;   /* default (Retail direction) */
  --radius-sm:   4px;
  --radius-lg:   12px;
  --radius-xl:   18px;
}
```

### 4.5 Spacing

Use the standard 4px base grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 60, 80, 100. Tailwind's default scale maps 1:1 (`p-4 = 16px`).

### 4.6 Density profiles

Three density modes drive component sizing. Apply globally via a `data-density` attribute on the layout root; per-surface overrides use `data-pos-mode="true"` and `data-dense-mode="true"` on any subtree.

| Token | Comfortable (POS) | Balanced (default) | Dense (Reports/Admin) |
|---|---|---|---|
| `--base-font` | 15px | 14px | 13px |
| `--row-h` | 52px | 44px | 36px |
| `--input-h` | 44px | 38px | 32px |
| `--btn-h` | 44px | 38px | 32px |
| `--sidebar-w` | 264px | 248px | 232px |
| `--header-h` | 68px | 60px | 52px |
| `--card-pad` | 24px | 20px | 16px |

**Rule:** POS pages get Comfortable regardless of user setting (cashier needs big touch targets). Reports/Admin get Dense. Everything else respects user's global setting.

### 4.7 Animation timing

- Micro-interactions (button, hover, focus): `140ms ease`
- Panel/reveal transitions: `300ms cubic-bezier(0.22, 1, 0.36, 1)`
- Entrance/scroll-reveal: `700ms cubic-bezier(0.22, 1, 0.36, 1)`, stagger children by 60-100ms
- Blob backgrounds (marketing): 14-18s ease-in-out infinite
- Marquee: 30s linear infinite

### 4.8 Shadows

```css
/* Elevation-1 (card hover) */
box-shadow: 0 20px 40px -12px color-mix(in oklch, var(--c-primary), transparent 82%);

/* Elevation-2 (modal, hero mockup) */
box-shadow: 0 30px 60px -15px color-mix(in oklch, var(--c-primary), transparent 78%);

/* Elevation-3 (hero photo, big surface) */
box-shadow: 0 40px 100px -20px color-mix(in oklch, var(--c-primary), transparent 75%);
```

Use `color-mix` with the primary color to keep shadows brand-tinted rather than gray.

---

## 5. Screen Inventory

Every screen is a live route in the prototype (see `TradeTrack Design Proposal.html`, navigate via the left screen picker rail). URLs map 1:1 to the codebase's existing Next.js routes.

### 5.1 Marketing (`src/app/(marketing)/`)

| Screen | Route | Prototype file | Notes |
|---|---|---|---|
| Landing | `/` | `marketing.jsx` → `Landing` | Hero + stats + featured card + feature grid + industries + testimonials + CTA + footer |
| Features | `/features` | `marketing.jsx` → `Features` | 6 category cards |
| Industries (NEW) | `/industries` | `production.jsx` → `IndustriesPage` | Introduces the Production/Hospitality extension |
| Pricing | `/pricing` | `marketing.jsx` → `Pricing` | 5 base tiers + 4 extension packs |
| Download | `/download` | `marketing.jsx` → `Download` | Windows / Android / PWA |

**Landing page animation contract:**
- Sticky nav: adds blur/border once `scrollY > 20`
- Two background "blobs" (primary + accent), floating on 14s / 18s cycles
- Hero H1 + subtitle + CTAs stagger in (100/200/350/500/650ms delays after mount)
- Hero photo has parallax translate (0.3× scroll)
- Floating mockup card (rotate -2deg), floating toast (rotate 3deg), floating stat pill — all entrance-animated
- `IntersectionObserver` reveals every section as it enters viewport (700ms fade + 24px translateY, 60-100ms stagger for grid children)
- Logo marquee scrolls continuously
- Feature/Industry cards hover-lift 4-6px

### 5.2 Auth (`src/app/(auth)/`)

| Screen | Route | Prototype file |
|---|---|---|
| Login | `/login` | `auth.jsx` → `Login` |
| Signup | `/signup` | `auth.jsx` → `Signup` |
| Forgot password | `/forgot-password` | `auth.jsx` → `Forgot` |
| Change password (forced) | `/change-password` | `auth.jsx` → `ChangePassword` |

All use a **split-panel shell**: form on the left, brand panel (primary bg + testimonial + stats) on the right. `AuthPanel` component swaps its content per screen.

### 5.3 Business Owner dashboard (`src/app/(dashboard)/`)

| Screen | Route | Prototype file → export |
|---|---|---|
| Dashboard | `/dashboard` | `dashboard.jsx` → `Dashboard` |
| POS · checkout | `/pos` | `pos.jsx` → `POS` |
| POS · payment | (POS state) | `pos.jsx` → `POSPayment` |
| POS · receipt | (POS state) | `pos.jsx` → `POSReceipt` |
| Sales history | `/sales` | `app-screens.jsx` → `Sales` |
| Sale detail | `/sales/[id]` | `missing-screens.jsx` → `SaleDetail` |
| Receipt lookup | `/receipts/lookup` | `missing-screens.jsx` → `ReceiptLookup` |
| Products | `/products` | `app-screens.jsx` → `Products` |
| Product edit | `/products/[id]/edit` | `missing-screens.jsx` → `ProductEdit` |
| Inventory | `/inventory` | `app-screens.jsx` → `Inventory` |
| Warehouses | `/warehouses` | `missing-screens.jsx` → `Warehouses` |
| Purchase Orders | `/purchase-orders` | `app-screens.jsx` → `PurchaseOrders` |
| PO · create | `/purchase-orders/new` | `app-screens.jsx` → `POCreate` |
| Transfers | `/transfers` | `app-screens.jsx` → `Transfers` |
| Vendors | `/vendors` | `app-screens.jsx` → `Vendors` |
| Reports | `/reports` | `app-screens.jsx` → `Reports` (auto-dense) |
| Audit trail | `/audit` | `app-screens.jsx` → `Audit` |
| Notifications | `/notifications` | `app-screens.jsx` → `Notifications` |
| Team / Users | `/users` | `admin-screens.jsx` → `Users` |
| Subscription | `/subscriptions` | `admin-screens.jsx` → `Subscriptions` |
| Settings | `/settings` | `admin-screens.jsx` → `SettingsPage` |

### 5.4 Platform Owner (`src/app/(dashboard)/admin/`, `/merchants/`)

| Screen | Route | Prototype file |
|---|---|---|
| Platform overview | `/admin` | `admin-screens.jsx` → `PlatformAdmin` |
| Merchants directory | `/merchants` | `admin-screens.jsx` → `Merchants` |
| Merchant detail | `/merchants/[id]` | `missing-screens.jsx` → `MerchantDetail` |

### 5.5 Production & Hospitality Extension (NEW)

New route group: `src/app/(dashboard)/production/` (or gate behind feature flag `hasFeature(plan, 'production_pack')`).

| Screen | Suggested route | Prototype file | Extension pack |
|---|---|---|---|
| Restaurant KDS | `/production/restaurant` | `production.jsx` → `RestaurantScreen` | Restaurant Pack (+₦5k/mo) |
| Bakery / Production | `/production/bakery` | `production.jsx` → `BakeryScreen` | Production Pack (+₦5k/mo) |
| Hotel front desk | `/production/hotel` | `production.jsx` → `HotelScreen` | Hotel Pack (+₦12k/mo) |
| Mall Manager | `/production/mall` | `production.jsx` → `MallScreen` | Mall Manager (+₦25k/mo) |

**Database:** New tables required (out of scope for this handoff, but the schema should follow existing patterns from `supabase/migrations/`):
- Restaurant: `menu_items`, `menu_modifiers`, `tables`, `orders`, `order_items`, `kds_stations`
- Bakery: `recipes`, `recipe_items` (BOM), `batches`, `batch_yields`
- Hotel: `rooms`, `room_types`, `rate_plans`, `reservations`, `folios`, `folio_charges`
- Mall: `tenants`, `leases`, `utility_meters`, `utility_readings`, `tenant_invoices`

All extension modules must respect the existing 4-role RBAC and RLS patterns.

### 5.6 Mobile (Android WebView / PWA)

| Screen | Prototype file |
|---|---|
| Mobile POS | `mobile.jsx` → `MobilePOSContent` |
| Mobile Dashboard | `mobile.jsx` → `MobileDashboardContent` |

Wrapped in `AndroidDevice` frame for demonstration. In production these are just responsive breakpoints of the main dashboard/POS routes — the mobile layouts should trigger below `768px`.

### 5.7 Design System reference

| Screen | Prototype file |
|---|---|
| Design tokens page | `system-page.jsx` → `SystemPage` |

Not a production route — used by the design team as a living style guide.

---

## 6. Component Library

The prototype uses vanilla CSS classes (`tt-*`), but the intent is that **you keep the existing shadcn Radix component APIs and re-skin them** with the new tokens. Below is the mapping.

### 6.1 Existing shadcn components → re-skin

| Existing shadcn component | Re-skin action |
|---|---|
| `<Button>` (`src/components/ui/button.tsx`) | Update `buttonVariants`: `primary/secondary/ghost/danger/lg/sm/icon`. See `styles.css` `.tt-btn-*` for exact styles. |
| `<Card>` | Match `.tt-card` (radius `--radius-lg`, padding `--card-pad`, `bg-surface`, `border-border`). Add `.tt-card-flat` variant (uses `surfaceAlt`). |
| `<Input>` | Match `.tt-input` (height `--input-h`, radius `--radius`, focus ring `0 0 0 3px color-mix(...primary, transparent 85%)`). |
| `<Badge>` | 7 variants: `neutral/primary/success/warn/danger/info/solid`. See `.tt-badge-*`. |
| `<Table>` | Match `.tt-table` (uppercase small header, hover row bg, `--row-h` row height). |
| `<Tabs>` | Match `.tt-tabs` / `.tt-tab` (underline-style, not pill-style). |
| `<Dialog>` | Match the `Modal` component in `templates.jsx` (backdrop blur 4px, `bg color-mix text/transparent 60%`, radius `--radius-lg`). |
| `<Select>` | Same styling as `<Input>`. |
| `<Tooltip>` | Match `.tt-nav-item` collapsed-state tooltip (popover bg, small text). |
| `<Skeleton>` | Match `Skeleton` component in `templates.jsx` — `bg color-mix(borderStrong, transparent 50%)`, `animation tt-skeleton 1.4s`. |
| `<DropdownMenu>` | Radix defaults with `--c-popover-*` tokens; align with `Modal` styling. |

### 6.2 New components to build

These have no existing shadcn equivalent — add them under `src/components/ui/`:

- **`<StatCard>`** — `label, value, delta, deltaDir, sub, Icon` props. See `dashboard.jsx` → `StatCard`.
- **`<SalesChart>`** — SVG line + area chart with dashed prev-period comparison. See `dashboard.jsx` → `SalesChart`. Use `recharts` (already in deps) for the real implementation.
- **`<Segmented>`** — pill-inside-container tabs. See `.tt-seg` / `.tt-seg-item`.
- **`<Kbd>`** — keyboard shortcut display. See `.tt-kbd`.
- **`<EmptyState>`, `<LoadingState>`, `<ErrorState>`, `<Toast>`** — see `templates.jsx`.
- **`<DetailTemplate>`** — Detail page shell (title + meta + KPI cards + tabs + main/side layout). See `templates.jsx` → `DetailTemplate`. Use for Sale detail, PO detail, Vendor detail, Merchant detail, Warehouse detail.
- **`<FormTemplate>`** — Add/Edit page shell (sections + sidebar + save bar). Use for Product Add/Edit, User Invite, Warehouse Create, Vendor Add.
- **`<AppScreen>`** — sidebar + header + page container. Replaces the current `dashboard-layout.tsx` composition. See `shell.jsx` → `AppScreen`.

### 6.3 Layout components (replace existing)

- **Sidebar** (`src/components/layout/sidebar.tsx`) — the new sidebar groups nav into 4 sections: **Operate** (Dashboard, POS, Sales, Receipt Lookup), **Inventory** (Products, Inventory, POs, Transfers, Vendors), **Insights** (Reports, Audit), **Admin** (Team, Subscription, Settings). Platform Owner gets a 2-group version: **Platform**, **Admin**. See `shell.jsx` → `NAV_GROUPS_BO` / `NAV_GROUPS_PO`.
- **Header** (`src/components/layout/header.tsx`) — sticky with backdrop blur, contains: breadcrumb + title/subtitle | ⌘K search input | online/offline pill | theme toggle | bell | user actions. See `shell.jsx` → `Header`.

---

## 7. Iconography

All icons are **Lucide** (already in `package.json` as `lucide-react`). The prototype uses inline SVG copies of the same set to avoid the runtime dep during prototyping. In your implementation, import directly:

```tsx
import { Package, Warehouse, ShoppingCart, /* ... */ } from "lucide-react";
```

Consistent icon style: **1.75 stroke, 16px default**, `currentColor` fill. Never mix with other icon libraries.

---

## 8. Photography & Imagery

**⚠️ Replace all placeholder photography before launch.**

The mocks use Creative-Commons and public-domain photos as **placeholders** to show intent. Commission or license real Nigerian trader / restaurant / hotel photography for production.

Photo slots in the design (see `assets/` folder in the prototype for placeholder references):
- **Hero (landing)**: `assets/photo-aba-traders.jpg` — Nigerian market-women scene. Replace with a shot of an actual TradeTrack customer's shop.
- **"Offline-first" featured card**: `assets/photo-testimonial-nigerian-woman.jpg` — Nigerian women preparing produce at market stall.
- **Industries grid**: 6 images (retail, restaurants, bakeries, hotels, malls, grocery) — replace each with in-context photography of that vertical using TradeTrack.
- **Testimonial cards**: 3 portrait shots of merchants + quote.
- **Auth right-panel**: no photo currently, but a subtle brand illustration or shop photo would add warmth.

**Placeholder styling** (until real photos arrive): the prototype ships a `.tt-placeholder` utility (striped diagonal SVG background, dashed border, mono explainer text). Use anywhere an image is missing.

---

## 9. Behavior & Interactions

### 9.1 Navigation

- Left sidebar with 4 nav groups (Business Owner) or 2 (Platform Owner). Active state gets a **primary-tinted background + primary text + 3px left indicator bar**.
- Sidebar collapses to icon-only on narrow viewports (`< 1024px`), user-toggleable via a button in the top-left. State persists in Zustand.
- Header search (`⌘K`) opens a command palette (`cmdk` is already a dep). Design not covered here — use `cmdk`'s defaults themed with the new tokens.

### 9.2 POS

- Full-screen mode with **sidebar collapsed to 64px**. Auto-applies `data-pos-mode="true"` (large touch targets).
- Left: product grid (4 cols, big cards with image placeholder + name + price + stock badge). Filters by category (segmented control).
- Right: sticky cart panel. Line items with +/- controls, subtotal / discount / VAT / total, "Charge ₦X" button at 56px height.
- Barcode scan input has an `⌘F2` shortcut hint.
- **Payment screen**: 4-method picker (Cash / Transfer / POS Card / Split), tendered-amount input with quick-add buttons for common notes (₦1k, ₦5k, ₦10k, ₦20k), live change calculation.
- **Receipt screen**: full-screen success state with checkmark, change owed, print/email/next-sale buttons, receipt preview.

### 9.3 Offline mode

- Header online/offline badge switches between green (`Online`) and amber (`Offline · N queued`).
- Cart in offline mode shows the offline badge inside the cart panel.
- Sync-in-progress state uses the loading skeleton pattern on affected rows.

### 9.4 Forms

- All forms use the `<FormTemplate>` pattern: sections (each a card) + optional sidebar (help/preview/live stats).
- Fields use `<Field>` (label + input + hint/error). Errors are red text under the input, not toast.
- Save bar at bottom-right: `Cancel` (ghost) + `Save` (primary). Sticky on long forms.
- Multi-step wizards (like PO Create) use a horizontal stepper at the top: circle numbers, green check for done, primary fill for active.

### 9.5 Empty / Loading / Error states

- **Empty**: `<EmptyState>` — icon + title + body + primary/secondary CTA. Muted background.
- **Loading**: `<LoadingState>` for tables (5-6 skeleton rows), or `<Skeleton>` primitive for arbitrary shapes.
- **Error**: `<ErrorState>` — danger-tinted card, alert icon, title, body, "Try again" button.
- **Toast**: `<Toast>` with 4 types (info/success/warn/danger). Use `sonner` (already a dep) for the actual toast host, themed with these tokens.

### 9.6 Animations

- Buttons: bg-color transition `140ms ease` on hover.
- Cards: `transform translateY(-4px)` + shadow bump on hover (`transition 300ms cubic-bezier(0.22,1,0.36,1)`).
- Landing page: `IntersectionObserver` reveal with 700ms fade + 24px translateY, `rootMargin: 200px` for early trigger, safety fallback at 1200ms.
- Blob backgrounds: 14s / 18s ease-in-out infinite float.
- Dot pulses (live indicators): `tt-pulse` 1.8s.
- Bar chart entrance: scaleY from 0, 700ms cubic-bezier, staggered 60ms per bar.

---

## 10. State Management

TradeTrack already uses **Zustand** (`src/store/index.ts`) and **TanStack Query**. This design doesn't change that. Specifically:

- `useUIStore` — sidebar collapsed, theme mode (add: current density preference)
- `useAuthStore` — current user + role
- Query hooks for all data fetching (products, sales, inventory, POs, etc.)

Add these UI state additions:
- `sidebarCollapsed: boolean` (already exists as `sidebarOpen`)
- `theme: 'light' | 'dark' | 'system'` (use `next-themes`, already a dep)
- `density: 'comfortable' | 'balanced' | 'dense'` — user preference, persisted

---

## 11. Assets

All asset files ship in `assets/`:

| File | Where used | Notes |
|---|---|---|
| `photo-aba-traders.jpg` | Landing hero | Nigerian market · placeholder |
| `photo-testimonial-nigerian-woman.jpg` | Featured "offline-first" card | Nigerian trader · placeholder |
| `photo-testimonial-african-corp-woman.jpg` | Testimonial 1 | Professional woman · placeholder |
| `photo-testimonial-man1.jpg` | Testimonial 2 | Trader portrait · placeholder |
| `photo-testimonial-african-man-restaurant.jpg` | Testimonial 3 | Café owner · placeholder |
| `photo-market.jpg` | Industries: Retail | Trader in shop · placeholder |
| `photo-restaurant.jpg` | Industries: Restaurants + Production module hero | Restaurant scene · placeholder |
| `photo-bakery.jpg` | Industries: Bakeries + Production module hero | Bakery scene · placeholder |
| `photo-african-hotel-women.jpg` | Industries: Hotels + Production module hero | Hotel staff · placeholder |
| `photo-african-spices-market.jpg` | Industries: Grocery | Market spices · placeholder |
| `photo-mall.jpg` | Industries: Shopping malls + Production hero | Mall interior · placeholder |
| `photo-hotel.jpg`, `photo-phone.jpg`, `photo-testimonial-woman1.jpg`, `photo-testimonial-woman2.jpg`, `photo-testimonial-central-african-man.jpg`, `photo-restaurant-culinary-team.jpg` | Additional slots | Standby placeholders |

**All must be replaced with licensed/commissioned photography for production launch.**

### Logo

The prototype ships **4 logo mark variants** (Ledger diamond, Market crate+leaf, Operator grid, Retail monogram). For the chosen Retail direction, use `LogoRetail` (blue rounded-square with white "TT" monogram + accent dot). SVG source is in `logo.jsx`. Export as SVG and drop into `public/logo.svg` + generate the PWA icon set from it.

---

## 12. Files in this handoff

All source files copied under `design_handoff_tradetrack/design_files/`:

**Core system**
- `tokens.js` — full design token JS (4 directions × light/dark, density profiles). Reference for building the Tailwind config.
- `styles.css` — vanilla CSS mirror of the token system + all `.tt-*` utility classes.
- `icons.jsx` — inline SVG icon set (Lucide-equivalent).
- `logo.jsx` — 4 logo variants (use `LogoRetail`).

**Layout & shell**
- `shell.jsx` — `AppScreen`, `Sidebar`, `Header`, `Page`, nav-group definitions.
- `templates.jsx` — `DetailTemplate`, `FormTemplate`, `EmptyState`, `LoadingState`, `ErrorState`, `Modal`, `Toast`, `Field`, `Skeleton`.

**Marketing**
- `marketing.jsx` — Landing, Features, Pricing, Download (with all animation hooks).

**Auth**
- `auth.jsx` — Login, Signup, Forgot, ChangePassword.

**Business Owner app**
- `dashboard.jsx` — Business Owner Dashboard.
- `pos.jsx` — POS checkout, payment, receipt.
- `app-screens.jsx` — Products, Inventory, POs, PO Create, Transfers, Vendors, Sales, Reports, Audit, Notifications.
- `missing-screens.jsx` — Warehouses, ReceiptLookup, SaleDetail, MerchantDetail, ProductEdit.

**Platform Owner**
- `admin-screens.jsx` — Users, SettingsPage, Subscriptions, PlatformAdmin, Merchants.

**Production & Hospitality Extension (NEW)**
- `production.jsx` — IndustriesPage, RestaurantScreen, BakeryScreen, HotelScreen, MallScreen.

**Mobile & System**
- `mobile.jsx` — MobilePOSContent, MobileDashboardContent, MobileScreens (AndroidFrame wrapper).
- `system-page.jsx` — Design system doc page with swatches, type spec, all component states.

**Router & entry**
- `app.jsx` — Screen router (hash-based), Tweaks integration.
- `TradeTrack Design Proposal.html` — main entry, loads everything.
- `tweaks_panel.jsx` — live tweak controls (dev preview only, do not ship).
- `android_frame.jsx` — Android device chrome for mobile demos.

---

## 13. Recommended implementation order

1. **Tokens first.** Replace `src/app/globals.css` with the token block from §4. Verify the app still boots.
2. **Re-skin existing shadcn components** (§6.1). This alone will visually transform 80% of the app.
3. **Update layout** (§6.3): Sidebar nav groups, Header structure.
4. **Landing page.** Highest visual leverage. Build hero + featured card + industry grid + testimonials + CTA.
5. **Dashboard + POS.** Highest product leverage. POS in particular should get its own layout wrapper that forces `data-pos-mode="true"`.
6. **Add new components** (§6.2): StatCard, DetailTemplate, FormTemplate, EmptyState, LoadingState, ErrorState.
7. **Fill in missing screens** using the templates (SaleDetail, MerchantDetail, ProductEdit, Warehouses, ReceiptLookup).
8. **Production/Hospitality extension.** Backend schema first (§5.5), then screens.
9. **Mobile responsive pass.** POS & Dashboard breakpoints.
10. **Replace placeholder photography** before launch (§11).

---

## 14. Things the developer should double-check before shipping

- All monetary values use **₦ (Naira)** with `.toLocaleString('en-NG')` formatting — no dollar signs anywhere.
- Numeric values in tables/receipts use `.tt-tabular` (`font-variant-numeric: tabular-nums`) for alignment.
- Dark mode uses **soft near-black + off-white text**, not pure black + pure white. Don't "fix" this — it's intentional.
- Every screen wraps in `<AppScreen>` for consistent shell.
- POS + KDS pages get `data-pos-mode="true"` (bigger touch targets).
- Reports + Admin pages get `data-dense-mode="true"` (tighter grid).
- Add/Edit flows use `<FormTemplate>` — do not hand-roll form layouts.
- Detail pages use `<DetailTemplate>` — do not hand-roll detail layouts.
- Empty/loading/error states are **always** provided per screen — never a bare blank state.
- No emojis in UI copy (except the "🇳🇬" flag in the footer, intentional).

---

## 15. Live prototype

The live prototype is at `TradeTrack Design Proposal.html`. To explore it:

1. Open the file. It boots into the **Retail** direction / **Light** mode by default.
2. **Top center**: direction switcher — you can preview other directions (Ledger, Market, Operator) but they're archived; **Retail is the approved direction.**
3. **Left rail**: screen picker, grouped by surface (Marketing, Auth, Business Owner, Platform Owner, Production, Mobile, System).
4. **Bottom-right**: Tweaks panel (dev-only) — toggle dark/light, density, radius, primary color override.
5. **Design tokens page** (System group) — reference for all colors, type, spacing, icons, and component states.

---

**Questions / follow-ups:** Point them at this document. It's designed to be self-sufficient — any competent frontend engineer familiar with Next.js + Tailwind + shadcn should be able to implement the design from the tokens + patterns above.
