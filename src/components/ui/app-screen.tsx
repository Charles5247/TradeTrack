'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { CommandPalette } from '@/components/layout/command-palette';
import { OrganizationProvider } from '@/components/shared/organization-provider';
import { SyncProvider } from '@/components/shared/sync-provider';
import { useAuthStore, useUIStore } from '@/store';
import { getOfflineAuthSession } from '@/lib/offline/auth-cache';
import { cn } from '@/lib/utils/cn';

interface AppScreenProps {
  children: React.ReactNode;
  /** POS/KDS screens force data-pos-mode="true" (README §9.2: big touch
   * targets, 64px collapsed sidebar). Mutually exclusive with `dense`. */
  pos?: boolean;
  /** Reports/Admin screens force data-dense-mode="true" (README §4.6 /
   * §9's density system: tighter row/input/button heights). */
  dense?: boolean;
  /** Skip the default `p-4 lg:p-6` content padding — used by screens
   * that need edge-to-edge layout (e.g. the POS full-screen grid). */
  noPadding?: boolean;
}

/**
 * New component per README §6.2 — "sidebar + header + page container.
 * Replaces the current dashboard-layout.tsx composition." See
 * design_files/shell.jsx → `AppScreen`.
 *
 * This is the single source of truth for the dashboard chrome + the
 * must_change_password / unauthenticated auth-guard redirect that used to
 * live only in `dashboard-layout.tsx`. `DashboardLayout` (used today by
 * `src/app/(dashboard)/layout.tsx`, the route-group layout wrapping all
 * ~19 existing dashboard pages) now simply renders `<AppScreen>` — so the
 * guard logic is preserved exactly, in one place, for every existing page
 * without requiring each page to individually adopt `<AppScreen>` yet.
 *
 * New/rebuilt screens (POS full-screen mode in Step 5, Production
 * extension screens in Step 8, etc.) that need `data-pos-mode` /
 * `data-dense-mode` or edge-to-edge layout should render `<AppScreen
 * pos|dense|noPadding>` directly instead of relying on the route-group
 * default, since the group layout can only apply one shared configuration
 * to every page beneath it.
 */
export function AppScreen({ children, pos, dense, noPadding }: AppScreenProps) {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();
  const density = useUIStore((s) => s.density);

  // Forced first-login password-change gate: a business_owner created via
  // /api/merchants/onboard has must_change_password=true until they set
  // their own password. Block every dashboard screen until that happens
  // (see src/app/change-password/page.tsx).
  useEffect(() => {
    if (isLoading) return;

    if (user?.must_change_password) {
      router.replace('/change-password');
      return;
    }

    if (!user && !getOfflineAuthSession()) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return null;
  }

  if (user?.must_change_password) {
    return null;
  }

  return (
    <OrganizationProvider>
      <SyncProvider>
        <div
          className="tt-app flex h-screen bg-background overflow-hidden"
          data-density={!pos && !dense && density !== 'balanced' ? density : undefined}
          data-pos-mode={pos ? 'true' : undefined}
          data-dense-mode={dense ? 'true' : undefined}
        >
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto tt-fadein">
              <div className={cn(!noPadding && 'p-4 lg:p-6')}>{children}</div>
            </main>
          </div>
        </div>
        <CommandPalette />
      </SyncProvider>
    </OrganizationProvider>
  );
}
