'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useCopy } from '@/i18n/text';
import { useAuthStore } from '@/store';

type Order = { id: string; created_at: string; supplier: { name: string } | null };
type Comparison = { order: { id: string; supplier: { name: string } | null }; ready: boolean;
  orderOutstandingValue: number; invoiceValue: number | null;
  matched: Array<{ index: number; name: string; sku: string; quantity: number | null;
    unitCost: number | null; lineId: string | null; remaining: number | null;
    orderedUnitCost: number | null; costDifference: number | null; issues: string[] }>;
  short: Array<{ name: string; remaining: number; onInvoice: number }> };

async function json(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Invoice review could not be prepared.');
  return data;
}

async function imageDataUrl(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP invoice photo.');
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not open the invoice photo.')); image.src = url; });
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This device cannot prepare the invoice photo.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.78);
    if (data.length > 3_000_000) throw new Error('Invoice photo is too large. Retake it closer.');
    return data;
  } finally { URL.revokeObjectURL(url); }
}

export function InvoiceOrderReview({ enabled }: { enabled: boolean }) {
  const user = useAuthStore(state => state.user);
  const owner = user?.role === 'business_owner' && user.status === 'active' && user.organization_id ? user : null;
  return <InvoiceOrderWorkspace key={owner ? `${owner.organization_id}:${owner.id}` : 'unavailable'}
    enabled={enabled && !!owner} ownerId={owner?.id ?? null} organizationId={owner?.organization_id ?? null} />;
}

function InvoiceOrderWorkspace({ enabled, ownerId, organizationId }: {
  enabled: boolean; ownerId: string | null; organizationId: string | null;
}) {
  const copy = useCopy();
  const mounted = useRef(true);
  const running = useRef(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [order, setOrder] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sameAccount = useCallback(() => {
    const current = useAuthStore.getState().user;
    return mounted.current && !!ownerId && !!organizationId && current?.id === ownerId
      && current.organization_id === organizationId && current.role === 'business_owner' && current.status === 'active';
  }, [ownerId, organizationId]);
  useEffect(() => {
    mounted.current = true;
    if (enabled && sameAccount()) {
      void fetch('/api/ai/purchase-order-match', { headers: {
        'X-Track-Expected-Owner': ownerId!, 'X-Track-Expected-Organization': organizationId!,
      } }).then(json).then(data => { if (sameAccount()) setOrders(data.orders); })
        .catch(cause => { if (sameAccount()) setError(cause instanceof Error ? cause.message : 'Could not load purchase orders.'); });
    }
    return () => { mounted.current = false; };
  }, [enabled, ownerId, organizationId, sameAccount]);
  const review = async () => {
    if (!enabled || !order || !file || running.current || !sameAccount()) return;
    running.current = true;
    setBusy(true); setError(''); setComparison(null);
    try {
      const image = await imageDataUrl(file);
      if (!sameAccount()) return;
      const headers = { 'Content-Type': 'application/json',
        'X-Track-Expected-Owner': ownerId!, 'X-Track-Expected-Organization': organizationId! };
      const extracted = await json(await fetch('/api/ai', { method: 'POST',
        headers, body: JSON.stringify({ action: 'invoice_image', image }) }));
      if (!sameAccount()) return;
      const result = await json(await fetch('/api/ai/purchase-order-match', { method: 'POST',
        headers, body: JSON.stringify({ job: extracted.job, order }) }));
      if (sameAccount()) setComparison(result);
    } catch (cause) { if (sameAccount()) setError(cause instanceof Error ? cause.message : 'Could not compare invoice.'); }
    finally { running.current = false; if (sameAccount()) setBusy(false); }
  };
  return <section className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6" aria-label={copy('Invoice and purchase order review')}>
    <h2 className="tt-section-title">{copy('Compare supplier invoice with a purchase order')}</h2>
    <p className="text-sm text-muted-foreground">{copy('Check invoice quantities and buying costs against a sent order. This comparison does not receive stock or pay the supplier.')}</p>
    <label className="block text-sm">{copy('Sent purchase order')}
      <NativeSelect className="mt-1 w-full" value={order} onChange={event => { setOrder(event.target.value); setComparison(null); }}>
        <option value="">{copy('Choose a purchase order')}</option>
        {orders.map(item => <option key={item.id} value={item.id}>{item.supplier?.name || 'Supplier'} · {new Date(item.created_at).toLocaleDateString()} · {item.id.slice(0, 8)}</option>)}
      </NativeSelect>
    </label>
    {orders.length === 0 && <p className="text-sm">{copy('No sent purchase orders found.')} <Link className="underline" href="/purchase-orders">{copy('Open purchase orders')}</Link></p>}
    <label className="block text-sm">{copy('Supplier invoice photo')}
      <Input className="mt-1" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { setFile(event.target.files?.[0] || null); setComparison(null); }} />
    </label>
    <Button disabled={!enabled || !order || !file || busy} onClick={() => void review()}>{copy(busy ? 'Reading invoice...' : 'Compare invoice')}</Button>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {comparison && <div className="space-y-3" role="status">
      <p className="font-medium">{comparison.order.supplier?.name || 'Supplier'} · {comparison.matched.length} {copy('invoice lines')}</p>
      <p className="text-sm">{copy('Invoice line total')}: {comparison.invoiceValue === null ? copy('Cannot calculate until every quantity and cost is checked') : `₦${comparison.invoiceValue.toLocaleString()}`} · {copy('Outstanding PO value at ordered prices')}: ₦{comparison.orderOutstandingValue.toLocaleString()}</p>
      {comparison.matched.map(line => <article key={line.index} className="rounded-lg border border-border p-3 text-sm">
        <strong>{line.name || `${copy('Invoice line')} ${line.index + 1}`}</strong> · {line.sku || copy('No SKU')}<br />
        {copy('Invoice')}: {line.quantity ?? '?'} × ₦{line.unitCost?.toLocaleString() ?? '?'} · {copy('PO remaining')}: {line.remaining ?? copy('No match')}
        {line.costDifference !== null && <span> · {copy('Unit buying cost change')}: {line.costDifference > 0 ? '+' : ''}₦{line.costDifference.toLocaleString()}</span>}
        {line.issues.length > 0 && <ul className="mt-1 list-disc pl-5 text-destructive">{line.issues.map(issue => <li key={issue}>{copy(issue)}</li>)}</ul>}
      </article>)}
      {comparison.short.map(line => <p key={line.name} className="text-sm">{line.name}: {line.remaining - line.onInvoice} {copy('units still outstanding on the PO')}.</p>)}
      <p className="text-sm font-medium">{copy('Verify physical delivery, units and the invoice grand total before receiving stock. Use the purchase order screen for the existing full-order receipt; partial or changed-cost invoices need a dedicated receipt action.')}</p>
      <Link className="text-primary underline" href="/purchase-orders">{copy('Open purchase orders')}</Link>
    </div>}
  </section>;
}
