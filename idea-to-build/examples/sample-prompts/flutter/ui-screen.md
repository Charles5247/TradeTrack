# Example: Flutter Page Prompts (Phase 7)

> Flutter-specific Phase 7 prompts. Each screen is a `ConsumerWidget` with explicit loading, empty, error, and success states. Components from Phase 6 are referenced by exact name and prompt number.

---

## [ ] [112] We need the TransactionListScreen for Finora Flutter — the primary screen where users browse, filter, search, and paginate through all of their transactions.

**Layout —** A `Scaffold` with no `AppBar`. Instead, a `CustomScrollView` containing a `SliverAppBar` with `floating: true`, `snap: true` (it hides on scroll and snaps back when the user scrolls up). The sliver content contains: the filter chip row, the search bar (collapses into the SliverAppBar on scroll), and the transaction list as a `SliverList`. A `FloatingActionButton` with a `+` icon navigates to `/transactions/new`.

**Loading state —** When `transactionsProvider` is in `AsyncLoading`, show a `SliverList` of 8 `TransactionCardSkeleton` widgets (built in Phase 6). The skeleton must match the exact height of `TransactionCard` to prevent layout shift.

**Empty state (no transactions) —** When the loaded list is empty and no filters are active: show a `SliverFillRemaining` containing `EmptyState` (built in Phase 6) with icon: `Icons.receipt_long_outlined`, title: "No transactions yet", description: "Tap the + button to add your first transaction.", action: navigates to `/transactions/new`.

**Empty state (filters active, no results) —** When the loaded list is empty and at least one filter is active: `EmptyState` with icon: `Icons.search_off`, title: "No matching transactions", description: "Try clearing some filters.", action: calls `ref.read(transactionFiltersProvider.notifier).clearFilters()`.

**Error state —** When `transactionsProvider` is in `AsyncError`: `SliverFillRemaining` containing `ErrorState` (built in Phase 6) with `onRetry: () => ref.invalidate(transactionsProvider)`. Never show raw error messages — only the user-friendly copy from `ErrorState`.

**Filter chips —** A horizontal `SingleChildScrollView` with `scrollDirection: Axis.horizontal` containing `FilterChip` widgets for each active filter. Each chip's label shows the filter value (e.g., "Type: Payment"). Tapping a chip clears that specific filter. Styled with the primary color for active chips.

**Pagination —** When the user scrolls to the last item in the list, call `ref.read(transactionsProvider.notifier).fetchNextPage()`. Detect this using a `ScrollController` on the `CustomScrollView`: trigger when `scrollController.position.pixels >= scrollController.position.maxScrollExtent - 200`. Show a `CircularProgressIndicator` with size 24 in a centered `SliverToBoxAdapter` while the next page is loading.

**Pull to refresh —** `RefreshIndicator` wrapping the `CustomScrollView`. On refresh: `ref.invalidate(transactionsProvider)`.

**Accessibility —** The FAB has `tooltip: 'Add transaction'`. Each `TransactionCard` is wrapped in `Semantics` with `label` set to: "Transaction: {description}, {formattedAmount}, {status}". The loading state has `Semantics(label: 'Loading transactions', child: ...)` on the skeleton list.

## Instructions

**File:** `lib/features/transactions/screens/transaction_list_screen.dart`

**Class declaration —** `TransactionListScreen extends ConsumerStatefulWidget`. The corresponding `State` class holds a `ScrollController` (for pagination detection) and disposes it in `dispose()`.

**Providers consumed —**

- `transactionsProvider` (built in Phase 5): provides `AsyncValue<TransactionPage>`
- `transactionFiltersProvider` (built in Phase 5): provides current filter state
- `categoriesProvider` (built in Phase 5): provides categories for the filter UI

**Filter chip row —**
Defined as a private method `_buildFilterChips(BuildContext context, WidgetRef ref)`. Returns a `Padding`-wrapped `SingleChildScrollView` with a `Row` of `FilterChip` widgets. Only render chips for active filters (non-null filter values). The row is only visible when at least one filter is active (check `filtersState.hasActiveFilters`).

