// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const user = vi.hoisted(() => ({ id: 'offline-user', organization_id: 'org', role: 'cashier' }));
vi.mock('@/store', () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user }) }));
vi.mock('@/components/layout/nav-config', () => ({ getNavGroupsForRole: () => [{ items: [{ href: '/pos' }, { href: '/dashboard' }] }] }));
import { OfflineNavigation } from './offline-navigation';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('caches full HTML and its scripts before reporting offline readiness', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const pages = { put: vi.fn() };
  const assets = { match: vi.fn(), put: vi.fn() };
  vi.stubGlobal('caches', { keys: async () => [], delete: vi.fn(), open: async (name: string) => name.includes('-pages-') ? pages : assets });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ active: { scriptURL: 'http://localhost/sw.js?build=test' } }), addEventListener: vi.fn(), removeEventListener: vi.fn() } });
  const fetcher = vi.fn(async (url: string) => url.includes('/_next/') ? new Response('console.log("cached")') : new Response('<html><script src="/_next/static/pos.js"></script></html>', { headers: { 'Content-Type': 'text/html' } }));
  vi.stubGlobal('fetch', fetcher);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => { root.render(<OfflineNavigation />); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    expect(host.textContent).toContain('Pages ready offline');
    expect(pages.put).toHaveBeenCalledTimes(3);
    expect(assets.put).toHaveBeenCalled();
    expect(fetcher.mock.calls.filter(([url]) => !url.includes('/_next/')).map(([url]) => url)).toEqual(['/', '/pos', '/dashboard']);
  } finally {
    await act(async () => root.unmount());
    Reflect.deleteProperty(navigator, 'serviceWorker');
  }
});
