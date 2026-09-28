// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { AUTH_CHECK_TIMEOUT_MS } from '@/lib/utils/timeout';
import { getDB } from '../db';

const { client } = vi.hoisted(() => ({ client: { auth: { getUser: vi.fn(), refreshSession: vi.fn() }, from: vi.fn() } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client }));
import { syncEngine } from '../sync-engine';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.clearAllMocks();
  client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await syncEngine!.sync(true);
});
afterEach(() => { syncEngine!.stopAutoSync(); vi.useRealTimers(); vi.restoreAllMocks(); });

it.each([
  new TypeError('Failed to fetch'),
  new AuthRetryableFetchError('Failed to fetch', 0),
])('preserves queue and retries after network failure: %s', async (error) => {
  const db = await getDB();
  const queued = { id: 'unsynced', table_name: 'sales', record_id: 'sale-1', operation: 'INSERT', status: 'pending', payload: { id: 'sale-1' }, retry_count: 0 };
  await db.put('sync_queue', queued);
  if (error instanceof TypeError) client.auth.getUser.mockRejectedValueOnce(error);
  else client.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error });
  await syncEngine!.sync(true);
  expect(syncEngine!.getState().status).toBe('offline');
  expect(await db.get('sync_queue', 'unsynced')).toEqual(queued);
  expect(client.from).not.toHaveBeenCalled();
  const calls = client.auth.getUser.mock.calls.length;
  await syncEngine!.sync();
  expect(client.auth.getUser).toHaveBeenCalledTimes(calls);
  syncEngine!.startAutoSync(30000);
  await vi.advanceTimersByTimeAsync(30000);
  expect(client.auth.getUser).toHaveBeenCalledTimes(calls + 1);
  expect(syncEngine!.getState().status).toBe('idle');
});

it('bounds stalled authentication and never flushes the queue after a late response', async () => {
  let resolve!: (value: unknown) => void;
  client.auth.getUser.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const attempt = syncEngine!.sync(true);
  await vi.advanceTimersByTimeAsync(AUTH_CHECK_TIMEOUT_MS);
  await attempt;
  expect(syncEngine!.getState().status).toBe('offline');
  resolve({ data: { user: { id: 'user-1' } }, error: null });
  await Promise.resolve();
  expect(client.from).not.toHaveBeenCalled();
});

it('keeps genuine authentication errors visible', async () => {
  client.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('Invalid token') });
  await syncEngine!.sync(true);
  expect(syncEngine!.getState()).toMatchObject({ status: 'error', error: 'Invalid token' });
});

it('stays idle when there is no signed-in session', async () => {
  client.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthSessionMissingError() });
  await syncEngine!.sync(true);
  expect(syncEngine!.getState()).toMatchObject({ status: 'idle', error: null });
  expect(client.from).not.toHaveBeenCalled();
});

it('does not request authentication when the browser is offline', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  client.auth.getUser.mockClear();
  await syncEngine!.sync(true);
  expect(client.auth.getUser).not.toHaveBeenCalled();
  expect(syncEngine!.getState().status).toBe('offline');
});


it.each(['network', 'invalid', 'timeout'])('preserves queued records when refresh fails: %s', async (kind) => {
  const db = await getDB();
  const queued = { id: 'refresh-pending', table_name: 'sales', record_id: 'sale-refresh', operation: 'INSERT', status: 'pending', payload: { id: 'sale-refresh' }, retry_count: 0 };
  await db.put('sync_queue', queued);
  client.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user' } }, error: null });
  client.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { organization_id: 'org' } }) }) }) });
  if (kind === 'network') client.auth.refreshSession.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  if (kind === 'invalid') client.auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new AuthSessionMissingError() });
  if (kind === 'timeout') client.auth.refreshSession.mockReturnValueOnce(new Promise(() => {}));
  const attempt = syncEngine!.sync(true);
  if (kind === 'timeout') await vi.advanceTimersByTimeAsync(AUTH_CHECK_TIMEOUT_MS);
  await attempt;
  expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
  expect(await db.get('sync_queue', queued.id)).toEqual(queued);
  expect(syncEngine!.getState().status).toBe(kind === 'invalid' ? 'error' : 'offline');
  if (kind === 'invalid') expect(syncEngine!.getState().error).toContain('sign in again');
});
