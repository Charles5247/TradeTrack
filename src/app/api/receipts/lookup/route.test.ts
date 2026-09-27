import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ from: mocks.from, auth: { getUser: mocks.getUser } }) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }));
import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user' } } });
});
afterEach(() => vi.restoreAllMocks());
const request = () => new NextRequest('http://localhost/api/receipts/lookup?code=INV-123');

it.each([true, false])('looks up an invoice without a nonexistent column (found=%s)', async (found) => {
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query),
    is: vi.fn(() => { throw new Error('deleted_at does not exist'); }),
    maybeSingle: vi.fn(async () => ({ error: null, data: found ? { invoice_number: 'INV-123', total: 20,
      items: [{ quantity: 2, unit_price: 10, discount: 0, total: 20, product: { name: 'Rice', sku: 'RICE' } }] } : null })) };
  mocks.from.mockReturnValue(query);
  const response = await GET(request());
  expect(mocks.from).toHaveBeenCalledWith('sales');
  expect(query.eq).toHaveBeenCalledWith('invoice_number', 'INV-123');
  expect(query.is).not.toHaveBeenCalled();
  expect(response.status).toBe(found ? 200 : 404);
  expect(await response.json()).toMatchObject(found
    ? { kind: 'sale', receipt: { invoiceNumber: 'INV-123', total: 20, items: [{ name: 'Rice', quantity: 2 }] } }
    : { error: 'No receipt found for this barcode' });
});

it('rejects unauthenticated lookups before querying sales', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  expect((await GET(request())).status).toBe(401);
  expect(mocks.from).not.toHaveBeenCalled();
});

it('surfaces database failure without retrying an unfiltered fallback', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const query = { select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: null, error: new Error('Database unavailable') }) };
  mocks.from.mockReturnValue(query);
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Database unavailable' });
  expect(mocks.from).toHaveBeenCalledTimes(1);
});
