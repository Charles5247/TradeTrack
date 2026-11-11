// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: [{ warehouse_id: 'kano' }], cache: new Map<string, unknown>(), calls: 0 }));
vi.mock('@/lib/offline/db', () => ({ getDB: async () => ({
  get: async (_store: string, key: string) => state.cache.get(key),
  put: async (_store: string, value: { id: string }) => { state.cache.set(value.id, value); },
}) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => ({
  select: () => ({ eq: () => ({ eq: async () => { state.calls++; return { data: state.rows, error: null }; } }) }),
}) }) }));
import { visibleWarehouseIds } from '../staff-visibility';

beforeEach(() => { state.rows = [{ warehouse_id: 'kano' }]; state.cache.clear(); state.calls = 0; Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); });

it('returns only the assigned warehouse and caches it for offline use', async () => {
  const admin = { id: 'admin', organization_id: 'org', role: 'admin' };
  expect([...(await visibleWarehouseIds(admin))!]).toEqual(['kano']);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  expect([...(await visibleWarehouseIds(admin))!]).toEqual(['kano']);
  expect(state.calls).toBe(1);
});

it('fails closed for unassigned staff and keeps owner-wide access', async () => {
  state.rows = [];
  expect((await visibleWarehouseIds({ id: 'cashier', organization_id: 'org', role: 'cashier' }))?.size).toBe(0);
  expect(await visibleWarehouseIds({ id: 'owner', organization_id: 'org', role: 'business_owner' })).toBeNull();
});
