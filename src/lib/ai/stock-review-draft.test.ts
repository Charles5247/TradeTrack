// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { User } from '@/types';
import { useAuthStore } from '@/store';
import * as offlineDB from '@/lib/offline/db';
import { reviewActionSchema, reviewSnapshotSchema, type StockReviewSnapshot, type StockSelection,
  type ReviewedStockOperation, type StockExecution } from './stock-review-contract';
import { clearStockReview, createStockReview, loadStockReview, initializeStockReviewRows, saveStockReview,
  saveServerStockReview, previewStockSelection, approveStockSelection, submitStockReviewReceipt,
  stageFirstStockLocation, resolveFirstStockLocation,
  recordStockExecution, resumeLegacyStockReview, type StockReviewRow, type StockReviewScope, type StockReviewAttempt } from './stock-review-draft';

const account = vi.hoisted(() => ({ namespace: '' }));
vi.mock('@/lib/offline/auth-cache', () => ({ getOfflineAccountNamespace: () => account.namespace }));
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const job = uid(1), product = uid(2), warehouse = uid(3), approvalId = uid(4);
const scope: StockReviewScope = { ownerId: 'owner', organizationId: 'org' };
const owner: User = { id: 'owner', organization_id: 'org', role: 'business_owner', status: 'active',
  email: 'owner@example.test', full_name: 'Test Owner', created_at: '', updated_at: '' };
const sourceRows = [{ name: 'Rice', sku: 'RICE', opening_stock: '4', cost_price: '150' }];
const row = (): StockReviewRow => ({ receiptId: `${job}:0`, source: 'Rice', productId: product, warehouseId: warehouse,
  quantity: '4', unitCost: '150', zeroConfirmed: false, state: 'draft', mode: 'existing', newName: 'Rice', newSku: 'RICE', stockUnit: 'bag', sellingPrice: '' });
let db: Awaited<ReturnType<typeof offlineDB.getDB>>;
let snapshot: StockReviewSnapshot;
let selection: StockSelection;
const fetchMock = vi.fn();
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

