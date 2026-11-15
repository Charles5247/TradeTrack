// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { User } from '@/types';
import { useAuthStore } from '@/store';
import * as offlineDB from '@/lib/offline/db';

const account = vi.hoisted(() => ({ namespace: '' }));
const server = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/offline/auth-cache', () => ({ getOfflineAccountNamespace: () => account.namespace }));
import {
  clearStockReview, createStockReview, loadStockReview, lookupStockReviewReceipt, saveStockReview,
  submitStockReviewReceipt, resumeLegacyStockReview, sameStockReviewSource,
  type StockReviewDraft, type StockReviewRow, type StockReviewScope, type StockReviewAttempt,
} from './stock-review-draft';

const scope: StockReviewScope = { ownerId: 'owner', organizationId: 'org' };
const owner: User = {
  id: 'owner', organization_id: 'org', role: 'business_owner', status: 'active',
  email: 'owner@example.test', full_name: 'Test Owner', created_at: '', updated_at: '',
};
const sourceRows = [{ name: 'Rice', sku: 'RICE', opening_stock: '4', cost_price: '150' }];
const row = (): StockReviewRow => ({
  receiptId: 'receipt', source: 'Rice', productId: 'product', warehouseId: 'warehouse',
  quantity: '4', unitCost: '150', zeroConfirmed: false, state: 'draft',
  mode: 'existing', newName: 'Rice', newSku: 'RICE', stockUnit: 'piece', sellingPrice: '',
});
const attempt = (): StockReviewAttempt => ({
  receipt_id: 'receipt', organization_id: 'org', product_id: 'product', warehouse_id: 'warehouse',
  quantity: 4, unit_cost: 150, notes: 'Owner reviewed job source row Rice',
  job: 'job', row_index: 0, mode: 'existing', name: 'Rice', sku: 'RICE', stock_unit: 'piece', selling_price: 0, confirm: true,
});
const history = () => ({
  row_index: 0, product_id: 'product', warehouse_id: 'warehouse', quantity: 4, unit_cost: '150.00',
  created_product: false, approved_product: null,
});
let db: Awaited<ReturnType<typeof offlineDB.getDB>>;

beforeEach(async () => {
  account.namespace = `stock-review-${crypto.randomUUID()}`;
  useAuthStore.getState().setUser(owner);
  db = await offlineDB.getDB();
  for (const mock of Object.values(server)) mock.mockReset();
  vi.stubGlobal('fetch', server.fetch);
  server.fetch.mockImplementation(async () => new Response(JSON.stringify({ rows: sourceRows, receipts: [history()] })));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  window.localStorage.clear();
});

