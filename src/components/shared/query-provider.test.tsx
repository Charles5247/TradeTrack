// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { QueryProvider } from './query-provider';
import { useAuthStore } from '@/store';
import type { User } from '@/types';

it('uses a separate query client immediately on account switch, isolating late results', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const alice = { id: 'query-a', organization_id: 'shop-a', role: 'admin', status: 'active' } as User;
  const bob = { ...alice, id: 'query-b', organization_id: 'shop-b' } as User;
  useAuthStore.getState().setUser(alice);
  const clients: QueryClient[] = [];
  function Probe() { const client = useQueryClient(); clients.push(client); return null; }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() => root.render(<QueryProvider><Probe /></QueryProvider>));
    const previous = clients.at(-1)!;
    previous.setQueryData(['reports'], { merchant: 'Alice' });
    await act(() => useAuthStore.getState().setUser(bob));
    const current = clients.at(-1)!;
    expect(current).not.toBe(previous);
    expect(current.getQueryData(['reports'])).toBeUndefined();
    // A response that ignored cancellation can only populate the old client.
    previous.setQueryData(['reports'], { merchant: 'Late Alice response' });
    expect(current.getQueryData(['reports'])).toBeUndefined();
  } finally {
    await act(() => root.unmount());
    host.remove();
    useAuthStore.getState().setUser(null);
  }
});
