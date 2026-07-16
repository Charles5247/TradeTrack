# Example: Error Handling Prompts (Phase 10)

> Shows what Phase 10 prompts look like. Error handling is addressed feature-by-feature — each prompt covers one failure domain and ensures users never see a broken state, blank screen, or raw error code. Context: Finora, Phases 1–9 complete.

---

## [ ] [177] We're implementing global error boundaries and feature-specific graceful failure for all networked operations in Finora — ensuring users always receive a meaningful message and a recovery path when something goes wrong.

**The error handling philosophy for Finora —** There are three tiers of failure: (1) infrastructure failures (the whole app is down — handled by Next.js's root `error.tsx`), (2) feature failures (a specific data fetch fails — handled by feature-level error states, already included in each Page prompt), (3) action failures (a user action fails — handled by toast notifications). This prompt wires all three tiers and adds the missing cases.

**Root error boundary —** Next.js's `app/error.tsx` is the last line of defense. It catches any unhandled error in the app shell. The page renders: the Finora logo, a generic "Something went wrong" message (no technical details), a "Reload page" button that calls `reset()`, and a "Contact support" link. It logs the error to Sentry (without PII) before rendering.

**Global toast system —** All action failures (failed mutations, network errors in user-triggered operations) are communicated via toast notifications. Use shadcn/ui `Sonner` for toast management. The toast system is initialized once in `app/(app)/layout.tsx`. Toasts for errors: red background using `--color-error-subtle`, `AlertCircle` icon, concise message (max 80 characters), optional "Retry" action button. Toasts for success: `--color-success-subtle`, `CheckCircle2` icon, auto-dismiss after 3 seconds. Toasts for warnings: `--color-warning-subtle`, `AlertTriangle` icon, does not auto-dismiss.

**TanStack Query global error handler —** Add an `onError` callback to the `QueryClient` config that: (1) detects 401 responses and triggers the session expiry flow (clear auth store, redirect to `/login?redirect={currentPath}`), (2) does NOT show a toast for 401 errors (the redirect handles the UX), (3) shows a toast for all other 5xx errors: "Connection error. Check your internet and try again." This prevents double-error-states (the page's ErrorState component handles the inline error, and the toast provides additional context).

**Feature-specific error messages —** For each feature area, define human-readable error messages that correspond to the API's error codes:

- `RATE_LIMITED`: "You're doing that too quickly. Please wait a moment and try again."
- `NOT_FOUND`: "[Resource] not found or may have been deleted."
- `VALIDATION_ERROR`: "Please check the form for errors." (form-level errors shown inline)
- `FORBIDDEN`: "You don't have permission to do this."
- `SERVER_ERROR`: "Something went wrong on our end. We've been notified and are looking into it."
- Network failure (fetch rejected): "Couldn't connect. Check your internet connection."

## Instructions

**Install Sonner:** `npm install sonner`

**`app/error.tsx structure —`** Client component. Accepts `{ error: Error, reset: () => void }` props. Logs the error to `console.error` in development, to Sentry in production (wrap in `process.env.NODE_ENV === 'production'` check — no PII in the log). Renders: Finora logo image, `<h1>` with text `'Something went wrong'`, a paragraph with text `'We've been notified and are working on a fix.'`, a 'Reload page' button that calls `reset()`, and an anchor link to `mailto:support@finora.app` with text 'Contact support'. All styled using CSS variable tokens from `design.md`.

**`app/(app)/layout.tsx`** — add `<Toaster richColors position="top-right" duration={3000} />` from `sonner` at the root.

**`QueryClient mutation error handler —`** In the `defaultOptions.mutations.onError` callback: cast the error to `{ code?: string; status?: number }`. If `status === 401`: return without showing a toast (session expiry is handled separately by the auth sync hook). For all other errors: call `toast.error(getErrorMessage(err.code))` where `getErrorMessage` returns the user-facing string for the code, or `'Something went wrong. Please try again.'` as the fallback.

**`lib/errors/messages.ts —`** Export a `getErrorMessage(code?: string): string | undefined` function. Internally uses a plain object mapping error codes to user-facing strings. Required mappings: `RATE_LIMITED` → `'You're doing that too quickly. Please wait a moment and try again.'`, `NOT_FOUND` → `'This item was not found or may have been deleted.'`, `FORBIDDEN` → `'You don't have permission to do this.'`, `SERVER_ERROR` → `'Something went wrong on our end. We've been notified and are looking into it.'`. Returns `undefined` for unmapped codes so callers can provide their own fallback.

**Session expiry handler** — update `lib/hooks/useAuthSync.ts` to listen for 401 responses. Add an Axios interceptor or a TanStack Query `onError` that checks for `status === 401`, then:

1. Calls `useAuthStore.getState().setUser(null)`
2. Shows a toast: `toast.warning('Your session expired. Please sign in again.')`
3. Calls `router.push('/login?redirect=' + encodeURIComponent(window.location.pathname))`

## Verification

I'll verify this implementation automatically. I can:

- Trigger an unhandled error in a component (e.g., throw inside a useEffect) → expect the `error.tsx` boundary to render with the Finora logo and "Something went wrong" message, not a blank screen or browser error page.
- Call `useSoftDeleteTransaction.mutate()` → mock the API to return a 500 → expect a toast notification with the `SERVER_ERROR` message, not just a broken UI state.
- Mock a 401 response from `/api/transactions` → expect the auth store to be cleared and the user redirected to `/login?redirect=...` → expect NO error toast to appear (session expiry has its own warning toast, not an error toast).
- Call `useCreateTransaction.mutate()` → mock a `RATE_LIMITED` response → expect the toast message "You're doing that too quickly. Please wait a moment and try again."
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Disconnect Wi-Fi while on the Transactions page → try creating a transaction → expect a toast: "Couldn't connect. Check your internet connection." — not a blank form submission or a spinner that never resolves.
- Let the session cookie expire (manually delete it) → perform any action → expect a warning toast and redirect to the login page.

Then give me your honest assessment of:

- Whether the global `onError` mutation handler in the QueryClient config will conflict with feature-level `onError` handlers in individual `useMutation` calls — specifically, whether both the global handler AND the local handler will run for the same error, causing duplicate toasts.

---

## [ ] [178] We're implementing offline detection and graceful degradation — so Finora users always know their connection status and the app never silently fails when they're offline.

**Network status detection —** A `useNetworkStatus` hook listens to the browser's `online` and `offline` events and reads `navigator.onLine`. It returns `{ isOnline: boolean }`. This hook drives: (1) an offline banner at the top of the app shell, (2) disabled form submit buttons when offline.

**Offline banner —** When `isOnline === false`, a banner appears between the header and the main content area in `app/(app)/layout.tsx`. Content: `WifiOff` icon (Lucide) + "You're offline. Changes will sync when you reconnect." Background: `--color-warning-subtle`. Text: `--color-warning-foreground`. The banner slides in from the top using `--duration-slow` and `--ease-spring`. When the connection restores, the banner slides out and a success toast appears: "You're back online!" (auto-dismiss 3s).

**Cached data indicator —** The TransactionListPage (built in [118]) shows a subtle "Showing cached data" indicator in the list header when `isOnline === false`. This is a small badge with `--color-warning-subtle` background. When online, this badge is not visible (even if TanStack Query is serving cached data — the badge only shows when definitively offline).

**Disabled form submit —** The CreateTransactionModal's submit button is disabled when `isOnline === false`. It shows a tooltip on hover/focus: "You're offline. Connect to save transactions." Use the `title` attribute for the tooltip (accessible by default).

## Instructions

**`lib/hooks/useNetworkStatus.ts —`** Client hook. Initialises `isOnline` state from `navigator.onLine` (with an `undefined` guard for SSR). Adds `window` event listeners for `'online'` and `'offline'` in a `useEffect`. The `'online'` handler sets `isOnline: true` and calls `toast.success('You\'re back online!')`. The `'offline'` handler sets `isOnline: false`. Returns the cleanup function from the `useEffect` to remove both listeners on unmount. Returns `{ isOnline: boolean }`.

**`components/shared/OfflineBanner.tsx —`** Accepts `{ isOnline: boolean }`. Root element has `role='alert'` and `aria-live='polite'`. When `isOnline` is false: visible, amber background using `--color-warning-subtle`, amber text using `--color-warning-foreground`, `WifiOff` Lucide icon (size 14, `aria-hidden`), text `'You're offline. Changes will sync when you reconnect.'` When `isOnline` is true: height collapses to zero and opacity to zero via CSS transition using `--duration-slow`. Never unmounts — it transitions in and out.

**Update `app/(app)/layout.tsx`:**

```typescript
const { isOnline } = useNetworkStatus()
// Add between header and <main>:
<OfflineBanner isOnline={isOnline} />
```

**Update CreateTransactionModal submit button:**

```typescript
const { isOnline } = useNetworkStatus()
<button
  type="submit"
  disabled={!isOnline || isSubmitting}
  title={!isOnline ? "You're offline. Connect to save transactions." : undefined}
>
  {isSubmitting ? <LoadingSpinner size="sm" /> : 'Save transaction'}
</button>
```

## Verification

I'll verify this implementation automatically. I can:

- Render `<OfflineBanner isOnline={false} />` → expect `role="alert"` and the offline message to be visible.
- Render `<OfflineBanner isOnline={true} />` → expect `opacity-0` class and message not visible.
- Call `useNetworkStatus()` → dispatch a `new Event('offline')` on `window` → expect `isOnline` to become `false`.
- Dispatch a `new Event('online')` → expect `isOnline` to become `true` and a success toast to appear.
- Render the CreateTransactionModal with `isOnline: false` → expect submit button to be disabled.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Open Finora in Chrome → DevTools → Network tab → select "Offline" from the throttling dropdown → verify the offline banner slides in from the top within 1 second.
- Try to submit the create transaction form while offline → verify the button is disabled and shows a tooltip.
- Re-enable the network → verify the banner slides out and a "You're back online!" toast appears.

Then give me your honest assessment of:

- Whether `navigator.onLine` and the `online`/`offline` browser events are reliable enough for a production app — specifically, whether there are cases (like a network with internet access blocked by a firewall) where `navigator.onLine` reports `true` even though API calls will fail, and how to handle this case.
