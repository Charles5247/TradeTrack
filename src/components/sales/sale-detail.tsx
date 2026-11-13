'use client';
import { TranslatedText, useCopy } from '@/i18n/text';

import React, { useState } from 'react';
import Link from 'next/link';
import type { Sale } from '@/types';
type SaleRecordData = Omit<Sale, 'cashier' | 'warehouse' | 'items'> & {
  cashier: { full_name: string } | null;
  warehouse: { name: string } | null;
  items: {
    id: string;
    product_name_snapshot: string | null;
    quantity: number;
    unit_price: number;
    total: number;
    product: { name: string; sku: string } | null;
  }[];
};
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { createClient } from '@/lib/supabase/client';
import { AccessGuard } from '@/components/shared/access-guard';
import { DetailTemplate } from '@/components/ui/detail-template';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import { toast } from 'sonner';
import { XCircle, Loader2, AlertTriangle } from 'lucide-react';

export function SaleDetail({ id }: { id: string }) {
  return (
    <AccessGuard allow={['business_owner', 'admin', 'cashier']}>
      <SaleRecord id={id} />
    </AccessGuard>
  );
}

function statusVariant(status: string): Parameters<typeof Badge>[0]['variant'] {
  const map: Record<string, Parameters<typeof Badge>[0]['variant']> = {
    completed: 'success',
    cancelled: 'destructive',
    refunded: 'info',
    pending: 'warning',
  };
  return map[status] ?? 'outline';
}

function SaleRecord({ id }: { id: string }) {
  const copy = useCopy();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const canCancel =
    user?.role === 'business_owner' || user?.role === 'admin';

  const query = useQuery({
    queryKey: ['sale-detail', user?.organization_id, id],
    enabled: Boolean(user?.organization_id),
    queryFn: async () => {
      const client = createClient();
      const fetchDetail = (items: string) => client.from('sales')
        .select(`*, cashier:users!sales_cashier_id_fkey(full_name), warehouse:warehouses(name), items:sale_items(${items}), financial_reversals(kind)`)
        .eq('organization_id', user!.organization_id!).eq('id', id).single();
      let { data, error } = await fetchDetail('id, quantity, unit_price, total, product_name_snapshot, product:products(name, sku)');
      if (error?.code === '42703' && error.message.includes('product_name_snapshot')) {
        ({ data, error } = await fetchDetail('id, quantity, unit_price, total, product:products(name, sku)'));
      }
      if (error) throw error;
      const sale = data as unknown as SaleRecordData & { financial_reversals?: { kind: string }[] };
      const reversal = sale.financial_reversals?.find((entry) => ['void', 'refund', 'return'].includes(entry.kind));
      return reversal ? { ...sale, status: reversal.kind === 'void' ? 'cancelled' : 'refunded' } as SaleRecordData : sale;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await fetch(`/api/sales/${id}/cancel`, {
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
      setCancelOpen(false);
      setCancelReason('');
      void queryClient.invalidateQueries({ queryKey: ['sale-detail', user?.organization_id, id] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError || !query.data)
    return (
      <ErrorState
        title={copy('Sale unavailable')}
        body={copy(
          'This sale could not be loaded. Check your connection and access, then try again.',
        )}
        onRetry={() => void query.refetch()}
      />
    );

  const sale = query.data;
  const isCancellable = sale.status === 'completed';

  return (
    <>
      <DetailTemplate
        title={sale.invoice_number}
        subtitle={formatDateTime(sale.created_at)}
        statusBadge={
          <Badge variant={statusVariant(sale.status)}>{sale.status}</Badge>
        }
        secondary={
          <div className="flex flex-wrap gap-2">
            {/* Cancel / Reverse button — only for admin/owner on completed sales */}
            {canCancel && isCancellable && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setCancelOpen(true)}
              >
                <XCircle className="h-4 w-4 mr-1.5" strokeWidth={1.75} />
                <TranslatedText text="Cancel sale" />
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/sales">
                <TranslatedText text="Back to sales" />
              </Link>
            </Button>
          </div>
        }
        meta={[
          { label: 'Customer', value: sale.customer_name || 'Walk-in customer' },
          { label: 'Cashier', value: sale.cashier?.full_name || '—' },
          { label: 'Warehouse', value: sale.warehouse?.name || '—' },
        ]}
        overviewCards={[
          { label: 'Total', value: formatCurrency(sale.total) },
          { label: 'Paid', value: formatCurrency(sale.amount_paid) },
          { label: 'Change', value: formatCurrency(sale.change_amount) },
        ]}
        mainContent={
          <Card>
            <CardHeader>
              <CardTitle>
                <TranslatedText text="Items sold" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <TranslatedText text="Product" />
                    </TableHead>
                    <TableHead>
                      <TranslatedText text="Qty" />
                    </TableHead>
                    <TableHead>
                      <TranslatedText text="Price" />
                    </TableHead>
                    <TableHead>
                      <TranslatedText text="Total" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.product_name_snapshot || item.product?.name || 'Product unavailable'}
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{formatCurrency(item.unit_price)}</TableCell>
                      <TableCell>{formatCurrency(item.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        }
        sideContent={
          <Card>
            <CardHeader>
              <CardTitle>
                <TranslatedText text="Payment summary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 tt-tabular">
              {(
                [
                  ['Subtotal', formatCurrency(sale.subtotal)],
                  ['Discount', formatCurrency(sale.discount)],
                  ['Tax', formatCurrency(sale.tax)],
                  ['Payment', sale.payment_method.replaceAll('_', ' ')],
                  ['Status', sale.status],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium capitalize">{value}</span>
                </div>
              ))}
              {sale.notes && (
                <div className="pt-2 border-t text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Note: </span>
                  {sale.notes}
                </div>
              )}
            </CardContent>
          </Card>
        }
      />

      {/* ── Cancel Confirmation Dialog ─────────────────────────── */}
      <Dialog open={cancelOpen} onOpenChange={(v) => { if (!cancelMutation.isPending) setCancelOpen(v); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <TranslatedText text="Cancel this sale?" />
            </DialogTitle>
            <DialogDescription className="pt-1 space-y-1">
              <span className="block">
                <TranslatedText text="This will mark" />{' '}
                <strong>{sale.invoice_number}</strong>{' '}
                <TranslatedText text="as cancelled and restore stock for all" />{' '}
                {sale.items.length}{' '}
                <TranslatedText text="item(s). This action is recorded in the audit log and cannot be undone." />
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="cancel-reason">
              <TranslatedText text="Reason for cancellation" />{' '}
              <span className="text-muted-foreground text-xs">
                <TranslatedText text="required" />
              </span>
            </Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              placeholder="e.g. Duplicate sale entered by mistake"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              disabled={cancelMutation.isPending}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setCancelOpen(false)}
              disabled={cancelMutation.isPending}
            >
              <TranslatedText text="Keep sale" />
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending || cancelReason.trim().length < 3}
              onClick={() => cancelMutation.mutate(cancelReason)}
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  <TranslatedText text="Cancelling…" />
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-1.5" />
                  <TranslatedText text="Confirm cancellation" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
