import { beforeEach, expect, it, vi } from 'vitest';
import { PLAN_ORDER } from '@/lib/ai/entitlement';

vi.mock('server-only', () => ({}));

const mock = vi.hoisted(() => ({
  context: vi.fn(), rpc: vi.fn(), from: vi.fn(), lookup: vi.fn(), enabled: vi.fn(),
}));
vi.mock('@/lib/auth/api-context', () => ({ apiContext: mock.context }));
vi.mock('@/lib/ai/local-price', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/ai/local-price')>(),
  isLocalPriceSearchEnabled: mock.enabled,
  lookupLocalPrice: mock.lookup,
}));

import { GET, POST } from './route';
import { LocalPriceUnavailable } from '@/lib/ai/local-price';

const productId = '20000000-0000-4000-8000-000000000001';
const warehouseId = '20000000-0000-4000-8000-000000000002';
const area = { state: 'Kano', city: 'Kano' };
const endpoint = 'https://app.example.com/api/ai/local-prices';
const productData = {
  name: 'Picnic', make: 'Picnic', barcode: null, variant_size: '75 g', variant_colour: null,
  model: null, stock_unit: 'piece', units_per_pack: 1, cost_price: 130, selling_price: 190, sku: 'SHARED-INTERNAL',
};

function query(data: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({ data, error: null });
  return chain;
}

function post(body: Record<string, unknown> = { productId, warehouseId, area }, headers?: HeadersInit) {
  return new Request(endpoint, { method: 'POST', body: JSON.stringify(body), headers });
}

beforeEach(() => {
  vi.resetAllMocks();
  mock.context.mockResolvedValue({
    db: { rpc: mock.rpc, from: mock.from }, org: 'own-org',
    profile: { id: 'owner', organization_id: 'own-org' },
  });
  mock.enabled.mockReturnValue(true);
  mock.rpc.mockResolvedValue({
    data: { active: true, plan_id: PLAN_ORDER[3], server_time: '2026-11-23' }, error: null,
  });
  mock.lookup.mockResolvedValue({ status: 'no_local_price', area, offers: [] });
});

it('takes the saved area for the requested warehouse and scopes the reads', async () => {
  const warehouse = query({ id: warehouseId });
  const organization = query({
    settings: { local_price_market_areas: { [warehouseId]: { state: 'Plateau', city: 'Jos' } } },
  });
  const tables: Record<string, ReturnType<typeof query>> = { warehouses: warehouse, organizations: organization };
  mock.from.mockImplementation((table: string) => tables[table]);
  const response = await GET(new Request(endpoint + '?warehouseId=' + warehouseId));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ area: { state: 'Plateau', city: 'Jos' } });
  expect(mock.context).toHaveBeenCalledWith(['business_owner']);
  expect(warehouse.eq).toHaveBeenCalledWith('id', warehouseId);
  expect(warehouse.eq).toHaveBeenCalledWith('organization_id', 'own-org');
  expect(organization.eq).toHaveBeenCalledWith('id', 'own-org');
  expect(mock.from).not.toHaveBeenCalledWith('merchants');
});

it('falls back to the registered area without reading or returning a street address', async () => {
  const merchant = query({ address: 'Street address', state: 'Kano State', city: 'Kano', country: 'Nigeria' });
  const tables: Record<string, ReturnType<typeof query>> = {
    warehouses: query({ id: warehouseId }),
    organizations: query({ settings: {} }),
    merchants: merchant,
  };
  mock.from.mockImplementation((table: string) => tables[table]);
  const response = await GET(new Request(endpoint + '?warehouseId=' + warehouseId));
  expect(await response.json()).toEqual({ area });
  expect(merchant.select).toHaveBeenCalledWith('state,city,country');
  expect(merchant.eq).toHaveBeenCalledWith('organization_id', 'own-org');
});

it('loads local product identity from a scoped active catalog and leaves private values out', async () => {
  const warehouse = query({ id: warehouseId });
  const product = query(productData);
  mock.from.mockImplementation((table: string) => table === 'warehouses' ? warehouse : product);
  const response = await POST(post());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'no_local_price', area });
  expect(warehouse.eq).toHaveBeenCalledWith('organization_id', 'own-org');
  expect(product.eq).toHaveBeenCalledWith('organization_id', 'own-org');
  expect(product.eq).toHaveBeenCalledWith('id', productId);
  expect(product.eq).toHaveBeenCalledWith('status', 'active');
  expect(mock.lookup).toHaveBeenCalledWith({
    name: 'Picnic', make: 'Picnic', barcode: null, variantSize: '75 g',
    variantColour: null, model: null, stockUnit: 'piece', unitsPerPack: 1,
  }, area);
});

it('rejects a missing or foreign product without calling any feed', async () => {
  mock.from.mockImplementation((table: string) => query(table === 'warehouses' ? { id: warehouseId } : null));
  expect((await POST(post())).status).toBe(404);
  expect(mock.lookup).not.toHaveBeenCalled();
});

it('rejects foreign warehouses before reading the requested product', async () => {
  mock.from.mockReturnValue(query(null));
  expect((await POST(post())).status).toBe(404);
  expect(mock.from).not.toHaveBeenCalledWith('products');
});

it('rejects disabled feed config and missing entitlement before catalog operations', async () => {
  mock.enabled.mockReturnValueOnce(false);
  expect((await POST(post())).status).toBe(503);
  mock.rpc.mockResolvedValueOnce({ data: { active: false }, error: null });
  expect((await POST(post())).status).toBe(403);
  expect(mock.from).not.toHaveBeenCalled();
  expect(mock.lookup).not.toHaveBeenCalled();
});

it('rejects a stale expected account and a foreign origin before any feed call', async () => {
  expect((await POST(post(undefined, { 'X-Track-Expected-Organization': 'other-org' }))).status).toBe(409);
  expect((await POST(post(undefined, { Origin: 'https://foreign.example.com', 'X-Forwarded-Host': 'foreign.example.com' }))).status).toBe(403);
  expect(mock.from).not.toHaveBeenCalled();
  expect(mock.lookup).not.toHaveBeenCalled();
});

it('rejects non-Owners and request fields that could bypass the feed contract', async () => {
  mock.context.mockRejectedValueOnce(new Error('Permission denied'));
  expect((await POST(post())).status).toBe(403);
  const foreignUrl = await POST(post({ productId, warehouseId, area, url: 'https://foreign.example.com' }));
  expect(foreignUrl.status).toBe(400);
  const oversized = await POST(post({ productId, warehouseId, area, input: 'a'.repeat(2000) }));
  expect(oversized.status).toBe(413);
  expect(mock.from).not.toHaveBeenCalled();
  expect(mock.lookup).not.toHaveBeenCalled();
});

it('reports an unavailable feed without exposing server details', async () => {
  mock.from.mockImplementation((table: string) => query(table === 'warehouses' ? { id: warehouseId } : productData));
  mock.lookup.mockRejectedValueOnce(new LocalPriceUnavailable('upstream internal detail'));
  const response = await POST(post());
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain('upstream internal detail');
});
