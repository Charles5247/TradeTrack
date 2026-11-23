// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ImportRow } from '@/lib/imports/preview';
import type { StockReviewDraft, StockReviewRow, StockReviewScope, StockReviewAttempt } from '@/lib/ai/stock-review-draft';
import type { StockExecution, StockSelection, ReviewedStockOperation } from '@/lib/ai/stock-review-contract';

type TestUser = { id: string; role: string; organization_id: string; status: string };
const mock = vi.hoisted(() => ({
  load: vi.fn(), initialize: vi.fn(), save: vi.fn(), serverSave: vi.fn(), preview: vi.fn(), approve: vi.fn(), execute: vi.fn(), record: vi.fn(),
  catalogFailed: false, user: { id: 'owner', role: 'business_owner', organization_id: 'org', status: 'active' } as TestUser,
  saved: null as StockReviewDraft | null,
}));
vi.mock('@/lib/ai/stock-review-draft', () => ({
  loadStockReview: mock.load, initializeStockReviewRows: mock.initialize, saveStockReview: mock.save, saveServerStockReview: mock.serverSave,
  previewStockSelection: mock.preview, approveStockSelection: mock.approve, submitStockReviewReceipt: mock.execute, recordStockExecution: mock.record,
}));
vi.mock('@/store', () => ({ useAuthStore: Object.assign((pick: (state: { user: TestUser }) => unknown) => pick({ user: mock.user }), { getState: () => ({ user: mock.user }) }) }));
vi.mock('@/i18n/text', () => ({ useCopy: () => (value: string) => value, TranslatedText: ({ text }: { text: string }) => text }));
vi.mock('@/lib/offline/db', () => ({ getDB: async () => ({ getAll: async () => [] }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: (table: string) => ({ select: () => ({ eq: () => ({ range: async () => ({
  error: mock.catalogFailed ? new Error('Catalog unavailable') : null,
  data: table === 'products' ? [{ id: 'product', organization_id: 'org', name: 'Rice', sku: 'RICE', barcode: null, stock_unit: 'bag', cost_price: 100 },
    { id: 'beans', organization_id: 'org', name: 'Beans', sku: 'BEANS', barcode: null, stock_unit: 'bag', cost_price: 80 }]
    : [{ id: 'warehouse', organization_id: 'org', name: 'Main', is_main: true }],
}) }) }) }) }) }));
import { StockReceivingReview } from './stock-receiving-review';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sourceRows: ImportRow[] = [{ name: 'Rice', sku: 'RICE', opening_stock: '4', cost_price: '150' }];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function baseRow(index = 0): StockReviewRow { return { receiptId: `job:${index}`, source: index === 0 ? 'Rice' : 'Beans',
  mode: 'existing', newName: index === 0 ? 'Rice' : 'Beans', newSku: index === 0 ? 'RICE' : 'BEANS', stockUnit: 'bag', sellingPrice: '',
  productId: index === 0 ? 'product' : 'beans', warehouseId: 'warehouse', quantity: '4', unitCost: '150', zeroConfirmed: false, state: 'draft' }; }
function makeDraft(): StockReviewDraft { return { version: 1, revision: 1, ownerId: 'owner', organizationId: 'org', job: 'job', sourceRows: clone(sourceRows), rows: [baseRow()],
  source: { kind: 'csv', text: 'Rice,4,150', hash: 'source-reference', byte_length: 10, evidence_available: true }, dirty: true }; }