**Pagination scroll listener —**
In `initState`, add a listener to the `ScrollController`. In the listener: if `pixels >= maxScrollExtent - 200` AND `!transactionsState.isLoadingNextPage` AND `transactionsState.hasNextPage`, call `ref.read(transactionsProvider.notifier).fetchNextPage()`.

**`SliverList` for transactions —**
Use `SliverList.builder` with `itemCount: transactions.length + (hasNextPage ? 1 : 0)`. For the last item (when `hasNextPage` is true), return the `CircularProgressIndicator` loader. For all other items, return `TransactionCard` wrapped in `Semantics`.

**Navigation —**
FAB `onPressed`: `context.push('/transactions/new')`.
`TransactionCard` `onTap`: `context.push('/transactions/${transaction.id}')`.

**Design reference:** `docs/design/mockups/transactions-list.html`

## Verification

I'll verify this implementation automatically. I can:

- Navigate to the screen while `transactionsProvider` is in `AsyncLoading` → expect 8 `TransactionCardSkeleton` widgets, no layout shift when data arrives.
- Navigate with no transactions → expect `EmptyState` with "No transactions yet".
- Apply a Type filter → expect filter chips to appear and the list to re-filter.
- Scroll to the bottom of a long list → expect `fetchNextPage` to be called and new cards to appear.
- Swipe down from the top → expect `RefreshIndicator` spinner and `ref.invalidate` to fire.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Run the app on a device → navigate to Transactions → verify list loads within 1 second.
- Enable TalkBack (Android) or VoiceOver (iOS) → navigate to the list → verify each transaction card announces "Transaction: {description}, {amount}, {status}" when focused.
- Enable airplane mode → pull to refresh → expect `ErrorState` with a "Try again" button — not a crash.

Then give me your honest assessment of:

- Whether the `ScrollController` offset threshold of 200px for pagination is the right value — specifically, whether it triggers too early (loading the next page before the user can see all current items) or too late (brief empty space visible before more items load) on different screen sizes.

---

## [ ] [113] We need the TransactionDetailScreen for Finora Flutter — the screen that shows all fields of a single transaction with edit and delete capabilities.

**Layout —** A `Scaffold` with a custom `AppBar` containing a back button (`ArrowBack` icon, calls `context.pop()`), the title "Transaction", and two action buttons: edit (pencil icon, navigates to `/transactions/:id/edit`) and a three-dot overflow menu containing "Delete". No `FloatingActionButton` on this screen.

**Content layout —** A `SingleChildScrollView` containing a `Column`. Sections in order: (1) amount hero section — large display of the formatted amount and type icon, center-aligned, amount in the type's color (green for income, red for expense, neutral for transfer); (2) details card — a `Card` with `ListTile` rows for: description, counterparty (if not null), category (if not null — shows category name, not ID), date (full format: "Monday, June 12, 2024 at 10:30 AM"), status badge; (3) tags section (if `tags` is not empty) — a wrap of `Chip` widgets; (4) receipt section (if `receiptUrl` is not null) — a full-width `CachedNetworkImage` that is tappable to open in full-screen with pinch-to-zoom; (5) notes section (if `notes` is not null).

**Loading state —** Show a `CircularProgressIndicator` centered on the screen while the transaction is being fetched.

**Error state —** If the transaction is not found or cannot be fetched: `ErrorState` with `onRetry: () => ref.invalidate(transactionProvider(transactionId))`. If the transaction belongs to another user (permission denied): `ErrorState` with title "Transaction not found" (do not reveal that it exists but is forbidden).

