import { z } from 'zod';
import { getDB } from '@/lib/offline/db';
import { getOfflineAccountNamespace } from '@/lib/offline/auth-cache';
import { useAuthStore } from '@/store';
import { withTimeout } from '@/lib/utils/timeout';
import type { ImportRow } from '@/lib/imports/preview';
import type { StockReceipt } from '@/lib/inventory/receive-stock';
import { STOCK_UNITS } from '@/lib/industries';
import { approvalSchema, executionSchema, reviewActionSchema, reviewSnapshotSchema, reviewedOperationSchema,
  selectionSchema, serverReviewSchema, sourceSchema, reviewRowSchema, stockReviewIdSchema, StockReviewRequestError,
  type ReviewRowInput, type StockSelection, type StockReviewSnapshot, type StockSource,
  type ReviewedStockOperation, type StockExecution } from './stock-review-contract';

export interface StockReviewAttempt extends StockReceipt {
  // receipt_id is a local display reference; the server uses (job, row_index).
  job: string; row_index: number; mode: 'existing' | 'new';
  name: string; sku: string; stock_unit: string; selling_price: number; confirm: true;
  approval_id?: string; operation_id?: string;
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
  operation?: ReviewedStockOperation;
  changes?: Array<{ field: string; reviewed: unknown; current: unknown }>;
}
export interface StockReviewDraft {
  version: 1;
  revision: number;
  ownerId: string;
  organizationId: string;
  job: string;
  sourceRows: ImportRow[];
  rows: StockReviewRow[] | null;
  serverRevision?: number | null;
  serverRows?: ReviewRowInput[];
  source?: StockSource;
  dirty?: boolean;
  conflict?: boolean;
  syncError?: string;
  selection?: StockSelection;
  pendingApproval?: StockSelection;
  firstLocation?: { id: string; name: string };
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
  approval_id: stockReviewIdSchema.optional(), operation_id: stockReviewIdSchema.optional(),
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
  operation: reviewedOperationSchema.optional(),
  changes: z.array(z.object({ field: z.string(), reviewed: z.unknown(), current: z.unknown() })).optional(),
}).strict();
const draftSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  ownerId: identifier,
  organizationId: identifier,
  job: identifier,
  sourceRows: sourceRowsSchema,
  rows: z.array(rowSchema).nullable(),
  serverRevision: z.number().int().positive().nullable().optional(),
  serverRows: z.array(reviewRowSchema).optional(), source: sourceSchema.optional(),
  dirty: z.boolean().optional(), conflict: z.boolean().optional(), syncError: z.string().optional(),
  selection: selectionSchema.optional(), pendingApproval: selectionSchema.optional(),
  firstLocation: z.object({ id: stockReviewIdSchema, name: z.string().trim().min(1).max(255) }).strict().optional(),
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
        if ((!row.operation && attempt.receipt_id !== row.receiptId) || attempt.organization_id !== scope.organizationId
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
        if (row.operation && (row.operation.row_index !== index || row.operation.receipt_id !== attempt.receipt_id
          || row.operation.operation_id !== attempt.operation_id || row.operation.approval_id !== attempt.approval_id
          || !equal(row.operation.row, toServerRow(row, index)))) throw invalidDraft();
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

export function toServerRow(row: StockReviewRow, index: number): ReviewRowInput {
  return { row_index: index, mode: row.mode, product_id: row.productId || null,
    warehouse_id: row.warehouseId || null, quantity: row.quantity.trim() || null,
    unit_cost: row.unitCost.trim() || null, zero_confirmed: row.zeroConfirmed,
    name: row.newName, sku: row.newSku, stock_unit: row.stockUnit,
    selling_price: row.sellingPrice.trim() || null };
}

export function applyServerRow(row: StockReviewRow, input: ReviewRowInput): StockReviewRow {
  return { ...row, mode: input.mode, productId: input.product_id || '', warehouseId: input.warehouse_id || '',
    quantity: input.quantity ?? '', unitCost: input.unit_cost ?? '', zeroConfirmed: input.zero_confirmed,
    newName: input.name, newSku: input.sku, stockUnit: input.stock_unit, sellingPrice: input.selling_price ?? '' };
}

export function attemptFromOperation(scope: StockReviewScope, job: string, operation: ReviewedStockOperation): StockReviewAttempt {
  const row = operation.row;
  return attemptSchema.parse({ receipt_id: operation.receipt_id, organization_id: scope.organizationId,
    job, row_index: operation.row_index, product_id: row.product_id || '', warehouse_id: row.warehouse_id,
    quantity: Number(row.quantity), unit_cost: Number(row.unit_cost), mode: row.mode, name: row.name,
    sku: row.sku, stock_unit: row.stock_unit, selling_price: row.mode === 'new' ? Number(row.selling_price) : 0,
    confirm: true, approval_id: operation.approval_id, operation_id: operation.operation_id });
}

async function request<T>(scopeInput: StockReviewScope, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const scope = copyScope(scopeInput);
  const session = scopedSession(scope);
  try {
    if (!navigator.onLine) throw new Error('Reconnect before checking or applying this stock review. No new stock has been submitted.');
    const headers = { 'X-Track-Expected-Owner': scope.ownerId, 'X-Track-Expected-Organization': scope.organizationId };
    const response = await withTimeout(fetch(path, body === undefined ? { cache: 'no-store', headers } : {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(reviewActionSchema.parse(body)),
    }), 10000);
    session.check();
    const value: unknown = await response.json();
    session.check();
    if (!response.ok) {
      const error = z.object({ error: z.string(), code: z.string().optional() }).safeParse(value);
      throw new StockReviewRequestError(error.success ? error.data.error : 'Could not confirm this stock review.',
        error.success ? error.data.code || 'REQUEST_FAILED' : 'REQUEST_FAILED');
    }
    return schema.parse(value);
  } finally { session.dispose(); }
}

export async function readStockReviewProposal(scope: StockReviewScope, job: string): Promise<StockReviewSnapshot> {
  const snapshot = await request(scope, `/api/ai/stock-receipts?job=${encodeURIComponent(job)}`, reviewSnapshotSchema);
  if (snapshot.job !== job) throw invalidDraft();
  return snapshot;
}

async function patch(scope: StockReviewScope, supplied: StockReviewDraft, mutate: (current: StockReviewDraft) => StockReviewDraft) {
  return accessReview(scope, async (current, write) => {
    assertCurrent(current, supplied, scope);
    if (!current) throw staleDraft();
    const next = validateDraft({ ...mutate(current), revision: current.revision + 1 }, scope);
    await write(next);
    return next;
  });
}

export function createStockReview(scopeInput: StockReviewScope, job: string, sourceRows: ImportRow[]): Promise<StockReviewDraft> {
  const scope = copyScope(scopeInput);
  return accessReview(scope, async (current, write) => {
    if (current) throw new Error('A stock review is already saved. Resume or safely close it before starting another delivery.');
    const draft = validateDraft({ version: 1, revision: 1, ...scope, job, sourceRows, rows: null }, scope);
    await write(draft);
    return draft;
  });
}

export function saveStockReview(scopeInput: StockReviewScope, currentDraft: StockReviewDraft, rows: StockReviewRow[]): Promise<StockReviewDraft> {
  const scope = copyScope(scopeInput);
  return patch(scope, currentDraft, current => {
    if (current.pendingApproval) throw new Error('Check the pending approval before changing this review.');
    const next = { ...current, rows };
    if (current.rows) current.rows.forEach((before, index) => {
      const after = rows[index];
      if (!after || before.receiptId !== after.receiptId || before.source !== after.source) throw invalidDraft();
      if (before.attempt && (!equal(before.attempt, after.attempt) || !equal(before.operation, after.operation)
        || before.state !== after.state || after.state === 'draft'
        || !equal(toServerRow(before, index), toServerRow(after, index)))) {
        throw new Error('This receipt has already been attempted. Check its original status before changing it.');
      }
    });
    const changed = !equal(current.rows?.map(toServerRow), rows.map(toServerRow));
    return { ...next, dirty: current.dirty || changed, selection: changed ? undefined : current.selection, syncError: undefined };
  });
}

/** Record the location identity before saving it so reloads and retries use the same ID. */
export function stageFirstStockLocation(scope: StockReviewScope, draft: StockReviewDraft, location: NonNullable<StockReviewDraft['firstLocation']>) {
  return patch(scope, draft, current => {
    if (current.pendingApproval || current.conflict || current.firstLocation) throw staleDraft();
    return { ...current, firstLocation: location };
  });
}

export function resolveFirstStockLocation(scope: StockReviewScope, draft: StockReviewDraft, warehouseId?: string) {
  return patch(scope, draft, current => {
    if (current.pendingApproval || current.conflict || !current.firstLocation) throw staleDraft();
    if (!warehouseId) return { ...current, firstLocation: undefined };
    if (warehouseId !== current.firstLocation.id) throw invalidDraft();
    const rows = current.rows?.map(row => row.state === 'draft' && !row.warehouseId
      ? { ...row, warehouseId, changes: undefined, error: undefined } : row) ?? null;
    return { ...current, firstLocation: undefined, rows, dirty: true, selection: undefined };
  });
}

export type SavedStockReviewReceipt = StockReviewSnapshot['receipts'][number];
class ReceiptConflict extends Error {}
function cents(value: number | string) { return Math.round(Number(value) * 100); }
export function confirmedStockReviewReceipt(attempt: StockReviewAttempt, receipts: SavedStockReviewReceipt[]) {
  const receipt = receipts.find(row => row.row_index === attempt.row_index);
  if (!receipt) return false;
  if (receipt.created_product !== (attempt.mode === 'new') || attempt.mode === 'existing' && receipt.product_id !== attempt.product_id
    || receipt.warehouse_id !== attempt.warehouse_id || receipt.quantity !== attempt.quantity || cents(receipt.unit_cost) !== cents(attempt.unit_cost)
    || attempt.mode === 'new' && (!receipt.approved_product || receipt.approved_product.name !== attempt.name.trim()
      || receipt.approved_product.sku !== attempt.sku.trim() || receipt.approved_product.stock_unit !== attempt.stock_unit
      || cents(receipt.approved_product.selling_price) !== cents(attempt.selling_price))) {
    throw new ReceiptConflict('This source row has a different confirmed receipt. Keep it and resolve the original receipt before receiving again.');
  }
  return true;
}

function latestOperation(snapshot: StockReviewSnapshot, index: number) {
  // The server orders each row's history chronologically. An unchanged review
  // can be approved again after an earlier selection expires, so revision alone
  // cannot choose its latest approval. On ties retain the last history entry.
  // A confirmed business effect always takes precedence over pending/no-effect.
  return snapshot.operations.reduce<ReviewedStockOperation | undefined>((latest, operation) => {
    if (operation.row_index !== index) return latest;
    if (!latest) return operation;
    if (operation.status === 'completed' && latest.status !== 'completed') return operation;
    if (latest.status === 'completed' && operation.status !== 'completed') return latest;
    return operation.revision >= latest.revision ? operation : latest;
  }, undefined);
}

function reconcileSnapshot(current: StockReviewDraft, snapshot: StockReviewSnapshot, discard: boolean): StockReviewDraft {
  if (current.job !== snapshot.job || !sameStockReviewSource(current.sourceRows, snapshot.rows)) throw invalidDraft();
  if (snapshot.review && (snapshot.review.rows.length !== snapshot.rows.length
    || snapshot.review.rows.some((row, index) => row.row_index !== index))) throw invalidDraft();
  const localInputs = current.rows?.map(toServerRow);
  const matchesRemote = !!snapshot.review && equal(localInputs, snapshot.review.rows);
  const conflict = !discard && !!current.dirty && !matchesRemote
    && (current.serverRevision ?? null) !== (snapshot.review?.revision ?? null);
  const useRemote = !!snapshot.review && !conflict && (discard || !current.dirty || matchesRemote);
  let rows = current.rows;
  if (rows) rows = rows.map((row, index): StockReviewRow => {
    if (row.state === 'saved') {
      if (row.attempt) confirmedStockReviewReceipt(row.attempt, snapshot.receipts);
      return row;
    }
    let next = useRemote && row.state === 'draft' ? applyServerRow(row, snapshot.review!.rows[index]) : row;
    const operation = latestOperation(snapshot, index);
    if (operation && (operation.status !== 'no_effect' || !row.attempt || row.operation?.operation_id === operation.operation_id)) {
      if (operation.status === 'no_effect') {
        const result = operation.result;
        next = { ...next, state: 'draft', attempt: undefined, operation: undefined,
          error: result?.status === 'no_effect' ? result.message : 'No stock was received. Review this row again.',
          changes: result?.status === 'no_effect' ? result.changes : undefined };
      } else {
        next = { ...applyServerRow(next, operation.row), operation,
          attempt: attemptFromOperation(current, current.job, operation),
          state: operation.status === 'completed' ? 'saved' : 'confirmation_pending',
          savedProductId: operation.result?.status === 'completed' ? operation.result.product_id : undefined,
          error: undefined, changes: undefined };
      }
    }
    const receipt = snapshot.receipts.find(item => item.row_index === index);
    if (receipt && next.attempt && confirmedStockReviewReceipt(next.attempt, [receipt])) {
      next = { ...next, state: 'saved', savedProductId: receipt.product_id, error: undefined };
    } else if (receipt && !next.attempt) {
      const approved = receipt.approved_product;
      next = { ...next, mode: receipt.created_product ? 'new' : 'existing', productId: receipt.created_product ? '' : receipt.product_id,
        warehouseId: receipt.warehouse_id, quantity: String(receipt.quantity), unitCost: String(receipt.unit_cost),
        zeroConfirmed: Number(receipt.unit_cost) === 0, newName: approved?.name || next.newName,
        newSku: approved?.sku || next.newSku, stockUnit: approved?.stock_unit || next.stockUnit,
        sellingPrice: approved ? String(approved.selling_price) : next.sellingPrice,
        state: 'saved', savedProductId: receipt.product_id };
      next.attempt = { receipt_id: next.receiptId, organization_id: current.organizationId, job: current.job, row_index: index,
        product_id: next.productId, warehouse_id: next.warehouseId, quantity: receipt.quantity, unit_cost: Number(receipt.unit_cost),
        mode: next.mode, name: next.newName, sku: next.newSku, stock_unit: next.stockUnit,
        selling_price: next.mode === 'new' ? Number(next.sellingPrice) : 0, confirm: true };
    }
    return next;
  });
  const pending = current.pendingApproval;
  const resolvedApproval = pending && pending.groups.every(group => snapshot.operations.some(operation =>
    operation.selection_id === pending.selection_id && operation.row_index === group.row_index));
  return { ...current, rows, source: snapshot.source,
    serverRevision: conflict ? current.serverRevision : snapshot.review?.revision ?? null,
    serverRows: snapshot.review?.rows, conflict, syncError: undefined,
    dirty: useRemote ? false : current.dirty, pendingApproval: resolvedApproval ? undefined : pending,
    selection: undefined };
}

/** Server review is authoritative; un-synced device edits survive revision conflicts. */
export async function loadStockReview(scope: StockReviewScope, options?: { discardLocalEdits?: boolean }): Promise<StockReviewDraft | null> {
  const local = await accessReview(scope, async current => current);
  if (!navigator.onLine) return local;
  try {
    const snapshot = local ? await readStockReviewProposal(scope, local.job)
      : await request(scope, '/api/ai/stock-receipts', reviewSnapshotSchema.nullable());
    if (!snapshot) return local;
    const current = local || await createStockReview(scope, snapshot.job, snapshot.rows);
    return await patch(scope, current, draft => reconcileSnapshot(draft, snapshot, !!options?.discardLocalEdits));
  } catch (error) {
    // Scope changes always fail closed; they must not be disguised as offline recovery.
    scopedSession(scope).dispose();
    if (!local) throw error;
    return { ...local, syncError: error instanceof Error ? error.message : 'Could not check the saved review. Reconnect and try again.' };
  }
}

/** Browser-wide legacy pointers are adopted only through the scoped server response. */
export async function resumeLegacyStockReview(scope: StockReviewScope): Promise<StockReviewDraft | null> {
  let job: string | null;
  try { job = window.localStorage.getItem('trackasuwa.ai.stockJob'); } catch { return null; }
  if (!job) return null;
  try {
    const snapshot = await readStockReviewProposal(scope, job);
    const draft = await createStockReview(scope, snapshot.job, snapshot.rows);
    return await patch(scope, draft, current => reconcileSnapshot(current, snapshot, false));
  } catch {
    scopedSession(scope).dispose();
    throw new Error('Could not restore the previous stock review. Reconnect and reopen it before starting another delivery.');
  }
}

export async function saveServerStockReview(scope: StockReviewScope, supplied: StockReviewDraft): Promise<StockReviewDraft> {
  if (!supplied.rows) throw invalidDraft();
  if (supplied.conflict) throw new Error('This review changed on another device. Keep your edits or explicitly reload the account review.');
  if (supplied.pendingApproval || supplied.rows.some(row => row.state !== 'draft' && row.state !== 'saved'))
    throw new Error('Check pending receipts before saving a new review revision.');
  const input = supplied.rows.map(toServerRow);
  if (!supplied.dirty && supplied.serverRevision && equal(input, supplied.serverRows)) return supplied;
  const review = await request(scope, '/api/ai/stock-receipts', serverReviewSchema, {
    action: 'save_review', job: supplied.job, expected_revision: supplied.serverRevision ?? null, rows: input,
  });
  if (!equal(review.rows, input)) throw invalidDraft();
  return patch(scope, supplied, current => ({ ...current, serverRevision: review.revision, serverRows: review.rows,
    dirty: false, conflict: false, syncError: undefined, selection: undefined }));
}

/** Matching remains UI-assisted; a second scoped read restores any existing operations. */
export async function initializeStockReviewRows(scope: StockReviewScope, supplied: StockReviewDraft, rows: StockReviewRow[]) {
  const saved = await patch(scope, supplied, current => {
    if (current.rows) return current;
    return { ...current, rows: rows.map((row, index) => current.serverRows?.[index]
      ? applyServerRow(row, current.serverRows[index]) : row), dirty: !current.serverRows };
  });
  return await loadStockReview(scope) || saved;
}

export async function previewStockSelection(scope: StockReviewScope, supplied: StockReviewDraft, indices: number[]): Promise<StockReviewDraft> {
  const saved = await saveServerStockReview(scope, supplied);
  const selection = await request(scope, '/api/ai/stock-receipts', selectionSchema, {
    action: 'preview_selection', job: saved.job, revision: saved.serverRevision, row_indices: indices, physical_received: true,
  });
  if (selection.revision !== saved.serverRevision || !equal([...indices].sort((a,b) => a-b), selection.groups.map(group => group.row_index).sort((a,b) => a-b))) throw invalidDraft();
  return patch(scope, saved, current => ({ ...current, selection, syncError: undefined }));
}

export async function approveStockSelection(scope: StockReviewScope, supplied: StockReviewDraft): Promise<StockReviewDraft> {
  const selection = supplied.selection;
  if (!selection || supplied.dirty || supplied.conflict || supplied.pendingApproval
    || selection.revision !== supplied.serverRevision || !equal(supplied.rows?.map(toServerRow), supplied.serverRows))
    throw new Error('Review the current exact stock changes before approving.');
  if (!navigator.onLine) throw new Error('Reconnect before approving stock. No new stock has been submitted.');
  const pending = await patch(scope, supplied, current => ({ ...current, pendingApproval: selection }));
  const approval = await request(scope, '/api/ai/stock-receipts', approvalSchema, {
    action: 'approve_selection', job: supplied.job, selection_id: selection.selection_id,
    revision: selection.revision, review_digest: selection.review_digest, confirm: true,
  });
  if (approval.selection_id !== selection.selection_id || approval.revision !== selection.revision
    || approval.review_digest !== selection.review_digest || !equal([...approval.row_indices].sort((a,b)=>a-b), selection.groups.map(group => group.row_index).sort((a,b)=>a-b))) throw invalidDraft();
  return patch(scope, pending, current => ({ ...current, pendingApproval: undefined, selection: undefined,
    rows: current.rows?.map((row, index): StockReviewRow => {
      const group = selection.groups.find(value => value.row_index === index);
      if (!group) return row;
      const operation: ReviewedStockOperation = { approval_id: approval.approval_id, selection_id: selection.selection_id,
        revision: selection.revision, row_index: index, operation_id: group.operation_id, receipt_id: group.receipt_id,
        review_digest: selection.review_digest, expires_at: approval.expires_at, row: toServerRow(row, index), status: 'approved', result: null };
      return { ...row, state: 'confirmation_pending', operation, attempt: attemptFromOperation(scope, current.job, operation) };
    }) || null }));
}

export async function submitStockReviewReceipt(scope: StockReviewScope, value: StockReviewAttempt): Promise<StockExecution> {
  const attempt = attemptSchema.parse(value);
  if (attempt.organization_id !== scope.organizationId) throw scopeError();
  if (!attempt.approval_id || !attempt.operation_id) throw new Error('This older receipt must be checked first. Its raw fields cannot be submitted again.');
  const result = await request(scope, '/api/ai/stock-receipts', executionSchema, {
    action: 'execute_reviewed', job: attempt.job, approval_id: attempt.approval_id, row_index: attempt.row_index,
  });
  if (result.row_index !== attempt.row_index || result.operation_id !== attempt.operation_id || result.receipt_id !== attempt.receipt_id) throw invalidDraft();
  return result;
}

export async function recordStockExecution(scope: StockReviewScope, supplied: StockReviewDraft, result: StockExecution) {
  result = executionSchema.parse(result);
  return patch(scope, supplied, current => ({ ...current, selection: undefined,
    rows: current.rows?.map((row, index): StockReviewRow => {
      if (index !== result.row_index) return row;
      if (row.attempt?.operation_id !== result.operation_id || row.attempt.receipt_id !== result.receipt_id || !row.operation) throw invalidDraft();
      if (row.state === 'saved') {
        if (result.status !== 'completed' || result.product_id !== row.savedProductId) throw invalidDraft();
        return row;
      }
      if (result.status === 'completed') return { ...row, state: 'saved', savedProductId: result.product_id,
        operation: { ...row.operation, status: 'completed', result }, error: undefined };
      return { ...row, state: 'draft', attempt: undefined, operation: undefined, error: result.message, changes: result.changes };
    }) || null }));
}

export async function lookupStockReviewReceipt(scope: StockReviewScope, value: StockReviewAttempt): Promise<'saved' | 'unconfirmed'> {
  const attempt = attemptSchema.parse(value);
  const snapshot = await readStockReviewProposal(scope, attempt.job);
  return confirmedStockReviewReceipt(attempt, snapshot.receipts) ? 'saved' : 'unconfirmed';
}

export async function clearStockReview(scope: StockReviewScope, supplied: StockReviewDraft): Promise<void> {
  if (supplied.pendingApproval || supplied.rows?.some(row => row.attempt && row.state !== 'saved'))
    throw new Error('Some receipts or approvals are unconfirmed. Check them before closing this review.');
  await accessReview(scope, async current => { assertCurrent(current, supplied, scope); });
  await request(scope, '/api/ai/stock-receipts', z.object({ closed: z.literal(true) }).strict(), {
    action: 'close_review', job: supplied.job, expected_revision: supplied.serverRevision ?? null,
  });
  await accessReview(scope, async (current, _write, remove) => { assertCurrent(current, supplied, scope); await remove(); });
}
