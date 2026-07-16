'use client';

import React, { useEffect } from 'react';
import { syncEngine } from '@/lib/offline/sync-engine';
import { useSyncStore } from '@/store';
import type { SyncStatus } from '@/types';

function mapEngineStatus(status: string): SyncStatus {
  switch (status) {
    case 'syncing':
      return 'syncing';
    case 'error':
      return 'failed';
    case 'offline':
      return 'pending';
    case 'idle':
    default:
      return 'synced';
  }
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { setSyncStatus, setLastSync, setPendingCount } = useSyncStore();

  useEffect(() => {
    if (!syncEngine) return;

    syncEngine.startAutoSync(30000);
    syncEngine.sync();

    const unsubscribe = syncEngine.subscribe((state) => {
      setSyncStatus(mapEngineStatus(state.status));
      if (state.lastSync) setLastSync(state.lastSync);
      setPendingCount(state.pendingCount);
    });

    const refreshPending = async () => {
      const count = await syncEngine.getPendingCount();
      setPendingCount(count);
    };
    refreshPending();
    const interval = setInterval(refreshPending, 15000);

    return () => {
      unsubscribe();
      syncEngine.stopAutoSync();
      clearInterval(interval);
    };
  }, [setSyncStatus, setLastSync, setPendingCount]);

  return <>{children}</>;
}
