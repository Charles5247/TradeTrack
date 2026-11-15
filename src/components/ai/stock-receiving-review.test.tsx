// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ImportRow } from '@/lib/imports/preview';
import type { StockReviewDraft, StockReviewRow, StockReviewScope, StockReviewAttempt, SavedStockReviewReceipt } from '@/lib/ai/stock-review-draft';

type TestUser = { id: string; role: string; organization_id: string; status: string };
const mock = vi.hoisted(() => ({
  receive: vi.fn(), load: vi.fn(), save: vi.fn(), lookup: vi.fn(), read: vi.fn(), catalogFailed: false,
  user: { id: 'owner', role: 'business_owner', organization_id: 'org', status: 'active' } as TestUser,
  saved: null as StockReviewDraft | null,
}));
vi.mock('@/lib/ai/stock-review-draft', () => ({
  loadStockReview: mock.load, saveStockReview: mock.save, lookupStockReviewReceipt: mock.lookup,
  submitStockReviewReceipt: mock.receive, readStockReviewProposal: mock.read,
  sameStockReviewSource: (left: ImportRow[], right: ImportRow[]) => JSON.stringify(left) === JSON.stringify(right),
  confirmedStockReviewReceipt: (attempt: StockReviewAttempt, receipts: SavedStockReviewReceipt[]) => {
    const receipt = receipts.find(row => row.row_index === attempt.row_index);
    if (!receipt) return false;
    if (receipt.quantity !== attempt.quantity || Number(receipt.unit_cost) !== attempt.unit_cost) throw new Error('Saved receipt differs');
    return true;
  },
}));
vi.mock('@/store', () => ({ useAuthStore: Object.assign(
  (pick: (state: { user: TestUser }) => unknown) => pick({ user: mock.user }),
  { getState: () => ({ user: mock.user }) },
) }));
vi.mock('@/i18n/text', () => ({ useCopy: () => (value: string) => value }));
vi.mock('@/lib/offline/db', () => ({ getDB: async () => ({ getAll: async () => [] }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: (table: string) => ({
  select: () => ({ eq: () => ({ range: async () => ({ error: mock.catalogFailed ? new Error('Offline catalog') : null,
    data: table === 'products' ? [
      { id: 'product', organization_id: 'org', name: 'Rice', sku: 'RICE', barcode: null, stock_unit: 'bag', cost_price: 100 },
      { id: 'beans', organization_id: 'org', name: 'Beans', sku: 'BEANS', barcode: null, stock_unit: 'bag', cost_price: 80 },
    ] : [{ id: 'warehouse', organization_id: 'org', name: 'Main', is_main: true }],
  }) }) }),
}) }) }));
import { StockReceivingReview } from './stock-receiving-review';

const sourceRows: ImportRow[] = [{ name: 'Rice', sku: 'RICE', opening_stock: '4', cost_price: '150' }];
const mounted = new Set<{ host: HTMLDivElement; root: Root }>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function makeDraft(rows = sourceRows): StockReviewDraft {
  return { version: 1, revision: 1, ownerId: 'owner', organizationId: 'org', job: 'job-1', sourceRows: clone(rows), rows: null };
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.user = { id: 'owner', role: 'business_owner', organization_id: 'org', status: 'active' };
  mock.catalogFailed = false; mock.saved = makeDraft();
  mock.receive.mockReset().mockResolvedValue({ productId: 'product' });
  mock.read.mockReset().mockImplementation(async () => ({ rows: mock.saved?.sourceRows, receipts: [] }));
  mock.lookup.mockReset().mockResolvedValue('unconfirmed');
  mock.load.mockReset().mockImplementation(async (scope: StockReviewScope) => mock.saved
    && mock.saved.ownerId === scope.ownerId && mock.saved.organizationId === scope.organizationId ? clone(mock.saved) : null);
  mock.save.mockReset().mockImplementation(async (_scope: StockReviewScope, current: StockReviewDraft, rows: StockReviewRow[]) => {
    if (!mock.saved || mock.saved.revision !== current.revision) throw new Error('Saved review changed');
    mock.saved = clone({ ...current, revision: current.revision + 1, rows });
    return clone(mock.saved);
  });
});