afterEach(() => { db.close(); useAuthStore.getState().setUser(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function initialized() {
  const draft = await createStockReview(scope, 'job', sourceRows);
  return saveStockReview(scope, draft, [row()]);
}
async function attempted(state: 'confirmation_pending' | 'queued' | 'saved' = 'confirmation_pending') {
  const draft = await initialized();
  return saveStockReview(scope, draft, [{ ...row(), state, attempt: attempt() }]);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

it('restores the original job, sources, corrections and receipt identity after reconnecting to IndexedDB', async () => {
  const draft = await initialized();
  const updated = await saveStockReview(scope, draft, [{ ...row(), quantity: '7', unitCost: '151.50' }]);
  db.close();
  expect(await loadStockReview(scope)).toEqual(updated);
  expect(updated.rows?.[0]).toMatchObject({ receiptId: 'receipt', quantity: '7', unitCost: '151.50' });
  expect(updated.sourceRows).toEqual(sourceRows);
  db = await offlineDB.getDB();
});

it('uses a compare-and-swap revision so a stale tab cannot overwrite a newer correction', async () => {
  const first = await initialized();
  const stale = await loadStockReview(scope);
  expect(stale).not.toBeNull();
  const latest = await saveStockReview(scope, first, [{ ...row(), quantity: '5' }]);
  await expect(saveStockReview(scope, stale!, [{ ...row(), quantity: '6' }])).rejects.toThrow('another tab');
  expect(await loadStockReview(scope)).toEqual(latest);
});

it('does not replace an active review and only clears the supplied current revision', async () => {
  const first = await initialized();
  await expect(createStockReview(scope, 'new-job', sourceRows)).rejects.toThrow('already saved');
  const latest = await saveStockReview(scope, first, [row()]);
  await expect(clearStockReview(scope, first)).rejects.toThrow('another tab');
  await clearStockReview(scope, latest);
  expect(await loadStockReview(scope)).toBeNull();
});

it.each([
  ['quantity', { quantity: '5' }],
  ['cost', { unitCost: '160' }],
  ['product', { productId: 'other-product' }],
  ['warehouse', { warehouseId: 'other-warehouse' }],
  ['receipt identity', { receiptId: 'different-receipt' }],
  ['source', { source: 'Different source' }],
  ['reset to draft', { state: 'draft' as const, attempt: undefined }],
] satisfies Array<[string, Partial<StockReviewRow>]>)('keeps the attempted %s immutable', async (_name, patch) => {
  const draft = await attempted();
  await expect(saveStockReview(scope, draft, [{ ...draft.rows![0], ...patch }])).rejects.toThrow();
  expect(await loadStockReview(scope)).toEqual(draft);
});

it('does not substitute notes on an already attempted command', async () => {
  const draft = await attempted();
  await expect(saveStockReview(scope, draft, [{ ...draft.rows![0], attempt: { ...attempt(), notes: 'Replacement' } }])).rejects.toThrow('already been attempted');
});

it('never downgrades a confirmed row or clears an unsaved attempted row even when the sync queue is empty', async () => {
  const draft = await attempted('queued');
  expect(await db.count('sync_queue')).toBe(0);
  await expect(clearStockReview(scope, draft)).rejects.toThrow('still unconfirmed or queued');
  const saved = await saveStockReview(scope, draft, [{ ...draft.rows![0], state: 'saved' }]);
  await expect(saveStockReview(scope, saved, [{ ...saved.rows![0], state: 'confirmation_pending' }])).rejects.toThrow('already been attempted');
  await clearStockReview(scope, saved);
  expect(await loadStockReview(scope)).toBeNull();
});

it('rejects changed source input and a receipt attempt for another business', async () => {
  const draft = await initialized();
  await expect(saveStockReview(scope, { ...draft, sourceRows: [{ name: 'Other' }] }, [row()])).rejects.toThrow();
  await expect(saveStockReview(scope, draft, [{ ...row(), state: 'confirmation_pending', attempt: { ...attempt(), organization_id: 'other' } }])).rejects.toThrow();
});

it('rejects a fractional-cent attempt before it can be stored or dispatched', async () => {
  const draft = await initialized();
  await expect(saveStockReview(scope, draft, [{
    ...row(), unitCost: '0.123', state: 'confirmation_pending', attempt: { ...attempt(), unit_cost: 0.123 },
  }])).rejects.toThrow();
  expect(await loadStockReview(scope)).toEqual(draft);
});

it('preserves explicitly confirmed free stock without treating a blank cost as zero', async () => {
  const draft = await initialized();
  const free = { ...row(), unitCost: '0.00', zeroConfirmed: true, state: 'confirmation_pending' as const, attempt: { ...attempt(), unit_cost: 0 } };
  const saved = await saveStockReview(scope, draft, [free]);
  expect(saved.rows?.[0]).toMatchObject({ unitCost: '0.00', zeroConfirmed: true, attempt: { unit_cost: 0 } });
  await expect(saveStockReview(scope, saved, [{ ...free, unitCost: '' }])).rejects.toThrow();
});

it('fails closed on a corrupt stored review without erasing it', async () => {
  await initialized();
  const stored = (await db.getAll('app_meta'))[0] as { id: string; draft: StockReviewDraft };
  await db.put('app_meta', { ...stored, draft: { ...stored.draft, version: 99 } });
  await expect(loadStockReview(scope)).rejects.toThrow('could not be read safely');
  expect(await db.count('app_meta')).toBe(1);
});

it('isolates active review keys by both owner and business even within one account database', async () => {
  const original = await initialized();
  useAuthStore.getState().setUser({ ...owner, id: 'other-owner' });
  await expect(loadStockReview(scope)).rejects.toThrow('account changed');
  expect(await loadStockReview({ ...scope, ownerId: 'other-owner' })).toBeNull();
  useAuthStore.getState().setUser({ ...owner, organization_id: 'other-org' });
  expect(await loadStockReview({ ...scope, organizationId: 'other-org' })).toBeNull();
  useAuthStore.getState().setUser(owner);
  expect(await loadStockReview(scope)).toEqual(original);
});

it.each(['owner', 'role', 'status', 'namespace'] as const)('rejects a %s change while the original database is opening', async change => {
  const draft = await initialized();
  const opening = deferred<typeof db>();
  vi.spyOn(offlineDB, 'getDB').mockImplementationOnce(() => opening.promise);
  const pending = loadStockReview(scope);
  if (change === 'owner') useAuthStore.getState().setUser({ ...owner, id: 'other-owner' });
  if (change === 'role') useAuthStore.getState().setUser({ ...owner, role: 'admin' });
  if (change === 'status') useAuthStore.getState().setUser({ ...owner, status: 'suspended' });
  if (change === 'namespace') account.namespace += '-other';
  opening.resolve(db);
  await expect(pending).rejects.toThrow('account changed');
  const records = await db.getAll('app_meta') as Array<{ draft: StockReviewDraft }>;
  expect(records[0].draft).toEqual(draft);
});

it('does not report a failed storage update as durable or replace the previous revision', async () => {
  const draft = await initialized();
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Storage full', 'QuotaExceededError'); });
  await expect(saveStockReview(scope, draft, [{ ...row(), quantity: '8' }])).rejects.toThrow('Storage full');
  expect(await loadStockReview(scope)).toEqual(draft);
});

it('confirms only a matching receipt through the current job-authorised endpoint', async () => {
  expect(await lookupStockReviewReceipt(scope, attempt())).toBe('saved');
  expect(server.fetch).toHaveBeenCalledWith('/api/ai/stock-receipts?job=job');
});

it.each(['missing', 'denied', 'network'] as const)('keeps a %s lookup unconfirmed', async condition => {
  if (condition === 'missing') server.fetch.mockResolvedValue(new Response(JSON.stringify({ receipts: [] })));
  if (condition === 'denied') server.fetch.mockResolvedValue(new Response('{}', { status: 400 }));
  if (condition === 'network') server.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  expect(await lookupStockReviewReceipt(scope, attempt())).toBe('unconfirmed');
});

it.each([
  { product_id: 'different-product' }, { warehouse_id: 'different-location' }, { quantity: 5 },
  { unit_cost: '150.01' }, { created_product: true },
])('rejects a conflicting saved receipt %j', async different => {
  server.fetch.mockResolvedValue(new Response(JSON.stringify({ receipts: [{ ...history(), ...different }] })));
  await expect(lookupStockReviewReceipt(scope, attempt())).rejects.toThrow('different saved result');
});

it('rejects an owner switch while the receipt lookup is in flight', async () => {
  server.fetch.mockImplementationOnce(async () => { useAuthStore.getState().setUser({ ...owner, id: 'other-owner' }); return new Response(JSON.stringify({ receipts: [history()] })); });
  await expect(lookupStockReviewReceipt(scope, attempt())).rejects.toThrow('account changed');
});

it('uses only the job-linked AI endpoint for the frozen command, never the generic stock writer', async () => {
  server.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ saved: true })));
  expect(await submitStockReviewReceipt(scope, attempt())).toEqual({ productId: 'product' });
  expect(server.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = server.fetch.mock.calls[0];
  expect(url).toBe('/api/ai/stock-receipts');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toMatchObject({ job: 'job', row_index: 0, product_id: 'product', quantity: 4, unit_cost: 150, confirm: true });
  expect(JSON.parse(options.body)).not.toHaveProperty('organization_id');
});

it('preserves transport failures as unknown without any offline stock queue', async () => {
  server.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(submitStockReviewReceipt(scope, attempt())).rejects.toThrow('Failed to fetch');
  expect(await db.count('sync_queue')).toBe(0);
});

it('rejects offline execution without issuing a request', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await expect(submitStockReviewReceipt(scope, attempt())).rejects.toThrow('Reconnect');
  expect(server.fetch).not.toHaveBeenCalled();
});