function selection(draft: StockReviewDraft, indices: number[]): StockSelection {
  return { selection_id: uid(10), revision: 1, review_digest: 'a'.repeat(64), expires_at: '2099-01-01T00:00:00Z', groups: indices.map(index => ({
    row_index: index, operation_id: uid(20 + index), receipt_id: uid(30 + index), mode: draft.rows![index].mode,
    product_id: draft.rows![index].mode === 'new' ? null : uid(40 + index), warehouse_id: uid(50), product_name: draft.rows![index].newName,
    warehouse_name: 'Server Main', stock_unit: 'bag', quantity: Number(draft.rows![index].quantity), cost_kind: 'paid', unit_cost_minor: '15000',
    selling_price_minor: draft.rows![index].mode === 'new' ? '20000' : null, stock_before: 7, stock_after: 11, cost_before_minor: '10000', cost_after_minor: '11818',
  })) };
}
function freeze(draft: StockReviewDraft): StockReviewDraft {
  return { ...draft, pendingApproval: undefined, selection: undefined, rows: draft.rows!.map((row, index): StockReviewRow => {
    const group = draft.selection!.groups.find(item => item.row_index === index); if (!group) return row;
    const operation: ReviewedStockOperation = { approval_id: uid(11), selection_id: uid(10), revision: 1,
      row_index: index, operation_id: group.operation_id, receipt_id: group.receipt_id, review_digest: 'a'.repeat(64), expires_at: '2099-01-01T00:00:00Z',
      row: { row_index: index, mode: row.mode, product_id: row.productId || null, warehouse_id: row.warehouseId, quantity: row.quantity,
        unit_cost: row.unitCost, zero_confirmed: row.zeroConfirmed, name: row.newName, sku: row.newSku, stock_unit: row.stockUnit, selling_price: row.sellingPrice || null }, status: 'approved', result: null };
    return { ...row, state: 'confirmation_pending', operation, attempt: { receipt_id: group.receipt_id, organization_id: 'org',
      job: 'job', row_index: index, mode: row.mode, product_id: row.productId, warehouse_id: row.warehouseId,
      quantity: Number(row.quantity), unit_cost: Number(row.unitCost), name: row.newName, sku: row.newSku,
      stock_unit: row.stockUnit, selling_price: Number(row.sellingPrice || 0), confirm: true, approval_id: uid(11), operation_id: group.operation_id } };
  }) };
}
const mounted = new Set<{ host: HTMLDivElement; root: Root }>();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.user = { id: 'owner', role: 'business_owner', organization_id: 'org', status: 'active' }; mock.catalogFailed = false; mock.saved = makeDraft();
  mock.load.mockReset().mockImplementation(async () => clone(mock.saved));
  mock.initialize.mockReset().mockImplementation(async (_scope: StockReviewScope, draft: StockReviewDraft, rows: StockReviewRow[]) => mock.saved = { ...draft, rows });
  mock.save.mockReset().mockImplementation(async (_scope: StockReviewScope, draft: StockReviewDraft, rows: StockReviewRow[]) => mock.saved = clone({ ...draft, rows, revision: draft.revision + 1, dirty: true, selection: undefined }));
  mock.serverSave.mockReset().mockImplementation(async (_scope: StockReviewScope, draft: StockReviewDraft) => mock.saved = clone({ ...draft, serverRevision: 1, dirty: false }));
  mock.preview.mockReset().mockImplementation(async (_scope: StockReviewScope, draft: StockReviewDraft, indices: number[]) => mock.saved = clone({ ...draft, serverRevision: 1, dirty: false, selection: selection(draft, indices) }));
  mock.approve.mockReset().mockImplementation(async (_scope: StockReviewScope, draft: StockReviewDraft) => mock.saved = clone(freeze(draft)));
  mock.execute.mockReset().mockImplementation(async (_scope: StockReviewScope, attempt: StockReviewAttempt): Promise<StockExecution> => {
    if (!attempt.operation_id || !attempt.receipt_id) throw new Error('This fixture requires a reviewed operation and receipt');
    return { status: 'completed', row_index: attempt.row_index, operation_id: attempt.operation_id,
      receipt_id: attempt.receipt_id, product_id: uid(40 + attempt.row_index), average_cost: '118.18' };
  });
  mock.record.mockReset().mockImplementation(async (_scope: StockReviewScope, draft: StockReviewDraft, result: StockExecution) => mock.saved = clone({ ...draft, rows: draft.rows!.map((row, index): StockReviewRow => index !== result.row_index ? row : result.status === 'completed'
    ? { ...row, state: 'saved', savedProductId: result.product_id, error: undefined } : { ...row, state: 'draft', attempt: undefined, operation: undefined, error: result.message, changes: result.changes }) }));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(async () => { for (const view of mounted) { await act(() => view.root.unmount()); view.host.remove(); } mounted.clear(); vi.restoreAllMocks(); });
