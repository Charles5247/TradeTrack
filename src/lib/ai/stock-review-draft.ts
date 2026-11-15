import { z } from 'zod';
import { getDB } from '@/lib/offline/db';
import { getOfflineAccountNamespace } from '@/lib/offline/auth-cache';
import { useAuthStore } from '@/store';
import { withTimeout } from '@/lib/utils/timeout';
import type { ImportRow } from '@/lib/imports/preview';
import type { StockReceipt } from '@/lib/inventory/receive-stock';
import { STOCK_UNITS } from '@/lib/industries';

export interface StockReviewAttempt extends StockReceipt {
  // receipt_id is a local display reference; the server uses (job, row_index).
  job: string; row_index: number; mode: 'existing' | 'new';
  name: string; sku: string; stock_unit: string; selling_price: number; confirm: true;
}

export interface StockReviewScope { ownerId: string; organizationId: string }
export interface StockReviewRow {
  receiptId: string;
  source: string;
  mode: 'existing' | 'new'; newName: string; newSku: string; stockUnit: string; sellingPrice: string;
  savedProductId?: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  unitCost: string;
  zeroConfirmed: boolean;
  state: 'draft' | 'confirmation_pending' | 'queued' | 'saved';
  attempt?: StockReviewAttempt;
  error?: string;
}
export interface StockReviewDraft {
  version: 1;
  revision: number;
  ownerId: string;
  organizationId: string;
  job: string;
  sourceRows: ImportRow[];
  rows: StockReviewRow[] | null;
}

const identifier = z.string().refine(value => value.trim().length > 0);
const sourceRowsSchema = z.array(z.record(z.string(), z.union([z.string(), z.number().finite()])));
const attemptSchema = z.object({
  receipt_id: identifier,
  organization_id: identifier,
  product_id: z.string(),
  warehouse_id: identifier,
  quantity: z.number().int().positive().max(2147483647),
  unit_cost: z.number().finite().min(0).max(9999999999.99)
    .refine(value => Number(value.toFixed(2)) === value, 'Buying cost must have at most two decimal places.'),
  notes: z.string().optional(),
  job: identifier, row_index: z.number().int().nonnegative(), mode: z.enum(['existing', 'new']),
  name: z.string(), sku: z.string(), stock_unit: z.string(),
  selling_price: z.number().finite().min(0).max(9999999999.99)
    .refine(value => Number(value.toFixed(2)) === value, 'Selling price must have at most two decimal places.'), confirm: z.literal(true),
}).strict();
const rowSchema = z.object({
  receiptId: identifier,
  source: z.string(),
  mode: z.enum(['existing', 'new']), newName: z.string(), newSku: z.string(), stockUnit: z.string(), sellingPrice: z.string(),
  savedProductId: identifier.optional(),
  productId: z.string(),
  warehouseId: z.string(),
  quantity: z.string(),
  unitCost: z.string(),
  zeroConfirmed: z.boolean(),
  state: z.enum(['draft', 'confirmation_pending', 'queued', 'saved']),
  attempt: attemptSchema.optional(),
  error: z.string().optional(),
}).strict();
const draftSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  ownerId: identifier,
  organizationId: identifier,
  job: identifier,
  sourceRows: sourceRowsSchema,
  rows: z.array(rowSchema).nullable(),
}).strict();
const storedSchema = z.object({ id: identifier, draft: draftSchema }).strict();
const scopeError = () => new Error('Your account changed. Reopen the stock review before continuing.');
const invalidDraft = () => new Error('This saved stock review could not be read safely. Keep it and check its receipts before starting again.');
const staleDraft = () => new Error('This stock review changed in another tab. Reload it before continuing.');

function copyScope(scope: StockReviewScope): StockReviewScope {
  if (!identifier.safeParse(scope.ownerId).success || !identifier.safeParse(scope.organizationId).success) throw scopeError();
  return { ownerId: scope.ownerId, organizationId: scope.organizationId };
}

function scopedSession(scope: StockReviewScope) {
  const namespace = getOfflineAccountNamespace();
  let lost = false;
  let abort: (() => void) | undefined;
  const matches = () => {
    const user = useAuthStore.getState().user;
    return user?.id === scope.ownerId && user.organization_id === scope.organizationId
      && user.role === 'business_owner' && user.status === 'active'
      && getOfflineAccountNamespace() === namespace;
  };
  if (!matches()) throw scopeError();
  const unsubscribe = useAuthStore.subscribe(() => {
    if (!matches()) {
      lost = true;
      abort?.();
    }
  });
  return {
    check() { if (lost || !matches()) throw scopeError(); },
    bindAbort(handler: () => void) { abort = handler; },
    dispose: unsubscribe,
  };
}

