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
    // Capture a non-null local reference so TS retains the narrowing
    // inside nested closures (module-level `syncEngine` binding is
    // otherwise widened back to `SyncEngine | null` in those scopes).
    const engine = syncEngine;

    engine.startAutoSync(30000);
    engine.sync();

    const unsubscribe = engine.subscribe((state) => {
      setSyncStatus(mapEngineStatus(state.status));
      if (state.lastSync) setLastSync(state.lastSync);
      setPendingCount(state.pendingCount);
    });

    const refreshPending = async () => {
      const count = await engine.getPendingCount();
      setPendingCount(count);
    };
    refreshPending();
    const interval = setInterval(refreshPending, 15000);

    return () => {
      unsubscribe();
      engine.stopAutoSync();
      clearInterval(interval);
    };
  }, [setSyncStatus, setLastSync, setPendingCount]);

  return <>{children}</>;
}
