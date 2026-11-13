'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { AccessGuard } from '@/components/shared/access-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import { loadVisibleReversals } from '@/lib/sales/effective-sale';
import { useAuthStore } from '@/store';
import { outstandingBalance } from '@/lib/sales/credit-balance';
import { generateId } from '@/lib/utils/id';

type CreditSale = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  amount_paid: number;
  created_at: string;
  notes?: string | null;
  imported: boolean;
  additionalPaid: number;
  writtenOff: number;
  remaining: number;
};
type CreditSettlement = {
  sale_id: string | null;
  historical_sale_id: string | null;
  kind: 'payment' | 'write_off';
  amount: number;
};

async function loadCreditSales() {
  const client = createClient();
  const native: CreditSale[] = [];
  const imported: CreditSale[] = [];
  const settlements: CreditSettlement[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('sales')
      .select('id,invoice_number,customer_name,customer_phone,total,amount_paid,created_at,notes')
      .eq('status', 'completed').order('created_at', { ascending: false }).range(offset, offset + 499);
    if (error) throw error;
    native.push(...(data || []).map(row => ({ ...row, imported: false, additionalPaid: 0, writtenOff: 0, remaining: 0 })));
    if (!data || data.length < 500) break;
  }
  const reversals = await loadVisibleReversals(native.map(sale => sale.id));
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('historical_sales' as never)
      .select('id,invoice_number,sold_at,total,amount_paid,status')
      .eq('status', 'active').order('sold_at', { ascending: false }).range(offset, offset + 499);
    if (error) throw error;
    const rows = (data || []) as unknown as Array<{ id: string; invoice_number: string; sold_at: string; total: number; amount_paid: number }>;
    imported.push(...rows.map(row => ({ id: row.id, invoice_number: row.invoice_number,
      customer_name: null, customer_phone: null, total: row.total, amount_paid: row.amount_paid,
      created_at: row.sold_at, imported: true, additionalPaid: 0, writtenOff: 0, remaining: 0 })));
    if (rows.length < 500) break;
  }
  let settlementReady = true;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('customer_credit_settlements' as never)
      .select('sale_id,historical_sale_id,kind,amount')
      .order('created_at', { ascending: false }).range(offset, offset + 499);
    if (error) {
      if (['42P01', 'PGRST205'].includes(error.code)) { settlementReady = false; break; }
      throw error;
    }
    const rows = (data || []) as unknown as CreditSettlement[];
    settlements.push(...rows);
    if (rows.length < 500) break;
  }
  const bySale = new Map<string, { paid: number; writtenOff: number }>();
  for (const entry of settlements) {
    const key = `${entry.historical_sale_id ? 'h' : 's'}:${entry.historical_sale_id || entry.sale_id}`;
    const current = bySale.get(key) || { paid: 0, writtenOff: 0 };
    if (entry.kind === 'payment') current.paid += Number(entry.amount);
    else current.writtenOff += Number(entry.amount);
    bySale.set(key, current);
  }
  const sales = [...native.filter(sale => !sale.notes?.startsWith('Vendor transaction ')
    && !['void', 'refund', 'return'].includes(reversals[sale.id])), ...imported]
    .filter(sale => outstandingBalance(sale) > 0)
    .map(sale => {
      const recorded = bySale.get(`${sale.imported ? 'h' : 's'}:${sale.id}`) || { paid: 0, writtenOff: 0 };
      return { ...sale, additionalPaid: recorded.paid, writtenOff: recorded.writtenOff,
        remaining: outstandingBalance({ total: sale.total, amount_paid: Number(sale.amount_paid) + recorded.paid + recorded.writtenOff }) };
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { sales, settlementReady };
}

function CreditLedger() {
  const organizationId = useAuthStore(state => state.user?.organization_id);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CreditSale | null>(null);
  const [kind, setKind] = useState<'payment' | 'write_off'>('payment');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState(() => generateId());
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['credit-ledger', organizationId], enabled: Boolean(organizationId), queryFn: loadCreditSales,
  });
  const sales = data?.sales || [];
  const openSales = sales.filter(sale => sale.remaining > 0);
  const closedSales = sales.filter(sale => sale.remaining === 0);
  const balance = openSales.reduce((sum, sale) => sum + sale.remaining, 0);
  const visible = openSales.filter(sale => [sale.customer_name, sale.customer_phone, sale.invoice_number]
    .some(value => value?.toLowerCase().includes(search.toLowerCase())));
  const customers = new Map<string, { name: string; phone: string | null; balance: number; sales: CreditSale[] }>();
  for (const sale of visible) {
    const key = sale.customer_phone || sale.customer_name?.trim().toLowerCase() || `invoice:${sale.id}`;
    const current = customers.get(key) || { name: sale.customer_name || (sale.imported ? 'Imported sale · customer not recorded' : 'Unnamed customer'), phone: sale.customer_phone, balance: 0, sales: [] };
    current.balance += sale.remaining;
    current.sales.push(sale);
    customers.set(key, current);
  }
  const begin = (sale: CreditSale, action: 'payment' | 'write_off') => {
    setSelected(sale); setKind(action); setAmount(String(sale.remaining)); setMethod('cash');
    setReference(''); setReason(''); setRequestId(generateId());
  };
  const settlement = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Choose a credit sale');
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0 || value > selected.remaining) throw new Error('Enter an amount no greater than the remaining balance');
      if (kind === 'write_off' && (value !== selected.remaining || reason.trim().length < 3)) throw new Error('Provide a reason to write off the full balance');
      const result = await createClient().rpc('record_customer_credit_settlement' as never, {
        p_request_id: requestId, p_sale_id: selected.id, p_imported: selected.imported,
        p_kind: kind, p_amount: value, p_payment_method: kind === 'payment' ? method : null,
        p_reference: reference.trim() || null, p_reason: reason.trim() || null,
      } as never);
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success(kind === 'payment' ? 'Customer payment recorded' : 'Remaining credit written off');
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ['credit-ledger', organizationId] });
      void queryClient.invalidateQueries({ queryKey: ['sales', organizationId] });
    },
    onError: (failure: Error) => toast.error(failure.message),
  });

  return <div className="space-y-5">
    <div><h1 className="tt-page-title">Customer credit</h1><p className="tt-muted text-sm">Record payments and close customer debt with an audit trail.</p></div>
    <Card><CardContent className="p-5"><p className="text-sm tt-muted">Total outstanding</p><p className="text-2xl font-semibold">{formatCurrency(balance)}</p><p className="text-sm tt-muted">{openSales.length} open · {closedSales.length} settled or written off</p></CardContent></Card>
    {data && !data.settlementReady && <p role="alert" className="text-sm text-destructive">Credit settlement is unavailable until the database update is applied. Existing balances remain visible.</p>}
    <Input aria-label="Search customer credit" placeholder="Search customer, phone or invoice" value={search} onChange={event => setSearch(event.target.value)} />
    {isLoading && <p>Loading credit sales…</p>}
    {error && <div role="alert">Could not load credit sales. <Button variant="outline" onClick={() => void refetch()}>Retry</Button></div>}
    {!isLoading && !error && visible.length === 0 && <p className="tt-muted">No outstanding credit sales found.</p>}
    <div className="space-y-3">{Array.from(customers.entries()).map(([key, customer]) => <Card key={key}><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap justify-between gap-2"><div><p className="font-medium">{customer.name}</p><p className="text-sm tt-muted">{customer.phone || 'No phone'} · {customer.sales.length} open sale(s)</p></div><p className="font-semibold">Owes {formatCurrency(customer.balance)}</p></div>
      <div className="space-y-3 border-t pt-2">{customer.sales.map(sale => <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div><p>{sale.invoice_number} · {formatDateTime(sale.created_at)}</p><p className="tt-muted">{formatCurrency(Number(sale.amount_paid) + sale.additionalPaid)} paid · {formatCurrency(sale.writtenOff)} written off · {formatCurrency(sale.remaining)} remaining</p></div>
        <div className="flex gap-2"><Button size="sm" disabled={!data?.settlementReady} onClick={() => begin(sale, 'payment')}>Record payment</Button><Button size="sm" variant="outline" disabled={!data?.settlementReady} onClick={() => begin(sale, 'write_off')}>Write off debt</Button></div>
      </div>)}</div>
      <Link className="text-sm text-primary underline" href="/sales">View sales</Link>
    </CardContent></Card>)}</div>
    {closedSales.length > 0 && <Card><CardContent className="space-y-2 p-4"><h2 className="font-semibold">Closed credit</h2>{closedSales.map(sale => <div key={sale.id} className="flex justify-between gap-3 border-t pt-2 text-sm"><span>{sale.invoice_number}</span><span>{sale.writtenOff > 0 ? 'Written off' : 'Paid in full'} · {formatCurrency(Number(sale.amount_paid) + sale.additionalPaid)} collected</span></div>)}</CardContent></Card>}
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open && !settlement.isPending) setSelected(null); }}>
      <DialogContent className="max-w-md"><DialogHeader><DialogTitle>{kind === 'payment' ? 'Record customer payment' : 'Write off remaining debt'}</DialogTitle><DialogDescription>{selected?.invoice_number} · {selected && formatCurrency(selected.remaining)} remaining. The original sale stays in the audit history.</DialogDescription></DialogHeader>
        <div className="space-y-3"><Input aria-label="Settlement amount" type="number" min="0.01" step="0.01" max={selected?.remaining} value={amount} onChange={event => { setAmount(event.target.value); setRequestId(generateId()); }} />
          {kind === 'payment' ? <><select aria-label="Payment method" className="min-h-11 w-full rounded border bg-background px-3" value={method} onChange={event => { setMethod(event.target.value); setRequestId(generateId()); }}><option value="cash">Cash</option><option value="transfer">Transfer</option><option value="pos_terminal">Card terminal</option><option value="split">Split</option></select><Input aria-label="Payment reference" placeholder="Reference (optional)" value={reference} onChange={event => { setReference(event.target.value); setRequestId(generateId()); }} /></>
            : <Input aria-label="Write off reason" placeholder="Reason for writing off this debt" value={reason} onChange={event => { setReason(event.target.value); setRequestId(generateId()); }} />}
          <Button className="w-full" disabled={settlement.isPending} onClick={() => settlement.mutate()}>{settlement.isPending ? 'Saving…' : kind === 'payment' ? 'Confirm payment received' : 'Confirm write off'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

export default function CreditPage() {
  return <AccessGuard allow={['business_owner', 'admin']}><CreditLedger /></AccessGuard>;
}
