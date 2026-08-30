'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AppScreen } from '@/components/ui/app-screen';
import { isPosRoute, isDenseRoute } from '@/lib/utils/route-mode';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Thin backward-compatible wrapper around `<AppScreen>` (README §6.2).
 * `src/app/(dashboard)/layout.tsx` (the Next.js route-group layout used by
 * all ~19 existing dashboard pages) renders this for every page beneath
 * it, so the previous default chrome + auth-guard behavior is unchanged.
 *
 * All actual sidebar/header/auth-guard/density logic lives in
 * `AppScreen` (src/components/ui/app-screen.tsx) — this wrapper now also
 * auto-detects POS/KDS vs Reports/Admin routes by pathname and passes
 * the matching `pos`/`dense` prop down, so the README §14 hard
 * constraints ("POS + KDS pages get data-pos-mode; Reports + Admin
 * pages get data-dense-mode") are satisfied for every page in this
 * route group without each page needing to opt in individually.
 */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname() ?? '';
  const pos = isPosRoute(pathname);
  const dense = isDenseRoute(pathname);
  // POS/KDS screens own their own edge-to-edge padding (README §9.2's
  // full-screen mode) instead of the shared `p-4 lg:p-6` content inset —
  // pass noPadding through so the POS page doesn't need a negative-margin
  // hack to counteract it.
  return (
    <AppScreen pos={pos} dense={dense} noPadding={pos}>
      {children}
    </AppScreen>
  );
}