function key(scope: StockReviewScope) {
  return `ai-stock-review:${encodeURIComponent(scope.organizationId)}:${encodeURIComponent(scope.ownerId)}`;
}

function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => equal(value, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a).filter(name => a[name] !== undefined).sort();
  const other = Object.keys(b).filter(name => b[name] !== undefined).sort();
  return equal(keys, other) && keys.every(name => equal(a[name], b[name]));
}

export function sameStockReviewSource(left: ImportRow[], right: ImportRow[]) { return equal(left, right); }

function sourceLabel(row: ImportRow, index: number) {
  return String(row.name || '').trim() || `Source row ${index + 1}`;
}

function validateDraft(value: unknown, scope: StockReviewScope): StockReviewDraft {
  const parsed = draftSchema.safeParse(value);
  if (!parsed.success) throw invalidDraft();
  const draft = parsed.data;
  if (draft.ownerId !== scope.ownerId || draft.organizationId !== scope.organizationId) throw scopeError();
  if (draft.rows) {
    if (draft.rows.length !== draft.sourceRows.length || new Set(draft.rows.map(row => row.receiptId)).size !== draft.rows.length) throw invalidDraft();
    for (const [index, row] of draft.rows.entries()) {
      if (row.source !== sourceLabel(draft.sourceRows[index], index)) throw invalidDraft();
      if ((row.state === 'draft') !== (row.attempt === undefined)) throw invalidDraft();
      if (row.attempt) {
        const attempt = row.attempt;
        if (attempt.receipt_id !== row.receiptId || attempt.organization_id !== scope.organizationId
          || attempt.job !== draft.job || attempt.row_index !== index || attempt.mode !== row.mode
          || attempt.name !== row.newName || attempt.sku !== row.newSku || attempt.stock_unit !== row.stockUnit
          || (row.mode === 'new' && (!row.sellingPrice.trim() || Number(row.sellingPrice) !== attempt.selling_price
            || !row.newName.trim() || row.newName.trim().length > 255 || !row.newSku.trim() || row.newSku.trim().length > 100
            || !STOCK_UNITS.some(unit => unit === row.stockUnit)))
          || (row.mode === 'existing' && !row.productId)
          || attempt.product_id !== row.productId || attempt.warehouse_id !== row.warehouseId
          || !row.quantity.trim() || Number(row.quantity) !== attempt.quantity
          || !row.unitCost.trim() || Number(row.unitCost) !== attempt.unit_cost
          || (attempt.unit_cost === 0 && !row.zeroConfirmed)) throw invalidDraft();
      }
    }
  }
  return draft;
}

async function accessReview<T>(scopeInput: StockReviewScope, action: (
  current: StockReviewDraft | null,
  write: (draft: StockReviewDraft) => Promise<void>,
  remove: () => Promise<void>,
) => Promise<T>): Promise<T> {
  const scope = copyScope(scopeInput);
  const session = scopedSession(scope);
  try {
    // getDB captures the active namespace synchronously, before its first await.
    const opening = getDB();
    const db = await opening;
    session.check();
    const tx = db.transaction('app_meta', 'readwrite');
    const done = tx.done;
    void done.catch(() => {});
    const abort = () => { try { tx.abort(); } catch { /* Already finished. */ } };
    session.bindAbort(abort);
    try {
      const raw: unknown = await tx.store.get(key(scope));
      session.check();
      let current: StockReviewDraft | null = null;
      if (raw !== undefined) {
        const record = storedSchema.safeParse(raw);
        if (!record.success || record.data.id !== key(scope)) throw invalidDraft();
        current = validateDraft(record.data.draft, scope);
      }
      const result = await action(current, async draft => {
        session.check();
        await tx.store.put({ id: key(scope), draft });
        session.check();
      }, async () => {
        session.check();
        await tx.store.delete(key(scope));
        session.check();
      });
      session.check();
      await done;
      session.check();
      return result;
    } catch (error) {
      abort();
      await done.catch(() => {});
      session.check();
      throw error;
    }
  } finally { session.dispose(); }
}

