import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), from: vi.fn(), provider: vi.fn(), adapter: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => ({ apiContext: mock.context }));
vi.mock('@/lib/ai/provider', () => ({ getAIProvider: mock.provider }));
vi.mock('@/lib/ai/delivery', () => ({ deliveryAdapter: mock.adapter }));
import { GET, POST } from '@/app/api/ai/route';
import { PLAN_ORDER } from '../entitlement';
beforeEach(() => {
  vi.resetAllMocks();
  mock.context.mockResolvedValue({ db: { rpc: mock.rpc, from: mock.from }, org: 'own-org', profile: { id: 'own-user', email: 'owner@example.test' } });
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === 'verify_business_subscription' ? { active: true, plan_id: PLAN_ORDER[2], server_time: '2026-09-01' } : 'job-1', error: null }));
  mock.adapter.mockReturnValue({ enabled: false });
});
const request = (body: Record<string, unknown>) => new Request('http://localhost/api/ai', { method: 'POST', body: JSON.stringify(body) });
it('enforces server entitlement on reads and every action', async () => {
  mock.rpc.mockResolvedValue({ data: { active: true, plan_id: PLAN_ORDER[0], server_time: '2026-09-01' }, error: null });
  expect((await GET()).status).toBe(400);
  for (const action of ['inventory','insights','approve','preferences','deliver']) {
    expect((await POST(request({ action, confirm: true }))).status).toBe(400);
  }
  expect(mock.from).not.toHaveBeenCalled(); expect(mock.provider).not.toHaveBeenCalled();
});
it('requires explicit confirmation before approvals, preferences or deliveries', async () => {
  for (const action of ['approve','preferences','deliver']) {
    const response = await POST(request({ action })); expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('confirm');
  }
  expect(mock.rpc.mock.calls.every(([name]) => name === 'verify_business_subscription')).toBe(true);
});
it('only drafts inventory and records the suggestion, stripping recognizable contact data', async () => {
  const mapInventory = vi.fn().mockResolvedValue([{ name: 'Rice', sku: 'RICE' }]);
  mock.provider.mockReturnValue({ stub: true, mapInventory });
  const response = await POST(request({ action: 'inventory', text: 'Rice 5 100 owner@example.test +234 800 123 4567', organization_id: 'other-org' }));
  expect(response.status).toBe(200);
  expect(mapInventory.mock.calls[0][0]).not.toContain('owner@example.test');
  expect(mapInventory.mock.calls[0][0]).not.toContain('+234');
  expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(['verify_business_subscription','reserve_ai_job','finish_ai_job']);
  expect(mock.from).not.toHaveBeenCalled();
});
it('records provider failures without executing an import', async () => {
  mock.provider.mockReturnValue({ stub: true, mapInventory: vi.fn().mockRejectedValue(new Error('Unavailable')) });
  expect((await POST(request({ action: 'inventory', text: 'Rice 5 100' }))).status).toBe(400);
  expect(mock.rpc).toHaveBeenLastCalledWith('finish_ai_job', { job: 'job-1', output: { error: 'Generation failed' }, failed: true });
});
