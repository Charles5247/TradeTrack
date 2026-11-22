import { beforeEach, expect, it, vi } from 'vitest';

const { apiContext, rpc, maybeSingle } = vi.hoisted(() => ({
  apiContext: vi.fn(), rpc: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock('@/lib/auth/api-context', () => ({ apiContext }));
import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  maybeSingle.mockResolvedValue({ data: { id: 'sale-2', status: 'completed' }, error: null });
  rpc.mockResolvedValue({ data: 'reversal-1', error: null });
  apiContext.mockResolvedValue({ db: { from: () => query, rpc }, org: 'org-1' });
});

it('uses the atomic reversal function for a completed sale', async () => {
  const response = await POST(new Request('http://localhost/api/sales/sale-2/cancel', {
    method: 'POST', body: JSON.stringify({ reason: 'Duplicate sale' }),
  }), { params: Promise.resolve({ id: 'sale-2' }) });
  expect(response.status).toBe(200);
  expect(apiContext).toHaveBeenCalledWith(['business_owner']);
  expect(rpc).toHaveBeenCalledWith('reverse_financial_sale', {
    target: 'sale-2', reversal_kind: 'void', reversal_reason: 'Duplicate sale',
  });
});

it('requires a reason and never calls the reversal function twice for a non-completed sale', async () => {
  const missingReason = await POST(new Request('http://localhost', {
    method: 'POST', body: JSON.stringify({ reason: 'x' }),
  }), { params: Promise.resolve({ id: 'sale-2' }) });
  expect(missingReason.status).toBe(400);
  maybeSingle.mockResolvedValue({ data: { id: 'sale-2', status: 'cancelled' }, error: null });
  const reversed = await POST(new Request('http://localhost', {
    method: 'POST', body: JSON.stringify({ reason: 'Duplicate sale' }),
  }), { params: Promise.resolve({ id: 'sale-2' }) });
  expect(reversed.status).toBe(409);
  expect(rpc).not.toHaveBeenCalled();
});

it('tries the guarded duplicate reversal only when the normal reversal finds no stock ledger', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'Stock has not reconciled. Sync and review stock before reversing this sale' } })
    .mockResolvedValueOnce({ data: 'duplicate-reversal', error: null });
  const response = await POST(new Request('http://localhost', {
    method: 'POST', body: JSON.stringify({ reason: 'Duplicate by mistake' }),
  }), { params: Promise.resolve({ id: 'sale-2' }) });
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenLastCalledWith('reverse_unapplied_duplicate_sale', {
    target: 'sale-2', reversal_reason: 'Duplicate by mistake',
  });
});

it('keeps other reversal conflicts blocked', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'Sale already reversed' } });
  const response = await POST(new Request('http://localhost', {
    method: 'POST', body: JSON.stringify({ reason: 'Duplicate by mistake' }),
  }), { params: Promise.resolve({ id: 'sale-2' }) });
  expect(response.status).toBe(409);
  expect(rpc).toHaveBeenCalledTimes(1);
});
