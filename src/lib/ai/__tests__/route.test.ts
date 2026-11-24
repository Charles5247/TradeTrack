import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), from: vi.fn(), provider: vi.fn(), adapter: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => ({ apiContext: mock.context }));
vi.mock('@/lib/ai/provider', () => ({ getAIProvider: mock.provider }));
vi.mock('@/lib/ai/local-price', () => ({ isLocalPriceSearchEnabled: () => false }));
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
it('requires a business owner for every assistant request', async () => {
  await GET();
  await POST(request({ action: 'preferences', confirm: true }));
  expect(mock.context).toHaveBeenCalledWith(['business_owner']);
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
  expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(['verify_business_subscription','reserve_ai_job','attach_ai_stock_source','finish_ai_job']);
  expect(mock.rpc).toHaveBeenCalledWith('attach_ai_stock_source', expect.objectContaining({ p_kind: 'text', p_content: 'Rice 5 100 owner@example.test +234 800 123 4567', p_metadata: { purpose: 'stock_intake' } }));
  expect(mock.from).not.toHaveBeenCalled();
});

it('rejects an account-switch precondition before storing source or invoking the provider', async () => {
  const response = await POST(new Request('http://localhost/api/ai', { method: 'POST',
    headers: { 'X-Track-Expected-Owner': 'another-owner' }, body: JSON.stringify({ action: 'inventory', text: 'Rice 4' }) }));
  expect(response.status).toBe(400);
  expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(['verify_business_subscription']);
  expect(mock.provider).not.toHaveBeenCalled();
});

it('retains original CSV text separately from prepared provider input', async () => {
  mock.provider.mockReturnValue({ stub: true, mapInventory: vi.fn().mockResolvedValue([{ name: 'Rice' }]) });
  const response = await POST(request({ action: 'inventory', text: 'name\tquantity\nRice\t4',
    source: { kind: 'csv', text: 'name,quantity\n"Rice",4', file_name: 'stock.csv' } }));
  expect(response.status).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith('attach_ai_stock_source', { p_job_id: 'job-1', p_kind: 'csv',
    p_content: 'name,quantity\n"Rice",4', p_metadata: { purpose: 'stock_intake', file_name: 'stock.csv' } });
});
it('records provider failures without executing an import', async () => {
  mock.provider.mockReturnValue({ stub: true, mapInventory: vi.fn().mockRejectedValue(new Error('Unavailable')) });
  expect((await POST(request({ action: 'inventory', text: 'Rice 5 100' }))).status).toBe(400);
  expect(mock.rpc).toHaveBeenLastCalledWith('finish_ai_job', { job: 'job-1', output: { error: 'Generation failed' }, failed: true });
});
it('keeps photo and voice stock extraction as owner-reviewed drafts', async () => {
  const mapInventoryImage = vi.fn().mockResolvedValue([{ name: 'Rice', opening_stock: '5' }]);
  const transcribeInventoryAudio = vi.fn().mockResolvedValue('Rice 5 100');
  const mapInventory = vi.fn().mockResolvedValue([{ name: 'Rice', opening_stock: '5' }]);
  mock.provider.mockReturnValue({ stub: false, mapInventoryImage, transcribeInventoryAudio, mapInventory });
  const image = await POST(request({ action: 'inventory_image', image: 'data:image/jpeg;base64,YWJj' }));
  expect(image.status).toBe(200);
  expect((await image.json()).rows).toEqual([{ name: 'Rice', opening_stock: '5' }]);
  const voice = await POST(request({ action: 'inventory_audio', audio: 'data:audio/webm;base64,YWJj' }));
  expect(voice.status).toBe(200);
  expect(transcribeInventoryAudio).toHaveBeenCalledOnce();
  expect(mapInventory).toHaveBeenCalledWith('Rice 5 100');
  expect(mock.rpc.mock.calls.filter(([name]) => name === 'approve_ai_job')).toHaveLength(0);
});
it('marks invoice extraction as an invoice job and never applies stock', async () => {
  const mapInvoiceImage = vi.fn().mockResolvedValue([{ name: 'Peak Milk', opening_stock: '4', cost_price: '120' }]);
  mock.provider.mockReturnValue({ stub: false, mapInvoiceImage });
  const response = await POST(request({ action: 'invoice_image', image: 'data:image/jpeg;base64,YWJj' }));
  expect(response.status).toBe(200);
  expect(mock.rpc).toHaveBeenLastCalledWith('finish_ai_job', {
    job: 'job-1', output: { rows: [{ name: 'Peak Milk', opening_stock: '4', cost_price: '120' }], source: 'invoice', stub: false }, failed: false,
  });
  expect(mock.rpc.mock.calls.some(([name]) => name.startsWith('apply_'))).toBe(false);
});

function aggregateRecords(invalidQuantity = false) {
  const records: Record<string, unknown[]> = {
    products: [{ id: 'p1', name: 'Rice', cost_price: 100 }],
    inventory: [{ id: 'i1', product_id: 'p1', quantity: invalidQuantity ? null : 10 }],
    sales: [
      { id: 's1', total: 400, status: 'completed', created_at: new Date().toISOString(), cashier_id: 'cashier', sale_items: [{ product_id: 'p1', quantity: 2, unit_price: 200 }] },
      { id: 's2', total: 300, status: 'completed', created_at: new Date().toISOString(), cashier_id: 'cashier', sale_items: [] },
      { id: 's3', total: 50, status: 'cancelled', created_at: new Date().toISOString(), cashier_id: 'cashier', sale_items: [] },
    ],
    financial_reversals: [{ id: 'r1', sale_id: 's2', kind: 'void' }],
  };
  const chains: Array<{ eq: ReturnType<typeof vi.fn> }> = [];
  mock.from.mockImplementation((table: string) => {
    const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ data: records[table], error: null }) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.order.mockReturnValue(chain);
    chains.push(chain); return chain;
  });
  return chains;
}

it('validates business records and sends deterministic scoped totals to the insight provider', async () => {
  const chains = aggregateRecords();
  const insights = vi.fn().mockResolvedValue([{ title: 'Sales', message: 'Reviewed figures', source: 'organization-data-only' }]);
  mock.provider.mockReturnValue({ stub: true, insights });
  const response = await POST(request({ action: 'insights', organization_id: 'foreign-org' }));
  expect(response.status).toBe(200);
  expect(insights).toHaveBeenCalledWith(expect.objectContaining({
    productCount: 1, unitsOnHand: 10, stockCost: 1000, salesTotal: 400, saleCount: 1,
  }), undefined);
  expect(chains).toHaveLength(4);
  expect(chains.every(chain => chain.eq.mock.calls.some(call => call[0] === 'organization_id' && call[1] === 'own-org'))).toBe(true);
});

it('refuses malformed analytical records instead of converting unknown stock into a numerical claim', async () => {
  aggregateRecords(true); const insights = vi.fn();
  mock.provider.mockReturnValue({ stub: true, insights });
  expect((await POST(request({ action: 'insights' }))).status).toBe(400);
  expect(insights).not.toHaveBeenCalled();
  expect(mock.rpc).toHaveBeenLastCalledWith('finish_ai_job', { job: 'job-1', output: { error: 'Generation failed' }, failed: true });
});