afterEach(async () => {
  for (const view of mounted) { await act(() => view.root.unmount()); view.host.remove(); }
  mounted.clear();
  vi.restoreAllMocks();
});

async function mount(rows = sourceRows) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); const view = { host, root }; mounted.add(view);
  await act(async () => { root.render(<StockReceivingReview job="job-1" rows={rows} />); });
  return { ...view,
    unmount: async () => { await act(() => root.unmount()); host.remove(); mounted.delete(view); },
    rerender: async (nextRows = rows) => { await act(async () => { root.render(<StockReceivingReview job="job-1" rows={nextRows} />); }); },
  };
}

function button(host: HTMLElement, label: string) {
  const result = Array.from(host.querySelectorAll('button')).find(element => element.textContent === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
function includes(host: HTMLElement) {
  return Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))
    .filter(input => input.parentElement?.textContent?.includes('Include this row'));
}
async function selectAndReview(host: HTMLElement) {
  for (const checkbox of includes(host)) await act(() => checkbox.click());
  await act(() => button(host, 'Review exact stock changes').click());
}
async function apply(host: HTMLElement, count = 1) {
  await act(async () => { button(host, `Apply ${count} stock receipt${count === 1 ? '' : 's'}`).click(); });
}
async function changeInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

it('requires selection and review, and persists the exact immutable attempt before dispatch', async () => {
  mock.receive.mockImplementation(async (_scope: StockReviewScope, attempt: StockReviewAttempt) => {
    expect(mock.saved?.rows?.[0]).toMatchObject({ receiptId: attempt.receipt_id, state: 'confirmation_pending', attempt });
    return { productId: 'product' };
  });
  const { host } = await mount();
  expect(host.textContent).toContain('Ready to select');
  expect(mock.receive).not.toHaveBeenCalled();
  await selectAndReview(host);
  expect(host.textContent).toContain('Rice: +4 bag at ₦150 each → Main');
  expect(mock.receive).not.toHaveBeenCalled();
  await apply(host);
  expect(mock.receive).toHaveBeenCalledWith({ ownerId: 'owner', organizationId: 'org' }, expect.objectContaining({ product_id: 'product', warehouse_id: 'warehouse',
    job: 'job-1', row_index: 0, confirm: true, quantity: 4, unit_cost: 150 }));
  expect(mock.saved?.rows?.[0].state).toBe('saved');
  expect(host.textContent).toContain('Applied');
});

it('sends nothing if persisting the pre-dispatch attempt fails', async () => {
  const { host } = await mount();
  await selectAndReview(host);
  mock.save.mockRejectedValueOnce(new Error('Storage unavailable'));
  await apply(host);
  expect(mock.receive).not.toHaveBeenCalled();
  expect(mock.saved?.rows?.[0].state).toBe('draft');
  expect(host.textContent).toContain('Storage unavailable');
});

it('keeps an offline Apply as review only without storing an attempt or submitting stock', async () => {
  const { host } = await mount();
  await selectAndReview(host);
  const beforeApply = clone(mock.saved);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await apply(host);
  expect(mock.receive).not.toHaveBeenCalled();
  expect(mock.saved).toEqual(beforeApply);
  expect(mock.saved?.rows?.[0].state).toBe('draft');
  expect(mock.saved?.rows?.[0].attempt).toBeUndefined();
  expect(host.textContent).toContain('Reconnect before applying stock. Nothing was submitted');
});

