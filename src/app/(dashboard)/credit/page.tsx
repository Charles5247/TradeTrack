'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { AccessGuard } from '@/components/shared/access-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import { loadVisibleReversals } from '@/lib/sales/effective-sale';
import { useAuthStore } from '@/store';
import { isOpenCustomerCredit, outstandingBalance } from '@/lib/sales/credit-balance';

type CreditSale = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  amount_paid: number;
  created_at: string;
  sale_type: string | null;
  notes?: string | null;
  imported?: boolean;
};

function CreditLedger() {
  const [search, setSearch] = useState('');
  const organizationId = useAuthStore(state => state.user?.organization_id);
  const { data: sales = [], isLoading, error, refetch } = useQuery({
    queryKey: ['credit-ledger', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const all: CreditSale[] = [];
      const client = createClient();
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client.from('sales')
          .select('id,invoice_number,customer_name,customer_phone,total,amount_paid,created_at,sale_type,notes')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .range(offset, offset + 499);
        if (error) throw error;
        all.push(...(data as CreditSale[]));
        if (!data || data.length < 500) break;
      }
      const reversals = await loadVisibleReversals(all.map(sale => sale.id));
      const openSales = all.filter(sale => isOpenCustomerCredit(sale, reversals));
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client.from('historical_sales' as never)
          .select('id,invoice_number,sold_at,total,amount_paid,status')
          .eq('status', 'active')
          .order('sold_at', { ascending: false })
          .range(offset, offset + 499);
        if (error) throw error;
        const historical = (data || []) as unknown as Array<{ id: string; invoice_number: string; sold_at: string; total: number; amount_paid: number }>;
        openSales.push(...historical.filter(sale => outstandingBalance(sale) > 0).map(sale => ({
          id: sale.id, invoice_number: sale.invoice_number, total: sale.total,
          amount_paid: sale.amount_paid, created_at: sale.sold_at,
          customer_name: null, customer_phone: null, sale_type: null, imported: true,
        })));
        if (!data || data.length < 500) break;
      }
      return openSales;
    },
  });
  const visible = sales.filter(sale => [sale.customer_name, sale.customer_phone, sale.invoice_number]
    .some(value => value?.toLowerCase().includes(search.toLowerCase())));
  const balance = sales.reduce((sum, sale) => sum + outstandingBalance(sale), 0);
  const customers = new Map<string, { name: string; phone: string | null; balance: number; sales: CreditSale[] }>();
  for (const sale of visible) {
    const key = sale.customer_phone || sale.customer_name?.trim().toLowerCase() || `invoice:${sale.id}`;
    const current = customers.get(key) || { name: sale.customer_name || (sale.imported ? 'Imported sale · customer not recorded' : 'Unnamed customer'), phone: sale.customer_phone, balance: 0, sales: [] };
    current.balance += outstandingBalance(sale);
    current.sales.push(sale);
    customers.set(key, current);
  }
  return <div className="space-y-5">
    <div><h1 className="tt-page-title">Customer credit</h1><p className="tt-muted text-sm">Outstanding customer purchases and balances.</p></div>
    <Card><CardContent className="p-5"><p className="text-sm tt-muted">Total outstanding</p><p className="text-2xl font-semibold">{formatCurrency(balance)}</p><p className="text-sm tt-muted">{sales.length} unpaid or partly paid sales</p></CardContent></Card>
    <Input aria-label="Search customer credit" placeholder="Search customer, phone or invoice" value={search} onChange={event => setSearch(event.target.value)} />
    {isLoading && <p>Loading credit sales…</p>}
    {error && <div role="alert">Could not load credit sales. <Button variant="outline" onClick={() => refetch()}>Retry</Button></div>}
    {!isLoading && !error && visible.length === 0 && <p className="tt-muted">No outstanding credit sales found.</p>}
    <div className="space-y-3">{Array.from(customers.entries()).map(([key, customer]) => <Card key={key}><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap justify-between gap-2"><div><p className="font-medium">{customer.name}</p><p className="text-sm tt-muted">{customer.phone || 'No phone'} · {customer.sales.length} open sale(s)</p></div><p className="font-semibold">Owes {formatCurrency(customer.balance)}</p></div>
      <div className="space-y-2 border-t pt-2">{customer.sales.map(sale => <div key={sale.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{sale.invoice_number} · {formatDateTime(sale.created_at)}</span><span>{formatCurrency(sale.amount_paid)} paid · {formatCurrency(outstandingBalance(sale))} remaining</span></div>)}</div>
      <Link className="text-sm text-primary underline" href="/sales">View sales</Link>
    </CardContent></Card>)}</div>
  </div>;
}

export default function CreditPage() {
  return <AccessGuard allow={['business_owner', 'admin']}><CreditLedger /></AccessGuard>;
}
