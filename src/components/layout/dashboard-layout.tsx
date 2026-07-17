'use client';

import React from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { OrganizationProvider } from '@/components/shared/organization-provider';
import { SyncProvider } from '@/components/shared/sync-provider';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
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
