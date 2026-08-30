'use client';

import React from 'react';
import { AppScreen } from '@/components/ui/app-screen';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Thin backward-compatible wrapper around `<AppScreen>` (README §6.2).
 * `src/app/(dashboard)/layout.tsx` (the Next.js route-group layout used by
 * all ~19 existing dashboard pages) renders this for every page beneath
 * it, so the previous default chrome + auth-guard behavior is unchanged.
 *
 * All actual sidebar/header/auth-guard/density logic now lives in
 * `AppScreen` (src/components/ui/app-screen.tsx) — this wrapper exists
 * only so existing imports of `DashboardLayout` keep working without
 * every call site needing to switch to `AppScreen` directly. New/rebuilt
 * screens that need `data-pos-mode`/`data-dense-mode` (POS, Reports,
 * Admin, and the Step 8 Production extension) should import and render
 * `<AppScreen pos>` / `<AppScreen dense>` directly instead of this
 * wrapper, since it can only apply one shared (Balanced) configuration.
 */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  return <AppScreen>{children}</AppScreen>;
}
