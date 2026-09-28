// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, onlineManager, type MutationOptions } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDB } from '../db';
const payload = { organization_id: 'org', user_id: 'user', product_id: 'product', warehouse_id: 'warehouse',
  inventory_id: 'stock', current_quantity: 20, quantity_change: -3, movement_type: 'out' as const, reason: 'Damaged' };
const mocks = vi.hoisted(() => ({ from: vi.fn(), success: vi.fn(), error: vi.fn(),
  options: undefined as MutationOptions<unknown, Error, typeof payload> | undefined }));
vi.mock('@tanstack/react-query', async (original) => ({
  ...await original<typeof import('@tanstack/react-query')>(),
  useQuery: () => ({ data: [], isLoading: false }),
  useMutation: (options: typeof mocks.options) => { mocks.options = options; return { isPending: false, mutate: vi.fn() }; },
}));
vi.mock('@/store', () => ({ useAuthStore: () => ({ user: { id: 'user', organization_id: 'org' } }) }));
vi.mock('@/i18n', async () => {
  const { en } = await import('@/i18n/locales/en');
  return { useI18n: () => ({ t: en }) };
});
vi.mock('@/components/shared/access-guard', () => ({ AccessGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
import InventoryPage from '@/app/(dashboard)/inventory/page';

let client: QueryClient;
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  onlineManager.setOnline(true);
  const db = await getDB(); await db.clear('inventory'); await db.clear('sync_queue');
  await db.put('inventory', { id: 'stock', organization_id: 'org', product_id: 'product', warehouse_id: 'warehouse', quantity: 20 });
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<QueryClientProvider client={client}><InventoryPage /></QueryClientProvider>));
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); client.clear(); vi.restoreAllMocks(); onlineManager.setOnline(true);
});
function mutation() { return client.getMutationCache().build(client, mocks.options!); }
function server(read: () => Promise<unknown>, failAt?: string, thrown = false) {
  const writes: string[] = [];
  mocks.from.mockImplementation((table: string) => {
    const write = async () => { writes.push(table); if (table === failAt && thrown) throw new TypeError('Connection closed');
      return { error: table === failAt ? new Error('Write rejected') : null }; };
    const query = { select: () => query, eq: () => query, maybeSingle: read,
      update: () => ({ eq: write }), insert: write };
    return query;
  });
  return writes;
}

it('runs immediately when React Query and the browser are offline, queuing stock, movement and audit', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false); onlineManager.setOnline(false);
  expect(mocks.options?.networkMode).toBe('always');
  const pending = mutation();
  await act(async () => { expect(await pending.execute(payload)).toEqual({ offline: true, quantity: 17 }); });
  expect(pending.state.isPaused).toBe(false); expect(mocks.from).not.toHaveBeenCalled();
  const db = await getDB(); expect((await db.get('inventory', 'stock')).quantity).toBe(17);
  expect((await db.getAll('sync_queue')).map((row) => [row.table_name, row.operation]).sort()).toEqual([
    ['audit_logs', 'INSERT'], ['inventory', 'UPDATE'], ['inventory_movements', 'INSERT'],
  ]);
});

it.each(['thrown', 'returned'])('falls back before writes when an online inventory read fails (%s)', async (kind) => {
  const writes = server(async () => { if (kind === 'thrown') throw new TypeError('Failed to fetch');
    return { data: null, error: new Error('Failed to fetch') }; });
  await act(async () => { expect(await mutation().execute(payload)).toEqual({ offline: true, quantity: 17 }); });
  expect(writes).toEqual([]); expect(await (await getDB()).count('sync_queue')).toBe(3);
});

it.each([true, false])('keeps successful online writes online (existing=%s)', async (existing) => {
  const writes = server(async () => ({ data: existing ? { id: 'stock', quantity: 20 } : null, error: null }));
  await act(async () => { expect(await mutation().execute(payload)).toEqual({ offline: false, quantity: existing ? 17 : 0 }); });
  expect(writes).toEqual(['inventory', 'inventory_movements', 'audit_logs']);
  expect(await (await getDB()).count('sync_queue')).toBe(0);
});

it.each([
  ['inventory', false], ['inventory', true], ['inventory_movements', false], ['audit_logs', false],
] as const)('surfaces %s write failure (thrown=%s) without queuing a duplicate', async (table, thrown) => {
  const writes = server(async () => ({ data: { id: 'stock', quantity: 20 }, error: null }), table, thrown);
  await act(async () => { await expect(mutation().execute(payload)).rejects.toThrow(thrown ? 'Connection closed' : 'Write rejected'); });
  expect(writes.at(-1)).toBe(table);
  expect(await (await getDB()).count('sync_queue')).toBe(0);
  expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).toHaveBeenCalled();
});
