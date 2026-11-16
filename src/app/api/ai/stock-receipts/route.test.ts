import { beforeEach, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import type { ReviewRowInput } from '@/lib/ai/stock-review-contract';

const mock = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => ({ apiContext: mock.context }));
const job = '50000000-0000-0000-0000-000000000001';
const owner = '20000000-0000-0000-0000-000000000001';
const org = '10000000-0000-0000-0000-000000000001';
const product = '30000000-0000-0000-0000-000000000001';
const warehouse = '40000000-0000-0000-0000-000000000001';
const selectionId = '70000000-0000-0000-0000-000000000001';
const approvalId = '80000000-0000-0000-0000-000000000001';
const operationId = '90000000-0000-0000-0000-000000000001';
const digest = 'a'.repeat(64);
const row: ReviewRowInput = { row_index: 0, mode: 'existing', product_id: product, warehouse_id: warehouse,
  name: 'Rice', sku: 'RICE', stock_unit: 'bag', quantity: '2', unit_cost: '150.00', zero_confirmed: false, selling_price: null };
const review = { revision: 1, rows: [row] };
const snapshot = { job, rows: [{ name: 'Rice' }], receipts: [], review, operations: [],
  source: { kind: 'text', hash: digest, byte_length: 10, text: 'Rice 2 150', evidence_available: true } };
const selection = { selection_id: selectionId, revision: 1, review_digest: digest, expires_at: '2026-11-16T10:10:00Z',
  groups: [{ row_index: 0, operation_id: operationId, receipt_id: operationId, mode: 'existing', product_id: product,
    warehouse_id: warehouse, product_name: 'Rice', warehouse_name: 'Main', stock_unit: 'bag', quantity: 2, cost_kind: 'paid',
    unit_cost_minor: '15000', selling_price_minor: null, stock_before: 10, stock_after: 12, cost_before_minor: '10000', cost_after_minor: '10833' }] };
const approval = { approval_id: approvalId, selection_id: selectionId, revision: 1, review_digest: digest,
  row_indices: [0], approved_at: '2026-11-16T10:00:00Z', expires_at: selection.expires_at };
const completed = { status: 'completed', row_index: 0, operation_id: operationId, receipt_id: operationId, product_id: product, average_cost: '108.33' };
const request = (body: unknown, headers: Record<string, string> = {}) => new Request('https://app.example/api/ai/stock-receipts', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  mock.context.mockResolvedValue({ db: { rpc: mock.rpc }, org, profile: { id: owner, organization_id: org } });
  mock.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'get_ai_stock_review' ? snapshot
    : name === 'save_ai_stock_review' ? review : name === 'preview_ai_stock_selection' ? selection
    : name === 'approve_ai_stock_selection' ? approval : name === 'execute_ai_stock_selection_row' ? completed : null }));
});

it('reads owned review and result state through its server boundary without starting paid processing', async () => {
  const response = await GET(new Request(`https://app.example/api/ai/stock-receipts?job=${job}`));
  expect(response.status).toBe(200); expect(await response.json()).toEqual(snapshot);
  expect(mock.context).toHaveBeenCalledWith(['business_owner']);
  expect(mock.rpc.mock.calls).toEqual([['get_ai_stock_review', { p_job_id: job }]]);
});

it('discovers the active task without trusting a browser-wide job pointer', async () => {
  mock.rpc.mockResolvedValueOnce({ data: null, error: null });
  const response = await GET(new Request('https://app.example/api/ai/stock-receipts'));
  expect(await response.json()).toBeNull();
  expect(mock.rpc).toHaveBeenCalledWith('get_ai_stock_review', { p_job_id: null });
});

it('saves corrected rows with an explicit revision precondition, without applying them', async () => {
  expect((await POST(request({ action: 'save_review', job, expected_revision: null, rows: [row] }))).status).toBe(200);
  expect(mock.rpc.mock.calls).toEqual([['save_ai_stock_review', { p_job_id: job, p_expected_revision: null, p_rows: [row] }]]);
});

