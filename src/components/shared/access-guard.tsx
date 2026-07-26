'use client';

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useI18n } from '@/i18n';
import type { UserRole } from '@/types';

/**
 * Renders `children` only if the current user's role is included in
 * `allow`. Otherwise renders a standard "Access Denied" placeholder.
 *
 * Used to enforce that the Owner role (a platform-level role) cannot
 * view operational pages such as Products, Inventory, POS, Sales
 * History, Warehouses, Transfers, Vendor Sales, Reports, Audit Trail
 * and Users — even via direct URL navigation (the sidebar already
 * hides these links for Owner, this is the page-level backstop).
 */
export function AccessGuard({
  allow,
  children,
}: {
  allow: UserRole[];
  children: React.ReactNode;
}) {
  const { user } = useAuthStore();
  const { t } = useI18n();

  if (!user || !allow.includes(user.role as UserRole)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">{t.common.access_denied}</p>
          <p className="text-sm text-muted-foreground">{t.common.access_denied_desc}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
