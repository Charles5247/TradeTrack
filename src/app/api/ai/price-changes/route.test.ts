import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';

const mock = vi.hoisted(() => ({ context: vi.fn(), access: vi.fn(), service: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => ({ apiContext: mock.context }));
vi.mock('@/lib/platform/support', () => ({ platformDb: () => ({ rpc: mock.service }) }));

const org = '10000000-0000-0000-0000-000000000001';
const owner = '20000000-0000-0000-0000-000000000001';
const productId = '30000000-0000-0000-0000-000000000001';
const job = '50000000-0000-0000-0000-000000000001';
const operationId = '90000000-0000-0000-0000-000000000001';
const reviewDigest = 'a'.repeat(64);
const validUntil = '2026-11-23T15:00:00Z';
const prepared = {
  operationId, job, rowIndex: 0, productId, productName: 'Rice', oldPriceMinor: '17000',
  newPriceMinor: '20000', reviewDigest, status: 'prepared', expiresAt: '2026-11-23T14:45:00Z', completedAt: null,
};
const prepare = { action: 'prepare', job, rowIndex: 0, operationId, newPriceMinor: '20000' };
const approve = { action: 'approve', operationId, reviewDigest };
const status = { action: 'status', operationId };
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://localhost/api/ai/price-changes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', host: 'shop.example', origin: 'https://shop.example',
      'x-track-expected-owner': owner, 'x-track-expected-organization': org, ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('AI_PRICE_WRITES_ENABLED', 'true');
  mock.context.mockResolvedValue({ db: { rpc: mock.access }, org, profile: { id: owner, organization_id: org } });
  mock.access.mockResolvedValue({ data: {
    organization_id: org, active: true, plan_id: 'b3000000-0000-0000-0000-000000000003',
    server_time: '2026-11-23T14:30:00Z', valid_until: validUntil,
  } });
  mock.service.mockResolvedValue({ data: prepared, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it('keeps the workflow disabled by default before consulting or writing to the database', async () => {
  vi.stubEnv('AI_PRICE_WRITES_ENABLED', '');
  expect((await POST(request(approve))).status).toBe(503);
  expect(mock.context).not.toHaveBeenCalled();
  expect(mock.service).not.toHaveBeenCalled();
});

it('lets an active Owner recover a known operation after writes are switched off', async () => {
  vi.stubEnv('AI_PRICE_WRITES_ENABLED', 'false');
  expect((await POST(request(status))).status).toBe(200);
  expect(mock.access).not.toHaveBeenCalled();
  expect(mock.service).toHaveBeenCalledWith('manage_ai_price_change', {
    p_actor_id: owner, p_organization_id: org, p_operation_id: operationId, p_action: 'status',
  });
});

it('prepares a product from the scoped receipt and keeps the payload free of caller-supplied identity', async () => {
  const response = await POST(request(prepare));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual(prepared);
  expect(mock.context).toHaveBeenCalledWith(['business_owner']);
  expect(mock.service).toHaveBeenCalledWith('manage_ai_price_change', {
    p_actor_id: owner, p_organization_id: org, p_operation_id: operationId,
    p_access_until: validUntil, p_action: 'prepare', p_job_id: job, p_row_index: 0, p_new_price_minor: 20000,
  });
});

it('approves only the server-issued digest and checks the original operation without spending allowance', async () => {
  expect((await POST(request(approve))).status).toBe(200);
  expect(mock.service).toHaveBeenLastCalledWith('manage_ai_price_change', {
    p_actor_id: owner, p_organization_id: org, p_operation_id: operationId,
    p_access_until: validUntil, p_action: 'approve', p_review_digest: reviewDigest,
  });
  expect((await POST(request(status))).status).toBe(200);
  expect(mock.access).toHaveBeenCalledTimes(1);
  expect(mock.service).toHaveBeenLastCalledWith('manage_ai_price_change', {
    p_actor_id: owner, p_organization_id: org, p_operation_id: operationId, p_action: 'status',
  });
});

it.each(['1.20', '-1', '1e5', '1000000000000', '0001'])('rejects invalid integer kobo %s', async newPriceMinor => {
  expect((await POST(request({ ...prepare, newPriceMinor }))).status).toBe(400);
  expect(mock.service).not.toHaveBeenCalled();
});

it('rejects foreign browser origins, mismatched accounts and an unentitled Owner', async () => {
  expect((await POST(request(approve, { origin: 'https://other.example' }))).status).toBe(403);
  expect((await POST(request(approve, { 'x-track-expected-organization': 'different' }))).status).toBe(409);
  mock.access.mockResolvedValueOnce({ data: { organization_id: org, active: false } });
  expect((await POST(request(approve))).status).toBe(403);
  expect(mock.service).not.toHaveBeenCalled();
});

it('distinguishes a confirmed absent operation from unanswered status calls', async () => {
  mock.service.mockResolvedValueOnce({ error: { message: 'PRICE_NOT_FOUND' } });
  expect((await POST(request(status))).status).toBe(404);
  mock.service.mockResolvedValueOnce({ error: { message: 'Internal details' } });
  const response = await POST(request(status));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('Internal details');
});
