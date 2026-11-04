'use client';
import { TranslatedText, useCopy } from '@/i18n/text';


import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Download, Eye, Receipt, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import { downloadTablePDF } from '@/lib/pdf/table-pdf';
import type { Sale, SaleItem } from '@/types';
import { useI18n } from '@/i18n';
import { AccessGuard } from '@/components/shared/access-guard';
import { useAuthStore } from '@/store';
import { effectiveSaleStatus, loadVisibleReversals, withReversalStatus } from '@/lib/sales/effective-sale';

async function fetchSales(filters: {
  search: string;
  status: string;
  payment_method: string;
  start_date: string;
  end_date: string;
  sale_type: 'all' | 'retail' | 'b2b' | 'b2c';
  credit_status: 'all' | 'paid' | 'partial' | 'unpaid';
}) {
  const supabase = createClient();
  let query = supabase
    .from('sales')
    .select('*, financial_reversals(kind)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (filters.search) {
    query = query.or(
      `invoice_number.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%`
    );
  }
  if (filters.payment_method && filters.payment_method !== 'all') query = query.eq('payment_method', filters.payment_method as import('@/lib/supabase/types').PaymentMethod);
  if (filters.sale_type && filters.sale_type !== 'all') query = query.eq('sale_type', filters.sale_type);
  if (filters.credit_status && filters.credit_status !== 'all') query = query.eq('payment_status', filters.credit_status);
  if (filters.start_date) query = query.gte('created_at', filters.start_date);
  if (filters.end_date) query = query.lte('created_at', filters.end_date + 'T23:59:59');

  const [{ data, error }, historicalResult] = await Promise.all([
    query,
    supabase
      .from('historical_sales' as never)
      .select('id,invoice_number,sold_at,total,amount_paid,payment_method,status,imported,created_at')
      .order('sold_at', { ascending: false })
      .limit(100),
  ]);
  if (error) {
    console.warn('Unable to load live sales; showing imported sales when available.', error);
  }

  const reversalKinds = error ? {} : await loadVisibleReversals((data || []).map(sale => sale.id));
  const liveSales = (error ? [] : ((data || []) as unknown as (Sale & { financial_reversals?: { kind: string }[] })[]))
    .map((sale) => {
      return { ...sale, status: effectiveSaleStatus(withReversalStatus(sale, reversalKinds)) } as Sale;
    })
    .filter((sale) => !filters.status || filters.status === 'all' || sale.status === filters.status);
  const historicalSales = (historicalResult.data || []) as unknown as Array<{
    id: string;
    invoice_number: string;
    sold_at: string;
    total: number;
    amount_paid: number;
    payment_method: Sale['payment_method'];
    status: string;
    imported: boolean;
    created_at: string;
  }>;

  const normalizedHistorical: Sale[] = historicalSales
    .filter((sale) => {
      const total = Number(sale.total);
      const amountPaid = Number(sale.amount_paid);
      const creditStatus = amountPaid <= 0 ? 'unpaid' : amountPaid < total ? 'partial' : 'paid';
      if (filters.search) {
        const needle = filters.search.toLowerCase();
        if (!sale.invoice_number.toLowerCase().includes(needle)) return false;
      }
      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'completed' && sale.status !== 'active') return false;
        if (filters.status === 'refunded' && sale.status !== 'reversed') return false;
        if (filters.status === 'cancelled' || filters.status === 'pending') return false;
      }
      if (filters.payment_method && filters.payment_method !== 'all' && sale.payment_method !== filters.payment_method) return false;
      if (filters.sale_type !== 'all') return false;
      if (filters.credit_status !== 'all' && creditStatus !== filters.credit_status) return false;
      if (filters.start_date && new Date(sale.sold_at).toISOString().slice(0, 10) < filters.start_date) return false;
      if (filters.end_date && new Date(sale.sold_at).toISOString().slice(0, 10) > filters.end_date) return false;
      return true;
    })
    .map((sale) => {
      const total = Number(sale.total);
      const amountPaid = Number(sale.amount_paid);
      return {
        ...sale,
        created_at: sale.sold_at,
        customer_name: null,
        customer_phone: null,
        cashier: null,
        credit_authorizer: null,
        warehouse: null,
        items: [],
        subtotal: total,
        discount: 0,
        tax: 0,
        total,
        amount_paid: amountPaid,
        change_amount: 0,
        sale_type: 'retail',
        payment_status: amountPaid <= 0 ? 'unpaid' : amountPaid < total ? 'partial' : 'paid',
        status: sale.status === 'active' ? 'completed' : 'refunded',
        imported: true,
      } as unknown as Sale;
    });

  const merged = [...liveSales, ...normalizedHistorical].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return merged.slice(0, 100);
}