async function mount() {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), view = { host, root }; mounted.add(view);
  await act(async () => { root.render(<StockReceivingReview job="job" rows={sourceRows} />); });
  return { ...view, unmount: async () => { await act(() => root.unmount()); host.remove(); mounted.delete(view); } };
}
function button(host: HTMLElement, label: string) { const found = Array.from(host.querySelectorAll('button')).find(item => item.textContent === label); if (!found) throw new Error(`Missing button: ${label}`); return found; }
function checkbox(host: HTMLElement, text: string) { const found = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')).find(item => item.parentElement?.textContent?.includes(text)); if (!found) throw new Error(`Missing checkbox: ${text}`); return found; }
const includes = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')).filter(item => item.parentElement?.textContent?.includes('Include this row'));
async function review(host: HTMLElement) { for (const item of includes(host)) await act(() => item.click()); await act(() => checkbox(host, 'I checked').click()); await act(async () => { button(host, 'Review exact stock changes').click(); }); }
async function apply(host: HTMLElement, count = 1) { await act(async () => { button(host, `Approve and apply ${count} stock receipt${count === 1 ? '' : 's'}`).click(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function changeInput(input: HTMLInputElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }); }

it('requires physical delivery confirmation and renders authoritative effects before approval', async () => {
  const { host } = await mount(); await act(() => includes(host)[0].click());
  expect(button(host, 'Review exact stock changes').disabled).toBe(true); expect(mock.preview).not.toHaveBeenCalled();
  await act(() => checkbox(host, 'I checked').click()); await act(async () => { button(host, 'Review exact stock changes').click(); });
  expect(mock.preview).toHaveBeenCalledWith({ ownerId: 'owner', organizationId: 'org' }, expect.anything(), [0]);
  expect(host.textContent).toContain('Stock at this warehouse'); expect(host.textContent).toContain('7 → 11');
  expect(host.textContent).toContain('₦100.00 → ₦118.18');
  expect(host.textContent).toContain('Server Main'); expect(mock.approve).not.toHaveBeenCalled(); expect(mock.execute).not.toHaveBeenCalled();
});
it('approves the exact selection, persists frozen attempts, then executes only its rows', async () => {
  mock.execute.mockImplementation(async (_scope: StockReviewScope, attempt: StockReviewAttempt) => {
    expect(mock.saved?.rows?.[0]).toMatchObject({ state: 'confirmation_pending', attempt });
    return { status: 'completed', row_index: 0, operation_id: uid(20), receipt_id: uid(30), product_id: uid(40), average_cost: '118.18' };
  });
  const { host } = await mount(); await review(host); await apply(host);
  expect(mock.approve).toHaveBeenCalledOnce(); expect(mock.execute).toHaveBeenCalledOnce(); expect(host.textContent).toContain('Stock saved');
});
it('sends no receipt if saving the frozen approval fails', async () => {
  const { host } = await mount(); await review(host); mock.approve.mockRejectedValueOnce(new Error('Device storage full')); await apply(host);
  expect(mock.execute).not.toHaveBeenCalled(); expect(host.textContent).toContain('Device storage full');
});
it('keeps deliberate offline Apply as review only, without creating an approval or attempt', async () => {
  const { host } = await mount(); await review(host); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false); await apply(host);
  expect(mock.approve).not.toHaveBeenCalled(); expect(mock.execute).not.toHaveBeenCalled(); expect(mock.saved?.rows?.[0].attempt).toBeUndefined();
  expect(host.textContent).toContain('No new stock has been submitted');
});
it('retains an approved attempt when connectivity drops before execution', async () => {
  const { host } = await mount();
  await review(host);
  mock.approve.mockImplementationOnce(async (_scope: StockReviewScope, draft: StockReviewDraft) => {
    const approved = clone(freeze(draft));
    mock.saved = approved;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    return approved;
  });
  await apply(host);
  expect(mock.execute).not.toHaveBeenCalled();
  expect(mock.saved?.rows?.[0]).toMatchObject({ state: 'confirmation_pending', attempt: { operation_id: uid(20) } });
  expect(button(host, 'Check receipt status').disabled).toBe(true);
});
it('opens the saved review offline and persists corrections locally without sending them', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const { host } = await mount();
  const quantity = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=number]'))
    .find(input => input.closest('label')?.textContent?.includes('Quantity physically received'))!;
  expect(quantity.disabled).toBe(false);
  await changeInput(quantity, '3');
  expect(mock.saved?.rows?.[0].quantity).toBe('3');
  expect(mock.serverSave).not.toHaveBeenCalled();
  expect(button(host, 'Review exact stock changes').disabled).toBe(true);
  expect(host.textContent).toContain('Corrections saved on this device');
});
it('locks other row controls while a receipt is outstanding and preserves the original selection', async () => {
  mock.saved!.sourceRows.push({ name: 'Beans' }); mock.saved!.rows!.push(baseRow(1));
  const first = deferred<StockExecution>(); mock.execute.mockImplementationOnce(() => first.promise);
  const { host } = await mount(); await review(host);
  await act(() => button(host, 'Approve and apply 2 stock receipts').click());
  expect(Array.from(host.querySelectorAll('input,select')).every(item => (item as HTMLInputElement).disabled)).toBe(true);
  expect(mock.execute).toHaveBeenCalledTimes(1);
  await act(async () => { first.resolve({ status: 'completed', row_index: 0, operation_id: uid(20), receipt_id: uid(30), product_id: uid(40), average_cost: 118.18 }); });
  expect(mock.execute).toHaveBeenCalledTimes(2); expect(mock.saved!.rows!.every(row => row.state === 'saved')).toBe(true);
});
it('reopens corrected rows and source evidence without restoring selection or automatically applying', async () => {
  mock.saved!.rows![0].quantity = '9'; mock.saved!.dirty = false; mock.saved!.serverRevision = 2;
  const { host } = await mount(); expect(host.textContent).toContain('Review saved to your account'); expect(host.textContent).toContain('Rice,4,150');
  expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[type=number]')).some(item => item.value === '9')).toBe(true);
  expect(includes(host)[0].checked).toBe(false); expect(mock.approve).not.toHaveBeenCalled(); expect(mock.execute).not.toHaveBeenCalled();
});
it('preserves an unknown receipt on reload; explicit retry checks first and uses its original operation', async () => {
  mock.saved = freeze({ ...mock.saved!, selection: selection(mock.saved!, [0]) }); const original = clone(mock.saved.rows![0].attempt!);
  const view = await mount(); expect(mock.execute).not.toHaveBeenCalled(); expect(view.host.textContent).toContain('Receipt confirmation pending');
  const previousLoads = mock.load.mock.calls.length; await act(async () => { button(view.host, 'Retry same receipt').click(); });
  expect(mock.load.mock.calls.length).toBe(previousLoads + 1); expect(mock.execute).toHaveBeenCalledWith({ ownerId: 'owner', organizationId: 'org' }, original);
  expect(view.host.textContent).toContain('Stock saved');
});
it('checks status without dispatch and does not retry after a failed status lookup', async () => {
  mock.saved = freeze({ ...mock.saved!, selection: selection(mock.saved!, [0]) }); const { host } = await mount();
  mock.load.mockResolvedValueOnce({ ...mock.saved, syncError: 'Unable to confirm receipt status' });
  await act(async () => { button(host, 'Retry same receipt').click(); }); expect(mock.execute).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Unable to confirm receipt status');
});
it('shows lost approval separately and checks operations without another approval or dispatch', async () => {
  const { host } = await mount(); await review(host);
  mock.approve.mockImplementationOnce(async (_scope: StockReviewScope, draft: StockReviewDraft) => { mock.saved = { ...draft, pendingApproval: draft.selection }; throw new Error('Approval response lost'); });
  await apply(host); expect(host.textContent).toContain('Approval confirmation pending'); expect(mock.execute).not.toHaveBeenCalled();
  await act(async () => { button(host, 'Check approval status').click(); }); expect(mock.approve).toHaveBeenCalledOnce(); expect(mock.execute).not.toHaveBeenCalled();
});
it('allows a known no-effect row to be corrected while preserving earlier confirmed success', async () => {
  mock.saved!.sourceRows.push({ name: 'Beans' }); mock.saved!.rows!.push(baseRow(1));
  mock.execute.mockImplementation(async (_scope: StockReviewScope, attempt: StockReviewAttempt) => attempt.row_index === 0
    ? { status: 'completed', row_index: 0, operation_id: uid(20), receipt_id: uid(30), product_id: uid(40), average_cost: '118.18' }
    : { status: 'no_effect', row_index: 1, operation_id: uid(21), receipt_id: uid(31), code: 'STALE_FACTS', message: 'Stock changed; review again.', changes: [{ field: 'stock', reviewed: 7, current: 8 }] });
  const { host } = await mount(); await review(host); await apply(host, 2);
  expect(mock.saved!.rows![0].state).toBe('saved'); expect(mock.saved!.rows![1].state).toBe('draft');
  expect(host.textContent).toContain('Reviewed 7 → Current 8'); expect(includes(host)).toHaveLength(0);
  await act(() => button(host, 'Review remaining items').click());
  expect(includes(host)).toHaveLength(1);
});

