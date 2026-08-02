import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

// Routes that require authentication
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/products",
  "/inventory",
  "/pos",
  "/sales",
  "/warehouses",
  "/transfers",
  "/vendors",
  "/reports",
  "/audit",
  "/notifications",
  "/users",
  "/subscriptions",
  "/settings",
  "/admin",
  "/merchants",
];

// Auth-only routes (redirect logged-in users away from these)
const AUTH_ROUTES = ["/login", "/forgot-password"];
const OFFLINE_AUTH_COOKIE_NAME = "tradetrack-offline-session";

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route),
  );
}

export function shouldForceLogin(
  pathname: string,
  user: unknown,
  authCheckFailed: boolean,
  hasSupabaseSessionCookie: boolean,
  hasOfflineAuthCookie = false,
): boolean {
  if (!isProtectedRoute(pathname)) return false;
  if (user) return false;

  // Offline-first auth: if we still have a valid browser session cookie or
  // the app-owned offline auth cookie, we should keep the user in the app even
  // when Supabase's live getUser() call resolves with null or fails.
  if (hasSupabaseSessionCookie || hasOfflineAuthCookie) return false;

  return !authCheckFailed || !hasSupabaseSessionCookie || !hasOfflineAuthCookie;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: Do not add logic between createServerClient and
  // supabase.auth.getUser(). A subtle bug exists in refreshing
  // the session with server components if done incorrectly.
  //
  // NOTE ON OFFLINE/FLAKY CONNECTIVITY:
  // getUser() makes a live network call to Supabase to verify the session.
  // On unstable market connectivity this call can fail even though the
  // trader has a valid, previously-cached session. We must NOT treat a
  // network/verification failure the same as "genuinely logged out" — that
  // was forcing traders to /login on every refresh whenever the network
  // blipped, which defeats the offline-first design.
  let user = null;
  let authCheckFailed = false;

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Network unavailable or Supabase unreachable — do not assume logged out.
    authCheckFailed = true;
  }

  const { pathname } = request.nextUrl;

  // A previously-issued Supabase session cookie existing tells us this
  // browser has authenticated before. If getUser() couldn't be verified
  // (offline/flaky network) but that cookie is still present, let the
  // request through and defer to the client-side AuthProvider, which can
  // fall back to the cached IndexedDB session. Only force a redirect when
  // we're confident there's genuinely no session at all.
  //
  // IMPORTANT: supabase-js itself clears its OWN sb-*-auth-token cookie
  // whenever a background token-refresh attempt fails outright — which it
  // will, roughly whenever the access token's ~1hr lifetime is up, offline
  // or not. So relying on that cookie alone means offline access silently
  // breaks partway through a session once that timer fires. tt_offline_session
  // is a separate, app-owned cookie (see src/lib/offline/auth-cache.ts)
  // that Supabase has no power to touch, set on every successful login —
  // check that too.
  const hasSupabaseSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  const hasOfflineAuthCookie = request.cookies.has(OFFLINE_AUTH_COOKIE_NAME);

  const shouldRedirectToLogin = shouldForceLogin(
    pathname,
    user,
    authCheckFailed,
    hasSupabaseSessionCookie,
    hasOfflineAuthCookie,
  );

  if (isProtectedRoute(pathname) && shouldRedirectToLogin) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthRoute(pathname)) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  // Redirect root to dashboard
  if (user && pathname === "/") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}
