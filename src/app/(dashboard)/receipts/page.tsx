'use client';
import { TranslatedText, useCopy } from '@/i18n/text';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ReceiptText, Search, ArrowUpRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';

export default function ReceiptsPage() {
  const copy = useCopy();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('all');
  const [page, setPage] = useState(0);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['receipt-library',user?.id,user?.organization_id,search,method,page], enabled: Boolean(user?.organization_id),
    queryFn: async () => {
      let query = createClient().from('sales').select('id,invoice_number,customer_name,created_at,total,payment_method,payment_status', {count:'exact'}).eq('organization_id',user!.organization_id).order('created_at',{ascending:false});
      if (user?.role === 'cashier') query = query.eq('cashier_id',user.id);
      if (search.trim()) query = query.ilike('invoice_number',`%${search.trim()}%`);
      if (method !== 'all') query = query.eq('payment_method',method as 'cash'|'transfer'|'pos_terminal');
      const {data,error,count} = await query.range(page*25,page*25+24);
      if(error) throw error;
      return {rows:data || [],count:count || 0};
    },
  });
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="tt-page-title"><TranslatedText text={"Receipts"} /></h1><p className="mt-1 text-sm text-muted-foreground"><TranslatedText text={"Find, review and reprint your recorded sales."} /></p></div><Button asChild><Link href="/receipts/lookup"><Search className="h-4 w-4" /><TranslatedText text={"Receipt lookup"} /></Link></Button></div><div className="flex flex-col gap-3 sm:flex-row"><Input aria-label={copy("Search receipt number")} placeholder={copy("Search receipt number…")} leftIcon={<Search className="h-4 w-4" />} value={search} onChange={e => {setSearch(e.target.value);setPage(0);}} /><select className="tt-input sm:max-w-52" aria-label={copy("Payment method")} value={method} onChange={e => {setMethod(e.target.value);setPage(0);}}><option value="all"><TranslatedText text={"All payment methods"} /></option><option value="cash"><TranslatedText text={"Cash"} /></option><option value="transfer"><TranslatedText text={"Transfer"} /></option><option value="pos_terminal"><TranslatedText text={"POS card"} /></option></select></div>{error ? <ErrorState body={error.message} onRetry={() => refetch()} /> : isLoading ? <LoadingState rows={6} /> : !data?.rows.length ? <EmptyState icon={ReceiptText} title={copy("No receipts found")} body={copy("Completed sales will appear here. Try a different receipt number or payment method.")} /> : <Card className="overflow-hidden"><Table><TableHeader><TableRow><TableHead><TranslatedText text={"Receipt"} /></TableHead><TableHead><TranslatedText text={"Date"} /></TableHead><TableHead><TranslatedText text={"Customer"} /></TableHead><TableHead><TranslatedText text={"Payment"} /></TableHead><TableHead className="text-right"><TranslatedText text={"Total"} /></TableHead><TableHead><TranslatedText text={"Open"} /></TableHead></TableRow></TableHeader><TableBody>{data.rows.map(r => <TableRow key={r.id}><TableCell className="font-mono">{r.invoice_number}</TableCell><TableCell>{formatDateTime(r.created_at)}</TableCell><TableCell>{r.customer_name || 'Walk-in customer'}</TableCell><TableCell><p className="mb-1 capitalize">{r.payment_method.replace('_',' ')}</p><Badge variant="outline">{r.payment_status}</Badge></TableCell><TableCell className="text-right font-mono font-semibold">{formatCurrency(r.total)}</TableCell><TableCell><Button variant="ghost" size="sm" asChild><Link aria-label={`Open receipt ${r.invoice_number}`} href={`/receipts/lookup?code=${encodeURIComponent(r.invoice_number)}`}><ArrowUpRight className="h-4 w-4" /><TranslatedText text={"View"} /></Link></Button></TableCell></TableRow>)}</TableBody></Table></Card>}<div className="flex items-center justify-between gap-3 text-sm"><p className="text-muted-foreground">{data?.count || 0}{" "}<TranslatedText text={"receipts · Page"} />{" "}{page+1}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!page || isLoading} onClick={() => setPage(page-1)}><TranslatedText text={"Previous"} /></Button><Button variant="outline" size="sm" disabled={isLoading || (page+1)*25 >= (data?.count || 0)} onClick={() => setPage(page+1)}><TranslatedText text={"Next"} /></Button></div></div></div>;
}