it('uses separate review, approval and receipt screens with a four-step indicator', async () => {
  const { host } = await mount();
  expect(host.querySelector('h1')?.textContent).toBe('Check the stock');
  expect(host.querySelectorAll('ol > li')).toHaveLength(4);
  expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('Check items');
  await act(() => button(host, 'Select ready').click());
  expect(includes(host)[0].checked).toBe(true);
  expect(mock.approve).not.toHaveBeenCalled();
  await act(() => checkbox(host, 'I checked').click());
  await act(async () => { button(host, 'Review exact stock changes').click(); });
  expect(host.querySelector('h1')?.textContent).toBe('Approve changes');
  expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('Approve');
  expect(includes(host)).toHaveLength(0);
  expect(host.textContent).toContain('₦600.00');
  await act(() => button(host, 'Back to check items').click());
  expect(includes(host)[0].checked).toBe(true);
  await act(async () => { button(host, 'Review exact stock changes').click(); });
  await apply(host);
  expect(host.querySelector('h1')?.textContent).toBe('Receipt summary');
  expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('Result');
  expect(host.textContent).toContain('Stock receipt completed');
});
it('keeps conflicting device edits visible and requires explicit discard before account reload', async () => {
  mock.saved!.conflict = true; mock.saved!.rows![0].quantity = '9'; const { host } = await mount();
  expect(host.textContent).toContain('Your unsaved device corrections are preserved'); expect(includes(host)[0].disabled).toBe(true);
  mock.load.mockResolvedValueOnce({ ...mock.saved!, conflict: false, dirty: false, rows: [{ ...baseRow(), quantity: '6' }] });
  await act(async () => { button(host, 'Reload account review and discard these device edits').click(); });
  expect(mock.load).toHaveBeenLastCalledWith({ ownerId: 'owner', organizationId: 'org' }, { discardLocalEdits: true });
  expect(includes(host)[0].disabled).toBe(false);
});
it('requires catalog resolution for new approvals but retains pending receipt recovery without catalog', async () => {
  mock.catalogFailed = true; const first = await mount(); expect(includes(first.host)[0].disabled).toBe(true); await first.unmount();
  mock.saved = freeze({ ...mock.saved!, selection: selection(mock.saved!, [0]) });
  const second = await mount(); expect(button(second.host, 'Check receipt status').disabled).toBe(false); expect(second.host.textContent).toContain(uid(30));
});
it('preserves new-product creation and selling price in the reviewed group and frozen operation', async () => {
  mock.saved!.rows![0] = { ...baseRow(), mode: 'new', productId: '', newName: 'New Rice', newSku: 'NEW', sellingPrice: '200.00' };
  const { host } = await mount(); await review(host); expect(host.textContent).toContain('Create product and receive stock together');
  expect(host.textContent).toContain('Selling price per unit: ₦200.00'); await apply(host);
  expect(mock.execute.mock.calls[0][1]).toMatchObject({ mode: 'new', name: 'New Rice', sku: 'NEW', selling_price: 200 });
});
it('treats 0.00 as explicit zero requiring confirmation and leaves unknown cost blank', async () => {
  mock.saved!.rows![0].unitCost = '0.00'; const first = await mount(); expect(includes(first.host)[0].disabled).toBe(true);
  await act(async () => { checkbox(first.host, 'really has zero').click(); }); expect(includes(first.host)[0].disabled).toBe(false); await first.unmount();
  mock.saved!.rows![0].unitCost = ''; mock.saved!.rows![0].zeroConfirmed = false; const second = await mount(); expect(includes(second.host)[0].disabled).toBe(true);
});
it('stops later receipts after Owner or organisation changes during execution', async () => {
  mock.saved!.sourceRows.push({ name: 'Beans' }); mock.saved!.rows!.push(baseRow(1)); const first = deferred<StockExecution>(); mock.execute.mockImplementationOnce(() => first.promise);
  const { host } = await mount(); await review(host); await act(() => button(host, 'Approve and apply 2 stock receipts').click());
  mock.user = { ...mock.user, id: 'other', organization_id: 'other-org' };
  await act(async () => { first.resolve({ status: 'completed', row_index: 0, operation_id: uid(20), receipt_id: uid(30), product_id: uid(40), average_cost: 118.18 }); });
  expect(mock.execute).toHaveBeenCalledTimes(1); expect(mock.record).not.toHaveBeenCalled();
});
it('shows device-only edits when the online correction cannot be saved to the account', async () => {
  mock.serverSave.mockRejectedValueOnce(new Error('Account save unavailable')); const { host } = await mount();
  const quantity = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=number]')).find(item => item.closest('label')?.textContent?.includes('Quantity physically received'))!;
  await act(() => quantity.focus()); await changeInput(quantity, '8'); await act(async () => { quantity.blur(); });
  expect(mock.saved?.rows?.[0].quantity).toBe('8'); expect(host.textContent).toContain('Corrections saved on this device');
  expect(mock.execute).not.toHaveBeenCalled();
});
it('saves each typed correction on the device without a server round-trip until field blur', async () => {
  const { host } = await mount();
  const quantity = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=number]')).find(item => item.closest('label')?.textContent?.includes('Quantity physically received'))!;
  await act(() => quantity.focus()); await changeInput(quantity, '8'); await changeInput(quantity, '82');
  expect(mock.saved?.rows?.[0].quantity).toBe('82'); expect(mock.serverSave).not.toHaveBeenCalled(); expect(quantity.disabled).toBe(false);
  await act(async () => { quantity.blur(); });
  expect(mock.serverSave).toHaveBeenCalledOnce(); expect(mock.serverSave.mock.calls[0][1].rows[0].quantity).toBe('82');
  expect(host.textContent).toContain('Review saved to your account');
});
it('preserves burst typing and another field while the first device save is pending, then flushes the latest values', async () => {
  const firstSave = deferred<StockReviewDraft>();
  const firstCall: { draft?: StockReviewDraft; rows?: StockReviewRow[] } = {};
  mock.save.mockImplementationOnce(async (_scope: StockReviewScope, draft: StockReviewDraft, rows: StockReviewRow[]) => {
    firstCall.draft = draft; firstCall.rows = rows;
    const saved = await firstSave.promise;
    mock.saved = clone(saved); return saved;
  });
  const { host } = await mount();
  const inputs = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=number]'));
  const quantity = inputs.find(item => item.closest('label')?.textContent?.includes('Quantity physically received'))!;
  const cost = inputs.find(item => item.closest('label')?.textContent?.includes('Buying cost per unit'))!;
  await act(() => quantity.focus());
  await changeInput(quantity, '8'); await changeInput(quantity, '82'); await changeInput(cost, '160.50');
  expect(quantity.value).toBe('82'); expect(cost.value).toBe('160.50');
  expect(quantity.disabled).toBe(false); expect(cost.disabled).toBe(false);
  expect(host.textContent).toContain('Saving your corrections');
  expect(mock.saved?.rows?.[0].quantity).toBe('4');
  await act(() => includes(host)[0].click()); await act(() => checkbox(host, 'I checked').click());
  expect(button(host, 'Review exact stock changes').disabled).toBe(true);
  expect(mock.save).toHaveBeenCalledOnce();
  await act(() => quantity.blur());
  expect(mock.serverSave).not.toHaveBeenCalled(); expect(mock.preview).not.toHaveBeenCalled();
  const original = firstCall.draft, rows = firstCall.rows;
  if (!original || !rows) throw new Error('The first device save did not start');
  await act(async () => { firstSave.resolve(clone({ ...original, rows, revision: original.revision + 1, dirty: true })); });
  expect(mock.save).toHaveBeenCalledTimes(2);
  expect(mock.save.mock.calls[1][1].revision).toBe(original.revision + 1);
  expect(mock.saved?.rows?.[0]).toMatchObject({ quantity: '82', unitCost: '160.50' });
  expect(mock.serverSave).toHaveBeenCalledOnce();
  expect(mock.serverSave.mock.calls[0][1].rows[0]).toMatchObject({ quantity: '82', unitCost: '160.50' });
  expect(includes(host)[0].disabled).toBe(false);
  expect(button(host, 'Review exact stock changes').disabled).toBe(false);
  expect(mock.approve).not.toHaveBeenCalled(); expect(mock.execute).not.toHaveBeenCalled();
});
it('keeps failed device corrections visible and retries them explicitly before allowing review', async () => {
  mock.save.mockRejectedValueOnce(new Error('Device storage is full'));
  const { host } = await mount();
  const quantity = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=number]')).find(item => item.closest('label')?.textContent?.includes('Quantity physically received'))!;
  await changeInput(quantity, '82');
  expect(quantity.value).toBe('82'); expect(mock.saved?.rows?.[0].quantity).toBe('4');
  expect(host.textContent).toContain('Some corrections are only on this screen');
  expect(includes(host)[0].disabled).toBe(true); expect(button(host, 'Reload saved review').disabled).toBe(true);
  await act(async () => { button(host, 'Retry saving corrections').click(); });
  expect(mock.saved?.rows?.[0].quantity).toBe('82'); expect(includes(host)[0].disabled).toBe(false);
  expect(host.textContent).toContain('Corrections saved on this device');
  expect(mock.preview).not.toHaveBeenCalled(); expect(mock.approve).not.toHaveBeenCalled(); expect(mock.execute).not.toHaveBeenCalled();
});
it('does not offer a raw legacy retry and is honest when the original source file is unavailable', async () => {
  mock.saved!.source = { kind: 'image', text: null, hash: 'photo-hash', byte_length: 200, evidence_available: false };
  mock.saved = freeze({ ...mock.saved!, selection: selection(mock.saved!, [0]) });
  delete mock.saved.rows![0].attempt!.approval_id; delete mock.saved.rows![0].attempt!.operation_id; delete mock.saved.rows![0].operation;
  const { host } = await mount(); expect(host.textContent).toContain('original file or text is unavailable');
  expect(host.textContent).toContain('older receipt can only be checked'); expect(Array.from(host.querySelectorAll('button')).some(item => item.textContent === 'Retry same receipt')).toBe(false);
});
