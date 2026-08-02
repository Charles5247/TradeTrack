'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { OrganizationProvider } from '@/components/shared/organization-provider';
import { SyncProvider } from '@/components/shared/sync-provider';
import { useAuthStore } from '@/store';
import { getOfflineAuthSession } from '@/lib/offline/auth-cache';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();

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
        <div className="flex h-screen bg-background overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto">
              <div className="p-4 lg:p-6">
                {children}
              </div>
            </main>
          </div>
        </div>
      </SyncProvider>
    </OrganizationProvider>
  );
}
