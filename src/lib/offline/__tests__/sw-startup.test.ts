import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('opens the cached dashboard when an Android cold start requests login offline', async () => {
  const listeners = new Map<string, (event: any) => void>();
  const dashboard = new Response('<html>Dashboard</html>');
  const cache = new Map<string, Response>([['https://trackasuwa.test/dashboard', dashboard]]);
  const context = {
    self: { location: { href: 'https://trackasuwa.test/sw.js?build=test', origin: 'https://trackasuwa.test' },
      addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler) },
    caches: { match: async (request: Request | string) => cache.get(String(request instanceof Request ? request.url : request)) || null,
      open: async () => ({ match: async () => null }) },
    fetch: vi.fn(async () => { throw new Error('offline'); }),
    Request, Response, URL,
  };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), context);
  let response: Promise<Response> | undefined;
  listeners.get('fetch')!({ request: { method: 'GET', url: 'https://trackasuwa.test/login', mode: 'navigate' },
    respondWith: (result: Promise<Response>) => { response = result; }, waitUntil: vi.fn() });
  const result = await response;
  expect(result?.status).toBe(302);
  expect(result?.headers.get('location')).toBe('https://trackasuwa.test/dashboard');
});
