# Example: Page Prompts (Phase 7)

> Shows what Phase 7 prompts look like. Every page gets its own prompt — no "same as X" shortcuts. Each prompt specifies loading, empty, error, and success states explicitly. Components from Phase 6 are referenced by exact name and prompt number.

---

## [ ] [118] We need the TransactionListPage — the primary screen where users browse, filter, search, and paginate through all of their transactions in Finora.

**Page purpose —** This is the most-visited page in Finora after the dashboard. It must feel fast: skeleton loaders appear instantly, the list renders as soon as data arrives, and filters apply without a full page reload. The URL reflects the active filters via query params (`?type=payment&status=completed`) so users can bookmark and share filtered views.

**Layout —** The page has three visual sections: (1) a sticky page header with the title "Transactions" and a filter trigger button, (2) a filter bar showing active filter chips (hidden when no filters are active), (3) the transaction list with infinite scroll. On desktop (≥1024px), the filter panel is an inline sidebar. On mobile (<1024px), the filter panel is a bottom sheet drawer.

**Loading state —** Render 8 `TransactionCardSkeleton` components (built in [98]) stacked in a list. The skeleton must match the exact height and width of a real `TransactionCard` so the layout does not shift when data arrives.

**Empty state —** When no transactions exist at all (first-time user): render `<EmptyState icon={Receipt} title="No transactions yet" description="Track your spending, income, and transfers in one place." action={{ label: "Add your first transaction", onClick: openCreateModal }} />` (EmptyState built in [99]). When filters are active but return no results: render `<EmptyState icon={SearchX} title="No matching transactions" description="Try removing some filters or adjusting your search." action={{ label: "Clear all filters", onClick: clearFilters }} />`.

**Error state —** Render `<ErrorState onRetry={() => refetch()} />` (ErrorState built in [99]). Show the error state for any non-401 error (401 triggers the session expiry flow from the auth store, not an inline error).

**Accessibility —** The page `<h1>` is "Transactions". The filter button has `aria-label="Open filters"`. The filter drawer has `role="dialog"` and `aria-label="Transaction filters"` and traps focus when open. Each filter chip group has a `<fieldset>` with `<legend>` for screen readers. The transactions list has `role="list"` and each TransactionCard has `role="listitem"`. When new transactions load on scroll, announce to screen readers: `aria-live="polite"` on a visually hidden element that says "X more transactions loaded."

## Instructions

**File:** `app/(app)/transactions/page.tsx`

**Data hooks used:**

- `useTransactions()` from `lib/hooks/useTransactions.ts` (built in [68]) — provides `transactions`, `isLoading`, `isError`, `fetchNextPage`, `hasNextPage`, `isFetchingNextPage`
- `useTransactionFiltersStore()` from `lib/stores/transaction-filters-store.ts` (built in [68]) — provides `type`, `status`, `categoryId`, `search`, `setFilter`, `clearFilters`
- `useCategories()` from `lib/hooks/useCategories.ts` (built in [69]) — provides categories for the category filter dropdown

**`Infinite scroll implementation —`** Use an `IntersectionObserver` to detect when the user reaches the bottom of the list. Attach the observer to a sentinel `<div>` placed after the last list item. When the sentinel enters the viewport and `hasNextPage` is true and `isFetchingNextPage` is false: call `fetchNextPage()`. Disconnect and re-create the observer when `isFetchingNextPage` or `hasNextPage` changes to prevent duplicate fetches. Use `useCallback` for the ref callback that creates the observer.

**URL sync:** Use `useSearchParams` and `useRouter` from `next/navigation` to sync filters to the URL. On filter change, update the URL with `router.replace('?' + new URLSearchParams(activeFilters).toString(), { scroll: false })`. On page load, initialize the filter store from URL params.

**Active filter chip bar:** Show only when at least one filter is active. Each chip displays the filter label and a close (×) button that clears that specific filter. A "Clear all" button appears at the right of the chip bar.

**Filter drawer/sidebar:**

- Desktop: `<aside>` with `position: sticky`, top = header height. Width 280px.
- Mobile: shadcn/ui `<Sheet>` (bottom variant). Triggered by the filter button in the header.
- Contents: filter sections for Type (radio group), Status (radio group), Category (select), Date range (two date inputs: From / To).
- Each filter section is a `<fieldset>` with `<legend>`.

**Keyboard navigation:** Pressing `Escape` while the filter sheet is open closes it and returns focus to the filter trigger button.

**Design reference:** `docs/design/mockups/transactions-list.html`

**If Next.js:** This page must be a Client Component (`'use client'`) because it uses hooks and browser APIs. Add `export const metadata` for SEO in a separate `app/(app)/transactions/layout.tsx`: `title: 'Transactions | Finora'`, `description: 'Browse and manage your income, expenses, and transfers.'`.

## Verification

I'll verify this implementation automatically. I can:

- Navigate to `/transactions` while loading → expect 8 skeleton cards, no layout shift when data arrives.
- Navigate to `/transactions` with no transactions → expect EmptyState with "Add your first transaction" CTA.
- Apply a filter → expect URL to update to `/transactions?type=payment` and list to re-fetch.
- Scroll to the bottom of the list → expect `fetchNextPage` to be called and new transactions to appear.
- Press Tab → navigate through the filter chips → expect each chip to have a visible focus ring.
- Press Escape while the mobile filter drawer is open → expect it to close and focus to return to the filter button.
- Disconnect Wi-Fi → navigate to `/transactions` → expect ErrorState with retry button, not a blank page.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Open `/transactions` → verify list loads within 1 second on a normal connection.
- Apply a Type filter (e.g., "Payment") → verify URL changes to `?type=payment` → refresh the page → verify the filter is still active after refresh (URL is read on page load).
- Scroll to the bottom of a long list → verify more transactions load automatically (no button required).
- Switch to a screen reader (macOS VoiceOver or NVDA on Windows) → navigate to the page → verify the heading "Transactions" is announced, the filter button label is announced, and each transaction card announces its description and amount.

Then give me your honest assessment of:

- Whether syncing filter state to URL query params AND a Zustand store creates a source-of-truth conflict — specifically, what happens when the user uses the browser back button to return to a filtered view after navigating to a detail page: does the Zustand store get out of sync with the URL, and which one wins?