it('locks later rows while the first receipt is outstanding and preserves the reviewed payload', async () => {
  const rows = [...sourceRows, { name: 'Beans', sku: 'BEANS', opening_stock: '2', cost_price: '80' }];
  mock.saved = makeDraft(rows);
  const first = deferred<{ offline: boolean; averageCost: number }>();
  mock.receive.mockReturnValueOnce(first.promise);
  const { host } = await mount(rows);
  await selectAndReview(host); await apply(host, 2);
  expect(mock.receive).toHaveBeenCalledTimes(1);
  const remainingInputs = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=number]'));
  expect(remainingInputs).toHaveLength(2);
  expect(remainingInputs.every(input => input.disabled)).toBe(true);
  expect(includes(host).every(input => input.disabled)).toBe(true);
  await changeInput(remainingInputs[0], '99');
  await act(async () => { first.resolve({ offline: false, averageCost: 120 }); });
  expect(mock.receive).toHaveBeenCalledTimes(2);
  expect(mock.receive.mock.calls[1][1]).toMatchObject({ product_id: 'beans', quantity: 2, unit_cost: 80 });
  expect(mock.saved?.rows?.every(row => row.state === 'saved')).toBe(true);
});

it('restores corrected rows and receipt IDs without restoring selection or applying again', async () => {
  const first = await mount();
  const receiptId = mock.saved?.rows?.[0].receiptId;
  const quantity = first.host.querySelector<HTMLInputElement>('input[type=number]')!;
  await changeInput(quantity, '7');
  expect(mock.saved?.rows?.[0].quantity).toBe('7');
  await first.rerender(clone(sourceRows));
  expect(mock.saved?.rows?.[0].receiptId).toBe(receiptId);
  await first.unmount();
  const second = await mount(clone(sourceRows));
  expect(second.host.querySelector<HTMLInputElement>('input[type=number]')!.value).toBe('7');
  expect(includes(second.host)[0].checked).toBe(false);
  expect(mock.receive).not.toHaveBeenCalled();
  await selectAndReview(second.host); await apply(second.host);
  await second.unmount();
  const third = await mount();
  expect(third.host.textContent).toContain('Applied');
  expect(includes(third.host)).toHaveLength(0);
  expect(mock.saved?.rows?.[0].receiptId).toBe(receiptId);
  expect(mock.receive).toHaveBeenCalledTimes(1);
});

it('retains an unknown outcome across remount and checks before retrying the same exact receipt', async () => {
  mock.receive.mockRejectedValueOnce(new Error('Connection lost'));
  const first = await mount();
  await selectAndReview(first.host); await apply(first.host);
  const attempt = clone(mock.saved!.rows![0].attempt!);
  expect(mock.saved?.rows?.[0].state).toBe('confirmation_pending');
  expect(first.host.querySelector('input[type=number]')).toBeNull();
  await first.unmount();
  const second = await mount();
  expect(mock.receive).toHaveBeenCalledTimes(1);
  await act(async () => { button(second.host, 'Check receipt status').click(); });
  expect(mock.receive).toHaveBeenCalledTimes(1);
  expect(mock.saved?.rows?.[0].state).toBe('confirmation_pending');
  const order: string[] = [];
  mock.lookup.mockImplementation(async () => { order.push('lookup'); return 'unconfirmed'; });
  mock.receive.mockImplementation(async () => { order.push('receive'); return { offline: false, averageCost: 120 }; });
  await act(async () => { button(second.host, 'Retry same receipt').click(); });
  expect(order).toEqual(['lookup', 'receive']);
  expect(mock.receive.mock.calls[1]).toEqual([{ ownerId: 'owner', organizationId: 'org' }, attempt]);
  expect(mock.saved?.rows?.[0].state).toBe('saved');
});

it('only resolves a restored unknown receipt when status is explicitly checked, without sending stock', async () => {
  const first = await mount();
  mock.receive.mockRejectedValueOnce(new Error('Connection lost'));
  await selectAndReview(first.host); await apply(first.host); await first.unmount();
  mock.receive.mockClear(); mock.lookup.mockResolvedValue('saved');
  const restored = await mount();
  expect(mock.saved?.rows?.[0].state).toBe('confirmation_pending');
  expect(mock.lookup).not.toHaveBeenCalled();
  await act(async () => { button(restored.host, 'Check receipt status').click(); });
  expect(restored.host.textContent).toContain('Applied');
  expect(mock.saved?.rows?.[0].state).toBe('saved');
  expect(mock.receive).not.toHaveBeenCalled();
});

