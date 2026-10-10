'use client';
import { TranslatedText } from '@/i18n/text';


import React, { useEffect, useState } from 'react';
import { syncEngine } from '@/lib/offline/sync-engine';
import { useSyncStore } from '@/store';
import type { SyncStatus } from '@/types';
import { VerificationBanner } from '@/components/subscriptions/verification-banner';

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
  const [authError, setAuthError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const { setSyncStatus, setLastSync, setPendingCount } = useSyncStore();

  useEffect(() => {
    if (!syncEngine) return;
    // Capture a non-null local reference so TS retains the narrowing
    // inside nested closures (module-level `syncEngine` binding is
    // otherwise widened back to `SyncEngine | null` in those scopes).
    const engine = syncEngine;
    let disposed = false;

    engine.startAutoSync(30000);
    engine.sync();

    const unsubscribe = engine.subscribe((state) => {
      setAuthError(state.error?.includes('sign in again') ? state.error : null);
      setSyncStatus(mapEngineStatus(state.status));
      if (state.lastSync) setLastSync(state.lastSync);
      setPendingCount(state.pendingCount);
    });

    const refreshPending = async () => {
      try {
        const count = await engine.getPendingCount();
        if (!disposed) {
          setPendingCount(count);
          setStorageError(null);
        }
      } catch {
        if (!disposed) {
          setSyncStatus('failed');
          setStorageError('Offline storage is temporarily unavailable. Pending changes could not be checked; retrying automatically.');
        }
      }
    };
    refreshPending();
    const interval = setInterval(refreshPending, 15000);

    return () => {
      disposed = true;
      unsubscribe();
      engine.stopAutoSync();
      clearInterval(interval);
    };
  }, [setSyncStatus, setLastSync, setPendingCount]);

  return <><VerificationBanner />{storageError && <div role="alert" className="bg-[color-mix(in_oklch,var(--c-warn),transparent_90%)] p-3 text-[var(--c-warn)]">{storageError}</div>}{authError && <div role="alert" className="bg-[color-mix(in_oklch,var(--c-warn),transparent_90%)] p-3 text-[var(--c-warn)]">{authError} <a href="/login" className="underline"><TranslatedText text={"Sign in"} /></a></div>}{children}</>;
}
