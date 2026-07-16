# Example: Integration Prompts (Phase 8)

> Shows what Phase 8 prompts look like. Integration wires together what was built in Phases 4–7. Context: Finora, all prior phases complete.

---

## [ ] [156] We're wiring Finora's complete navigation system — registering all routes in Next.js App Router, implementing the deep link redirect handler, and adding active-state highlighting to the sidebar and bottom nav.

**All Finora routes —** Register the following routes and verify each has a `page.tsx` file:

- `/(auth)/login`, `/(auth)/register`, `/(auth)/forgot-password`
- `/(app)/dashboard`
- `/(app)/transactions` (list), `/(app)/transactions/[id]` (detail), `/(app)/transactions/new` (create)
- `/(app)/categories`
- `/(app)/reports`
- `/(app)/settings`, `/(app)/settings/profile`, `/(app)/settings/notifications`, `/(app)/settings/billing`
- `/(app)/onboarding` (only accessible when `onboardingCompleted === false`)

**Active route highlighting —** The Sidebar and BottomNav (built as shells in [1]) must now highlight the active section. Active matching rules: `/transactions/[id]` and `/transactions/new` both highlight the "Transactions" nav item. `/settings/profile` and `/settings/notifications` both highlight "Settings". Use `usePathname()` and check if `pathname.startsWith('/transactions')` for parent matching — not exact string equality.

**Deep link redirect —** When a signed-out user tries to access a protected route, they are redirected to `/login?redirect={encodedPath}`. After sign-in, the login page reads the `redirect` param and navigates to that path. This was referenced in the route guard built in [16] — now implement the receiving side in the login page's `onSuccess` callback: `const redirect = searchParams.get('redirect'); router.push(redirect ?? '/dashboard')`.

**Back navigation consistency —** The Transaction Detail page (`/transactions/[id]`) shows a back button in its header. This back button must use `router.push('/transactions')` (not `router.back()`). Using `router.back()` breaks when users navigate to a transaction directly from the dashboard — `router.back()` would go to the dashboard, not the list.

## Instructions

**`Active route check utility (lib/utils/navigation.ts) —`** Exports a `isRouteActive(pathname: string, href: string): boolean` function. If the `href` is exactly `'/dashboard'`, returns true if the `pathname` is exactly `'/dashboard'`. Otherwise, returns true if the `pathname` starts with the `href` string.

**`Sidebar nav item rendering —`** Define a `NAV_ITEMS` constant array (not exported) where each item has `label`, `href`, and `icon` (a Lucide icon component). Items: Dashboard (`/dashboard`, `LayoutDashboard`), Transactions (`/transactions`, `ArrowLeftRight`), Categories (`/categories`, `Tag`), Reports (`/reports`, `BarChart2`), Settings (`/settings`, `Settings`). Render each item as a Next.js `Link` component. Apply active styles when `isRouteActive(pathname, item.href)` returns true: `--color-primary-subtle` background, `--color-primary` text. Apply hover styles otherwise: `--color-surface-elevated` background, `--color-text-primary` text on hover. Active links get `aria-current='page'`. Icons are `aria-hidden='true'`. Transitions use `--duration-fast`.

**Update `components/shared/layout/BottomNav.tsx`** with same NAV_ITEMS array (omit labels, show only icons + small labels below icons). Same active state logic. Tab order: Dashboard → Transactions → Categories → Reports → Settings.

**`Login page deep link handler —`** After successful sign-in, read `searchParams.get('redirect')`. Guard against open redirect: only use the value if it starts with `/`, otherwise fall back to `/dashboard`. Call `router.push(safePath)`.

**`Transaction Detail back button —`** Renders a button in the page header. `onClick`: calls `router.push('/transactions')` — NOT `router.back()`. Has `aria-label='Back to transactions list'`. Contains a `ChevronLeft` Lucide icon with `aria-hidden='true'` and a visible 'Back' text label.

## Verification

I'll verify this implementation automatically. I can:

