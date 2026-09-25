import { afterEach, expect, it, vi } from 'vitest';
import { browserFetch } from './browser-fetch';

afterEach(() => vi.unstubAllGlobals());

it('identifies failed auth requests without exposing tokens or bodies', async () => {
  const original = new TypeError('Failed to fetch');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(original));
  const error = await browserFetch('https://example.supabase.co/auth/v1/token?secret=private', {
    method: 'POST', headers: { apikey: 'private-key' }, body: 'private-refresh-token',
  }).catch((error: Error) => error);
  expect(error).toBeInstanceOf(TypeError);
  expect((error as Error).message).toContain('POST https://example.supabase.co/auth/v1/token');
  expect((error as Error).message).not.toContain('private');
  expect((error as Error).cause).toBe(original);
});

it('redacts storage paths and signed query strings', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(browserFetch('https://example.supabase.co/storage/v1/object/private/customer-name?token=secret'))
    .rejects.toThrow('GET https://example.supabase.co/storage/v1/…');
  const error = await browserFetch('https://example.supabase.co/storage/v1/object/private/customer-name?token=secret').catch((error: Error) => error);
  expect((error as Error).message).not.toMatch(/customer-name|secret/);
});

it('preserves successful and HTTP-error responses unchanged', async () => {
  const response = new Response('Unauthorized', { status: 401 });
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  const options = { headers: { apikey: 'key' } };
  expect(await browserFetch('https://example.supabase.co/auth/v1/user', options)).toBe(response);
  expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/auth/v1/user', options);
});

it('preserves intentional aborts unchanged', async () => {
  const error = new DOMException('Aborted', 'AbortError');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
  await expect(browserFetch('https://example.supabase.co/auth/v1/user')).rejects.toBe(error);
});
