'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Download, Eye, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import type { Sale, SaleItem } from '@/types';

async function fetchSales(filters: {
  search: string;
  status: string;
  payment_method: string;
  start_date: string;
  end_date: string;
}) {
  const supabase = createClient();
  let query = supabase
    .from('sales')
    .select(`
      *,
      cashier:users(full_name),
      warehouse:warehouses(name),
      items:sale_items(
        id, quantity, unit_price, total,
        product:products(name, sku)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (filters.search) {
    query = query.or(
      `invoice_number.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%`
    );
  }
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.payment_method && filters.payment_method !== 'all') query = query.eq('payment_method', filters.payment_method);
  if (filters.start_date) query = query.gte('created_at', filters.start_date);
  if (filters.end_date) query = query.lte('created_at', filters.end_date + 'T23:59:59');

  const { data, error } = await query;
  if (error) throw error;
  return data as Sale[];
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

export default function SalesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales', search, status, paymentMethod, startDate, endDate],
    queryFn: () => fetchSales({ search, status, payment_method: paymentMethod, start_date: startDate, end_date: endDate }),
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales History</h1>
          <p className="text-muted-foreground text-sm">
            {sales.length} transactions · {formatCurrency(totalRevenue)} revenue
          </p>
        </div>
        <Button variant="outline" onClick={() => exportToCSV(sales)}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search invoice, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              className="w-60"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="pos_terminal">POS Terminal</SelectItem>
                <SelectItem value="split">Split</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" />
              <span className="text-muted-foreground text-sm">to</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(9)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="h-8 w-8 opacity-30" />
                      <p>No sales found</p>
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
                    <TableCell>{sale.customer_name || <span className="text-muted-foreground text-xs">Walk-in</span>}</TableCell>
                    <TableCell className="text-sm">{(sale.cashier as { full_name?: string } | null)?.full_name || '—'}</TableCell>
                    <TableCell>{(sale.items as SaleItem[] | undefined)?.length || 0} items</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(sale.total)}</TableCell>
                    <TableCell>{paymentBadge(sale.payment_method)}</TableCell>
                    <TableCell>{statusBadge(sale.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(sale.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => setViewSale(sale)}>
                        <Eye className="h-4 w-4" />
                      </Button>
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
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Sale Details - {viewSale.invoice_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{formatDateTime(viewSale.created_at)}</span></div>
                <div><span className="text-muted-foreground">Cashier:</span> <span className="font-medium">{(viewSale.cashier as { full_name?: string } | null)?.full_name}</span></div>
                <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{viewSale.customer_name || 'Walk-in'}</span></div>
                <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{viewSale.customer_phone || '—'}</span></div>
                <div><span className="text-muted-foreground">Payment:</span> <span className="font-medium capitalize">{viewSale.payment_method.replace('_', ' ')}</span></div>
                <div><span className="text-muted-foreground">Status:</span> {statusBadge(viewSale.status)}</div>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Total</TableHead>
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
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(viewSale.subtotal)}</span></div>
                {viewSale.discount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(viewSale.discount)}</span></div>}
                {viewSale.tax > 0 && <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(viewSale.tax)}</span></div>}
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(viewSale.total)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Amount Paid</span>
                  <span>{formatCurrency(viewSale.amount_paid)}</span>
                </div>
                {viewSale.change_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Change</span>
                    <span>{formatCurrency(viewSale.change_amount)}</span>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
