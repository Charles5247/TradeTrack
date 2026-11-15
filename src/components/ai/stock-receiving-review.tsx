'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getDB } from '@/lib/offline/db';
import { loadStockReview, saveStockReview, lookupStockReviewReceipt, submitStockReviewReceipt, readStockReviewProposal, sameStockReviewSource, confirmedStockReviewReceipt,
  type StockReviewDraft, type StockReviewRow, type StockReviewScope, type StockReviewAttempt, type SavedStockReviewReceipt } from '@/lib/ai/stock-review-draft';
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

function validCost(value: string) {
  return /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 9999999999.99;
}

function ready(row: StockReviewRow) {
  const targetReady = row.mode === 'existing' ? Boolean(row.productId) : Boolean(row.newName.trim() && row.newSku.trim()
    && row.newName.trim().length <= 255 && row.newSku.trim().length <= 100
    && STOCK_UNITS.some(unit => unit === row.stockUnit) && validCost(row.sellingPrice));
  return row.state === 'draft' && targetReady && Boolean(row.warehouseId)
    && /^\d+$/.test(row.quantity.trim()) && Number(row.quantity) > 0 && Number(row.quantity) <= 2147483647
    && validCost(row.unitCost) && (Number(row.unitCost) > 0 || row.zeroConfirmed);
}

function attemptFor(row: StockReviewRow, index: number, job: string, organizationId: string): StockReviewAttempt {
  return { receipt_id: row.receiptId, organization_id: organizationId,
    product_id: row.productId, warehouse_id: row.warehouseId, quantity: Number(row.quantity), unit_cost: Number(row.unitCost),
    job, row_index: index, mode: row.mode, name: row.newName, sku: row.newSku, stock_unit: row.stockUnit,
    selling_price: row.mode === 'new' ? Number(row.sellingPrice) : 0, confirm: true };
}

function initialRows(sourceRows: ImportRow[], products: Product[], warehouses: Warehouse[], receipts: SavedStockReviewReceipt[], job: string, org: string): StockReviewRow[] {
  const main = warehouses.find(location => location.is_main)?.id || warehouses[0]?.id || '';
  return sourceRows.map((source, index) => {
    const name = String(source.name || '').trim();
    const sku = String(source.sku || '').trim();
    const barcode = String(source.barcode || '').trim();
    const candidates = products.filter(product => Boolean(barcode && product.barcode?.toLowerCase() === barcode.toLowerCase())
      || Boolean(sku && product.sku?.toLowerCase() === sku.toLowerCase())
      || Boolean(name && product.name.toLowerCase() === name.toLowerCase()));
    const saved = receipts.find(receipt => receipt.row_index === index);
    const row: StockReviewRow = { receiptId: `${job}:${index}`, source: name || `Source row ${index + 1}`,
      mode: saved ? (saved.created_product ? 'new' : 'existing') : candidates.length === 0 ? 'new' : 'existing',
      newName: saved?.approved_product?.name || name, newSku: saved?.approved_product?.sku || sku,
      stockUnit: saved?.approved_product?.stock_unit || 'piece',
      sellingPrice: String(saved?.approved_product?.selling_price ?? source.selling_price ?? ''),
      productId: saved?.product_id || (candidates.length === 1 ? candidates[0].id : ''), warehouseId: saved?.warehouse_id || main,
      quantity: String(saved?.quantity ?? source.opening_stock ?? ''), unitCost: String(saved?.unit_cost ?? source.cost_price ?? ''),
      zeroConfirmed: !!saved && Number(saved.unit_cost) === 0, state: saved ? 'saved' : 'draft', savedProductId: saved?.product_id };
    if (saved) row.attempt = attemptFor(row, index, job, org);
    return row;
  });
}

export function StockReceivingReview({ job, onBusyChange }: ReviewProps) {
  const user = useAuthStore(state => state.user);
  const copy = useCopy();
  if (!user?.organization_id || user.role !== 'business_owner' || user.status !== 'active') {
    return <p role="alert">{copy('An active business owner must sign in to review these receipts.')}</p>;
  }
  return <StockReceivingReviewForAccount key={`${user.organization_id}:${user.id}:${job}`}
    scope={{ ownerId: user.id, organizationId: user.organization_id }} job={job} onBusyChange={onBusyChange} />;
}

