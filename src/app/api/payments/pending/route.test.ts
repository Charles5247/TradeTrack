import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), checkout: vi.fn(), role: 'business_owner' }));
vi.mock('@/lib/subscriptions/zainpay-checkout', () => ({
  paymentAdmin: () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));
import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = 'business_owner';
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  mocks.checkout.mockResolvedValue({ data: { reference: 'own-pending', amount_kobo: 1500000 }, error: null });
  mocks.from.mockImplementation((table: string) => ({
    select: () => ({ eq: () => table === 'users'
      ? { single: async () => ({ data: { organization_id: 'own-org', role: mocks.role }, error: null }) }
      : { eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: mocks.checkout }) }) }) },
    }),
  }));
});

const request = (authorized = true) => new NextRequest('https://trackasuwa.vercel.app/api/payments/pending', {
  headers: authorized ? { Authorization: 'Bearer session-token' } : {},
});

it('returns only the owner organization pending checkout', async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ checkout: { reference: 'own-pending', amount_kobo: 1500000 } });
  const chain = mocks.from.mock.results[1].value.select().eq('organization_id', 'own-org');
  expect(chain).toBeDefined();
});

it('rejects anonymous and staff access', async () => {
  expect((await GET(request(false))).status).toBe(401);
  mocks.role = 'cashier';
  expect((await GET(request())).status).toBe(403);
  expect(mocks.checkout).not.toHaveBeenCalled();
});
