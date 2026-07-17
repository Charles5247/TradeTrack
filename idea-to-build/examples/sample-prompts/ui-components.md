# Example: UI Component Prompts (Phase 6)

> Shows what Phase 6 prompts look like. Components are pure, stateless building blocks. They use design tokens from `docs/architecture/design.md`. They accept data via props. Every prompt includes accessibility requirements — these are never implied.
>
> **Design reference:** All components reference mockups generated in Phase 2.5.

---

## [ ] [98] We're building the TransactionCard component — the reusable card used in the transactions list, dashboard recent activity, and search results throughout Finora.

**What the card displays —** Each TransactionCard shows: a type icon (colored badge on the left), the transaction description (truncated to 2 lines with ellipsis), the counterparty name below the description (if not null, in muted text), the formatted amount (emerald green for income types: deposit and refund; warm red for expense types: payment and withdrawal; text-secondary for transfer), the currency-formatted amount using the user's currency preference from the auth store, a status badge (completed=emerald, pending=amber, failed=red/error, cancelled=muted), and the formatted date (relative for recent: "2 hours ago", absolute for older than 7 days: "Jun 12").

**Card states —** The TransactionCard renders in four states controlled by props: `default` (standard appearance), `hover` (lift + shadow increase — CSS only, no prop needed), `selected` (primary color left border, `--color-primary-subtle` background), `loading` (a `TransactionCardSkeleton` exported from the same file that matches the card's exact dimensions).

**Design tokens used —** Background: `--color-surface-elevated`. Border: `1px solid var(--color-border)`. Border radius: `--radius-md`. On hover: `transform: translateY(-2px)`, shadow increases from `--shadow-sm` to `--shadow-md`. Transition: `--duration-fast` with `--ease-default`. Selected state: `border-left: 3px solid var(--color-primary)`, background `--color-primary-subtle`.

**Accessibility requirements —** The card has `role="button"` when `onClick` is provided, `role="article"` otherwise. `aria-label` must be: `"Transaction: {description}, {formatted amount} {currency}, {status}"`. The card is keyboard-accessible: `tabIndex={onClick ? 0 : undefined}`, responds to `Enter` and `Space` keydown events when `onClick` is provided. Focus ring: `outline: 2px solid var(--color-primary)`, `outline-offset: 2px`.

## Instructions

**File:** `components/shared/TransactionCard.tsx`

**Prop interface:**

```typescript
interface TransactionCardProps {
  transaction: Transaction; // from @/lib/types/transaction
  isSelected?: boolean; // default: false
  onClick?: () => void; // if provided, card is interactive
  className?: string;
}
```

**`Amount colour and prefix logic —`** Determine colour and prefix from transaction type. Income types (`deposit`, `refund`): amount displayed in `--color-success`, prefix `+`. Expense types (`payment`, `withdrawal`): displayed in `--color-error`, prefix `-`. Transfer type: displayed in `--color-text-secondary`, no prefix.

**`Date display logic —`** Use `date-fns`. If the transaction is fewer than 7 days old: show relative time using `formatDistanceToNow` with `addSuffix: true` (e.g., '2 hours ago'). If 7 or more days old: show absolute date using `format` with the pattern `'MMM d'` (e.g., 'Jun 12').

**Type icon mapping:** Create a `TRANSACTION_TYPE_ICON` record mapping each `TransactionType` to a Lucide icon and a background color token. Example: `payment: { icon: CreditCard, bg: '--color-error-subtle', color: '--color-error' }`, `deposit: { icon: TrendingUp, bg: '--color-success-subtle', color: '--color-success' }`.

**Status badge:** Use a `<span>` with `role="status"`. Map status to `--color-*-subtle` background and `--color-*` text. Example: `completed → success`, `pending → warning`, `failed → error`, `cancelled → text-muted`.

**`Keyboard accessibility implementation —`** Add an `onKeyDown` handler to the card's root element. When `onClick` is provided: listen for `Enter` and `Space` key events, call `e.preventDefault()` to stop page scroll on Space, then call `onClick()`. When `onClick` is not provided: no keyboard handler needed.

**`TransactionCardSkeleton`** — export from the same file. Renders a `<div>` with the exact same dimensions as the real card but uses a shimmer animation (`background: linear-gradient(90deg, var(--color-surface-elevated) 25%, var(--color-surface-overlay) 50%, var(--color-surface-elevated) 75%)`, `background-size: 200% 100%`, `animation: shimmer 1.5s infinite linear`). Define the `@keyframes shimmer` in `globals.css`.

**Barrel export:** Add `export { TransactionCard, TransactionCardSkeleton } from './TransactionCard'` to `components/shared/index.ts`.

**Design reference:** `docs/design/mockups/transactions-list.html` — the card design is shown in the list context on this mockup.

## Verification

I'll verify this implementation automatically. I can:

- Render `<TransactionCard transaction={depositTransaction} />` — expect amount to be green with a `+` prefix.
- Render `<TransactionCard transaction={paymentTransaction} />` — expect amount to be red with a `-` prefix.
- Render `<TransactionCard transaction={t} isSelected={true} />` — expect left border in `--color-primary` color.
- Render `<TransactionCardSkeleton />` — expect it renders without errors and matches the card's height.
- Tab to the card (when `onClick` is provided) → press Enter → expect `onClick` to be called.
- Tab to the card → verify focus ring is visible (2px primary color outline).
- Render with a description of 200 characters → expect truncation after 2 lines.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Navigate to the Transactions page → verify all TransactionCards render correctly with the right amount colors, type icons, and dates.
- Tab through the list → verify each card receives a visible focus ring and is reachable by keyboard.
- Resize the browser to mobile width → verify the card layout does not break.

Then give me your honest assessment of:

- Whether the `role="button"` approach for interactive cards is semantically correct for screen readers — or whether wrapping the card in a `<button>` element would provide better native accessibility behavior (including automatic keyboard handling) at the cost of some styling complexity.

---

## [ ] [99] We're building the EmptyState, ErrorState, and LoadingSpinner shared components used across every data-driven page in Finora.

**EmptyState —** Used when a page has no data to show. Props: `icon` (a Lucide icon component), `title` (string), `description` (string), `action` (optional: `{ label: string, onClick: () => void }`), `secondaryAction` (optional: `{ label: string, href: string }`). The layout: centered vertically and horizontally, icon in a subtle rounded container using `--color-primary-subtle`, icon color `--color-primary`, title in `--text-lg` weight semibold, description in `--text-base` color `--color-text-secondary`, primary action as a filled button, secondary action as a text link.

**ErrorState —** Used when a data fetch fails. Props: `title` (string, default `'Something went wrong'`), `description` (string, default `'We couldn\'t load this data. Please try again.'`), `onRetry` (optional function — shows a retry button when provided), `contactSupport` (optional boolean — shows a "Contact support" link when true). Uses `AlertTriangle` icon from Lucide in `--color-error` color. Never shows raw error messages or stack traces — those go to Sentry.

**LoadingSpinner —** A simple animated spinner. Props: `size` (`'sm' | 'md' | 'lg'`, default `'md'`). Size mapping: sm=16px, md=24px, lg=40px. Color: `--color-primary`. Uses a CSS animation, not a GIF. Accessible: `role="status"`, `aria-label="Loading"`.

## Instructions

**`components/shared/EmptyState.tsx`:**

```typescript
interface EmptyStateProps {
  icon: LucideIcon; // import { LucideIcon } from 'lucide-react'
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; href: string };
  className?: string;
}
```

- Root element: `<div role="status" className="flex flex-col items-center justify-center py-[var(--space-16)] px-[var(--space-8)] text-center">`
- Icon container: `<div className="mb-[var(--space-4)] rounded-[var(--radius-lg)] p-[var(--space-4)]" style={{ background: 'var(--color-primary-subtle)' }}>`
- `<Icon size={40} style={{ color: 'var(--color-primary)' }} />`
- Title: `<h3 className="mt-[var(--space-2)] text-[var(--text-lg)] font-semibold" style={{ color: 'var(--color-text-primary)' }}>`
- Description: `<p className="mt-[var(--space-2)] text-[var(--text-base)] max-w-sm" style={{ color: 'var(--color-text-secondary)' }}>`
- Action button: shadcn/ui `<Button variant="default" onClick={action.onClick}>{action.label}</Button>` wrapped in `mt-[var(--space-6)]`

**`components/shared/ErrorState.tsx`:**
Same structure as EmptyState but uses `AlertTriangle` icon always. When `onRetry` is provided, render a `<Button variant="outline" onClick={onRetry}>Try again</Button>`. When `contactSupport` is true, render `<a href="mailto:support@finora.app" ...>Contact support</a>` as a secondary action below.

**`LoadingSpinner implementation —`** Renders an SVG spinner. `role='status'`, `aria-label='Loading'`. A visually-hidden `<span>` inside contains the text 'Loading' for screen readers. The SVG uses two concentric arcs: a full circle at 25% opacity (the track) and a quarter-arc at full opacity (the rotating indicator). The SVG animates with `animate-spin` (Tailwind's built-in spin utility) at full speed. Size (width and height) is determined by the `size` prop: `sm=16`, `md=24`, `lg=40`. Colour: `currentColor` inherits from `--color-primary` set on the parent.

**Barrel exports:** Add all three to `components/shared/index.ts`.

**Design reference:** `docs/design/mockups/transactions-list.html` (shows the EmptyState in context), `docs/design/mockups/error-states.html`.

## Verification

I'll verify this implementation automatically. I can:

- Render `<EmptyState icon={Receipt} title="No transactions yet" description="Add your first transaction to get started." action={{ label: "Add transaction", onClick: mockFn }} />` — expect it renders without errors, action button is present, `onClick` fires on click.
- Render `<ErrorState />` with no props — expect default title and description, no retry button.
- Render `<ErrorState onRetry={mockFn} />` — expect a "Try again" button that calls `mockFn`.
- Render `<LoadingSpinner size="lg" />` — expect `role="status"` and `aria-label="Loading"` on the root element.
- Screen reader test: navigate to an EmptyState — verify the screen reader announces the title via `role="status"`.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Navigate to the Categories page before creating any categories → expect the EmptyState with the "Create your first category" CTA.
- Disable Wi-Fi → navigate to Transactions → expect the ErrorState with "Try again" button (not a blank page).

Then give me your honest assessment of:

- Whether using `role="status"` on EmptyState and ErrorState is the correct ARIA role for these components — or whether `role="region"` with an `aria-label` would better communicate to screen reader users that this is a page section rather than a live updating status.