function assertCurrent(current: StockReviewDraft | null, supplied: StockReviewDraft, scope: StockReviewScope) {
  const checked = validateDraft(supplied, scope);
  if (!current || current.revision !== checked.revision || current.job !== checked.job
    || !equal(current.sourceRows, checked.sourceRows)) throw staleDraft();
}

export function loadStockReview(scope: StockReviewScope): Promise<StockReviewDraft | null> {
  return accessReview(scope, async current => current);
}

/** Adopt upstream's older browser-wide job pointer only after server ownership checks. */
export async function resumeLegacyStockReview(scope: StockReviewScope): Promise<StockReviewDraft | null> {
  const session = scopedSession(copyScope(scope));
  try {
    let job: string | null;
    try { job = window.localStorage.getItem('trackasuwa.ai.stockJob'); } catch { return null; }
    if (!job) return null;
    try {
      const response = await withTimeout(fetch(`/api/ai/stock-receipts?job=${encodeURIComponent(job)}`), 5000);
      session.check();
      if (!response.ok) return null;
      const parsed = z.object({ rows: sourceRowsSchema }).safeParse(await response.json());
      session.check();
      if (!parsed.success) throw new Error('Saved proposal could not be read.');
      return await createStockReview(scope, job, parsed.data.rows);
    } catch {
      session.check();
      throw new Error('Could not restore the previous stock review. Reconnect and reopen it before starting another delivery.');
    }
  } finally { session.dispose(); }
}

export function createStockReview(scopeInput: StockReviewScope, job: string, sourceRows: ImportRow[]): Promise<StockReviewDraft> {
  const scope = copyScope(scopeInput);
  return accessReview(scope, async (current, write) => {
    if (current) throw new Error('A stock review is already saved on this device. Resume or safely clear it before starting another.');
    const draft = validateDraft({ version: 1, revision: 1, ...scope, job, sourceRows, rows: null }, scope);
    await write(draft);
    return draft;
  });
}

export function saveStockReview(scopeInput: StockReviewScope, currentDraft: StockReviewDraft, rows: StockReviewRow[]): Promise<StockReviewDraft> {
  const scope = copyScope(scopeInput);
  return accessReview(scope, async (current, write) => {
    assertCurrent(current, currentDraft, scope);
    if (!current) throw staleDraft();
    const next = validateDraft({ ...current, revision: current.revision + 1, rows }, scope);
    if (current.rows) {
      if (!next.rows || next.rows.length !== current.rows.length) throw invalidDraft();
      const incoming = next.rows;
      current.rows.forEach((before, index) => {
        const after = incoming[index];
        if (before.receiptId !== after.receiptId || before.source !== after.source) throw invalidDraft();
        if (before.attempt && (!equal(before.attempt, after.attempt) || before.state === 'saved' && after.state !== 'saved'
          || before.productId !== after.productId || before.warehouseId !== after.warehouseId
          || before.quantity !== after.quantity || before.unitCost !== after.unitCost
          || before.zeroConfirmed !== after.zeroConfirmed || after.state === 'draft')) {
          throw new Error('This receipt has already been attempted. Check its status before changing or receiving it again.');
        }
        if (before.attempt && (before.mode !== after.mode || before.newName !== after.newName
          || before.newSku !== after.newSku || before.stockUnit !== after.stockUnit || before.sellingPrice !== after.sellingPrice)) throw invalidDraft();
      });
    }
    await write(next);
    return next;
  });
}

export function clearStockReview(scopeInput: StockReviewScope, currentDraft: StockReviewDraft): Promise<void> {
  const scope = copyScope(scopeInput);
  return accessReview(scope, async (current, _write, remove) => {
    assertCurrent(current, currentDraft, scope);
    if (current?.rows?.some(row => row.attempt && row.state !== 'saved')) {
      throw new Error('Some receipts are still unconfirmed or queued. Check them before clearing this stock review.');
    }
    await remove();
  });
}

class ReceiptConflict extends Error {}

