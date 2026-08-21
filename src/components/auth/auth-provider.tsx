"use client";

import React, { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore, useOrgStore } from "@/store";
import type { User } from "@/types";
import {
  cacheUserSession,
  clearCachedSession,
  getAnyCachedSession,
} from "@/lib/offline/db";
import {
  getOfflineAuthSession,
  clearOfflineAuthSession,
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

    const loadCachedUser = async () => {
      const cached = await getAnyCachedSession();
      const offlineSession = getOfflineAuthSession();
      if (cached) {
        setUser(cached.profile as unknown as User);
      } else if (offlineSession) {
        setUser(offlineSession.profile as unknown as User);
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
      // Do not call getUser() offline: it can attempt to refresh an expired
      // token and block the browser with repeated failed network requests.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await loadCachedUser();
        setLoading(false);
        return;
      }

      try {
        // 1. Try online fetch first
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (user && !error) {
          // Fetch profile from database
          const { data: profile } = await supabase
            .from("users")
            .select("*")
            .eq("id", user.id)
            .single();

          if (profile) {
            setUser(profile as User);
            // Cache session for offline use
            await cacheUserSession(user.id, profile as Record<string, unknown>);
            await loadOrgSettings((profile as User).organization_id);
          } else {
            setUser(null);
          }
        } else {
          // 2. Fall back to IndexedDB cached session (offline mode)
          await loadCachedUser();
        }
      } catch {
        // Network completely unavailable – try offline cache
        console.warn("[offline] Network unavailable, loading cached session");
        try {
          await loadCachedUser();
        } catch {
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    }

    loadUser();

    window.addEventListener("online", startOnlineAuth);
    window.addEventListener("offline", stopOfflineAuth);

    // Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        try {
          const { data: profile } = await supabase
            .from("users")
            .select("*")
            .eq("id", session.user.id)
            .single();

          if (profile) {
            setUser(profile as User);
            await cacheUserSession(
              session.user.id,
              profile as Record<string, unknown>,
            );
            await loadOrgSettings((profile as User).organization_id);
          }
        } catch {
          // ignore
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
          if (cached || offlineSession) {
            console.warn(
              "[offline] Ignoring SIGNED_OUT while offline — restoring cached session",
            );
            setUser(
              (cached?.profile ?? offlineSession?.profile) as unknown as User,
            );
            return;
          }
        }

        // Clear cached session on genuine sign-out
        const {
          data: { user: currentUser },
        } = await supabase.auth
          .getUser()
          .catch(() => ({ data: { user: null } }));
        if (currentUser) {
          await clearCachedSession(currentUser.id);
        }
        clearOfflineAuthSession();
        setUser(null);
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        // Update cache on token refresh
        try {
          const { data: profile } = await supabase
            .from("users")
            .select("*")
            .eq("id", session.user.id)
            .single();
          if (profile) {
            await cacheUserSession(
              session.user.id,
              profile as Record<string, unknown>,
            );
          }
        } catch {
          // ignore
        }
      }
    });

    return () => {
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
