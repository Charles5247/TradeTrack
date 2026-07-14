'use client';

import React, { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import type { User } from '@/types';
import {
  cacheUserSession,
  clearCachedSession,
  getAnyCachedSession,
} from '@/lib/offline/db';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      try {
        // 1. Try online fetch first
        const { data: { user }, error } = await supabase.auth.getUser();

        if (user && !error) {
          // Fetch profile from database
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

          if (profile) {
            setUser(profile as User);
            // Cache session for offline use
            await cacheUserSession(user.id, profile as Record<string, unknown>);
          } else {
            setUser(null);
          }
        } else {
          // 2. Fall back to IndexedDB cached session (offline mode)
          const cached = await getAnyCachedSession();
          if (cached) {
            console.info('[offline] Using cached session for user:', cached.id);
            setUser(cached.profile as unknown as User);
          } else {
            setUser(null);
          }
        }
      } catch (networkErr) {
        // Network completely unavailable – try offline cache
        console.warn('[offline] Network unavailable, loading cached session');
        try {
          const cached = await getAnyCachedSession();
          if (cached) {
            setUser(cached.profile as unknown as User);
          } else {
            setUser(null);
          }
        } catch {
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    }

    loadUser();

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          try {
            const { data: profile } = await supabase
              .from('users')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profile) {
              setUser(profile as User);
              await cacheUserSession(session.user.id, profile as Record<string, unknown>);
            }
          } catch {
            // ignore
          }
        } else if (event === 'SIGNED_OUT') {
          // Clear cached session on explicit sign-out
          const { data: { user: currentUser } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
          if (currentUser) {
            await clearCachedSession(currentUser.id);
          }
          setUser(null);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Update cache on token refresh
          try {
            const { data: profile } = await supabase
              .from('users')
              .select('*')
              .eq('id', session.user.id)
              .single();
            if (profile) {
              await cacheUserSession(session.user.id, profile as Record<string, unknown>);
            }
          } catch {
            // ignore
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [setUser, setLoading]);

  return <>{children}</>;
}