it('keeps queued receipts locked and unconfirmed until a positive server lookup', async () => {
  mock.receive.mockRejectedValueOnce(new Error('Unknown prior result'));
  const first = await mount();
  await selectAndReview(first.host); await apply(first.host);
  await first.unmount();
  mock.saved!.rows![0].state = 'queued';
  const restored = await mount();
  expect(restored.host.textContent).toContain('Queued for upload — not yet confirmed');
  expect(restored.host.textContent).not.toContain('Applied');
  expect(Array.from(restored.host.querySelectorAll('button')).some(item => item.textContent === 'Retry same receipt')).toBe(false);
  expect(mock.saved?.rows?.[0].state).toBe('queued');
  expect(mock.receive).toHaveBeenCalledTimes(1);
  await act(async () => { button(restored.host, 'Check receipt status').click(); });
  expect(mock.saved?.rows?.[0].state).toBe('queued');
  mock.lookup.mockResolvedValue('saved');
  await act(async () => { button(restored.host, 'Check receipt status').click(); });
  expect(mock.saved?.rows?.[0].state).toBe('saved');
  expect(mock.receive).toHaveBeenCalledTimes(1);
});

it.each([
  { role: 'cashier', organization_id: 'org', id: 'owner', status: 'active' },
  { role: 'business_owner', organization_id: 'other-org', id: 'owner', status: 'active' },
  { role: 'business_owner', organization_id: 'org', id: 'other-owner', status: 'active' },
  { role: 'business_owner', organization_id: 'org', id: 'owner', status: 'inactive' },
])('stops remaining dispatches after account or role changes: %j', async nextUser => {
  const rows = [...sourceRows, { name: 'Beans', sku: 'BEANS', opening_stock: '2', cost_price: '80' }];
  mock.saved = makeDraft(rows);
  const first = deferred<{ offline: boolean; averageCost: number }>();
  mock.receive.mockReturnValueOnce(first.promise);
  const view = await mount(rows);
  await selectAndReview(view.host); await apply(view.host, 2);
  mock.user = nextUser;
  await act(async () => { first.resolve({ offline: false, averageCost: 120 }); });
  expect(mock.receive).toHaveBeenCalledTimes(1);
  expect(mock.saved?.rows?.[0].state).toBe('confirmation_pending');
  expect(mock.saved?.rows?.[1].state).toBe('draft');
  await view.rerender();
  expect(view.host.textContent).not.toContain('Source row 1: Rice');
});

it.each(['0', '0.00'])('requires explicit known-free confirmation for zero cost %s', async cost => {
  mock.saved = makeDraft([{ ...sourceRows[0], cost_price: cost }]);
  const { host } = await mount();
  const confirmation = Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))
    .find(input => input.parentElement?.textContent?.includes('Confirm this stock really has zero buying cost'))!;
  expect(confirmation).toBeDefined(); expect(includes(host)[0].disabled).toBe(true);
  await act(async () => { confirmation.click(); });
  expect(mock.saved?.rows?.[0].zeroConfirmed).toBe(true);
  expect(includes(host)[0].disabled).toBe(false);
});

it.each(['', '1.001', '10000000000', '-1'])('holds missing or unsupported buying cost %s without silent rounding', async cost => {
  mock.saved = makeDraft([{ ...sourceRows[0], cost_price: cost }]);
  const { host } = await mount();
  expect(includes(host)[0].disabled).toBe(true);
  expect(mock.receive).not.toHaveBeenCalled();
});

it('does not select a restored unattempted row when neither catalog nor cache can resolve its product and warehouse', async () => {
  const first = await mount();
  const receiptId = mock.saved?.rows?.[0].receiptId;
  await first.unmount();
  mock.catalogFailed = true;
  const restored = await mount();
  expect(mock.saved?.rows?.[0]).toMatchObject({ receiptId, state: 'draft', productId: 'product', warehouseId: 'warehouse' });
  expect(restored.host.textContent).toContain('Needs your decision');
  expect(restored.host.textContent).not.toContain('Ready to select');
  expect(includes(restored.host)[0].disabled).toBe(true);
  expect(button(restored.host, 'Review exact stock changes').disabled).toBe(true);
  expect(Array.from(restored.host.querySelectorAll('button')).some(item => item.textContent === 'Apply 1 stock receipt')).toBe(false);
  await act(() => includes(restored.host)[0].click());
  expect(mock.receive).not.toHaveBeenCalled();
  expect(mock.saved?.rows?.[0].attempt).toBeUndefined();
});