beforeEach(async () => {
  account.namespace = `review-${crypto.randomUUID()}`; useAuthStore.getState().setUser(owner);
  db = await offlineDB.getDB();
  snapshot = { job, rows: sourceRows, receipts: [], review: null, operations: [],
    source: { kind: 'csv', text: 'name,quantity,cost\nRice,4,150', hash: 'source-hash', byte_length: 35, evidence_available: true } };
  selection = { selection_id: uid(5), revision: 1, review_digest: 'a'.repeat(64), expires_at: '2099-01-01T00:00:00Z', groups: [{
    row_index: 0, operation_id: uid(6), receipt_id: uid(7), mode: 'existing', product_id: product, warehouse_id: warehouse,
    product_name: 'Rice', warehouse_name: 'Main', stock_unit: 'bag', quantity: 4, cost_kind: 'paid', unit_cost_minor: '15000',
    selling_price_minor: null, stock_before: 7, stock_after: 11, cost_before_minor: '10000', cost_after_minor: '11818',
  }] };
  fetchMock.mockReset().mockImplementation(async (_url: string, init?: RequestInit) => {
    if (!init?.body) return response(reviewSnapshotSchema.parse(snapshot));
    const body = reviewActionSchema.parse(JSON.parse(String(init.body)));
    if (body.action === 'save_review') {
      if (body.expected_revision !== (snapshot.review?.revision ?? null)) return response({ error: 'Account review changed', code: 'REVISION_CONFLICT' }, 409);
      snapshot.review = { revision: (snapshot.review?.revision ?? 0) + 1, rows: body.rows };
      return response(snapshot.review);
    }
    if (body.action === 'preview_selection') return response({ ...selection, revision: body.revision });
    if (body.action === 'approve_selection') {
      snapshot.operations = selection.groups.map(group => ({ approval_id: approvalId, selection_id: selection.selection_id,
        revision: body.revision, row_index: group.row_index, operation_id: group.operation_id, receipt_id: group.receipt_id,
        review_digest: body.review_digest, expires_at: selection.expires_at, row: snapshot.review!.rows[group.row_index], status: 'approved', result: null }));
      return response({ approval_id: approvalId, selection_id: selection.selection_id, revision: body.revision,
        review_digest: body.review_digest, row_indices: selection.groups.map(group => group.row_index), approved_at: '2026-11-16T00:00:00Z', expires_at: selection.expires_at });
    }
    if (body.action === 'execute_reviewed') return response(completed());
    return response({ closed: true });
  });
  vi.stubGlobal('fetch', fetchMock); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); window.localStorage.clear();
});
afterEach(() => { db.close(); useAuthStore.getState().setUser(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const bodies = () => fetchMock.mock.calls.flatMap(([, init]) => init?.body ? [JSON.parse(String(init.body))] : []);
async function initialized() {
  const draft = await createStockReview(scope, job, sourceRows);
  return saveStockReview(scope, draft, [row()]);
}
async function reviewed() { return previewStockSelection(scope, await initialized(), [0]); }
async function approved() { return approveStockSelection(scope, await reviewed()); }
function completed(): StockExecution { return { status: 'completed', row_index: 0, operation_id: uid(6), receipt_id: uid(7), product_id: product, average_cost: '118.18' }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

it('keeps scoped device corrections and their stable row identity offline without issuing an operation', async () => {
  const first = await initialized();
  const changed = await saveStockReview(scope, first, [{ ...row(), quantity: '7', unitCost: '151.50' }]);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  expect(await loadStockReview(scope)).toEqual(changed);
  expect(changed.rows?.[0]).toMatchObject({ receiptId: `${job}:0`, quantity: '7', unitCost: '151.50' });
  expect(bodies()).toEqual([]);
});
it('persists a first-location identity across reloads without sending a receipt or overwriting edits', async () => {
  const first = await initialized();
  const unassigned = await saveStockReview(scope, first, [{ ...row(), warehouseId: '', quantity: '9' }]);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const location = { id: warehouse, name: 'Main Shop' };
  await stageFirstStockLocation(scope, unassigned, location);
  const restored = (await loadStockReview(scope))!;
  expect(restored.firstLocation).toEqual(location);
  expect(restored.rows?.[0]).toMatchObject({ warehouseId: '', quantity: '9' });
  await expect(resolveFirstStockLocation(scope, restored, uid(98))).rejects.toThrow();
  const confirmed = await resolveFirstStockLocation(scope, restored, warehouse);
  expect(confirmed.firstLocation).toBeUndefined();
  expect(confirmed.rows?.[0]).toMatchObject({ warehouseId: warehouse, quantity: '9' });
  expect(bodies()).toEqual([]);
});
it('uses device compare-and-swap rather than overwriting corrections from a stale tab', async () => {
  const first = await initialized();
  await saveStockReview(scope, first, [{ ...row(), quantity: '5' }]);
  await expect(saveStockReview(scope, first, [{ ...row(), quantity: '6' }])).rejects.toThrow('another tab');
});
it('persists corrected nullable draft fields on the server without receiving stock', async () => {
  const draft = await initialized();
  const changed = await saveStockReview(scope, draft, [{ ...row(), unitCost: '', warehouseId: '', productId: '', quantity: '' }]);
  const saved = await saveServerStockReview(scope, changed);
  expect(saved).toMatchObject({ serverRevision: 1, dirty: false });
  expect(snapshot.review?.rows[0]).toMatchObject({ product_id: null, warehouse_id: null, quantity: null, unit_cost: null });
  expect(bodies().map(body => body.action)).toEqual(['save_review']);
});
it('reopens corrected account rows on a second device and retains genuine original source separately', async () => {
  const saved = await saveServerStockReview(scope, await initialized());
  snapshot.review!.rows[0].quantity = '9'; snapshot.review!.revision = 2;
  account.namespace = `second-device-${crypto.randomUUID()}`;
  const reopened = await loadStockReview(scope);
  expect(reopened?.job).toBe(job); expect(reopened?.source?.text).toContain('Rice,4,150');
  const ready = await initializeStockReviewRows(scope, reopened!, [row()]);
  expect(ready.rows?.[0].quantity).toBe('9'); expect(ready.serverRevision).toBe(2);
  expect(saved.serverRevision).toBe(1); expect(bodies().some(body => body.action === 'execute_reviewed')).toBe(false);
});
it('preserves offline corrections when the server revision changed and discards only after explicit choice', async () => {
  const saved = await saveServerStockReview(scope, await initialized());
  await saveStockReview(scope, saved, [{ ...row(), quantity: '8' }]);
  snapshot.review!.revision = 2; snapshot.review!.rows[0] = { ...snapshot.review!.rows[0], quantity: '6' };
  const conflict = await loadStockReview(scope);
  expect(conflict).toMatchObject({ conflict: true, serverRevision: 1 }); expect(conflict?.rows?.[0].quantity).toBe('8');
  await expect(saveServerStockReview(scope, conflict!)).rejects.toThrow('another device');
  const reloaded = await loadStockReview(scope, { discardLocalEdits: true });
  expect(reloaded?.rows?.[0].quantity).toBe('6'); expect(reloaded).toMatchObject({ dirty: false, conflict: false, serverRevision: 2 });
});
it('binds preview to the exact subset and rejects a successful-looking different subset', async () => {
  const current = await initialized();
  selection.groups[0].row_index = 1;
  await expect(previewStockSelection(scope, current, [0])).rejects.toThrow('safely');
  expect(bodies().find(body => body.action === 'preview_selection')).toMatchObject({ physical_received: true, row_indices: [0], revision: 1 });
});
it('persists approval intent then the frozen approved operation before execution, with distinct receipt and row IDs', async () => {
  const current = await approved();
  expect(current.pendingApproval).toBeUndefined();
  expect(current.rows?.[0]).toMatchObject({ receiptId: `${job}:0`, state: 'confirmation_pending', attempt: { receipt_id: uid(7), operation_id: uid(6), approval_id: approvalId } });
  expect(bodies().some(body => body.action === 'execute_reviewed')).toBe(false);
  expect(bodies().slice(0, 2).map(body => body.action)).toEqual(['save_review', 'preview_selection']);
  await submitStockReviewReceipt(scope, current.rows![0].attempt!);
  expect(bodies().at(-1)).toEqual({ action: 'execute_reviewed', job, approval_id: approvalId, row_index: 0 });
  expect(bodies().at(-1)).not.toHaveProperty('quantity');
  expect(fetchMock.mock.calls.at(-1)?.[1]?.headers).toMatchObject({ 'X-Track-Expected-Owner': scope.ownerId, 'X-Track-Expected-Organization': scope.organizationId });
});
it('does not approve or execute when durable pre-approval storage fails', async () => {
  const current = await reviewed();
  vi.spyOn(db, 'transaction').mockImplementationOnce(() => { throw new Error('Device storage full'); });
  await expect(approveStockSelection(scope, current)).rejects.toThrow('storage full');
  expect(bodies().map(body => body.action)).not.toContain('approve_selection');
});
it('recovers a lost approval response from server operations without approving or receiving again', async () => {
  const current = await reviewed(); const normal = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const result = await normal(url, init);
    if (init?.body && JSON.parse(String(init.body)).action === 'approve_selection') throw new Error('Connection lost after approval');
    return result;
  });
  await expect(approveStockSelection(scope, current)).rejects.toThrow('Connection lost');
  const restored = await loadStockReview(scope);
  expect(restored?.pendingApproval).toBeUndefined(); expect(restored?.rows?.[0].attempt?.approval_id).toBe(approvalId);
  expect(restored?.rows?.[0].state).toBe('confirmation_pending');
  expect(bodies().filter(body => body.action === 'approve_selection')).toHaveLength(1);
  expect(bodies().some(body => body.action === 'execute_reviewed')).toBe(false);
});
it('keeps a lost approval unknown when no matching server ledger is available', async () => {
  const current = await reviewed();
  fetchMock.mockResolvedValueOnce(response({ error: 'Approval response unavailable', code: 'REQUEST_FAILED' }, 503));
  await expect(approveStockSelection(scope, current)).rejects.toThrow('unavailable');
  const restored = await loadStockReview(scope);
  expect(restored?.pendingApproval?.selection_id).toBe(selection.selection_id);
  await expect(clearStockReview(scope, restored!)).rejects.toThrow('unconfirmed');
});
it.each([1, 2])('uses historical operation evidence to resolve an old unknown approval after another device approves revision %i', async revision => {
  const current = await reviewed(); const normal = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const result = await normal(url, init);
    if (init?.body && JSON.parse(String(init.body)).action === 'approve_selection') throw new Error('Lost response');
    return result;
  });
  await expect(approveStockSelection(scope, current)).rejects.toThrow('Lost response');
  const old = snapshot.operations[0];
  snapshot.operations[0] = { ...old, status: 'no_effect', result: { status: 'no_effect', row_index: 0,
    operation_id: old.operation_id, receipt_id: old.receipt_id, code: 'REVISION_SUPERSEDED', message: 'Review changed.' } };
  snapshot.review!.revision = revision;
  snapshot.operations.push({ ...old, revision, selection_id: uid(90), approval_id: uid(91), operation_id: uid(92), status: 'approved', result: null });
  const restored = await loadStockReview(scope);
  expect(restored?.pendingApproval).toBeUndefined(); expect(restored?.rows?.[0].attempt?.operation_id).toBe(uid(92));
  expect(bodies().some(body => body.action === 'execute_reviewed')).toBe(false);
});
it('restores the latest same-revision approval on a new device instead of an earlier expired selection', async () => {
  await approved();
  const old = snapshot.operations[0];
  snapshot.operations[0] = { ...old, status: 'no_effect', result: { status: 'no_effect', row_index: 0,
    operation_id: old.operation_id, receipt_id: old.receipt_id, code: 'APPROVAL_EXPIRED', message: 'Old approval expired.' } };
  snapshot.operations.push({ ...old, selection_id: uid(90), approval_id: uid(91), operation_id: uid(92), status: 'approved', result: null });
  account.namespace = `fresh-device-${crypto.randomUUID()}`;
  const reopened = await loadStockReview(scope);
  const restored = await initializeStockReviewRows(scope, reopened!, [row()]);
  expect(restored.rows?.[0]).toMatchObject({ state: 'confirmation_pending', operation: { operation_id: uid(92) } });
  expect(bodies().some(body => body.action === 'execute_reviewed')).toBe(false);
});
it('keeps a confirmed business effect ahead of later no-effect history on a fresh device', async () => {
  await approved();
  const old = snapshot.operations[0];
  snapshot.operations[0] = { ...old, status: 'completed', result: completed() };
  snapshot.operations.push({ ...old, selection_id: uid(90), approval_id: uid(91), operation_id: uid(92), status: 'no_effect',
    result: { status: 'no_effect', row_index: 0, operation_id: uid(92), receipt_id: old.receipt_id,
      code: 'APPROVAL_EXPIRED', message: 'Another selection expired.' } });
  snapshot.receipts = [{ row_index: 0, product_id: product, warehouse_id: warehouse, quantity: 4,
    unit_cost: '150', average_cost: '118.18', created_product: false, approved_product: null }];
  account.namespace = `fresh-device-${crypto.randomUUID()}`;
  const reopened = await loadStockReview(scope);
  const restored = await initializeStockReviewRows(scope, reopened!, [row()]);
  expect(restored.rows?.[0]).toMatchObject({ state: 'saved', operation: { operation_id: old.operation_id }, savedProductId: product });
  expect(bodies().some(body => body.action === 'execute_reviewed')).toBe(false);
});
it('rejects deliberate offline approval before storing pending intent or issuing requests', async () => {
  const current = await reviewed(); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await expect(approveStockSelection(scope, current)).rejects.toThrow('Reconnect');
  expect((await loadStockReview(scope))?.pendingApproval).toBeUndefined();
  expect(bodies().some(body => body.action === 'approve_selection')).toBe(false);
});
it('keeps unknown receipts immutable; only the matching canonical no-effect result unlocks correction', async () => {
  const current = await approved();
  await expect(saveStockReview(scope, current, [{ ...current.rows![0], state: 'draft', attempt: undefined }])).rejects.toThrow('already been attempted');
  const result: StockExecution = { status: 'no_effect', row_index: 0, operation_id: uid(6), receipt_id: uid(7), code: 'STALE_FACTS', message: 'Stock changed; review again.', changes: [{ field: 'stock', reviewed: 7, current: 8 }] };
  const reset = await recordStockExecution(scope, current, result);
  expect(reset.rows?.[0]).toMatchObject({ state: 'draft', error: result.message, changes: result.changes });
  expect(reset.rows?.[0].attempt).toBeUndefined();
  expect((await saveStockReview(scope, reset, [{ ...reset.rows![0], quantity: '3' }])).rows?.[0].quantity).toBe('3');
});
it('preserves a completed row and rejects attempts to substitute another operation result', async () => {
  const current = await approved();
  await expect(recordStockExecution(scope, current, { ...completed(), operation_id: uid(99) })).rejects.toThrow('safely');
  const saved = await recordStockExecution(scope, current, completed());
  await expect(saveStockReview(scope, saved, [{ ...saved.rows![0], state: 'confirmation_pending' }])).rejects.toThrow('already been attempted');
  await expect(recordStockExecution(scope, saved, { status: 'no_effect', row_index: 0, operation_id: uid(6), receipt_id: uid(7),
    code: 'STALE_FACTS', message: 'Inconsistent later response' })).rejects.toThrow('safely');
});
it('treats digest-generated PostgreSQL UUID operation IDs as opaque identifiers', async () => {
  selection.groups[0].operation_id = '30000000-0000-0000-0000-000000000006';
  selection.groups[0].receipt_id = '70000000-0000-0000-0000-000000000007';
  const current = await approved();
  expect(current.rows?.[0].attempt?.operation_id).toBe(selection.groups[0].operation_id);
  expect(current.rows?.[0].attempt?.receipt_id).toBe(selection.groups[0].receipt_id);
});
it('keeps old v1 attempts available for read-only recovery and never executes their raw fields', async () => {
  const current = await initialized();
  const legacy: StockReviewAttempt = { receipt_id: `${job}:0`, organization_id: 'org', job, row_index: 0, product_id: product,
    warehouse_id: warehouse, quantity: 4, unit_cost: 150, mode: 'existing', name: 'Rice', sku: 'RICE', stock_unit: 'bag', selling_price: 0, confirm: true };
  await saveStockReview(scope, current, [{ ...row(), state: 'confirmation_pending', attempt: legacy }]);
  expect((await loadStockReview(scope))?.rows?.[0].state).toBe('confirmation_pending');
  await expect(submitStockReviewReceipt(scope, legacy)).rejects.toThrow('raw fields');
  expect(bodies().some(body => body.action === 'execute_reviewed')).toBe(false);
});
it('rejects blank-to-zero coercion and fractional-cent executable attempts, while allowing explicit real zero', async () => {
  const current = await initialized();
  const zero = await saveStockReview(scope, current, [{ ...row(), unitCost: '0.00', zeroConfirmed: true }]);
  const saved = await saveServerStockReview(scope, zero); expect(saved.serverRows?.[0]).toMatchObject({ unit_cost: '0.00', zero_confirmed: true });
  const bad: StockReviewAttempt = { receipt_id: `${job}:0`, organization_id: 'org', job, row_index: 0, product_id: product,
    warehouse_id: warehouse, quantity: 4, unit_cost: 1.001, mode: 'existing', name: 'Rice', sku: 'RICE', stock_unit: 'bag', selling_price: 0, confirm: true };
  await expect(submitStockReviewReceipt(scope, bad)).rejects.toThrow();
});
it('fails closed after an account or role switch while a scoped response is in flight', async () => {
  const current = await approved(); const waiting = deferred<Response>(); fetchMock.mockReturnValueOnce(waiting.promise);
  const execution = submitStockReviewReceipt(scope, current.rows![0].attempt!);
  useAuthStore.getState().setUser({ ...owner, role: 'cashier' }); waiting.resolve(response(completed()));
  await expect(execution).rejects.toThrow('account changed');
});
it('isolates cached reviews and retains failed legacy pointers for recovery', async () => {
  await initialized(); useAuthStore.getState().setUser({ ...owner, id: 'other' });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  expect(await loadStockReview({ ...scope, ownerId: 'other' })).toBeNull();
  useAuthStore.getState().setUser(owner); window.localStorage.setItem('trackasuwa.ai.stockJob', job);
  await expect(resumeLegacyStockReview(scope)).rejects.toThrow('Reconnect');
  expect(window.localStorage.getItem('trackasuwa.ai.stockJob')).toBe(job);
});
it('restores approved operations and new-product fields from the server without automatic execution', async () => {
  const current = await reviewed(); const input = snapshot.review!.rows[0];
  snapshot.review!.rows[0] = { ...input, mode: 'new', product_id: null, name: 'New Rice', sku: 'NEW', stock_unit: 'bag', selling_price: '200.00' };
  const operation: ReviewedStockOperation = { approval_id: approvalId, selection_id: uid(5), revision: 1, row_index: 0,
    operation_id: uid(6), receipt_id: uid(7), review_digest: 'a'.repeat(64), expires_at: selection.expires_at,
    row: snapshot.review!.rows[0], status: 'approved', result: null };
  snapshot.operations = [operation];
  const restored = await loadStockReview(scope);
  expect(restored?.rows?.[0]).toMatchObject({ mode: 'new', newName: 'New Rice', newSku: 'NEW', stockUnit: 'bag', sellingPrice: '200.00', state: 'confirmation_pending' });
  expect(restored?.rows?.[0].receiptId).toBe(current.rows![0].receiptId);
  expect(bodies().some(body => body.action === 'execute_reviewed')).toBe(false);
});