it('resumes an older job pointer only after its authorised server lookup', async () => {
  window.localStorage.setItem('trackasuwa.ai.stockJob', 'job');
  expect(await resumeLegacyStockReview(scope)).toMatchObject({ job: 'job', ownerId: 'owner', sourceRows });
});

it('keeps an older job pointer after lookup failure instead of losing its recovery reference', async () => {
  window.localStorage.setItem('trackasuwa.ai.stockJob', 'job');
  server.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(resumeLegacyStockReview(scope)).rejects.toThrow('Could not restore');
  expect(window.localStorage.getItem('trackasuwa.ai.stockJob')).toBe('job');
});

it('compares source fields independently of JSONB key ordering', () => {
  expect(sameStockReviewSource([{ name: 'Rice', sku: 'RICE' }], [{ sku: 'RICE', name: 'Rice' }])).toBe(true);
  expect(sameStockReviewSource([{ name: 'Rice' }], [{ name: 'Beans' }])).toBe(false);
});

it('keeps new-product name, SKU, unit and selling price immutable after an attempt', async () => {
  const draft = await initialized();
  const newAttempt: StockReviewAttempt = { ...attempt(), product_id: '', mode: 'new', selling_price: 200 };
  const newRow: StockReviewRow = { ...row(), productId: '', mode: 'new', sellingPrice: '200', state: 'confirmation_pending', attempt: newAttempt };
  const saved = await saveStockReview(scope, draft, [newRow]);
  for (const patch of [{ newName: 'Other' }, { newSku: 'OTHER' }, { stockUnit: 'bag' }, { sellingPrice: '250' }]) {
    await expect(saveStockReview(scope, saved, [{ ...newRow, ...patch }])).rejects.toThrow();
  }
  expect(await loadStockReview(scope)).toEqual(saved);
});

it.each(['matching', 'price', 'sku'])('checks the exact approved metadata of a new-product receipt: %s', async condition => {
  const newAttempt: StockReviewAttempt = { ...attempt(), product_id: '', mode: 'new', selling_price: 200 };
  server.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ receipts: [{ ...history(), created_product: true,
    product_id: 'new-product', approved_product: { name: 'Rice', sku: condition === 'sku' ? 'OTHER' : 'RICE', stock_unit: 'piece', selling_price: condition === 'price' ? 250 : 200 },
  }] })));
  if (condition === 'matching') expect(await lookupStockReviewReceipt(scope, newAttempt)).toBe('saved');
  else await expect(lookupStockReviewReceipt(scope, newAttempt)).rejects.toThrow('different saved result');
});

it('does not accept a successful-looking response after the original account changes', async () => {
  server.fetch.mockImplementationOnce(async () => {
    useAuthStore.getState().setUser({ ...owner, id: 'other-owner' });
    return new Response(JSON.stringify({ saved: true }));
  });
  await expect(submitStockReviewReceipt(scope, attempt())).rejects.toThrow('account changed');
});
