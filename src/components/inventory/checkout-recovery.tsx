'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { getDB } from '@/lib/offline/db';
import { getAccountRevision } from '@/lib/auth/account-state';
import { accountIdentity } from '@/lib/auth/account-state';
import { atomicCheckoutEnabled, getCheckoutRecovery, postSavedCheckout } from '@/lib/offline/checkout-command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function CheckoutRecovery() {
  const user = useAuthStore(state => state.user);
  return <CheckoutRecoveryWorkspace key={accountIdentity(user)} />;
}

function CheckoutRecoveryWorkspace() {
  const user = useAuthStore(state => state.user);
  const cache = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [lines, setLines] = useState<{ id: string; product: string; quantity: number }[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const enabled = atomicCheckoutEnabled() && !!user?.organization_id;
  const { data: receipts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['checkout-recovery', user?.organization_id, user?.id],
    queryFn: () => getCheckoutRecovery(user!.organization_id!), enabled,
    refetchInterval: enabled ? 15000 : false,
  });
  if (!enabled) return null;
  const receipt = receipts.find(row => row.id === selected);
  async function inspect(id: string) {
    const revision = getAccountRevision();
    const db = await getDB();
    const items = await db.getAllFromIndex('sale_items','by-sale',id);
    const products = await db.getAll('products');
    if (revision !== getAccountRevision()) return;
    const names = new Map(products.filter(row => row.organization_id === user?.organization_id).map(row => [row.id,row.name]));
    setLines(items.map(item => ({ id: item.id, product: names.get(item.product_id) ?? item.product_id, quantity: item.quantity })));
    setReason(''); setError(null); setSelected(id);
  }
  async function retry() {
    if (!user?.organization_id || !selected || reason.trim().length < 8) return;
    setBusy(true); setError(null);
    const revision = getAccountRevision();
    try {
      if (!navigator.onLine) throw new Error('Connect to the internet to reconcile this receipt.');
      await postSavedCheckout(await getDB(), selected, user.organization_id, undefined, reason.trim(),revision);
      if (revision !== getAccountRevision()) return;
      setSelected(null);
      await cache.invalidateQueries();
    } catch (failure) {
      if (revision === getAccountRevision()) setError(failure instanceof Error ? failure.message : 'Receipt needs further review.');
    } finally { setBusy(false); }
  }
  return <section aria-label="Saved checkout recovery" className="rounded-lg border border-border p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-medium">Saved checkouts</h2><p className="text-sm text-muted-foreground">Review receipts awaiting server confirmation. A retry preserves the original receipt and checks existing stock effects.</p></div>
      <Button variant="outline" onClick={() => void refetch()}>Refresh saved receipts</Button>
    </div>
    {isLoading ? <p role="status">Loading saved receipts…</p> : isError ? <p role="alert">Could not read saved receipts. Refresh to retry.</p> : receipts.length === 0 ? <p className="text-sm text-muted-foreground">All saved checkouts are confirmed.</p> : <>
      <ul className="divide-y divide-border">{receipts.slice(page*10,page*10+10).map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div className="min-w-0 flex-1"><p className="font-medium break-all">{row.invoice}</p><p className="text-sm text-muted-foreground break-words">{row.error}</p></div>
        <Button variant="outline" aria-label={`Review ${row.invoice}`} onClick={() => void inspect(row.id)}>Review receipt</Button>
      </li>)}</ul>
      <div className="flex items-center gap-3"><Button variant="outline" disabled={page===0} onClick={() => setPage(page-1)}>Previous</Button><span className="text-sm">{receipts.length} saved receipts</span><Button variant="outline" disabled={(page+1)*10>=receipts.length} onClick={() => setPage(page+1)}>Next</Button></div>
    </>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !busy) setSelected(null); }}>
      <DialogContent className="max-h-[85vh] overflow-auto">
        <DialogHeader><DialogTitle className="break-words pr-8">Review {receipt?.invoice ?? 'saved receipt'}</DialogTitle><DialogDescription>Check the saved quantities against the original receipt. The server will apply only missing effects, or leave this receipt unchanged if it needs further review.</DialogDescription></DialogHeader>
        <table className="w-full table-fixed text-sm"><caption className="sr-only">Every saved receipt line</caption><thead><tr><th scope="col" className="text-left">Product</th><th scope="col">Units sold</th></tr></thead><tbody>{lines.map(line => <tr key={line.id}><td className="py-2 break-words">{line.product}</td><td className="text-center">{line.quantity}</td></tr>)}</tbody></table>
        <Label htmlFor="checkout-recovery-reason">Reason for reconciliation</Label><Input id="checkout-recovery-reason" value={reason} onChange={event => setReason(event.target.value)} disabled={busy} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button disabled={busy || reason.trim().length<8} onClick={() => void retry()}>{busy ? 'Checking receipt…' : 'Reconcile this saved receipt'}</Button>
      </DialogContent>
    </Dialog>
  </section>;
}