function exportToCSV(sales: Sale[]) {
  const headers = ['Invoice', 'Customer', 'Cashier', 'Warehouse', 'Total', 'Payment', 'Status', 'Date'];
  const rows = sales.map((s) => [
    s.invoice_number,
    s.customer_name || '',
    (s.cashier as { full_name?: string } | null)?.full_name || '',
    (s.warehouse as { name?: string } | null)?.name || '',
    s.total,
    s.payment_method,
    s.status,
    new Date(s.created_at).toLocaleDateString(),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToPDF(sales: Sale[]) {
  const headers = ['Invoice', 'Customer', 'Cashier', 'Warehouse', 'Total', 'Payment', 'Status', 'Date'];
  const rows = sales.map((s) => [
    s.invoice_number,
    s.customer_name || '',
    (s.cashier as { full_name?: string } | null)?.full_name || '',
    (s.warehouse as { name?: string } | null)?.name || '',
    formatCurrency(s.total),
    s.payment_method,
    s.status,
    new Date(s.created_at).toLocaleDateString(),
  ]);
  downloadTablePDF({
    title: 'Sales Report',
    subtitle: `${sales.length} sales · generated ${new Date().toLocaleString()}`,
    headers,
    rows,
    filename: `sales-${new Date().toISOString().split('T')[0]}.pdf`,
  });
}

export default function SalesPage() {
  return (
    <AccessGuard allow={['business_owner', 'admin']}>
      <SalesPageInner />
    </AccessGuard>
  );
}

function SalesPageInner() {
  const copy = useCopy();
  const router = useRouter();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [saleType, setSaleType] = useState<'all' | 'retail' | 'b2b' | 'b2c'>('all');
  const [creditStatus, setCreditStatus] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [cancelingSale, setCancelingSale] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const user = useAuthStore((s) => s.user);
  const canCancel = user?.role === 'business_owner' || user?.role === 'admin';
  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: async ({ saleId, reason }: { saleId: string; reason: string }) => {
      const res = await fetch(`/api/sales/${saleId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to cancel sale');
      return json;
    },
    onSuccess: () => {
      toast.success('Sale reversed; deducted stock restored');
      setCancelingSale(null);
      setCancelReason('');
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: sales = [], isLoading, error: pageError, refetch: retryPage } = useQuery({
    queryKey: ['sales', search, status, paymentMethod, saleType, creditStatus, startDate, endDate],
    queryFn: () => fetchSales({ search, status, payment_method: paymentMethod, sale_type: saleType, credit_status: creditStatus, start_date: startDate, end_date: endDate }),
  });

  const statusBadge = (s: string) => {
    const variants: Record<string, string> = {
      completed: 'success',
      pending: 'warning',
      cancelled: 'destructive',
      refunded: 'info',
    };
    return <Badge variant={(variants[s] || 'outline') as Parameters<typeof Badge>[0]['variant']}>{s}</Badge>;
  };

  const paymentBadge = (method: string) => {
    const labels: Record<string, string> = {
      cash: '💵 Cash',
      transfer: '🏦 Transfer',
      pos_terminal: '💳 POS',
      split: '✂️ Split',
      partial: '⏳ Partial',
    };
    return <Badge variant="outline" className="text-xs">{labels[method] || method}</Badge>;
  };

  const totalRevenue = sales.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="min-w-0 space-y-6">
      {pageError && <ErrorState title={copy("Could not load this page")} body={pageError.message} onRetry={() => retryPage()} />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="tt-page-title">{t.sales.title}</h1>
          <p className="tt-muted text-sm">
            {t.sales.subtitle.replace('{count}', String(sales.length)).replace('{revenue}', formatCurrency(totalRevenue))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportToCSV(sales)}>
            <Download className="h-4 w-4 mr-2" strokeWidth={1.75} />
            {t.sales.export_csv}
          </Button>
          <Button variant="outline" onClick={() => exportToPDF(sales)}>
            <Download className="h-4 w-4 mr-2" strokeWidth={1.75} /><TranslatedText text={"PDF"} /></Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder={t.sales.search_placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" strokeWidth={1.75} />}
              className="w-full"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder={t.common.status} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.sales.all_status}</SelectItem>
                <SelectItem value="completed">{t.sales.status_completed}</SelectItem>
                <SelectItem value="pending">{t.sales.status_pending}</SelectItem>
                <SelectItem value="cancelled">{t.sales.status_cancelled}</SelectItem>
                <SelectItem value="refunded">{t.sales.status_refunded}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={saleType} onValueChange={(value) => setSaleType(value as "retail" | "b2b" | "b2c" | "all")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Customer sale type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customer sales</SelectItem>
                <SelectItem value="b2b">B2B credit sales</SelectItem>
                <SelectItem value="b2c">B2C credit sales</SelectItem>
                <SelectItem value="retail">Retail sales</SelectItem>
              </SelectContent>
            </Select>
            <Select value={creditStatus} onValueChange={(value) => setCreditStatus(value as "all" | "paid" | "partial" | "unpaid")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Credit status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payment states</SelectItem>
                <SelectItem value="paid">Paid / completed</SelectItem>
                <SelectItem value="partial">Still paying</SelectItem>
                <SelectItem value="unpaid">Not paid / 0 paid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t.sales.payment} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.sales.all_payments}</SelectItem>
                <SelectItem value="cash">{t.sales.payment_cash}</SelectItem>
                <SelectItem value="transfer">{t.sales.payment_transfer}</SelectItem>
                <SelectItem value="pos_terminal">{t.sales.payment_pos_terminal}</SelectItem>
                <SelectItem value="split">{t.sales.payment_split}</SelectItem>
                <SelectItem value="partial">{t.sales.payment_partial}</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:col-span-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full min-w-0" />
              <span className="tt-muted text-sm">{t.sales.to_separator}</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full min-w-0" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="min-w-0 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.sales.invoice}</TableHead>
                <TableHead>{t.sales.customer}</TableHead>
                <TableHead>{t.sales.cashier}</TableHead>
                <TableHead>{t.sales.items}</TableHead>
                <TableHead>{t.sales.total}</TableHead>
                <TableHead>{t.sales.payment}</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Credit state</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead>{t.sales.date}</TableHead>
                <TableHead className="text-right">{t.sales.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(11)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="h-8 w-8 opacity-30" strokeWidth={1.75} />
                      <p>{t.sales.no_sales}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <code className="text-xs font-medium bg-muted px-1.5 py-0.5 rounded">
                        {sale.invoice_number}
                      </code>
                    </TableCell>
                    <TableCell>{sale.customer_name || <span className="text-muted-foreground text-xs">{t.sales.walk_in}</span>}</TableCell>
                    <TableCell className="text-sm">{(sale.cashier as { full_name?: string } | null)?.full_name || '—'}</TableCell>
                    <TableCell>{t.sales.items_count.replace('{count}', String((sale.items as SaleItem[] | undefined)?.length || 0))}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(sale.total)}</TableCell>
                    <TableCell>{paymentBadge(sale.payment_method)}</TableCell>
                    <TableCell>{sale.sale_type === 'b2b' ? 'B2B' : sale.sale_type === 'b2c' ? 'B2C' : 'Retail'}</TableCell>
                    <TableCell>{sale.payment_status === 'unpaid' ? '0 paid' : sale.payment_status === 'partial' ? 'Still paying' : 'Paid'}</TableCell>
                    <TableCell>{statusBadge(sale.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(sale.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => router.push(`/sales/${sale.id}`)}>
                          <Eye className="h-4 w-4" strokeWidth={1.75} />
                        </Button>
                        {canCancel && sale.status === 'completed' && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            title="Cancel this sale"
                            onClick={() => { setCancelingSale(sale); setCancelReason(''); }}
                          >
                            <XCircle className="h-4 w-4" strokeWidth={1.75} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sale Details Dialog */}
      {viewSale && (
        <Dialog open={!!viewSale} onOpenChange={() => setViewSale(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t.sales.sale_details_title.replace('{invoice}', viewSale.invoice_number)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">{t.sales.date}:</span> <span className="font-medium">{formatDateTime(viewSale.created_at)}</span></div>
                <div><span className="text-muted-foreground">{t.sales.cashier}:</span> <span className="font-medium">{(viewSale.cashier as { full_name?: string } | null)?.full_name}</span></div>
                <div><span className="text-muted-foreground">{t.sales.customer}:</span> <span className="font-medium">{viewSale.customer_name || t.sales.walk_in}</span></div>
                <div><span className="text-muted-foreground">{t.sales.phone}:</span> <span className="font-medium">{viewSale.customer_phone || '—'}</span></div>
                <div><span className="text-muted-foreground">Customer type:</span> <span className="font-medium">{viewSale.sale_type === 'b2b' ? 'B2B' : viewSale.sale_type === 'b2c' ? 'B2C' : 'Retail'}</span></div>
                <div><span className="text-muted-foreground">Credit state:</span> <span className="font-medium">{viewSale.payment_status === 'unpaid' ? 'Not paid / 0 paid' : viewSale.payment_status === 'partial' ? 'Still paying' : 'Paid / completed'}</span></div>
                <div><span className="text-muted-foreground">Authorized by:</span> <span className="font-medium">{(viewSale as Sale & { credit_authorizer?: { full_name?: string } }).credit_authorizer?.full_name || '—'}</span></div>
                <div><span className="text-muted-foreground">{t.sales.payment}:</span> <span className="font-medium capitalize">{viewSale.payment_method.replace('_', ' ')}</span></div>
                <div><span className="text-muted-foreground">{t.common.status}:</span> {statusBadge(viewSale.status)}</div>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.sales.item_product}</TableHead>
                      <TableHead>{t.sales.item_qty}</TableHead>
                      <TableHead>{t.sales.item_price}</TableHead>
                      <TableHead>{t.sales.item_total}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(viewSale.items as SaleItem[] | undefined)?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm">{(item.product as { name?: string } | null)?.name}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell>{formatCurrency(item.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-1 text-sm border-t pt-3">
                <div className="flex justify-between"><span>{t.sales.subtotal}</span><span>{formatCurrency(viewSale.subtotal)}</span></div>
                {viewSale.discount > 0 && <div className="flex justify-between text-[var(--c-success)]"><span>{t.sales.discount}</span><span>-{formatCurrency(viewSale.discount)}</span></div>}
                {viewSale.tax > 0 && <div className="flex justify-between"><span>{t.sales.tax}</span><span>{formatCurrency(viewSale.tax)}</span></div>}
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>{t.sales.total}</span>
                  <span>{formatCurrency(viewSale.total)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{t.sales.amount_paid}</span>
                  <span>{formatCurrency(viewSale.amount_paid)}</span>
                </div>
                {viewSale.change_amount > 0 && (
                  <div className="flex justify-between text-[var(--c-success)]">
                    <span>{t.sales.change}</span>
                    <span>{formatCurrency(viewSale.change_amount)}</span>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {/* ── Cancel Confirmation Dialog ─────────────────────────── */}
      <Dialog
        open={!!cancelingSale}
        onOpenChange={(v) => { if (!cancelMutation.isPending) { if (!v) setCancelingSale(null); } }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Cancel this sale?
            </DialogTitle>
            <DialogDescription className="pt-1">
              This will mark <strong>{cancelingSale?.invoice_number}</strong> as cancelled
              and restore stock for all items sold. This action is recorded in the audit
              log and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sales-cancel-reason">
              Reason
            </Label>
            <Textarea
              id="sales-cancel-reason"
              rows={3}
              placeholder="e.g. Duplicate sale entered by mistake"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              disabled={cancelMutation.isPending}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setCancelingSale(null)} disabled={cancelMutation.isPending}>
              Keep sale
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending || cancelReason.trim().length < 3}
              onClick={() => cancelingSale && cancelMutation.mutate({ saleId: cancelingSale.id, reason: cancelReason })}
            >
              {cancelMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelling…</>
              ) : (
                <><XCircle className="h-4 w-4 mr-1.5" />Confirm cancellation</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