function StockReceivingReviewForAccount({ scope, job, onBusyChange }: { scope: StockReviewScope; job: string; onBusyChange?: (busy: boolean) => void }) {
  const copy = useCopy();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [draft, setDraft] = useState<StockReviewDraft | null>(null);
  const current = useRef<StockReviewDraft | null>(null);
  const mounted = useRef(true);
  const working = useRef(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [serverNotice, setServerNotice] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reload, setReload] = useState(0);
  const { ownerId, organizationId } = scope;

  const sameAccount = useCallback(() => {
    const active = useAuthStore.getState().user;
    return mounted.current && active?.id === ownerId && active.organization_id === organizationId
      && active.role === 'business_owner' && active.status === 'active';
  }, [ownerId, organizationId]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onBusyChange?.(loading || busy); }, [loading, busy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);

  const update = useCallback(async (rows: StockReviewRow[]) => {
    if (!current.current || !sameAccount()) throw new Error('The signed-in account changed. Reopen this review.');
    const saved = await saveStockReview({ ownerId, organizationId }, current.current, rows);
    if (!sameAccount()) throw new Error('The signed-in account changed. Reopen this review.');
    current.current = saved; setDraft(saved);
    return saved;
  }, [ownerId, organizationId, sameAccount]);

  useEffect(() => {
    let disposed = false;
    const active = () => !disposed && sameAccount();
    void (async () => {
      const saved = await loadStockReview({ ownerId, organizationId });
      if (!active()) return;
      if (!saved || saved.job !== job) throw new Error('This saved stock review is unavailable. Reopen it from the assistant.');
      current.current = saved; setDraft(saved);
      const loaded = await Promise.allSettled([
        loadAll<Product>('products', 'id,name,sku,barcode,stock_unit,cost_price,organization_id,medical_stock_managed', organizationId),
        loadAll<Warehouse>('warehouses', 'id,name,is_main,organization_id', organizationId),
        readStockReviewProposal({ ownerId, organizationId }, job),
      ]);
      if (!active()) return;
      let catalog = loaded[0].status === 'fulfilled' ? loaded[0].value : [];
      let locations = loaded[1].status === 'fulfilled' ? loaded[1].value : [];
      if (loaded.slice(0, 2).some(result => result.status === 'rejected')) {
        setCatalogError('Could not refresh the catalog. Saved receipts remain available; reconnect before relying on product or location details.');
        try {
          const db = await getDB();
          if (!active()) return;
          const [cachedProducts, cachedWarehouses] = await Promise.all([db.getAll('products'), db.getAll('warehouses')]);
          if (!active()) return;
          if (loaded[0].status === 'rejected') catalog = cachedProducts.filter((product: Product) => product.organization_id === organizationId);
          if (loaded[1].status === 'rejected') locations = cachedWarehouses.filter((warehouse: Warehouse) => warehouse.organization_id === organizationId);
        } catch { /* Keep saved receipts visible even if the catalog cache cannot be read. */ }
      }
      if (!active()) return;
      catalog = catalog.filter(product => product.organization_id === organizationId && !product.medical_stock_managed);
      locations = locations.filter(warehouse => warehouse.organization_id === organizationId);
      setProducts(catalog); setWarehouses(locations);
      if (saved.rows === null) {
        if (loaded[2].status === 'rejected') throw new Error('Could not confirm the stock proposal. Reconnect and reload the saved review.');
        if (!sameStockReviewSource(loaded[2].value.rows, saved.sourceRows)) throw new Error('The source proposal changed. Keep this review and check the original job before applying.');
        if (loaded.slice(0, 2).some(result => result.status === 'rejected') && (!catalog.length || !locations.length)) return;
        try { await update(initialRows(saved.sourceRows, catalog, locations, loaded[2].value.receipts, job, organizationId)); }
        catch (cause) {
          const latest = await loadStockReview({ ownerId, organizationId });
          if (!active()) return;
          if (!latest || latest.job !== job || latest.rows === null) throw cause;
          current.current = latest; setDraft(latest);
        }
      } else if (loaded[2].status === 'fulfilled') {
        if (!sameStockReviewSource(loaded[2].value.rows, saved.sourceRows)) throw new Error('The source proposal changed. Keep this review and check its original job.');
        const receipts = loaded[2].value.receipts;
        const authoritative = initialRows(saved.sourceRows, catalog, locations, receipts, job, organizationId);
        let changed = false;
        const reconciled = saved.rows.map((row, index) => {
          const receipt = receipts.find(item => item.row_index === index);
          if (!receipt) return row;
          if (row.state === 'saved') {
            if (row.savedProductId) return row;
            changed = true;
            return { ...row, savedProductId: receipt.product_id };
          }
          if (!row.attempt) {
            changed = true;
            const restored = { ...authoritative[index], receiptId: row.receiptId };
            return { ...restored, attempt: attemptFor(restored, index, job, organizationId) };
          }
          try {
            if (confirmedStockReviewReceipt(row.attempt, [receipt])) {
              changed = true;
              return { ...row, state: 'saved' as const, error: undefined, savedProductId: receipt.product_id };
            }
          } catch (cause) {
            changed = true;
            return { ...row, error: cause instanceof Error ? cause.message : 'Saved receipt differs. Keep the original attempt for review.' };
          }
          return row;
        });
        if (changed) {
          await update(reconciled);
          if (active()) setServerNotice('The server has results for this review. Matching results are marked saved; rows with different effects need attention. Unapplied local edits to completed rows were not submitted.');
        }
      }
    })().catch(cause => { if (active()) setError(cause instanceof Error ? cause.message : 'Could not restore this stock review.'); })
      .finally(() => { if (active()) setLoading(false); });
    return () => { disposed = true; };
    // Read durable source rows: a newly allocated rows prop must not replace receipt IDs.
  }, [job, ownerId, organizationId, reload, sameAccount, update]);

  const run = async (action: () => Promise<void>) => {
    if (working.current || loading || !sameAccount()) return;
    working.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (cause) { if (sameAccount()) setError(cause instanceof Error ? cause.message : 'This receipt is not confirmed. Keep this review and check its status.'); }
    finally { working.current = false; if (sameAccount()) setBusy(false); }
  };
  const edit = (id: string, patch: Partial<Pick<StockReviewRow, 'productId' | 'warehouseId' | 'quantity' | 'unitCost' | 'zeroConfirmed' | 'mode' | 'newName' | 'newSku' | 'stockUnit' | 'sellingPrice'>>) => {
    if (working.current || loading) return;
    setReviewing(false); setSelectedIds(ids => ids.filter(value => value !== id));
    void run(async () => { await update((current.current?.rows ?? []).map(row => row.receiptId === id && row.state === 'draft'
      ? { ...row, ...patch, error: undefined } : row)); });
  };
  const setOutcome = async (receiptId: string, state: StockReviewRow['state'], error?: string, savedProductId?: string) => {
    await update((current.current?.rows ?? []).map(row => row.receiptId === receiptId ? { ...row, state, error, savedProductId: savedProductId || row.savedProductId } : row));
  };
  const dispatch = async (attempt: StockReviewAttempt) => {
    if (!sameAccount()) return;
    let result;
    try { result = await submitStockReviewReceipt({ ownerId, organizationId }, attempt); }
    catch (cause) {
      if (!sameAccount()) return;
      await setOutcome(attempt.receipt_id!, 'confirmation_pending', cause instanceof Error ? cause.message : 'No receipt confirmation received.');
      return;
    }
    if (!sameAccount()) return;
    await setOutcome(attempt.receipt_id!, 'saved', undefined, result.productId);
  };
  const drafts = draft?.rows ?? [];
  const canReceive = (row: StockReviewRow) => ready(row)
    && (row.mode === 'new' ? !catalogError : products.some(product => product.id === row.productId))
    && warehouses.some(warehouse => warehouse.id === row.warehouseId);
  const selected = drafts.filter(row => selectedIds.includes(row.receiptId) && canReceive(row));
  const locked = loading || busy;
  const apply = () => void run(async () => {
    if (!navigator.onLine) {
      setError(copy('Reconnect before applying stock. Nothing was submitted; your review remains saved on this device.'));
      return;
    }
    const approved = selected.filter(canReceive).map(row => ({ ...row }));
    setReviewing(false); setSelectedIds([]);
    for (const row of approved) {
      if (!sameAccount()) break;
      const attempt = attemptFor(row, (current.current?.rows ?? []).findIndex(item => item.receiptId === row.receiptId), job, organizationId);
      await update((current.current?.rows ?? []).map(item => item.receiptId === row.receiptId
        ? { ...item, state: 'confirmation_pending', attempt, error: undefined } : item));
      if (!sameAccount()) break;
      await dispatch(attempt);
    }
  });
  const reconcile = (receiptId: string, retry: boolean) => void run(async () => {
    const row = current.current?.rows?.find(item => item.receiptId === receiptId);
    if (!row?.attempt || row.state === 'saved' || (retry && row.state !== 'confirmation_pending')) return;
    const outcome = await lookupStockReviewReceipt({ ownerId, organizationId }, row.attempt);
    if (!sameAccount()) return;
    if (outcome === 'saved') { await setOutcome(receiptId, 'saved'); return; }
    if (retry && navigator.onLine) {
      await setOutcome(receiptId, 'confirmation_pending');
      if (sameAccount()) await dispatch(row.attempt);
    } else await setOutcome(receiptId, row.state,
      retry ? 'Reconnect before retrying this same receipt.' : 'Not confirmed yet. Keep this receipt reference; absence of confirmation does not mean stock was not saved.');
  });

  if (loading && !draft) return <p role="status">{copy('Restoring your saved stock review...')}</p>;
  return <section className="space-y-4" aria-label={copy('Review stock receiving draft')}>
    <div><h2 className="tt-section-title">{copy('Review stock receiving draft')}</h2>
      <p className="text-sm text-muted-foreground">{copy('The assistant only suggested these rows. Check the product, quantity, buying cost, selling price for new products, and location before applying.')}</p>
      {draft && <p className="text-xs text-muted-foreground">{copy('This review is saved on this device. Selected rows still need your review and Apply.')}</p>}</div>
    {loading && <p role="status">{copy('Restoring saved receipt results and refreshing the catalog...')}</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {catalogError && <p role="status" className="text-sm text-muted-foreground">{copy(catalogError)}</p>}
    {serverNotice && <p role="status" className="text-sm text-muted-foreground">{copy(serverNotice)}</p>}
    {(error || catalogError) && <Button variant="outline" disabled={locked} onClick={() => {
      setLoading(true); setError(''); setCatalogError(''); setReviewing(false); setSelectedIds([]);
      setServerNotice('');
      setReload(value => value + 1);
    }}>{copy('Reload saved review')}</Button>}
    {!loading && !catalogError && warehouses.length === 0 && <p role="alert">{copy('Create a warehouse before receiving stock.')} <Link className="underline" href="/warehouses">{copy('Open warehouses')}</Link></p>}
    {draft?.rows?.length === 0 && <p>{copy('No product rows were found. Close this review and correct the source.')}</p>}
    {drafts.map((row, index) => {
      const product = products.find(item => item.id === row.productId);
      const stateLabel = row.state === 'saved' ? 'Stock saved' : row.state === 'queued' ? 'Queued for upload — not yet confirmed'
        : row.state === 'confirmation_pending' ? 'Receipt confirmation pending' : canReceive(row) ? 'Ready to select' : 'Needs your decision';
      return <article key={row.receiptId} className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{copy('Source row')} {index + 1}: {row.source}</p><p role="status" className="text-xs text-muted-foreground">{copy(stateLabel)}</p></div>{row.state !== 'draft' && <span className="text-sm font-medium text-primary">{copy(row.state === 'saved' ? 'Applied' : 'Pending confirmation')}</span>}</div>
        {row.state === 'draft' ? <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">{copy('Stock destination')}<NativeSelect disabled={locked} className="mt-1 w-full" value={row.mode === 'new' ? '__new__' : row.productId} onChange={event => edit(row.receiptId, event.target.value === '__new__' ? { mode: 'new', productId: '' } : { mode: 'existing', productId: event.target.value })}><option value="">{copy('Choose product')}</option><option value="__new__">{copy('Create a new product')}</option>{products.map(item => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</NativeSelect></label>
            {row.mode === 'new' && <>
              <label className="text-sm">{copy('New product name')}<Input disabled={locked} maxLength={255} value={row.newName} onChange={event => edit(row.receiptId, { newName: event.target.value })} /></label>
              <label className="text-sm">{copy('New product SKU')}<Input disabled={locked} maxLength={100} value={row.newSku} onChange={event => edit(row.receiptId, { newSku: event.target.value })} /></label>
              <label className="text-sm">{copy('Stock unit')}<NativeSelect disabled={locked} value={row.stockUnit} onChange={event => edit(row.receiptId, { stockUnit: event.target.value })}>{STOCK_UNITS.map(unit => <option key={unit} value={unit}>{copy(unit)}</option>)}</NativeSelect></label>
              <label className="text-sm">{copy('Selling price per unit')}<Input disabled={locked} type="number" min="0" step="0.01" value={row.sellingPrice} onChange={event => edit(row.receiptId, { sellingPrice: event.target.value })} /></label>
            </>}
            <label className="text-sm">{copy('Receiving warehouse')}<NativeSelect disabled={locked} className="mt-1 w-full" value={row.warehouseId} onChange={event => edit(row.receiptId, { warehouseId: event.target.value })}><option value="">{copy('Choose warehouse')}</option>{warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label>
            <label className="text-sm">{copy('Quantity')} {product ? `(${copy(product.stock_unit || 'piece')})` : ''}<Input disabled={locked} className="mt-1" type="number" min="1" max="2147483647" step="1" value={row.quantity} onChange={event => edit(row.receiptId, { quantity: event.target.value })} /></label>
            <label className="text-sm">{copy('Buying cost per unit')}<Input disabled={locked} className="mt-1" type="number" min="0" max="9999999999.99" step="0.01" value={row.unitCost} onChange={event => edit(row.receiptId, { unitCost: event.target.value, zeroConfirmed: false })} /></label>
          </div>
          {row.unitCost.trim() !== '' && Number(row.unitCost) === 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked} checked={row.zeroConfirmed} onChange={event => edit(row.receiptId, { zeroConfirmed: event.target.checked })} />{copy('Confirm this stock really has zero buying cost')}</label>}
          {row.unitCost.trim() !== '' && !validCost(row.unitCost) && <p className="text-sm text-destructive">{copy('Enter a buying cost with no more than two decimal places, up to ₦9,999,999,999.99.')}</p>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedIds.includes(row.receiptId)} disabled={locked || !canReceive(row)} onChange={event => { if (working.current) return; setSelectedIds(ids => event.target.checked ? [...ids, row.receiptId] : ids.filter(id => id !== row.receiptId)); setReviewing(false); }} />{copy('Include this row')}</label>
        </> : <div className="space-y-2 text-sm">
          <p>{row.mode === 'new' ? row.newName : product?.name || row.productId}: +{row.quantity} {copy(row.mode === 'new' ? row.stockUnit : product?.stock_unit || 'units')} at ₦{Number(row.unitCost).toLocaleString('en-NG')} → {warehouses.find(item => item.id === row.warehouseId)?.name || row.warehouseId}</p>
          {row.mode === 'new' && <p>{copy('Create SKU')} {row.newSku} · {copy('Selling price per unit')}: ₦{Number(row.sellingPrice).toLocaleString('en-NG')}</p>}
          {row.state === 'saved' && <Link className="text-sm text-primary underline" href={row.savedProductId || row.productId ? `/products/${row.savedProductId || row.productId}/edit` : '/products'}>{copy(row.savedProductId || row.productId ? 'View product' : 'View products')}</Link>}
          <p className="break-all text-xs text-muted-foreground">{copy('Catalog product')}: {row.productId} · {copy('Receiving warehouse')}: {row.warehouseId}</p>
          <p className="break-all text-xs text-muted-foreground">{copy('Receipt reference')}: {row.receiptId}</p>
          {row.state !== 'saved' && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={locked} onClick={() => reconcile(row.receiptId, false)}>{copy('Check receipt status')}</Button>
            {row.state === 'confirmation_pending' && <Button variant="outline" disabled={locked} onClick={() => reconcile(row.receiptId, true)}>{copy('Retry same receipt')}</Button>}</div>}
        </div>}
        {row.error && <p role="alert" className="text-sm text-destructive">{row.error}</p>}
      </article>;
    })}
    {drafts.some(row => row.state === 'draft') && <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm">{selected.length} {copy('selected')} · {drafts.filter(row => row.state === 'draft' && !canReceive(row)).length} {copy('need decisions')}</p>
      {!reviewing ? <Button disabled={locked || selected.length === 0} onClick={() => setReviewing(true)}>{copy('Review exact stock changes')}</Button> : <>
        <h3 className="font-semibold">{copy('These changes will be applied')}</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">{selected.map(row => <li key={row.receiptId}>{row.mode === 'new' ? row.newName : products.find(item => item.id === row.productId)?.name}: +{row.quantity} {copy(row.mode === 'new' ? row.stockUnit : products.find(item => item.id === row.productId)?.stock_unit || 'piece')} at ₦{Number(row.unitCost).toLocaleString('en-NG')} each → {warehouses.find(item => item.id === row.warehouseId)?.name}. {row.mode === 'new' ? `Create SKU ${row.newSku} at ₦${Number(row.sellingPrice).toLocaleString('en-NG')} selling price.` : copy('Selling price unchanged.')}</li>)}</ul>
        <p className="text-xs text-muted-foreground">{copy('Check every new product and price. Similar catalog items must be matched instead of duplicated.')}</p>
        <div className="flex flex-wrap gap-2"><Button disabled={locked || selected.length === 0} onClick={apply}>{copy(locked ? 'Applying...' : `Apply ${selected.length} stock receipt${selected.length === 1 ? '' : 's'}`)}</Button><Button variant="outline" disabled={locked} onClick={() => setReviewing(false)}>{copy('Edit draft')}</Button></div>
      </>}
    </div>}
  </section>;
}
