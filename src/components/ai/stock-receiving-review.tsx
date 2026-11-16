'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getDB } from '@/lib/offline/db';
import { loadStockReview, saveStockReview, initializeStockReviewRows, saveServerStockReview,
  previewStockSelection, approveStockSelection, submitStockReviewReceipt, recordStockExecution,
  type StockReviewDraft, type StockReviewRow, type StockReviewScope } from '@/lib/ai/stock-review-draft';
import { useAuthStore } from '@/store';
import { useCopy } from '@/i18n/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { ImportRow } from '@/lib/imports/preview';
import { STOCK_UNITS } from '@/lib/industries';

type Product = { id: string; name: string; sku: string; barcode: string | null; stock_unit: string; cost_price: number; organization_id: string; medical_stock_managed?: boolean | null };
type Warehouse = { id: string; name: string; is_main: boolean; organization_id: string };
type ReviewProps = { job: string; rows: ImportRow[]; onBusyChange?: (busy: boolean) => void };
type RowCorrections = Partial<Pick<StockReviewRow, 'productId' | 'warehouseId' | 'quantity' | 'unitCost' | 'zeroConfirmed' | 'mode' | 'newName' | 'newSku' | 'stockUnit' | 'sellingPrice'>>;

function correctedRows(rows: StockReviewRow[], corrections: Map<string, RowCorrections>) {
  return rows.map(row => row.state === 'draft' && corrections.has(row.receiptId)
    ? { ...row, ...corrections.get(row.receiptId), error: undefined, changes: undefined } : row);
}

async function loadAll<T>(table: 'products' | 'warehouses', columns: string, orgId: string): Promise<T[]> {
  const db = createClient();
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await db.from(table).select(columns).eq('organization_id', orgId).range(start, start + 499);
    if (error) throw error;
    rows.push(...(data as T[]));
    if (!data || data.length < 500) return rows;
  }
}
function validCost(value: string) { return /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 9999999999.99; }
function ready(row: StockReviewRow) {
  const target = row.mode === 'existing' ? !!row.productId : !!(row.newName.trim() && row.newSku.trim()
    && row.newName.trim().length <= 255 && row.newSku.trim().length <= 100
    && STOCK_UNITS.some(unit => unit === row.stockUnit) && validCost(row.sellingPrice));
  return row.state === 'draft' && target && !!row.warehouseId && /^\d+$/.test(row.quantity.trim())
    && Number(row.quantity) > 0 && Number(row.quantity) <= 2147483647 && validCost(row.unitCost)
    && (Number(row.unitCost) > 0 || row.zeroConfirmed);
}
function initialRows(sourceRows: ImportRow[], products: Product[], warehouses: Warehouse[], job: string): StockReviewRow[] {
  const main = warehouses.find(item => item.is_main)?.id || warehouses[0]?.id || '';
  return sourceRows.map((source, index) => {
    const name = String(source.name || '').trim(), sku = String(source.sku || '').trim(), barcode = String(source.barcode || '').trim();
    const candidates = products.filter(product => !!(barcode && product.barcode?.toLowerCase() === barcode.toLowerCase())
      || !!(sku && product.sku?.toLowerCase() === sku.toLowerCase()) || !!(name && product.name.toLowerCase() === name.toLowerCase()));
    return { receiptId: `${job}:${index}`, source: name || `Source row ${index + 1}`,
      mode: candidates.length === 0 ? 'new' : 'existing', newName: name, newSku: sku, stockUnit: 'piece',
      sellingPrice: String(source.selling_price ?? ''), productId: candidates.length === 1 ? candidates[0].id : '',
      warehouseId: main, quantity: String(source.opening_stock ?? ''), unitCost: String(source.cost_price ?? ''),
      zeroConfirmed: false, state: 'draft' };
  });
}
function money(minor: string) { const text = minor.padStart(3, '0'); return `₦${text.slice(0, -2)}.${text.slice(-2)}`; }
function display(value: unknown) { return typeof value === 'string' ? value : JSON.stringify(value) ?? '—'; }

