<<<<<<< HEAD
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
=======
import { DashboardLayout } from '@/components/layout/dashboard-layout';
>>>>>>> bc81cdde09fe9e08d926018710b30e283dc5c220

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
<<<<<<< HEAD
  const supabase = await createClient();

  if (!supabase) {
    return <DashboardLayout>{children}</DashboardLayout>;
  }

  // NOTE ON OFFLINE/FLAKY CONNECTIVITY:
  // This mirrors src/lib/supabase/middleware.ts's reasoning exactly, and
  // for the same reason: getUser() makes a live network call, so it will
  // fail (throw, or resolve with user: null) whenever Supabase is
  // unreachable — even for a trader who has a perfectly valid, previously
  // cached session. This layout runs on EVERY navigation to any
  // /(dashboard) route, so if it hard-redirects on a network failure, it
  // silently undoes all offline-login work done at the login page and in
  // middleware.ts — which is exactly what was happening: middleware let
  // the request through via the session cookie, but this layout then
  // redirected to /login anyway on its own, unguarded getUser() call.
  let user = null;
  let authCheckFailed = false;

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    authCheckFailed = true;
  }

  if (!user) {
    // A previously-issued Supabase session cookie tells us this browser
    // has authenticated before. If we couldn't verify it live (offline/
    // flaky network), don't force a redirect — let the request through
    // and defer to the client-side AuthProvider, which restores the
    // cached IndexedDB/localStorage session. Only redirect when we're
    // confident there's genuinely no session at all (online and
    // confirmed logged out, or offline with no session cookie ever set).
    //
    // IMPORTANT: supabase-js clears its OWN sb-*-auth-token cookie
    // whenever a background token-refresh attempt fails outright — which
    // happens routinely offline (roughly once an hour, on the access
    // token's expiry). tt_offline_session is a separate, app-owned
    // cookie (see src/lib/offline/auth-cache.ts) set on every successful
    // login that Supabase has no power to touch — check that too, or
    // offline access silently breaks partway through a session the
    // moment that refresh timer fires.
    const cookieStore = await cookies();
    const hasSupabaseSessionCookie = cookieStore
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    const hasOfflineSessionCookie = cookieStore.has("tt_offline_session");

    const shouldForceLogin =
      !authCheckFailed ||
      (!hasSupabaseSessionCookie && !hasOfflineSessionCookie);

    if (shouldForceLogin) {
      redirect("/login");
    }
  }

=======
>>>>>>> bc81cdde09fe9e08d926018710b30e283dc5c220
  return <DashboardLayout>{children}</DashboardLayout>;
}
