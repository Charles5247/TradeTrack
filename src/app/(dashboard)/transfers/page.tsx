'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowRight, CheckCircle, XCircle, Clock, Printer, Download, Loader2, Usb, Bluetooth, Receipt as ReceiptIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils/format';
import { useAuthStore, useOrgStore } from '@/store';
import type { WarehouseTransfer, Warehouse, Product } from '@/types';
import { useI18n } from '@/i18n';
import { AccessGuard } from '@/components/shared/access-guard';
import { buildTransferReceiptData, type TransferReceiptData } from '@/lib/receipt/build-transfer-receipt';
import { TransferReceipt } from '@/components/transfers/transfer-receipt';
import { downloadTransferReceiptPDF } from '@/lib/pdf/transfer-receipt-pdf';
import { usePrinter } from '@/hooks/use-printer';

async function fetchTransfers() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('warehouse_transfers')
    .select(`
      *,
      from_warehouse:warehouses!warehouse_transfers_from_warehouse_id_fkey(name),
      to_warehouse:warehouses!warehouse_transfers_to_warehouse_id_fkey(name),
      product:products(name, sku),
      sender:users!warehouse_transfers_sent_by_fkey(full_name),
      receiver:users!warehouse_transfers_received_by_fkey(full_name)
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any) as WarehouseTransfer[];
}

async function fetchWarehousesAndProducts() {
  const supabase = createClient();
  const [w, p] = await Promise.all([
    supabase.from('warehouses').select('*').order('name'),
    supabase.from('products').select('id, name, sku').eq('status', 'active').order('name'),
  ]);
  return { warehouses: (w.data || []) as Warehouse[], products: (p.data || []) as Product[] };
}

async function createTransfer(payload: {
  organization_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  product_id: string;
  quantity: number;
  notes?: string;
  sent_by: string;
  initiated_by?: string;
  approved_by?: string;
  coordinated_by?: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.from('warehouse_transfers').insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updateTransferStatus(id: string, status: 'received' | 'cancelled', userId: string) {
  const supabase = createClient();
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'received') {
    updates.received_by = userId;
    updates.date_received = new Date().toISOString();

    // Move inventory
    const { data: transfer } = await supabase
      .from('warehouse_transfers')
      .select('*')
      .eq('id', id)
      .single();

    if (transfer) {
      // Deduct from source
      const { data: srcInv } = await supabase
        .from('inventory')
        .select('quantity')
        .eq('product_id', transfer.product_id)
        .eq('warehouse_id', transfer.from_warehouse_id)
        .single();

      if (srcInv) {
        await supabase
          .from('inventory')
          .update({ quantity: Math.max(0, srcInv.quantity - transfer.quantity) })
          .eq('product_id', transfer.product_id)
          .eq('warehouse_id', transfer.from_warehouse_id);
      }

      // Add to destination
      const { data: dstInv } = await supabase
        .from('inventory')
        .select('quantity')
        .eq('product_id', transfer.product_id)
        .eq('warehouse_id', transfer.to_warehouse_id)
        .single();

      if (dstInv) {
        await supabase
          .from('inventory')
          .update({ quantity: dstInv.quantity + transfer.quantity })
          .eq('product_id', transfer.product_id)
          .eq('warehouse_id', transfer.to_warehouse_id);
      } else {
        await supabase.from('inventory').insert({
          organization_id: transfer.organization_id,
          product_id: transfer.product_id,
          warehouse_id: transfer.to_warehouse_id,
          quantity: transfer.quantity,
          min_stock_level: 5,
        });
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from('warehouse_transfers').update(updates as any).eq('id', id);
  if (error) throw error;
}

export default function TransfersPage() {
  return (
    <AccessGuard allow={['business_owner', 'admin']}>
      <TransfersPageInner />
    </AccessGuard>
  );
}

function TransfersPageInner() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { organizationName, organizationAddress, organizationPhone } = useOrgStore();
  const printer = usePrinter();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    from_warehouse_id: '',
    to_warehouse_id: '',
    product_id: '',
    quantity: '',
    notes: '',
    initiated_by: '',
    approved_by: '',
    coordinated_by: '',
  });
  const [receiptTransfer, setReceiptTransfer] = useState<WarehouseTransfer | null>(null);

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: fetchTransfers,
  });

  const { data: { warehouses = [], products = [] } = {} } = useQuery({
    queryKey: ['warehouses-products'],
    queryFn: fetchWarehousesAndProducts,
  });

  const createMutation = useMutation({
    mutationFn: createTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      setIsFormOpen(false);
      setFormData({
        from_warehouse_id: '',
        to_warehouse_id: '',
        product_id: '',
        quantity: '',
        notes: '',
        initiated_by: '',
        approved_by: '',
        coordinated_by: '',
      });
      toast.success(t.transfers.created_success);
    },
    onError: () => toast.error(t.transfers.create_failed),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'received' | 'cancelled' }) =>
      updateTransferStatus(id, status, user?.id || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      toast.success(t.transfers.updated_success);
    },
    onError: () => toast.error(t.transfers.update_failed),
  });

  const handleCreate = () => {
    if (!user) return;
    if (!formData.from_warehouse_id || !formData.to_warehouse_id || !formData.product_id) {
      toast.error(t.transfers.fill_required);
      return;
    }
    if (formData.from_warehouse_id === formData.to_warehouse_id) {
      toast.error(t.transfers.different_warehouses);
      return;
    }
    const qty = parseInt(formData.quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error(t.transfers.valid_quantity);
      return;
    }
    createMutation.mutate({
      organization_id: (user as unknown as { organization_id: string }).organization_id,
      from_warehouse_id: formData.from_warehouse_id,
      to_warehouse_id: formData.to_warehouse_id,
      product_id: formData.product_id,
      quantity: qty,
      notes: formData.notes,
      sent_by: user.id,
      initiated_by: formData.initiated_by.trim() || undefined,
      approved_by: formData.approved_by.trim() || undefined,
      coordinated_by: formData.coordinated_by.trim() || undefined,
    });
  };

  const getTransferReceiptData = (tr: WarehouseTransfer): TransferReceiptData =>
    buildTransferReceiptData({
      transfer: {
        id: tr.id,
        from_warehouse_id: tr.from_warehouse_id,
        to_warehouse_id: tr.to_warehouse_id,
        quantity: tr.quantity,
        status: tr.status,
        notes: tr.notes,
        date_sent: tr.date_sent,
        initiated_by: tr.initiated_by,
        approved_by: tr.approved_by,
        coordinated_by: tr.coordinated_by,
      },
      fromWarehouseName: (tr.from_warehouse as { name?: string } | null)?.name || '',
      toWarehouseName: (tr.to_warehouse as { name?: string } | null)?.name || '',
      productName: (tr.product as { name?: string } | null)?.name || '',
      productSku: (tr.product as { sku?: string } | null)?.sku,
      sentByName: (tr.sender as { full_name?: string } | null)?.full_name,
      receivedByName: (tr.receiver as { full_name?: string } | null)?.full_name,
      orgName: organizationName,
      orgAddress: organizationAddress || undefined,
      orgPhone: organizationPhone || undefined,
    });

  const receiptData = receiptTransfer ? getTransferReceiptData(receiptTransfer) : null;

  const handleBrowserPrintTransfer = () => {
    window.print();
  };

  const handleDownloadTransferPDF = () => {
    if (!receiptData) return;
    downloadTransferReceiptPDF(receiptData);
  };

  const handleHardwarePrintTransfer = async () => {
    if (!receiptData) return;
    const printed = await printer.printTransferReceipt(receiptData);
    if (!printed) {
      handleBrowserPrintTransfer();
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { icon: React.ElementType; variant: string }> = {
      pending: { icon: Clock, variant: 'warning' },
      received: { icon: CheckCircle, variant: 'success' },
      cancelled: { icon: XCircle, variant: 'destructive' },
    };
    const { icon: Icon, variant } = map[status] || map.pending;
    return (
      <Badge variant={variant as Parameters<typeof Badge>[0]['variant']} className="flex items-center gap-1 w-fit">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const pendingCount = transfers.filter((tr) => tr.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.transfers.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.transfers.subtitle_pending.replace('{count}', String(pendingCount))}
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t.transfers.new_transfer}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.transfers.product}</TableHead>
                <TableHead>{t.transfers.from}</TableHead>
                <TableHead>{t.transfers.to}</TableHead>
                <TableHead>{t.transfers.quantity}</TableHead>
                <TableHead>{t.transfers.sent_by}</TableHead>
                <TableHead>{t.transfers.received_by}</TableHead>
                <TableHead>{t.transfers.date_sent}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="text-right">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(9)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : transfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    {t.transfers.no_transfers}
                  </TableCell>
                </TableRow>
              ) : (
                transfers.map((tr) => (
                  <TableRow key={tr.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{(tr.product as { name?: string } | null)?.name}</p>
                        <p className="text-xs text-muted-foreground">{(tr.product as { sku?: string } | null)?.sku}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{(tr.from_warehouse as { name?: string } | null)?.name}</TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        {(tr.to_warehouse as { name?: string } | null)?.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold">{tr.quantity}</TableCell>
                    <TableCell className="text-sm">{(tr.sender as { full_name?: string } | null)?.full_name}</TableCell>
                    <TableCell className="text-sm">{(tr.receiver as { full_name?: string } | null)?.full_name || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(tr.date_sent)}</TableCell>
                    <TableCell>{statusBadge(tr.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setReceiptTransfer(tr)}
                          title={t.transfers.view_receipt}
                        >
                          <ReceiptIcon className="h-3 w-3 mr-1" /> {t.transfers.view_receipt}
                        </Button>
                        {tr.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-green-600 border-green-200"
                              onClick={() => updateMutation.mutate({ id: tr.id, status: 'received' })}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> {t.transfers.receive}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-red-600 border-red-200"
                              onClick={() => updateMutation.mutate({ id: tr.id, status: 'cancelled' })}
                            >
                              {t.transfers.cancel_action}
                            </Button>
                          </>
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

      {/* Create Transfer Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.transfers.create_dialog_title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.transfers.from_warehouse}</Label>
                <Select onValueChange={(v) => setFormData({ ...formData, from_warehouse_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.transfers.select_placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w: Warehouse) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.transfers.to_warehouse}</Label>
                <Select onValueChange={(v) => setFormData({ ...formData, to_warehouse_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.transfers.select_placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w: Warehouse) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.transfers.product_required}</Label>
              <Select onValueChange={(v) => setFormData({ ...formData, product_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t.transfers.select_product} />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p: Product) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.transfers.quantity_required}</Label>
              <Input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder={t.transfers.enter_quantity}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t.transfers.initiated_by}</Label>
                <Input
                  value={formData.initiated_by}
                  onChange={(e) => setFormData({ ...formData, initiated_by: e.target.value })}
                  placeholder={t.transfers.initiated_by_placeholder}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.transfers.approved_by}</Label>
                <Input
                  value={formData.approved_by}
                  onChange={(e) => setFormData({ ...formData, approved_by: e.target.value })}
                  placeholder={t.transfers.approved_by_placeholder}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.transfers.coordinated_by}</Label>
                <Input
                  value={formData.coordinated_by}
                  onChange={(e) => setFormData({ ...formData, coordinated_by: e.target.value })}
                  placeholder={t.transfers.coordinated_by_placeholder}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.transfers.notes}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder={t.transfers.notes_placeholder}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIsFormOpen(false)}>
                {t.transfers.cancel}
              </Button>
              <Button className="flex-1" onClick={handleCreate} disabled={createMutation.isPending}>
                {t.transfers.create_transfer}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Receipt Dialog — "Stock Transfer Note" preview + print/PDF/hardware actions */}
      <Dialog open={!!receiptTransfer} onOpenChange={(open) => !open && setReceiptTransfer(null)}>
        <DialogContent className="max-w-sm no-print">
          <DialogHeader>
            <DialogTitle>{t.transfers.transfer_note_title}</DialogTitle>
          </DialogHeader>
          {receiptData && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-medium">{receiptData.transferRef}</p>
                <p className="text-muted-foreground">
                  {receiptData.fromWarehouse} <ArrowRight className="inline h-3 w-3" /> {receiptData.toWarehouse}
                </p>
                <p className="text-muted-foreground">{receiptData.productName} &times; {receiptData.quantity}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleBrowserPrintTransfer}>
                  <Printer className="h-4 w-4 mr-2" />
                  {t.common.print}
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleDownloadTransferPDF}>
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </div>
              {(printer.usbSupported || printer.bluetoothSupported) && (
                <div className="border rounded-lg p-3 bg-muted/30">
                  {printer.isConnected ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        {printer.transport === 'usb' ? (
                          <Usb className="h-4 w-4 shrink-0 text-green-600" />
                        ) : (
                          <Bluetooth className="h-4 w-4 shrink-0 text-green-600" />
                        )}
                        <span className="truncate">{printer.deviceName}</span>
                      </div>
                      <Button size="sm" onClick={handleHardwarePrintTransfer} disabled={printer.status === 'printing'}>
                        {printer.status === 'printing' ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Printer className="h-4 w-4 mr-1.5" />
                        )}
                        Print to device
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {printer.usbSupported && (
                        <Button size="sm" variant="outline" className="flex-1" onClick={printer.connectUsb}>
                          <Usb className="h-4 w-4 mr-1.5" /> USB
                        </Button>
                      )}
                      {printer.bluetoothSupported && (
                        <Button size="sm" variant="outline" className="flex-1" onClick={printer.connectBluetooth}>
                          <Bluetooth className="h-4 w-4 mr-1.5" /> Bluetooth
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Print-only transfer receipt — hidden on screen (see globals.css
          @media print rules), rendered only when window.print() fires
          while receiptData is set. */}
      {receiptData && <TransferReceipt data={receiptData} />}
    </div>
  );
}
