# Example: Frontend Features Prompts (Phase 5)

> Shows what Phase 5 prompts look like. These hooks and providers are the client-side data layer — they sit between the backend API (Phase 4) and the UI components (Phase 6). They have no visual output. Context: Finora, Phases 1–4 complete.

---

## [ ] [68] We're building the TanStack Query setup and the useTransactions hook that fetches, caches, paginates, and invalidates the Finora transactions list with full filter support.

**TanStack Query configuration —** The `QueryClient` is configured in `lib/providers/query-provider.tsx` (shell created in [2]). Now add the full configuration: `staleTime: 30_000` (data is fresh for 30 seconds — no redundant refetches on tab switch), `retry: 2` (retry failed requests twice before showing an error), `retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000)` (exponential backoff: 1s, 2s, capped at 30s), `gcTime: 5 * 60 * 1000` (cache garbage collected after 5 minutes of inactivity).

**useTransactions hook —** This hook fetches the authenticated user's transactions using `useInfiniteQuery`. It accepts a `filters` argument that maps to the query parameters of GET /api/transactions (built in [42]). The hook handles: initial loading, fetching the next page (cursor-based), and re-fetching when filters change. When filters change, the query resets to page 1 (the cursor is cleared).

**Query key structure —** The query key must be structured to enable granular invalidation: `['transactions', { uid, ...filters }]`. When a transaction is created, updated, or deleted, the mutation invalidates `['transactions']` (all variations) using `queryClient.invalidateQueries({ queryKey: ['transactions'] })`.

**Filter state —** A Zustand store (`useTransactionFiltersStore`) holds the current filter state: `{ type, status, categoryId, dateFrom, dateTo, search }`. The `useTransactions` hook reads from this store. The filter components (built in Phase 6) write to this store. This decouples filter state from the TanStack Query key.

**Optimistic updates for soft-delete —** When a transaction is soft-deleted, immediately remove it from the cached list using `queryClient.setQueryData(...)` before the API call completes. If the API call fails, revert using `queryClient.cancelQueries()` and `context.previousData`.

## Instructions

**`lib/providers/query-provider.tsx`** — update with full `QueryClient` config as described above. Add `ReactQueryDevtools` in dev mode only (wrap in `process.env.NODE_ENV === 'development'` check).

**`lib/stores/transaction-filters-store.ts`:**

```typescript
import { create } from 'zustand';
import { TransactionType, TransactionStatus } from '@/lib/types/transaction';

interface TransactionFiltersState {
  type?: TransactionType;
  status?: TransactionStatus;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  setFilter: <K extends keyof Omit<TransactionFiltersState, 'setFilter' | 'clearFilters'>>(
    key: K,
    value: TransactionFiltersState[K]
  ) => void;
  clearFilters: () => void;
}

export const useTransactionFiltersStore = create<TransactionFiltersState>((set) => ({
  setFilter: (key, value) => set({ [key]: value }),
  clearFilters: () =>
    set({
      type: undefined,
      status: undefined,
      categoryId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      search: undefined,
    }),
}));
```

**`lib/hooks/useTransactions.ts`:**

- Use `useInfiniteQuery` from TanStack Query
- `queryKey`: `['transactions', { uid: user?.id, type, status, categoryId, dateFrom, dateTo, search }]`
- `queryFn`: `async ({ pageParam }) => fetch('/api/transactions?' + new URLSearchParams({ limit: '20', cursor: pageParam ?? '', ...activeFilters }).toString()).then(r => r.json())`
- `getNextPageParam`: `(lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined`
- `initialPageParam`: `undefined`
- Returns: the `useInfiniteQuery` result flattened — expose: `transactions` (flattened `items` from all pages), `isLoading`, `isError`, `error`, `fetchNextPage`, `hasNextPage`, `isFetchingNextPage`

**`lib/hooks/useTransactionMutations.ts`:**

- `useCreateTransaction`: `useMutation` that POSTs to `/api/transactions`, on success calls `queryClient.invalidateQueries({ queryKey: ['transactions'] })`
- `useSoftDeleteTransaction`: `useMutation` with optimistic update — on `onMutate`, snapshot current data, remove the deleted item from cache; on `onError`, restore snapshot; on `onSettled`, invalidate

**If Next.js:** These hooks are client-only — add `'use client'` to any file that uses them, or only import them from client components.

## Verification

I'll verify this implementation automatically. I can:

- Import `useTransactions` in a test component — render it with no filters — expect `isLoading: true` initially, then `transactions: Transaction[]` after the query resolves.
- Change a filter in `useTransactionFiltersStore` — expect `useTransactions` to re-fetch with the new filter parameter.
- Call `useSoftDeleteTransaction.mutate(transactionId)` — expect the transaction to disappear from the list immediately (optimistic update), then reappear briefly if the API returns an error.
- Call `useCreateTransaction.mutate(newTransaction)` — after success, expect the transactions list to refetch and include the new transaction.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Open the Finora transactions page → open React Query DevTools → verify the `['transactions', ...]` query appears, shows status, data, and cache time.
- Apply a type filter → verify the query key changes in DevTools and a new request fires.
- Delete a transaction → verify it disappears from the list instantly, and the query shows as refetching in the background.

Then give me your honest assessment of:

- Whether the optimistic delete approach correctly handles the case where the user soft-deletes a transaction while a background refetch is in progress — and whether TanStack Query's `onMutate` / `onError` / `onSettled` lifecycle correctly resolves this race condition.

---

## [ ] [69] We're building the useCategories hook and category mutations that power Finora's transaction categorization system.

**Category data model —** Categories are user-defined labels for transactions. Each category has: `id`, `userId`, `name` (1–30 chars), `color` (hex color string, e.g. `'#6366F1'`), `icon` (string — one of the supported Lucide icon names), `type` (one of `'income' | 'expense' | 'both'`), `isDefault` (boolean — seeded categories created by the Cloud Function), `transactionCount` (integer — maintained by Cloud Functions), `createdAt`, `updatedAt`, `isDeleted`.

**useCategories —** Uses `useQuery` (not infinite — all categories are loaded at once, as users rarely have more than 50). Query key: `['categories', { uid }]`. Fetches from GET `/api/categories`. Returns: `{ categories, isLoading, isError }`.

**Derived selectors —** Expose derived selectors as additional hooks to avoid re-computation in components:

- `useCategoriesByType(type: 'income' | 'expense' | 'both')` — returns only categories matching the given type
- `useCategoryById(id: string)` — returns a single category from the cached list (no additional fetch)

**Mutations —** `useCreateCategory`, `useUpdateCategory`, `useSoftDeleteCategory` — all invalidate `['categories']` on success. Creating a category that would duplicate an existing name (case-insensitive) is validated client-side before the API call.

## Instructions

**`lib/hooks/useCategories.ts`:**

```typescript
export function useCategories() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['categories', { uid: user?.id }],
    queryFn: () =>
      fetch('/api/categories').then((r) => r.json() as Promise<{ categories: Category[] }>),
    enabled: !!user,
    select: (data) => data.categories,
  });
}

export function useCategoriesByType(type: 'income' | 'expense' | 'both') {
  const { data: categories = [] } = useCategories();
  return categories.filter((c) => c.type === type || c.type === 'both');
}

export function useCategoryById(id: string) {
  const { data: categories = [] } = useCategories();
  return categories.find((c) => c.id === id) ?? null;
}
```

**`lib/hooks/useCategoryMutations.ts`:**

- `useCreateCategory`: validates no duplicate name before mutating, calls POST `/api/categories`, invalidates `['categories']`
- `useUpdateCategory`: calls PATCH `/api/categories/{id}`, invalidates `['categories']` and `['transactions']` (because transactions display category names)
- `useSoftDeleteCategory`: calls DELETE `/api/categories/{id}`, invalidates both query keys

## Verification

I'll verify this implementation automatically. I can:

- `useCategories()` when user is null → expect `enabled: false` → no network request fires.
- `useCategories()` when user is set → expect a fetch to `/api/categories` and `categories` array in the result.
- `useCategoriesByType('income')` → expect only categories with `type === 'income'` or `type === 'both'`.
- `useCategoryById('nonexistent-id')` → expect `null` without throwing.
- `useCreateCategory.mutate({ name: 'Food', color: '#F59E0B', icon: 'Utensils', type: 'expense' })` → expect `['categories']` query to invalidate and refetch.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Navigate to the Categories page → verify all categories load without error.
- Create a new category → verify it appears in the list without a page refresh.
- Delete a category → verify it disappears. Navigate to Transactions → verify no transaction references the deleted category with a broken state.

Then give me your honest assessment of:

- Whether invalidating `['transactions']` on every category update is too aggressive — specifically, whether it causes unnecessary refetches on the transactions page for users with large transaction lists, and whether a targeted invalidation approach would be better.
