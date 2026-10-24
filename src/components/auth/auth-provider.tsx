"use client";

import { withTimeout, AUTH_CHECK_TIMEOUT_MS } from "@/lib/utils/timeout";
import React, { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore, useOrgStore } from "@/store";
import type { User } from "@/types";
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import {
  cacheUserSession,
  clearCachedSession,
  getAnyCachedSession,
} from "@/lib/offline/db";
import {
  getOfflineAuthSession,
  clearOfflineAuthSession,
  isOfflineProfileFresh,
} from "@/lib/offline/auth-cache";
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();
  const {
    setCurrency,
    setOrganizationName,
    setOrganizationAddress,
    setOrganizationPhone,
  } = useOrgStore();

  useEffect(() => {
    const supabase = createClient();
    let authRevision = 0;

    const loadCachedUser = async (revision = authRevision) => {
      const cached = await getAnyCachedSession();
      const offlineSession = getOfflineAuthSession();
      if (revision !== authRevision) return;
      if (offlineSession) {
        setUser(offlineSession.profile as unknown as User);
      } else if (cached && isOfflineProfileFresh(cached.profile,cached.cached_at)) {
        setUser(cached.profile as unknown as User);
      } else {
        setUser(null);
      }
    };

    const startOnlineAuth = () => {
      void supabase.auth.startAutoRefresh();
    };
    const stopOfflineAuth = () => {
      void supabase.auth.stopAutoRefresh();
    };

    if (typeof navigator !== "undefined" && navigator.onLine) {
      startOnlineAuth();
    } else {
      stopOfflineAuth();
    }

    async function loadOrgSettings(organizationId: string | undefined) {
      if (!organizationId) return;
      try {
        const { data: org } = await supabase
          .from("organizations")
          .select("currency, name, address, phone")
          .eq("id", organizationId)
          .single();
        if (org) {
          if (useAuthStore.getState().user?.organization_id !== organizationId) return;
          if (org.currency) setCurrency(org.currency);
          if (org.name) setOrganizationName(org.name);
          setOrganizationAddress(org.address || "");
          setOrganizationPhone(org.phone || "");
        }
      } catch {
        // Non-fatal: fall back to persisted/default currency & org name
      }
    }

    async function loadUser() {
      const revision = ++authRevision;
      // Do not call getUser() offline: it can attempt to refresh an expired
      // token and block the browser with repeated failed network requests.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await loadCachedUser(revision);
        if (revision === authRevision) setLoading(false);
        return;
      }

      try {
        // 1. Try online fetch first
        const {
          data: { user },
          error,
        } = await withTimeout(supabase.auth.getUser(), AUTH_CHECK_TIMEOUT_MS);

        if (error) throw error;
        if (user) {
          // Fetch profile from database
          const { data: profile } = await supabase
            .from("users")
            .select("*")
            .eq("id", user.id)
            .single();

          if (revision !== authRevision) return;
          if (profile?.status === 'active') {
            setUser(profile as User);
            // Cache session for offline use
            await cacheUserSession(user.id, profile as Record<string, unknown>);
            await loadOrgSettings((profile as User).organization_id);
          } else {
            setUser(null);
            clearOfflineAuthSession();
            if (profile) await cacheUserSession(user.id, profile as Record<string, unknown>);
            else await clearCachedSession(user.id);
          }
        } else {
          // A confirmed missing online session must not resurrect a cached user.
          if (revision === authRevision) setUser(null);
        }
      } catch (error) {
        if (revision !== authRevision) return;
        if (!isAuthRetryableFetchError(error) && !(error instanceof TypeError) &&
            !(error instanceof Error && error.message === 'Operation timed out')) {
          clearOfflineAuthSession();
          setUser(null);
          return;
        }
        // Network completely unavailable – try offline cache
        console.warn("[offline] Network unavailable, loading cached session");
        try {
          await loadCachedUser(revision);
        } catch {
          setUser(null);
        }
      } finally {
        if (revision === authRevision) setLoading(false);
      }
    }

    loadUser();

    window.addEventListener("online", startOnlineAuth);
    window.addEventListener("offline", stopOfflineAuth);

    // Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED'].includes(event)) return;
      const revision = ++authRevision;
      // Return synchronously so Supabase can release its auth lock before
      // profile queries acquire the session. Revisions guard late responses.
      void (async () => {
        if (event === "SIGNED_IN" && session?.user) {
          if (useAuthStore.getState().user?.id !== session.user.id) {
            setUser(null);
            setLoading(true);
          }
          try {
            const { data: profile } = await supabase
              .from("users")
              .select("*")
              .eq("id", session.user.id)
              .single();

            if (revision !== authRevision) return;
            if (profile?.status === 'active') {
              setUser(profile as User);
              await cacheUserSession(
                session.user.id,
                profile as Record<string, unknown>,
              );
              await loadOrgSettings((profile as User).organization_id);
            } else {
              setUser(null);
              clearOfflineAuthSession();
              if (profile) await cacheUserSession(session.user.id, profile as Record<string, unknown>);
              else await clearCachedSession(session.user.id);
            }
          } catch {
            // ignore
          } finally {
            if (revision === authRevision) setLoading(false);
          }
        } else if (event === "SIGNED_OUT") {
          // supabase-js emits SIGNED_OUT both for an explicit sign-out
          // AND when its background token-auto-refresh fails outright
          // (e.g. no network at the moment the access token needed
          // refreshing). Blindly clearing the session on every SIGNED_OUT
          // would silently log an offline trader out from under them —
          // exactly what the rest of this offline design exists to
          // prevent. If we're offline and still have a cached session to
          // fall back to, treat this as a failed-refresh false alarm
          // rather than a real sign-out.
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            const cached = await getAnyCachedSession();
            const offlineSession = getOfflineAuthSession();
            if (revision !== authRevision) return;
          const validCached=cached && isOfflineProfileFresh(cached.profile,cached.cached_at) ? cached : null;
          if (validCached || offlineSession) {
              console.warn(
                "[offline] Ignoring SIGNED_OUT while offline — restoring cached session",
              );
              setUser(
              (offlineSession?.profile ?? validCached?.profile) as unknown as User,
              );
              return;
            }
          }

          // Clear the captured account locally; do not call auth methods from
          // the auth event callback or clear a new account after an await.
          const currentUser = useAuthStore.getState().user;
          clearOfflineAuthSession();
          setUser(null);
          setLoading(false);
          if (currentUser) await clearCachedSession(currentUser.id);
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          // Update cache on token refresh
          try {
            const { data: profile } = await supabase
              .from("users")
              .select("*")
              .eq("id", session.user.id)
              .single();
            if (revision !== authRevision) return;
            if (profile?.status === 'active') {
              setUser(profile as User);
              await cacheUserSession(
                session.user.id,
                profile as Record<string, unknown>,
              );
            } else {
              setUser(null);
              clearOfflineAuthSession();
              if (profile) await cacheUserSession(session.user.id, profile as Record<string, unknown>);
              else await clearCachedSession(session.user.id);
            }
          } catch {
            // ignore
          }
        }
      })();
    });

    return () => {
      authRevision++;
      window.removeEventListener("online", startOnlineAuth);
      window.removeEventListener("offline", stopOfflineAuth);
      subscription.unsubscribe();
    };
  }, [
    setUser,
    setLoading,
    setCurrency,
    setOrganizationName,
    setOrganizationAddress,
    setOrganizationPhone,
  ]);

  return <>{children}</>;
}
