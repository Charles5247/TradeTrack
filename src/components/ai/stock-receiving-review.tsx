'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { useCopy } from '@/i18n/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { ImportRow } from '@/lib/imports/preview';

type Product = { id: string; name: string; sku: string; barcode: string | null; stock_unit: string; cost_price: number; organization_id: string; medical_stock_managed?: boolean | null };
type Warehouse = { id: string; name: string; is_main: boolean; organization_id: string };
type Draft = {
  rowIndex: number; source: string; productId: string; warehouseId: string;
  quantity: string; unitCost: string; zeroConfirmed: boolean; selected: boolean;
  result?: 'saved'; error?: string;
};
type SavedReceipt = { row_index: number; product_id: string; warehouse_id: string; quantity: number; unit_cost: number };

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

function ready(row: Draft) {
  const quantity = Number(row.quantity);
  const cost = Number(row.unitCost);
  return Boolean(row.productId && row.warehouseId && row.quantity.trim() && row.unitCost.trim()
    && Number.isSafeInteger(quantity) && quantity > 0 && Number.isFinite(cost) && cost >= 0
    && (cost > 0 || row.zeroConfirmed) && !row.result);
}

export function StockReceivingReview({ job, rows }: { job: string; rows: ImportRow[] }) {
  const copy = useCopy();
  const user = useAuthStore(state => state.user);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!user?.organization_id) return;
    let disposed = false;
    const orgId = user.organization_id;
    void Promise.all([
      loadAll<Product>('products', 'id,name,sku,barcode,stock_unit,cost_price,organization_id,medical_stock_managed', orgId),
      loadAll<Warehouse>('warehouses', 'id,name,is_main,organization_id', orgId),
      fetch(`/api/ai/stock-receipts?job=${encodeURIComponent(job)}`).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load stock proposal.');
        return data as { rows: ImportRow[]; receipts: SavedReceipt[] };
      }),
    ]).then(([allProducts, locations, proposal]) => {
      if (disposed) return;
      if (!Array.isArray(proposal.rows) || proposal.rows.length !== rows.length) throw new Error('Stock proposal changed. Generate it again.');
      const catalog = allProducts.filter(product => !product.medical_stock_managed);
      setProducts(catalog);
      setWarehouses(locations);
      const main = locations.find(location => location.is_main)?.id || locations[0]?.id || '';
      setDrafts(rows.map((row, index) => {
        const name = String(row.name || '').trim();
        const sku = String(row.sku || '').trim();
        const barcode = String(row.barcode || '').trim();
        const candidates = catalog.filter(product =>
          Boolean(barcode && product.barcode?.toLowerCase() === barcode.toLowerCase())
          || Boolean(sku && product.sku?.toLowerCase() === sku.toLowerCase())
          || Boolean(name && product.name.toLowerCase() === name.toLowerCase()));
        const saved = proposal.receipts.find(receipt => receipt.row_index === index);
        return { rowIndex: index, source: name || `Source row ${index + 1}`,
          productId: saved?.product_id || (candidates.length === 1 ? candidates[0].id : ''),
          warehouseId: saved?.warehouse_id || main,
          quantity: String(saved?.quantity ?? row.opening_stock ?? ''),
          unitCost: String(saved?.unit_cost ?? row.cost_price ?? ''),
          zeroConfirmed: false, selected: false, result: saved ? 'saved' as const : undefined };
      }));
    }).catch(cause => { if (!disposed) setError(cause instanceof Error ? cause.message : 'Could not load your catalog.'); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [job, rows, user?.organization_id]);

  const edit = (id: string, patch: Partial<Draft>) => {
    setDrafts(current => current.map(row => String(row.rowIndex) === id ? { ...row, ...patch, selected: false, error: undefined } : row));
    setReviewing(false);
  };
  const selected = drafts.filter(row => row.selected && ready(row));
  const pending = drafts.filter(row => !row.result);
  const unresolved = pending.filter(row => !ready(row));
  const apply = async () => {
    if (!user?.organization_id || user.role !== 'business_owner' || selected.length === 0) return;
    setApplying(true); setError('');
    try {
      for (const row of selected) {
        try {
          const response = await fetch('/api/ai/stock-receipts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job, row_index: row.rowIndex, product_id: row.productId,
              warehouse_id: row.warehouseId, quantity: Number(row.quantity),
              unit_cost: Number(row.unitCost), confirm: true }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Receipt was not confirmed');
          setDrafts(current => current.map(item => item.rowIndex === row.rowIndex
            ? { ...item, selected: false, result: 'saved', error: undefined } : item));
        } catch (cause) {
          setDrafts(current => current.map(item => item.rowIndex === row.rowIndex
            ? { ...item, selected: false, error: cause instanceof Error ? cause.message : 'Receipt was not confirmed' } : item));
        }
      }
      setReviewing(false);
    } finally { setApplying(false); }
  };

  if (loading) return <p role="status">{copy('Loading your products and warehouses...')}</p>;
  if (error) return <p role="alert" className="text-destructive">{error}</p>;
  return <section className="space-y-4" aria-label={copy('Review stock receiving draft')}>
    <div><h2 className="tt-section-title">{copy('Review stock receiving draft')}</h2>
      <p className="text-sm text-muted-foreground">{copy('The assistant only suggested these rows. Check the product, quantity, buying cost and location. Existing selling prices stay unchanged.')}</p></div>
    {warehouses.length === 0 && <p role="alert">{copy('Create a warehouse before receiving stock.')} <Link className="underline" href="/warehouses">{copy('Open warehouses')}</Link></p>}
    {drafts.length === 0 && <p>{copy('No product rows were found. Edit the source and try again.')}</p>}
    {drafts.map((row, index) => {
      const product = products.find(item => item.id === row.productId);
      return <article key={row.rowIndex} className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{copy('Source row')} {index + 1}: {row.source}</p><p className="text-xs text-muted-foreground">{row.result ? copy('Stock saved') : ready(row) ? copy('Ready to select') : copy('Needs your decision')}</p></div>{row.result && <span className="text-sm font-medium text-primary">{copy('Applied')}</span>}</div>
        {!row.result && <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">{copy('Catalog product')}<NativeSelect className="mt-1 w-full" value={row.productId} onChange={event => edit(String(row.rowIndex), { productId: event.target.value })}><option value="">{copy('Choose product')}</option>{products.map(item => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</NativeSelect></label>
          <label className="text-sm">{copy('Receiving warehouse')}<NativeSelect className="mt-1 w-full" value={row.warehouseId} onChange={event => edit(String(row.rowIndex), { warehouseId: event.target.value })}><option value="">{copy('Choose warehouse')}</option>{warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label>
          <label className="text-sm">{copy('Quantity')} {product ? `(${copy(product.stock_unit || 'piece')})` : ''}<Input className="mt-1" type="number" min="1" step="1" value={row.quantity} onChange={event => edit(String(row.rowIndex), { quantity: event.target.value })} /></label>
          <label className="text-sm">{copy('Buying cost per unit')}<Input className="mt-1" type="number" min="0" step="0.01" value={row.unitCost} onChange={event => edit(String(row.rowIndex), { unitCost: event.target.value, zeroConfirmed: false })} /></label>
        </div>}
        {!row.result && row.unitCost.trim() === '0' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={row.zeroConfirmed} onChange={event => edit(String(row.rowIndex), { zeroConfirmed: event.target.checked })} />{copy('Confirm this stock really has zero buying cost')}</label>}
        {!row.result && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={row.selected} disabled={!ready(row)} onChange={event => { setDrafts(current => current.map(item => item.rowIndex === row.rowIndex ? { ...item, selected: event.target.checked } : item)); setReviewing(false); }} />{copy('Include this row')}</label>}
        {row.error && <p role="alert" className="text-sm text-destructive">{row.error}</p>}
      </article>;
    })}
    {pending.length > 0 && <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm">{selected.length} {copy('selected')} · {unresolved.length} {copy('need decisions')}</p>
      {!reviewing ? <Button disabled={selected.length === 0} onClick={() => setReviewing(true)}>{copy('Review exact stock changes')}</Button> : <>
        <h3 className="font-semibold">{copy('These changes will be applied')}</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">{selected.map(row => <li key={row.rowIndex}>{products.find(item => item.id === row.productId)?.name}: +{row.quantity} {copy(products.find(item => item.id === row.productId)?.stock_unit || 'piece')} at ₦{Number(row.unitCost).toLocaleString()} each → {warehouses.find(item => item.id === row.warehouseId)?.name}. {copy('Selling price unchanged.')}</li>)}</ul>
        <p className="text-xs text-muted-foreground">{copy('Rows without a catalog match are not included. Create those products separately and review this draft again.')}</p>
        <div className="flex flex-wrap gap-2"><Button disabled={applying || selected.length === 0} onClick={() => void apply()}>{copy(applying ? 'Applying...' : `Apply ${selected.length} stock receipt${selected.length === 1 ? '' : 's'}`)}</Button><Button variant="outline" disabled={applying} onClick={() => setReviewing(false)}>{copy('Edit draft')}</Button></div>
      </>}
    </div>}
  </section>;
}