**Delete action —** Tapping "Delete" in the overflow menu opens a `showModalBottomSheet` (not a `showDialog` — bottom sheet is more mobile-native for destructive actions). The bottom sheet contains: warning icon, "Delete this transaction?", "This action cannot be undone. The transaction will be permanently removed from your records." (note: "permanently" refers to the user's visible records — it is a soft delete in Firestore), two buttons: "Cancel" (pops the sheet) and "Delete" (red color, calls `softDeleteTransaction`, then pops the sheet and navigates back to the list).

**After delete —** Call `ref.read(transactionRepositoryProvider).softDeleteTransaction(transactionId)`. While the delete is in progress, show a loading state on the delete button in the bottom sheet. On success: show a `SnackBar` on the previous screen (transactions list) saying "Transaction deleted". On error: show a `SnackBar` on the current screen saying "Couldn't delete transaction. Please try again."

## Instructions

**File:** `lib/features/transactions/screens/transaction_detail_screen.dart`

**Route parameter —**
The screen receives `transactionId` as a `String` from the route path parameter. In GoRouter, declare the route as `/transactions/:id` and extract the param via `GoRouterState.pathParameters['id']`.

**Providers consumed —**

- `transactionProvider(transactionId)` (a family provider built in Phase 5): provides `AsyncValue<Transaction?>`
- `categoryByIdProvider(categoryId)` (built in Phase 5): provides `Category?` for the category display
- `transactionRepositoryProvider` (built in [9]): for the softDelete mutation

**Amount display section —**
The amount is formatted using `NumberFormat.currency(locale: user.locale, symbol: transaction.currency)` from the `intl` package. The icon is the same type icon mapping used in `TransactionCard` (built in Phase 6). Both are in a `Container` with `--color-surface-elevated` background and `--radius-lg` border radius, centered with generous padding.

**Receipt full-screen viewer —**
When `receiptUrl` is not null, show a `CachedNetworkImage` (package: `cached_network_image`). Wrap it in a `GestureDetector` with `onTap` that pushes a new route using `context.push('/transactions/${transaction.id}/receipt')`. The receipt route shows the image in an `InteractiveViewer` that allows pinch-to-zoom.

**Delete bottom sheet —**
Call `showModalBottomSheet` with `isScrollControlled: false`, `shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16)))`. Inside, the delete button uses a `StatefulBuilder` to show a loading state while the async delete is in progress.

**Post-delete navigation —**
After successful delete, `context.pop()` to return to the transactions list. Use `context.read<MessengerKey>()` or a Riverpod provider to pass the "Transaction deleted" snackbar message to the list screen. Alternatively, the list screen can detect the return via `GoRouter`'s `onExit` callback and show the snackbar if the return was due to a delete action.

**Design reference:** `docs/design/mockups/transaction-detail.html`

## Verification

I'll verify this implementation automatically. I can:

- Navigate to a transaction with all fields populated → expect all sections to render (amount, details, tags, receipt, notes).
- Navigate to a transaction with null `counterparty`, null `receiptUrl`, empty `tags`, null `notes` → expect those sections to be completely hidden.
- Tap "Delete" → expect the bottom sheet to appear (not a dialog).
- Tap "Cancel" in the bottom sheet → expect the sheet to dismiss and the screen to remain.
- Tap "Delete" in the bottom sheet → mock the delete to succeed → expect navigation back to the list with a SnackBar.
- Tap "Delete" → mock the delete to fail → expect an error SnackBar on the detail screen with "Couldn't delete transaction."
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Navigate to a transaction with a receipt image → tap the image → verify it opens full-screen → pinch to zoom in → verify zoom works → swipe down to dismiss.
- Delete a transaction → return to the list → verify the deleted transaction no longer appears.
- Enable VoiceOver/TalkBack → navigate to the detail screen → verify the amount section announces the amount and type, the delete button announces "Delete transaction" when focused.

Then give me your honest assessment of:

- Whether using `showModalBottomSheet` for the delete confirmation (instead of `showDialog`) is universally better for mobile UX — or whether there are cases (small-screen devices, users in landscape orientation) where a dialog would be more appropriate and less likely to be accidentally triggered.