it('previews a physical receipt and approves only the exact server selection', async () => {
  expect((await POST(request({ action: 'preview_selection', job, revision: 1, row_indices: [0], physical_received: true }))).status).toBe(200);
  expect(mock.rpc).toHaveBeenLastCalledWith('preview_ai_stock_selection', { p_job_id: job, p_revision: 1, p_row_indices: [0], p_physical_received: true });
  expect((await POST(request({ action: 'approve_selection', job, revision: 1, selection_id: selectionId, review_digest: digest, confirm: true }))).status).toBe(200);
  expect(mock.rpc).toHaveBeenLastCalledWith('approve_ai_stock_selection', { p_job_id: job, p_selection_id: selectionId, p_revision: 1, p_review_digest: digest });
});

it('executes only a stored approval and group reference', async () => {
  const response = await POST(request({ action: 'execute_reviewed', job, approval_id: approvalId, row_index: 0 }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual(completed);
  expect(mock.rpc.mock.calls).toEqual([['execute_ai_stock_selection_row', { p_job_id: job, p_approval_id: approvalId, p_row_index: 0 }]]);
});

it.each([
  { action: 'execute_reviewed', job, approval_id: approvalId, row_index: 0, quantity: 999 },
  { action: 'execute_reviewed', job, approval_id: approvalId, row_index: 0, organization_id: org },
  { action: 'approve_selection', job, revision: 1, selection_id: selectionId, review_digest: digest, confirm: false },
  { action: 'preview_selection', job, revision: 1, row_indices: [0], physical_received: false },
  { job, row_index: 0, product_id: product, quantity: 2, unit_cost: 150, confirm: true },
])('rejects forged, unconfirmed or legacy first-write payloads: %j', async body => {
  expect((await POST(request(body))).status).toBe(400); expect(mock.rpc).not.toHaveBeenCalled();
});

it('refuses a foreign browser origin before invoking business operations', async () => {
  expect((await POST(request({ action: 'execute_reviewed', job, approval_id: approvalId, row_index: 0 }, { Origin: 'https://foreign.example' }))).status).toBe(403);
  expect(mock.context).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled();
});

it('uses the actual Host when Next normalises a loopback request URL', async () => {
  const response = await POST(new Request('http://localhost:3141/api/ai/stock-receipts', {
    method: 'POST', headers: { Host: '127.0.0.1:3141', Origin: 'http://127.0.0.1:3141' },
    body: JSON.stringify({ action: 'save_review', job, expected_revision: null, rows: [row] }),
  }));
  expect(response.status).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith('save_ai_stock_review', { p_job_id: job, p_expected_revision: null, p_rows: [row] });
});

it.each([
  { Origin: 'https://foreign.example', Host: 'app.example', 'X-Forwarded-Host': 'foreign.example' },
  { Origin: 'http://app.example', Host: 'app.example' },
  { Origin: 'null', Host: 'app.example' },
  { Origin: 'https://app.example', Host: 'app.example?invalid' },
])('rejects forwarded-host spoofing, scheme changes and opaque origins: %j', async headers => {
  expect((await POST(request({ action: 'close_review', job, expected_revision: 1 }, headers))).status).toBe(403);
  expect(mock.context).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled();
});

it('rejects a changed account before an active-task read can return another Owner data', async () => {
  const response = await GET(new Request('https://app.example/api/ai/stock-receipts', { headers: { 'X-Track-Expected-Owner': product } }));
  expect(response.status).toBe(409); expect(mock.rpc).not.toHaveBeenCalled();
});

it('returns typed revision conflicts and missing-migration failures without a fallback write', async () => {
  mock.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'REVISION_CONFLICT: A newer review is saved.' } });
  const response = await POST(request({ action: 'save_review', job, expected_revision: 1, rows: [row] }));
  expect(response.status).toBe(409); expect((await response.json()).code).toBe('REVISION_CONFLICT');
  mock.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Not found' } });
  expect((await GET(new Request(`https://app.example/api/ai/stock-receipts?job=${job}`))).status).toBe(503);
});
