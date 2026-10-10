'use client';
import { TranslatedText, useCopy } from '@/i18n/text';


import Link from 'next/link';
import type { Sale } from '@/types';
type SaleRecordData = Omit<Sale, 'cashier' | 'warehouse' | 'items'> & { cashier: { full_name: string } | null; warehouse: { name: string } | null; items: { id: string; quantity: number; unit_price: number; total: number; product: { name: string; sku: string } | null }[] };
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { createClient } from '@/lib/supabase/client';
import { AccessGuard } from '@/components/shared/access-guard';
import { DetailTemplate } from '@/components/ui/detail-template';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';

export function SaleDetail({ id }: { id: string }) {
  return <AccessGuard allow={['business_owner', 'admin', 'cashier']}><SaleRecord id={id} /></AccessGuard>;
}

function SaleRecord({ id }: { id: string }) {
  const copy = useCopy();
  const user = useAuthStore(s => s.user);
  const query = useQuery({
    queryKey: ['sale-detail', user?.organization_id, id],
    enabled: Boolean(user?.organization_id),
    queryFn: async () => {
      const { data, error } = await createClient().from('sales')
        .select('*, cashier:users(full_name), warehouse:warehouses(name), items:sale_items(id, quantity, unit_price, total, product:products(name, sku))')
        .eq('organization_id', user!.organization_id!).eq('id', id).single();
      if (error) throw error;
      return data as unknown as SaleRecordData;
    },
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState title={copy("Sale unavailable")} body={copy("This sale could not be loaded. Check your connection and access, then try again.")} onRetry={() => void query.refetch()} />;
  const sale = query.data;
  return <DetailTemplate title={sale.invoice_number} subtitle={formatDateTime(sale.created_at)}
    statusBadge={<Badge variant={sale.status === 'completed' ? 'success' : 'secondary'}>{sale.status}</Badge>}
    secondary={<Button asChild variant="outline"><Link href="/sales"><TranslatedText text={"Back to sales"} /></Link></Button>}
    meta={[{ label: 'Customer', value: sale.customer_name || 'Walk-in customer' }, { label: 'Cashier', value: sale.cashier?.full_name || '—' }, { label: 'Warehouse', value: sale.warehouse?.name || '—' }]}
    overviewCards={[{ label: 'Total', value: formatCurrency(sale.total) }, { label: 'Paid', value: formatCurrency(sale.amount_paid) }, { label: 'Change', value: formatCurrency(sale.change_amount) }]}
    mainContent={<Card><CardHeader><CardTitle><TranslatedText text={"Items sold"} /></CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead><TranslatedText text={"Product"} /></TableHead><TableHead><TranslatedText text={"Qty"} /></TableHead><TableHead><TranslatedText text={"Price"} /></TableHead><TableHead><TranslatedText text={"Total"} /></TableHead></TableRow></TableHeader><TableBody>{sale.items.map(item => <TableRow key={item.id}><TableCell>{item.product?.name || 'Product unavailable'}<div className="tt-mono text-xs text-muted-foreground">{item.product?.sku}</div></TableCell><TableCell>{item.quantity}</TableCell><TableCell>{formatCurrency(item.unit_price)}</TableCell><TableCell>{formatCurrency(item.total)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
    sideContent={<Card><CardHeader><CardTitle><TranslatedText text={"Payment summary"} /></CardTitle></CardHeader><CardContent className="space-y-4 tt-tabular">{[['Subtotal', formatCurrency(sale.subtotal)], ['Discount', formatCurrency(sale.discount)], ['Tax', formatCurrency(sale.tax)], ['Payment', sale.payment_method.replaceAll('_', ' ')]].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="font-medium capitalize">{value}</span></div>)}</CardContent></Card>} />;
}
