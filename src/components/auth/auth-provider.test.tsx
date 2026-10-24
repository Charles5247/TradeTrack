// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { User } from '@/types';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(),
  cached: vi.fn(), cache: vi.fn(), offline: vi.fn(), clear: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getUser: mocks.getUser, onAuthStateChange: mocks.subscribe,
    startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn() }, from: mocks.from,
}) }));
vi.mock('@/lib/offline/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/offline/db')>(),
  getAnyCachedSession: mocks.cached, cacheUserSession: mocks.cache, clearCachedSession: vi.fn(),
}));
vi.mock('@/lib/offline/auth-cache', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/offline/auth-cache')>(),
  getOfflineAuthSession: mocks.offline, clearOfflineAuthSession: mocks.clear,
}));
import { AuthProvider } from './auth-provider';
import { useAuthStore } from '@/store';

let root: Root;
let host: HTMLDivElement;
let authEvent: (event: AuthChangeEvent, session: Session | null) => void;
const bob = { id: 'bob', organization_id: 'shop-b', role: 'admin', status: 'active' } as User;
const session = { user: { id: 'bob' } } as Session;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  useAuthStore.getState().setUser(null);
  mocks.subscribe.mockImplementation(callback => {
    authEvent = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.cached.mockResolvedValue(null);
  mocks.offline.mockReturnValue(null);
  mocks.cache.mockResolvedValue(undefined);
  mocks.from.mockImplementation((table: string) => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: table === 'users' ? bob : null }) }) }),
  }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  useAuthStore.getState().setUser(null);
  vi.restoreAllMocks();
});

it('ignores a late initial authentication response after a different account signs in', async () => {
  let resolve!: (value: { data: { user: { id: string } }; error: null }) => void;
  mocks.getUser.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await act(() => root.render(<AuthProvider><span>App</span></AuthProvider>));
  await act(async () => { expect(authEvent('SIGNED_IN', session)).toBeUndefined(); });
  expect(useAuthStore.getState().user?.id).toBe('bob');
  await act(async () => { resolve({ data: { user: { id: 'alice' } }, error: null }); });
  expect(useAuthStore.getState().user?.id).toBe('bob');
  expect(mocks.cache).toHaveBeenCalledTimes(1);
});

it('clears a suspended profile on token refresh while retaining offline business data', async () => {
  await act(() => root.render(<AuthProvider><span>App</span></AuthProvider>));
  useAuthStore.getState().setUser(bob);
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { ...bob, status: 'suspended' } }) }) }) });
  await act(async () => { authEvent('TOKEN_REFRESHED', session); });
  expect(useAuthStore.getState().user).toBeNull();
  expect(mocks.clear).toHaveBeenCalled();
  expect(mocks.cache).toHaveBeenCalledWith('bob', expect.objectContaining({ status: 'suspended' }));
});

it('does not restore cached identity when online authentication rejects the session', async () => {
  mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('Invalid token') });
  mocks.cached.mockResolvedValue({ profile: bob });
  await act(() => root.render(<AuthProvider><span>App</span></AuthProvider>));
  expect(useAuthStore.getState().user).toBeNull();
  expect(mocks.cached).not.toHaveBeenCalled();
  expect(mocks.clear).toHaveBeenCalled();
});