- Navigate to `/transactions` → expect "Transactions" nav item highlighted in sidebar and bottom nav.
- Navigate to `/transactions/some-id` → expect "Transactions" still highlighted (not unhighlighted).
- Navigate to `/settings/profile` → expect "Settings" highlighted (not unhighlighted because we're on a sub-route).
- Sign out → navigate to `/reports` → expect redirect to `/login?redirect=%2Freports`.
- Sign in from that redirect → expect navigation to `/reports` (not `/dashboard`).
- In the login page's redirect handler, pass `?redirect=https://evil.com` → expect fallback to `/dashboard` (open redirect prevented).
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Click "Transactions" in the sidebar → navigate to a transaction detail page → click the back button → expect to land on `/transactions` (not browser back-tracked to wherever you came from).
- On a mobile device (or DevTools mobile emulation) → verify bottom nav is visible and the active icon is highlighted.

Then give me your honest assessment of:

- Whether the `startsWith()` active route matching will cause unexpected behavior for routes that share a prefix — for example, if we add `/transactions-report` as a future route, will it incorrectly highlight the "Transactions" nav item when on that route?

---

## [ ] [158] We're instrumenting Finora's analytics — logging every meaningful user action to Firebase Analytics with typed event definitions and a privacy-safe utility layer.

**What gets logged —** Every event listed in the PRD's Analytics section. For Finora, these are: `transaction_created`, `transaction_viewed`, `transaction_deleted`, `filter_applied`, `category_created`, `report_viewed`, `settings_updated`, `export_initiated`, `onboarding_completed`. New events must be added to the typed definition before being logged — no ad-hoc `logEvent` calls anywhere in the codebase.

**Privacy rules —** These rules are non-negotiable and must be enforced by the utility layer:

1. Never log PII: no email addresses, no display names, no transaction descriptions, no amounts.
2. Transaction IDs in events must be hashed (use `hashId(id)` — a simple SHA-256 hash).
3. Analytics is disabled in test environments (`NODE_ENV === 'test'`).
4. Analytics is disabled until the user has completed onboarding (no data before consent is established).

**Implementation approach —** A single `lib/analytics.ts` utility file wraps Firebase Analytics `logEvent`. All event logging in components and hooks calls this utility — never `logEvent` directly. This makes it easy to add future behavior (A/B testing, filtering, disabling) in one place.

## Instructions

**Install:** `npm install crypto-js @types/crypto-js` (for hashing transaction IDs in the browser).

**`lib/analytics.ts structure —`** The file exports three things: (1) `hashId(id: string): string` — a SHA-256 hash of the ID, truncated to 12 hex characters, using the `crypto-js` package. (2) An `AnalyticsEvents` TypeScript type — a record mapping each event name (string literal) to its property type. Include all 9 events listed in the specification section with their exact property shapes. (3) `track<T extends keyof AnalyticsEvents>(event: T, properties: AnalyticsEvents[T]): void` — the only public function. Internally: checks `isEnabled` (disabled in `test` environment, optionally in `development`); lazily initialises the Firebase Analytics instance; calls `firebaseLogEvent(analytics, event, properties)`. No other file in the codebase may call `firebaseLogEvent` directly — all analytics go through `track`.

**`Where each event is called —`**

- `transaction_created`: inside `useCreateTransaction` mutation's `onSuccess` callback.
- `transaction_viewed`: inside `TransactionDetailPage` in a `useEffect` that runs when `transactionId` changes.
- `filter_applied`: inside `useTransactionFiltersStore`'s `setFilter` action, called after the filter value is set.

## Verification

I'll verify this implementation automatically. I can:

- Call `track('transaction_created', { type: 'payment', ... })` in a test — expect no errors thrown (silent no-op in test env).
- Call `track` with a misspelled event name — expect a TypeScript compile error (type safety enforced).
- Call `track` with a missing required property — expect a TypeScript compile error.
- Verify `hashId('abc')` returns a consistent 12-character hex string on every call.
- Check for any direct `logEvent` calls in the codebase (should be zero outside `lib/analytics.ts`).
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Enable analytics in development (temporarily remove the dev check) → create a transaction → open Firebase Analytics DebugView in the Firebase Console → expect the `transaction_created` event to appear within 30 seconds with the correct properties.
- Verify no event property contains an email address, display name, or raw transaction description.

Then give me your honest assessment of:

- Whether the typed `AnalyticsEvents` definition provides sufficient protection against accidentally logging PII — or whether a runtime validation layer (stripping string values over a certain length, or checking for email patterns) would add meaningful protection at the cost of complexity.