function cents(value: number | string) {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

const amountSchema = z.union([z.number().finite(), z.string().regex(/^\d+(?:\.\d+)?$/)]);
const receiptSchema = z.object({
  row_index: z.number().int().nonnegative(), product_id: identifier, warehouse_id: identifier,
  quantity: z.number().int().positive(), unit_cost: amountSchema, created_product: z.boolean(),
  approved_product: z.object({ name: z.string(), sku: z.string(), stock_unit: z.string(), selling_price: amountSchema }).nullable(),
});
export type SavedStockReviewReceipt = z.infer<typeof receiptSchema>;

export function confirmedStockReviewReceipt(value: StockReviewAttempt, receipts: SavedStockReviewReceipt[]): boolean {
  const attempt = attemptSchema.parse(value);
  const receipt = receipts.find(row => row.row_index === attempt.row_index);
  if (!receipt) return false;
  const created = attempt.mode === 'new';
  if (receipt.created_product !== created || (!created && receipt.product_id !== attempt.product_id)
    || receipt.warehouse_id !== attempt.warehouse_id || receipt.quantity !== attempt.quantity
    || (created && (!receipt.approved_product || receipt.approved_product.name !== attempt.name.trim()
      || receipt.approved_product.sku !== attempt.sku.trim() || receipt.approved_product.stock_unit !== attempt.stock_unit
      || cents(receipt.approved_product.selling_price) !== cents(attempt.selling_price)))
    || cents(receipt.unit_cost) !== cents(attempt.unit_cost)) {
    throw new ReceiptConflict('This receipt ID has a different saved result. Keep this review and resolve the receipt before receiving again.');
  }
  return true;
}

export async function readStockReviewProposal(scope: StockReviewScope, job: string) {
  const session = scopedSession(copyScope(scope));
  try {
    const response = await withTimeout(fetch(`/api/ai/stock-receipts?job=${encodeURIComponent(job)}`), 5000);
    session.check();
    if (!response.ok) throw new Error('Could not confirm this stock proposal. Reconnect using its original Owner account.');
    const parsed = z.object({ rows: sourceRowsSchema, receipts: z.array(receiptSchema) }).parse(await response.json());
    session.check();
    return parsed;
  } finally { session.dispose(); }
}

export async function submitStockReviewReceipt(scopeInput: StockReviewScope, value: StockReviewAttempt): Promise<{ productId: string }> {
  const scope = copyScope(scopeInput);
  const session = scopedSession(scope);
  try {
    const attempt = attemptSchema.parse(value);
    if (attempt.organization_id !== scope.organizationId) throw scopeError();
    if (!navigator.onLine) throw new Error('Reconnect before applying stock. The receipt has not been confirmed.');
    const response = await withTimeout(fetch('/api/ai/stock-receipts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: attempt.job, row_index: attempt.row_index, mode: attempt.mode,
        product_id: attempt.product_id, name: attempt.name, sku: attempt.sku,
        stock_unit: attempt.stock_unit, selling_price: attempt.selling_price,
        warehouse_id: attempt.warehouse_id, quantity: attempt.quantity, unit_cost: attempt.unit_cost, confirm: true }),
    }), 10000);
    session.check();
    const result: unknown = await response.json();
    session.check();
    const parsed = z.object({ saved: z.literal(true), product_id: identifier.optional() }).safeParse(result);
    if (!response.ok || !parsed.success || (attempt.mode === 'new' && !parsed.data.product_id))
      throw new Error('Stock was not confirmed. Keep this review and check the receipt before retrying.');
    return { productId: parsed.data.product_id || attempt.product_id };
  } finally { session.dispose(); }
}

export async function lookupStockReviewReceipt(scopeInput: StockReviewScope, value: StockReviewAttempt): Promise<'saved' | 'unconfirmed'> {
  const scope = copyScope(scopeInput);
  const session = scopedSession(scope);
  try {
    const attempt = attemptSchema.parse(value);
    if (attempt.organization_id !== scope.organizationId) throw scopeError();
    try {
      // This endpoint derives current Owner/organisation/entitlement on the
      // server and binds both lookup and execution to the original job's owner.
      const response = await withTimeout(fetch(`/api/ai/stock-receipts?job=${encodeURIComponent(attempt.job)}`), 5000);
      session.check();
      if (!response.ok) return 'unconfirmed';
      const data: unknown = await response.json();
      session.check();
      const parsed = z.object({ receipts: z.array(receiptSchema) }).safeParse(data);
      if (!parsed.success) return 'unconfirmed';
      return confirmedStockReviewReceipt(attempt, parsed.data.receipts) ? 'saved' : 'unconfirmed';
    } catch (error) {
      session.check();
      if (error instanceof ReceiptConflict || error instanceof Error && error.message === scopeError().message) throw error;
      return 'unconfirmed';
    }
  } finally { session.dispose(); }
}
