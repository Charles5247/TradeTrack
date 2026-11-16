import { beforeEach, expect, it, vi } from 'vitest';
import { PLAN_ORDER } from '@/lib/ai/entitlement';

const mock = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => ({ apiContext: mock.context }));
import { GET, POST } from './route';

function query(result: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), single: vi.fn() };
  for (const key of ['select', 'eq', 'order', 'limit'] as const) chain[key].mockReturnValue(chain);
  chain.single.mockResolvedValue(result);
  return Object.assign(chain, { then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mock.context.mockResolvedValue({ db: { rpc: mock.rpc, from: mock.from }, org: 'own-org', profile: { id: 'owner', organization_id: 'own-org' } });
  mock.rpc.mockResolvedValue({ data: { active: true, plan_id: PLAN_ORDER[3], server_time: '2026-11-15' }, error: null });
});

it('limits open-order listing to the authenticated organization', async () => {
  const orders = query({ data: [], error: null });
  mock.from.mockReturnValue(orders);
  expect((await GET(new Request('http://localhost/api/ai/purchase-order-match'))).status).toBe(200);
  expect(mock.context).toHaveBeenCalledWith(['business_owner']);
  expect(orders.eq).toHaveBeenCalledWith('organization_id', 'own-org');
  expect(orders.eq).toHaveBeenCalledWith('status', 'sent');
});

it('requires an invoice job belonging to this owner and a sent order in the same organization', async () => {
  const job = query({ data: { status: 'ready', kind: 'inventory', result: { source: 'invoice', rows: [] } }, error: null });
  const order = query({ data: { id: 'order', supplier: null, purchase_order_items: [] }, error: null });
  mock.from.mockImplementation((table: string) => table === 'ai_jobs' ? job : order);
  const id = '00000000-0000-4000-8000-000000000001';
  const response = await POST(new Request('http://localhost/api/ai/purchase-order-match', { method: 'POST', body: JSON.stringify({ job: id, order: id }) }));
  expect(response.status).toBe(200);
  expect(job.eq).toHaveBeenCalledWith('organization_id', 'own-org');
  expect(job.eq).toHaveBeenCalledWith('user_id', 'owner');
  expect(order.eq).toHaveBeenCalledWith('organization_id', 'own-org');
  expect(order.eq).toHaveBeenCalledWith('status', 'sent');
});

it('rejects a changed account before retrieving an old invoice or order', async () => {
  const response = await POST(new Request('http://localhost/api/ai/purchase-order-match', {
    method: 'POST', headers: { 'X-Track-Expected-Owner': 'previous-owner' }, body: '{}',
  }));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain('ACCOUNT_CHANGED');
  expect(mock.from).not.toHaveBeenCalled();
});
