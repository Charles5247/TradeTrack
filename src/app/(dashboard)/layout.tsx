import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Keep the user on the dashboard when the live auth call fails but the
    // offline session cookie is still present. This is intentional for
    // offline-first access.
  }

  if (!user) {
    const cookieStore = await cookies();
    const hasSupabaseSessionCookie = cookieStore
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    const hasOfflineSessionCookie = cookieStore.has(
      "tradetrack-offline-session",
    );

    // When the network is down, a null user result from Supabase is not proof
    // of a logged-out user. If either session cookie is still present, keep the
    // user on the dashboard and let the client-side auth provider restore the
    // cached session instead of forcibly bouncing them to /login.
    const shouldForceLogin =
      !hasSupabaseSessionCookie && !hasOfflineSessionCookie;

    if (shouldForceLogin) {
      redirect("/login");
    }
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
