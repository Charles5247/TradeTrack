// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pending: vi.fn(), verify: vi.fn(), setPendingCount: vi.fn(), setSyncStatus: vi.fn(), setLastSync: vi.fn(),
}));
vi.mock('@/store', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ user: { organization_id: 'org' } }),
  useSyncStore: () => mocks,
}));
vi.mock('@/lib/offline/sync-engine', () => ({ syncEngine: {
  getPendingCount: mocks.pending, startAutoSync: vi.fn(), stopAutoSync: vi.fn(), sync: vi.fn(), subscribe: () => () => {},
} }));
vi.mock('@/lib/subscriptions/verification', async importOriginal => ({
  ...await importOriginal<object>(), verifySubscription: mocks.verify,
}));
import { SyncProvider } from './sync-provider';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('handles background storage failures, keeps the pending count, then clears warnings on recovery', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  mocks.pending.mockRejectedValueOnce(new DOMException('Closing', 'InvalidStateError')).mockResolvedValue(3);
  mocks.verify.mockRejectedValueOnce(new DOMException('Closing', 'InvalidStateError')).mockResolvedValue({
    id: 'subscription:org', active: true, verifiedAt: Date.now(), lastSeen: Date.now(),
  });
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<SyncProvider><div>Workspace</div></SyncProvider>));
    expect(host.textContent).toContain('Offline storage is temporarily unavailable');
    expect(host.textContent).toContain('Subscription verification is temporarily unavailable');
    expect(mocks.setPendingCount).not.toHaveBeenCalled();
    expect(mocks.setSyncStatus).toHaveBeenCalledWith('failed');
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(mocks.setPendingCount).toHaveBeenLastCalledWith(3);
    expect(host.textContent).toBe('Workspace');
  } finally {
    await act(async () => root.unmount());
  }
});