export function StockReceivingReview({ job, onBusyChange }: ReviewProps) {
  const user = useAuthStore(state => state.user), copy = useCopy();
  if (!user?.organization_id || user.role !== 'business_owner' || user.status !== 'active')
    return <p role="alert">{copy('An active business owner must sign in to review these receipts.')}</p>;
  return <StockReceivingReviewForAccount key={`${user.organization_id}:${user.id}:${job}`}
    scope={{ ownerId: user.id, organizationId: user.organization_id }} job={job} onBusyChange={onBusyChange} />;
}

function StockReceivingReviewForAccount({ scope, job, onBusyChange }: { scope: StockReviewScope; job: string; onBusyChange?: (busy: boolean) => void }) {
  const copy = useCopy();
  const [products, setProducts] = useState<Product[]>([]), [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [draft, setDraft] = useState<StockReviewDraft | null>(null), current = useRef<StockReviewDraft | null>(null);
  const mounted = useRef(true), working = useRef(false);
  const corrections = useRef(new Map<string, RowCorrections>());
  const saving = useRef(false), flushRequested = useRef(false);
  const [savingCorrections, setSavingCorrections] = useState(false), [correctionError, setCorrectionError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]), [physicalReceived, setPhysicalReceived] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [catalogError, setCatalogError] = useState(''), [reviewing, setReviewing] = useState(false), [reload, setReload] = useState(0);
  const { ownerId, organizationId } = scope;
  const sameAccount = useCallback(() => {
    const active = useAuthStore.getState().user;
    return mounted.current && active?.id === ownerId && active.organization_id === organizationId
      && active.role === 'business_owner' && active.status === 'active';
  }, [ownerId, organizationId]);
  const accept = useCallback((saved: StockReviewDraft) => {
    if (!sameAccount()) throw new Error('The signed-in account changed. Reopen this review.');
    current.current = saved;
    setDraft(corrections.current.size && saved.rows
      ? { ...saved, rows: correctedRows(saved.rows, corrections.current), dirty: true, selection: undefined } : saved);
    return saved;
  }, [sameAccount]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onBusyChange?.(loading || busy || savingCorrections || correctionError); }, [loading, busy, savingCorrections, correctionError, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [productResult, warehouseResult, savedResult] = await Promise.allSettled([
          loadAll<Product>('products', 'id,name,sku,barcode,stock_unit,cost_price,organization_id,medical_stock_managed', organizationId),
          loadAll<Warehouse>('warehouses', 'id,name,is_main,organization_id', organizationId), loadStockReview({ ownerId, organizationId }),
        ]);
        if (cancelled || !sameAccount()) return;
        if (savedResult.status === 'rejected') throw savedResult.reason;
        let saved = savedResult.value;
        if (!saved || saved.job !== job) throw new Error('This saved stock review is no longer active. Reopen the assistant.');
        let availableProducts = productResult.status === 'fulfilled' ? productResult.value : [];
        let availableWarehouses = warehouseResult.status === 'fulfilled' ? warehouseResult.value : [];
        if (productResult.status === 'rejected' || warehouseResult.status === 'rejected') {
          try {
            const db = await getDB();
            const [cachedProducts, cachedWarehouses] = await Promise.all([db.getAll('products'), db.getAll('warehouses')]);
            if (cancelled || !sameAccount()) return;
            if (productResult.status === 'rejected') availableProducts = cachedProducts.filter(item => item.organization_id === organizationId);
            if (warehouseResult.status === 'rejected') availableWarehouses = cachedWarehouses.filter(item => item.organization_id === organizationId);
          } catch { /* Pending receipts remain recoverable without catalog access. */ }
          setCatalogError('Current catalog could not be loaded. Cached products may be shown; reconnect before preparing stock.');
        }
        availableProducts = availableProducts.filter(item => item.organization_id === organizationId && !item.medical_stock_managed);
        availableWarehouses = availableWarehouses.filter(item => item.organization_id === organizationId);
        setProducts(availableProducts); setWarehouses(availableWarehouses);
        if (!saved.rows) saved = await initializeStockReviewRows({ ownerId, organizationId }, saved,
          initialRows(saved.sourceRows, availableProducts, availableWarehouses, job));
        if (cancelled || !sameAccount()) return;
        accept(saved);
      } catch (cause) { if (!cancelled && sameAccount()) setError(cause instanceof Error ? cause.message : 'Could not open the saved stock review.'); }
      finally { if (!cancelled && sameAccount()) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [accept, job, ownerId, organizationId, reload, sameAccount]);
  const run = (action: () => Promise<void>) => {
    if (working.current || saving.current || corrections.current.size || !sameAccount()) return;
    working.current = true; setBusy(true); setError('');
    void action().catch(async cause => {
      if (!sameAccount()) return;
      setError(cause instanceof Error ? cause.message : 'This stock change has not been confirmed.');
      // Recover cached pending approval/operations after a lost response without dispatching them.
      try { const saved = await loadStockReview(scope); if (saved && sameAccount()) accept(saved); } catch { /* Retain the current review and original error. */ }
    }).finally(() => { working.current = false; if (sameAccount()) setBusy(false); });
  };
  const saveCorrections = (): void => {
    if (saving.current || working.current || !sameAccount()) return;
    saving.current = true; setSavingCorrections(true); setCorrectionError(false); setError('');
    let deviceFailed = false;
    // Device and account writes share one serial lane. Inputs remain editable;
    // newer field values are coalesced and applied after the in-flight revision.
    void (async () => {
      while (sameAccount()) {
        const active = current.current;
        if (!active?.rows || active.pendingApproval || active.conflict) return;
        if (corrections.current.size) {
          const batch = new Map(corrections.current); corrections.current.clear();
          try { accept(await saveStockReview(scope, active, correctedRows(active.rows, batch))); }
          catch (cause) {
            deviceFailed = true;
            // Keep every unsaved value. A later correction wins over the failed
            // batch for the same field, never the other way around.
            for (const [id, changes] of batch)
              corrections.current.set(id, { ...changes, ...corrections.current.get(id) });
            if (sameAccount()) {
              setCorrectionError(true);
              setError(cause instanceof Error ? cause.message : 'Corrections could not be saved on this device. Keep this screen open and retry.');
            }
            return;
          }
          continue;
        }
        if (!flushRequested.current) return;
        flushRequested.current = false;
        if (navigator.onLine && active.dirty && !active.rows.some(row => row.state !== 'draft' && row.state !== 'saved')) {
          try { accept(await saveServerStockReview(scope, active)); }
          catch (cause) {
            if (!sameAccount()) return;
            const message = cause instanceof Error ? cause.message : 'Corrections were not saved to your account.';
            accept({ ...active, syncError: message });
          }
        }
      }
    })().finally(() => {
      saving.current = false;
      if (!sameAccount()) return;
      setSavingCorrections(false);
      // A new event can arrive after the loop returns but before this microtask.
      const active = current.current;
      if (!deviceFailed && active?.rows && !active.pendingApproval && !active.conflict
        && (corrections.current.size || flushRequested.current)) saveCorrections();
    });
  };
  const flushCorrections = () => {
    if (working.current || !sameAccount()) return;
    flushRequested.current = true; saveCorrections();
  };
  const edit = (receiptId: string, changes: RowCorrections, discrete = false) => {
    const active = current.current;
    if (working.current || !sameAccount() || !active?.rows || active.pendingApproval || active.conflict
      || active.rows.find(row => row.receiptId === receiptId)?.state !== 'draft') return;
    corrections.current.set(receiptId, { ...corrections.current.get(receiptId), ...changes });
    setDraft(value => value?.rows ? { ...value, rows: correctedRows(value.rows, new Map([[receiptId, changes]])), dirty: true, selection: undefined } : value);
    setReviewing(false); setSelectedIds([]); setPhysicalReceived(false);
    if (discrete) flushRequested.current = true;
    saveCorrections();
  };
  const rows = draft?.rows || [];
  const canReceive = (row: StockReviewRow) => ready(row) && !catalogError && products.some(item => item.id === row.productId)
    && warehouses.some(item => item.id === row.warehouseId);
  // A new shop can have no products yet.
  const eligible = (row: StockReviewRow) => row.mode === 'new' ? ready(row) && !catalogError && warehouses.some(item => item.id === row.warehouseId) : canReceive(row);
  const selected = rows.filter(row => selectedIds.includes(row.receiptId) && eligible(row));
  const locked = loading || busy || !!draft?.pendingApproval || !!draft?.conflict;
  const actionsLocked = locked || savingCorrections || correctionError;
  const prepare = () => run(async () => {
    if (!physicalReceived || !current.current || selected.length === 0) return;
    const indices = selected.map(row => rows.indexOf(row));
    accept(await previewStockSelection(scope, current.current, indices)); setReviewing(true);
  });
  const execute = async (index: number) => {
    if (!sameAccount()) throw new Error('The signed-in account changed. Reopen this review.');
    const active = current.current, row = active?.rows?.[index];
    if (!active || !row?.attempt || row.state !== 'confirmation_pending') return;
    const result = await submitStockReviewReceipt(scope, row.attempt);
    if (!sameAccount()) throw new Error('The signed-in account changed. Reopen this review.');
    accept(await recordStockExecution(scope, current.current!, result));
  };
  const apply = () => run(async () => {
    if (!navigator.onLine) throw new Error('Reconnect before approving stock. No new stock has been submitted.');
    const active = current.current;
    if (!active?.selection || !reviewing) return;
    const indices = active.selection.groups.map(group => group.row_index);
    const approved = accept(await approveStockSelection(scope, active));
    setReviewing(false); setSelectedIds([]); setPhysicalReceived(false);
    if (approved.pendingApproval) return;
    for (const index of indices) {
      if (!sameAccount()) throw new Error('The signed-in account changed. Reopen this review.');
      try { await execute(index); }
      catch (cause) {
        if (!sameAccount()) throw cause;
        const latest = current.current;
        if (latest?.rows) accept(await saveStockReview(scope, latest, latest.rows.map((row, rowIndex) => rowIndex === index
          ? { ...row, error: 'Receipt confirmation pending. Check its original status before retrying.' } : row)));
      }
    }
  });
  const check = (index?: number, retry = false, discardLocalEdits = false) => run(async () => {
    const original = index === undefined ? undefined : current.current?.rows?.[index]?.attempt;
    const saved = await loadStockReview(scope, { discardLocalEdits });
    if (!saved) throw new Error('This review could not be reopened.');
    accept(saved); setReviewing(false); setSelectedIds([]); setPhysicalReceived(false);
    if (saved.syncError) throw new Error(saved.syncError);
    if (retry && index !== undefined) {
      const row = saved.rows?.[index];
      if (row?.state === 'saved' || row?.state === 'draft') return;
      if (!row?.attempt?.approval_id || row.attempt.operation_id !== original?.operation_id)
        throw new Error('Keep the original receipt. Its reviewed approval must be resolved before any retry.');
      await execute(index);
    }
  });
  if (loading) return <p role="status">{copy('Opening your saved stock review...')}</p>;
  return <section className="min-w-0 space-y-4" aria-label={copy('Review stock receiving')}>
    <div><h2 className="tt-section-title">{copy('Review stock before receiving')}</h2><p className="text-sm text-muted-foreground">{copy('Match every item, confirm goods physically received and check each buying cost. Nothing is received until you approve and the server confirms it.')}</p></div>
    <p role="status" className="text-xs text-muted-foreground">{copy(correctionError ? 'Some corrections are only on this screen. Retry saving before leaving.' : savingCorrections ? 'Saving your corrections...' : draft?.dirty ? 'Corrections saved on this device; not yet saved to your account.' : draft?.serverRevision ? 'Review saved to your account. Selection is not approval.' : 'Review saved on this device; not yet saved to your account.')}</p>
    {busy && <p role="status" className="text-sm text-muted-foreground">{copy('Working on your stock review...')}</p>}
    {draft?.source && <details className="rounded-lg border border-border p-3 text-sm"><summary>{copy('Original source evidence')}</summary>
      <p>{copy('Source type')}: {draft.source.kind}</p>{draft.source.evidence_available && draft.source.text !== null
        ? <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{draft.source.text}</pre>
        : <p>{copy('The original file or text is unavailable here. The extracted rows below still need checking against your delivery.')}</p>}
      {draft.source.kind === 'xlsx' && <p>{copy('This is the spreadsheet text captured for the review. The original workbook is not stored here.')}</p>}
      {draft.source.hash && <p className="mt-2 break-all text-xs">{copy('Source reference')}: {draft.source.hash}</p>}
    </details>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {correctionError && <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={saveCorrections}>{copy('Retry saving corrections')}</Button>
      <Button variant="outline" onClick={() => {
        if (saving.current || working.current || !sameAccount()) return;
        corrections.current.clear(); flushRequested.current = false; setCorrectionError(false);
        setLoading(true); setError(''); setCatalogError(''); setReload(value => value + 1);
      }}>{copy('Discard unsaved corrections and reload')}</Button>
    </div>}
    {draft?.syncError && <p role="alert" className="text-sm text-destructive">{draft.syncError}</p>}
    {catalogError && <p role="status" className="text-sm text-muted-foreground">{copy(catalogError)}</p>}
    {draft?.conflict && <div role="alert" className="space-y-2 rounded-lg border border-border p-3"><p>{copy('This account review changed on another device. Your unsaved device corrections are preserved below. They have not replaced the account review.')}</p><Button variant="outline" disabled={busy || savingCorrections || correctionError} onClick={() => check(undefined, false, true)}>{copy('Reload account review and discard these device edits')}</Button></div>}
    {draft?.pendingApproval && <div role="status" className="space-y-2"><p>{copy('Approval confirmation pending. No additional stock will be submitted until its original approval is found.')}</p><Button variant="outline" disabled={busy || savingCorrections || correctionError} onClick={() => check()}>{copy('Check approval status')}</Button></div>}
    {(error || catalogError || draft?.syncError) && <Button variant="outline" disabled={busy || savingCorrections || correctionError} onClick={() => {
      setLoading(true); setError(''); setCatalogError(''); setReviewing(false); setSelectedIds([]); setPhysicalReceived(false); setReload(value => value + 1);
    }}>{copy('Reload saved review')}</Button>}
    <p className="text-sm"><Link href="/inventory" className="text-primary underline">{copy('Open inventory for the manual workflow')}</Link></p>
    {rows.length === 0 && <p>{copy('No product rows were found. Close this review and correct the source.')}</p>}
    {rows.map((row, index) => {
      const product = products.find(item => item.id === row.productId);
      const stateLabel = row.state === 'saved' ? 'Stock saved' : row.state === 'queued' ? 'Queued for upload — not yet confirmed'
        : row.state === 'confirmation_pending' ? 'Receipt confirmation pending' : eligible(row) ? 'Ready to select' : 'Needs your decision';
      return <article key={row.receiptId} className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{copy('Extracted source row')} {index + 1}: {row.source}</p><p role="status" className="text-xs text-muted-foreground">{copy(stateLabel)}</p></div>{row.state !== 'draft' && <span className="text-sm font-medium text-primary">{copy(row.state === 'saved' ? 'Applied' : 'Pending confirmation')}</span>}</div>
        {row.state === 'draft' ? <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">{copy('Stock destination')}<NativeSelect disabled={locked} className="mt-1 w-full" value={row.mode === 'new' ? '__new__' : row.productId} onChange={event => edit(row.receiptId, event.target.value === '__new__' ? { mode: 'new', productId: '' } : { mode: 'existing', productId: event.target.value }, true)}><option value="">{copy('Choose product')}</option><option value="__new__">{copy('Create a new product')}</option>{products.map(item => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</NativeSelect></label>
            {row.mode === 'new' && <>
              <label className="text-sm">{copy('New product name')}<Input disabled={locked} maxLength={255} value={row.newName} onChange={event => edit(row.receiptId, { newName: event.target.value })} onBlur={flushCorrections} /></label>
              <label className="text-sm">{copy('New product SKU')}<Input disabled={locked} maxLength={100} value={row.newSku} onChange={event => edit(row.receiptId, { newSku: event.target.value })} onBlur={flushCorrections} /></label>
              <label className="text-sm">{copy('Stock unit')}<NativeSelect disabled={locked} value={row.stockUnit} onChange={event => edit(row.receiptId, { stockUnit: event.target.value }, true)}>{STOCK_UNITS.map(unit => <option key={unit} value={unit}>{copy(unit)}</option>)}</NativeSelect></label>
              <label className="text-sm">{copy('Selling price per unit')}<Input disabled={locked} type="number" min="0" step="0.01" value={row.sellingPrice} onChange={event => edit(row.receiptId, { sellingPrice: event.target.value })} onBlur={flushCorrections} /></label>
            </>}
            <label className="text-sm">{copy('Receiving warehouse')}<NativeSelect disabled={locked} className="mt-1 w-full" value={row.warehouseId} onChange={event => edit(row.receiptId, { warehouseId: event.target.value }, true)}><option value="">{copy('Choose warehouse')}</option>{warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label>
            <label className="text-sm">{copy('Quantity physically received')} {product ? `(${copy(product.stock_unit || 'piece')})` : ''}<Input disabled={locked} className="mt-1" type="number" min="1" max="2147483647" step="1" value={row.quantity} onChange={event => edit(row.receiptId, { quantity: event.target.value })} onBlur={flushCorrections} /></label>
            <label className="text-sm">{copy('Buying cost per unit')}<Input disabled={locked} className="mt-1" type="number" min="0" max="9999999999.99" step="0.01" value={row.unitCost} onChange={event => edit(row.receiptId, { unitCost: event.target.value, zeroConfirmed: false })} onBlur={flushCorrections} /></label>
          </div>
          {row.unitCost.trim() !== '' && Number(row.unitCost) === 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked} checked={row.zeroConfirmed} onChange={event => edit(row.receiptId, { zeroConfirmed: event.target.checked }, true)} />{copy('Confirm this stock really has zero buying cost')}</label>}
          {row.unitCost.trim() !== '' && !validCost(row.unitCost) && <p className="text-sm text-destructive">{copy('Enter a buying cost with no more than two decimal places, up to ₦9,999,999,999.99.')}</p>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedIds.includes(row.receiptId)} disabled={locked || correctionError || !eligible(row)} onChange={event => { if (working.current || !sameAccount()) return; setSelectedIds(ids => event.target.checked ? [...ids, row.receiptId] : ids.filter(id => id !== row.receiptId)); setReviewing(false); setPhysicalReceived(false); }} />{copy('Include this row')}</label>
        </> : <div className="space-y-2 text-sm">
          <p>{row.mode === 'new' ? row.newName : product?.name || row.productId}: +{row.quantity} {copy(row.mode === 'new' ? row.stockUnit : product?.stock_unit || 'units')} at ₦{Number(row.unitCost).toLocaleString('en-NG')} → {warehouses.find(item => item.id === row.warehouseId)?.name || row.warehouseId}</p>
          {row.mode === 'new' && <p>{copy('Create SKU')} {row.newSku} · {copy('Selling price per unit')}: ₦{Number(row.sellingPrice).toLocaleString('en-NG')}</p>}
          {row.state === 'saved' && <Link className="text-primary underline" href={`/products/${row.savedProductId || row.productId}/edit`}>{copy('View product')}</Link>}
          <p className="break-all text-xs text-muted-foreground">{copy('Receiving warehouse')}: {row.warehouseId} · {copy('Receipt reference')}: {row.attempt?.receipt_id || row.receiptId}</p>
          {row.attempt?.operation_id && <p className="break-all text-xs text-muted-foreground">{copy('Operation reference')}: {row.attempt.operation_id}</p>}
          {row.state !== 'saved' && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || savingCorrections || correctionError} onClick={() => check(index)}>{copy('Check receipt status')}</Button>
            {row.state === 'confirmation_pending' && row.attempt?.approval_id && <Button variant="outline" disabled={busy || savingCorrections || correctionError} onClick={() => check(index, true)}>{copy('Retry same receipt')}</Button>}</div>}
          {row.state !== 'saved' && !row.attempt?.approval_id && <p>{copy('This older receipt can only be checked here. Resolve its original result before preparing another receipt.')}</p>}
        </div>}
        {row.error && <p role="alert" className="text-sm text-destructive">{row.error}</p>}
        {row.changes?.map(change => <p key={change.field} className="break-words text-sm">{change.field}: {copy('Reviewed')} {display(change.reviewed)} → {copy('Current')} {display(change.current)}. {copy('Check the proposed row above and review again.')}</p>)}
      </article>;
    })}
    {rows.some(row => row.state === 'draft') && <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm">{selected.length} {copy('selected')} · {rows.filter(row => row.state === 'draft' && !eligible(row)).length} {copy('need decisions')}</p>
      {!reviewing || !draft?.selection ? <>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={locked || correctionError} checked={physicalReceived} onChange={event => setPhysicalReceived(event.target.checked)} />{copy('I checked that the selected quantities were physically received at these warehouses. An invoice alone does not confirm delivery.')}</label>
        <Button disabled={actionsLocked || selected.length === 0 || !physicalReceived} onClick={prepare}>{copy('Review exact stock changes')}</Button>
      </> : <>
        <h3 className="font-semibold">{copy('These exact changes will be applied')}</h3>
        <ul className="space-y-3 text-sm">{draft.selection.groups.map(group => <li key={group.operation_id} className="rounded-lg border border-border p-3">
          <p>{group.product_name}: +{group.quantity} {copy(group.stock_unit)} at {money(group.unit_cost_minor)} {copy('each')} → {group.warehouse_name}.</p>
          <p>{copy('Stock at this warehouse')}: {group.stock_before} → {group.stock_after}. {copy('Average buying cost across all warehouses')}: {money(group.cost_before_minor)} → {money(group.cost_after_minor)}.</p>
          {group.cost_kind === 'free' && <p>{copy('Buying cost explicitly confirmed as zero.')}</p>}
          <p>{group.mode === 'new' ? `${copy('Create product and receive stock together')}. ${copy('Selling price per unit')}: ${money(group.selling_price_minor || '0')}.` : copy('Existing product; selling price unchanged.')}</p>
        </li>)}</ul>
        <p className="text-xs text-muted-foreground">{copy('Approval applies only to this selection. Changed business records may require another review.')}</p>
        <div className="flex flex-wrap gap-2"><Button disabled={actionsLocked} onClick={apply}>{copy(`Approve and apply ${draft.selection.groups.length} stock receipt${draft.selection.groups.length === 1 ? '' : 's'}`)}</Button><Button variant="outline" disabled={actionsLocked} onClick={() => setReviewing(false)}>{copy('Edit draft')}</Button></div>
      </>}
    </div>}
  </section>;
}
