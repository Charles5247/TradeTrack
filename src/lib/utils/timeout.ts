/**
 * TradeTrack - Promise timeout helper
 *
 * Supabase's own client retries certain failure classes (a fully
 * unreachable network, or an access token that happens to be near/past
 * expiry when the connection is down) internally with exponential backoff
 * before finally rejecting `getUser()`/`signInWithPassword()` etc. That
 * backoff can legitimately run for up to ~30 seconds (see
 * `@supabase/auth-js`'s `retryable()`/`AUTO_REFRESH_TICK_DURATION_MS`) —
 * far too long to leave a request hanging, whether that's a cashier
 * staring at a frozen POS/dashboard navigation or a login form spinner.
 *
 * `withTimeout` bounds the wait: if `ms` elapses before `promise` settles,
 * the returned promise rejects immediately so the caller can fall back
 * (e.g. to a cached offline session) instead of blocking. The original
 * promise is left to resolve/reject on its own in the background — for
 * the read-only auth calls this wraps, that has no side effects worth
 * cancelling.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = "Operation timed out",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Every navigation to a protected route triggers at least one server-side
// `supabase.auth.getUser()` call (middleware.ts, and again in
// (dashboard)/layout.tsx). Both already treat a failed/thrown getUser()
// the same as "couldn't verify, fall back to the session cookie" — this
// bound just makes sure that fallback kicks in within a couple of seconds
// instead of after Supabase's own ~30s internal retry storm.
export const AUTH_CHECK_TIMEOUT_MS = 3000;