it('keeps saved pending receipts available when catalog and cache reads cannot supply products', async () => {
  const first = await mount();
  mock.receive.mockRejectedValueOnce(new Error('Connection lost'));
  await selectAndReview(first.host); await apply(first.host); await first.unmount();
  mock.catalogFailed = true; mock.receive.mockClear();
  const restored = await mount();
  expect(restored.host.textContent).toContain('Could not refresh the catalog');
  expect(restored.host.textContent).toContain('Receipt reference');
  expect(button(restored.host, 'Check receipt status').disabled).toBe(false);
  expect(mock.saved?.rows?.[0].state).toBe('confirmation_pending');
  expect(mock.receive).not.toHaveBeenCalled();
});

it('preserves new-product intake and persists its selling price in the exact approval', async () => {
  const rows = [{ name: 'New Oil', sku: 'OIL-NEW', opening_stock: '3', cost_price: '900' }];
  mock.saved = makeDraft(rows);
  mock.receive.mockResolvedValue({ productId: 'created' });
  const { host } = await mount(rows);
  expect(includes(host)[0].disabled).toBe(true);
  const selling = Array.from(host.querySelectorAll<HTMLInputElement>('input')).find(input => input.closest('label')?.textContent?.includes('Selling price per unit'))!;
  await changeInput(selling, '1200');
  await selectAndReview(host);
  expect(host.textContent).toContain('Create SKU OIL-NEW at ₦1,200 selling price.');
  await apply(host);
  expect(mock.receive).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode: 'new', name: 'New Oil', sku: 'OIL-NEW', selling_price: 1200, quantity: 3, unit_cost: 900 }));
  expect(host.querySelector('a[href="/products/created/edit"]')).not.toBeNull();
});

it('restores server-confirmed rows from an older job without applying them again', async () => {
  mock.read.mockResolvedValueOnce({ rows: sourceRows, receipts: [{ row_index: 0, product_id: 'product', warehouse_id: 'warehouse', quantity: 6, unit_cost: 160, created_product: false, approved_product: null }] });
  const { host } = await mount();
  expect(host.textContent).toContain('Applied');
  expect(mock.saved?.rows?.[0]).toMatchObject({ state: 'saved', quantity: '6', unitCost: '160', attempt: { job: 'job-1', row_index: 0 } });
  expect(mock.receive).not.toHaveBeenCalled();
});

it('shows completed server effects instead of submitting stale unapplied local corrections', async () => {
  const first = await mount();
  await changeInput(first.host.querySelector<HTMLInputElement>('input[type=number]')!, '7');
  await first.unmount();
  mock.read.mockResolvedValueOnce({ rows: sourceRows, receipts: [{ row_index: 0, product_id: 'product', warehouse_id: 'warehouse', quantity: 4, unit_cost: 150, created_product: false, approved_product: null }] });
  const restored = await mount();
  expect(mock.saved?.rows?.[0]).toMatchObject({ state: 'saved', quantity: '4' });
  expect(restored.host.textContent).toContain('Unapplied local edits to completed rows were not submitted.');
  expect(includes(restored.host)).toHaveLength(0);
  expect(mock.receive).not.toHaveBeenCalled();
});

it.each(['unknown', '1,200', '1.001'])('does not validate an unused source selling price for an existing product: %s', async selling => {
  mock.saved = makeDraft([{ ...sourceRows[0], selling_price: selling }]);
  const { host } = await mount();
  await selectAndReview(host); await apply(host);
  expect(mock.receive).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode: 'existing', selling_price: 0 }));
  expect(mock.saved?.rows?.[0].state).toBe('saved');
});
