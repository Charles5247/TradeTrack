// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const user = vi.hoisted(() => ({ id: 'offline-user', organization_id: 'org', role: 'cashier' }));
vi.mock('@/store', () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user }) }));
vi.mock('@/components/layout/nav-config', () => ({ getNavGroupsForRole: () => [{ items: [{ href: '/pos' }, { href: '/dashboard' }] }] }));
vi.mock('@/lib/offline/prepare-pos', () => ({ prepareOfflinePos: vi.fn(async () => ({ warehouses: 1, products: 2 })) }));
import { OfflineNavigation } from './offline-navigation';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('caches full HTML and its scripts before reporting offline readiness', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const pages = { put: vi.fn(), keys: vi.fn(async () => []) };
  const assets = { match: vi.fn(), put: vi.fn() };
  vi.stubGlobal('caches', { keys: async () => [], delete: vi.fn(), open: async (name: string) => name.includes('-pages-') ? pages : assets });
  const postMessage = vi.fn();
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ active: { scriptURL: 'http://localhost/sw.js?build=test', postMessage } }), addEventListener: vi.fn(), removeEventListener: vi.fn() } });
  const fetcher = vi.fn(async (url: string) => url.includes('/_next/') ? new Response('console.log("cached")') : new Response('<html><script src="/_next/static/pos.js"></script></html>', { headers: { 'Content-Type': 'text/html' } }));
  vi.stubGlobal('fetch', fetcher);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => { root.render(<OfflineNavigation />); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    expect(host.textContent).toContain('Offline navigation and POS catalog ready');
    expect(postMessage).toHaveBeenCalledWith({ type: 'OFFLINE_PREPARED', build: 'test' });
    expect(pages.put).toHaveBeenCalledTimes(3);
    expect(assets.put).toHaveBeenCalled();
    expect(fetcher.mock.calls.filter(([url]) => !url.includes('/_next/')).map(([url]) => url)).toEqual(['/', '/pos', '/dashboard']);
  } finally {
    await act(async () => root.unmount());
    Reflect.deleteProperty(navigator, 'serviceWorker');
  }
});

it('does not advertise merchant POS for a platform owner while offline', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const priorRole = user.role;
  user.role = 'platform_owner';
  vi.stubGlobal('caches', { match: vi.fn(async () => new Response('cached')) });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { addEventListener: vi.fn(), removeEventListener: vi.fn() } });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => { root.render(<OfflineNavigation />); });
    expect(host.textContent).toContain('Platform owner accounts cannot use merchant POS');
    expect(host.textContent).not.toContain('Offline POS data is available');
  } finally {
    await act(async () => root.unmount());
    user.role = priorRole;
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(navigator, 'onLine');
  }
});
