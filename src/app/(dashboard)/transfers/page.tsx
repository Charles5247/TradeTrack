'use client';
import { TranslatedText, useCopy } from '@/i18n/text';


import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowRight, CheckCircle, XCircle, Clock, Printer, Download, Loader2, Usb, Bluetooth, Receipt as ReceiptIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/ui/error-state';
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
  from_warehouse_id: string;
  to_warehouse_id: string;
  product_id: string;
  quantity: number;
  notes?: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('request_warehouse_transfer' as never, {
    p_from: payload.from_warehouse_id, p_to: payload.to_warehouse_id,
    p_product: payload.product_id, p_quantity: payload.quantity, p_notes: payload.notes || null,
  } as never);
  if (error) throw error;
  return data;
}

async function decideTransfer(id: string, approve: boolean) {
  const supabase = createClient();
  const { error } = await supabase.rpc('decide_warehouse_transfer' as never,
    { p_id: id, p_approve: approve, p_reason: approve ? null : 'Declined by merchant' } as never);
  if (error) throw error;
}

async function receiveTransfer(id: string, quantity: number, note: string) {
  const { error } = await createClient().rpc('receive_warehouse_transfer' as never,
    { p_id: id, p_quantity: quantity, p_note: note || null } as never);
  if (error) throw error;
}

export default function TransfersPage() {
  return (
    <AccessGuard allow={['business_owner', 'admin', 'cashier']}>
      <TransfersPageInner />
    </AccessGuard>
  );
}

function TransfersPageInner() {
  const copy = useCopy();
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
  });
  const [receiptTransfer, setReceiptTransfer] = useState<WarehouseTransfer | null>(null);
  const [receivingTransfer, setReceivingTransfer] = useState<WarehouseTransfer | null>(null);
  const [receivedCount, setReceivedCount] = useState('');
  const [receivingNote, setReceivingNote] = useState('');

  const { data: transfers = [], isLoading, error: pageError, refetch: retryPage } = useQuery({
    queryKey: ['transfers'],
    queryFn: fetchTransfers,
  });

  const { data: { warehouses = [], products = [] } = {} } = useQuery({
    queryKey: ['warehouses-products'],
    queryFn: fetchWarehousesAndProducts,
  });
  const { data: assignedWarehouses = [] } = useQuery({
    queryKey: ['transfer-assigned-warehouses', user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await createClient().from('warehouse_staff').select('warehouse_id').eq('user_id', user!.id);
      if (error) throw error;
      return (data || []).map(row => row.warehouse_id);
    },
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
      });
      toast.success(t.transfers.created_success);
    },
    onError: error => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => decideTransfer(id, approve),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      toast.success(t.transfers.updated_success);
    },
    onError: error => toast.error(error.message),
  });
  const receiveMutation = useMutation({
    mutationFn: () => receiveTransfer(receivingTransfer!.id, Number(receivedCount), receivingNote),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['transfers'] }); setReceivingTransfer(null); toast.success('Receiving count recorded'); },
    onError: error => toast.error(error.message),
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
      from_warehouse_id: formData.from_warehouse_id,
      to_warehouse_id: formData.to_warehouse_id,
      product_id: formData.product_id,
      quantity: qty,
      notes: formData.notes,
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
      authorized: { icon: Clock, variant: 'info' },
      received: { icon: CheckCircle, variant: 'success' },
      rejected: { icon: XCircle, variant: 'destructive' },
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
      {pageError && <ErrorState title={copy("Could not load this page")} body={pageError.message} onRetry={() => retryPage()} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="tt-page-title">{t.transfers.title}</h1>
          <p className="tt-muted text-sm">
            {t.transfers.subtitle_pending.replace('{count}', String(pendingCount))}
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t.transfers.new_transfer}
        </Button>
      </div>

      <Card>
        <CardContent className="min-w-0 overflow-hidden p-0">
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
                  <TableCell colSpan={9} className="h-32 text-center tt-muted">
                    {t.transfers.no_transfers}
                  </TableCell>
                </TableRow>
              ) : (
                transfers.map((tr) => (
                  <TableRow key={tr.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{(tr.product as { name?: string } | null)?.name}</p>
                        <p className="text-xs tt-muted">{(tr.product as { sku?: string } | null)?.sku}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{(tr.from_warehouse as { name?: string } | null)?.name}</TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1">
                        <ArrowRight className="h-3 w-3 tt-muted" />
                        {(tr.to_warehouse as { name?: string } | null)?.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold">{tr.received_quantity == null ? tr.quantity : `${tr.received_quantity} / ${tr.quantity}`}</TableCell>
                    <TableCell className="text-sm">{(tr.sender as { full_name?: string } | null)?.full_name}</TableCell>
                    <TableCell className="text-sm">{(tr.receiver as { full_name?: string } | null)?.full_name || '—'}</TableCell>
                    <TableCell className="text-xs tt-muted">{formatDateTime(tr.date_sent)}</TableCell>
                    <TableCell>{statusBadge(tr.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11 sm:min-h-8 text-xs"
                          onClick={() => setReceiptTransfer(tr)}
                          title={t.transfers.view_receipt}
                        >
                          <ReceiptIcon className="h-3 w-3 mr-1" /> {t.transfers.view_receipt}
                        </Button>
                        {tr.status === 'pending' && user?.role === 'business_owner' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-11 sm:min-h-8 text-xs text-[var(--c-success)] border-[var(--c-success)]"
                              disabled={updateMutation.isPending}
                              onClick={() => updateMutation.mutate({ id: tr.id, approve: true })}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-11 sm:min-h-8 text-xs text-[var(--c-danger)] border-[var(--c-danger)]"
                              disabled={updateMutation.isPending}
                              onClick={() => updateMutation.mutate({ id: tr.id, approve: false })}
                            >
                              Decline
                            </Button>
                          </>
                        )}
                        {tr.status === 'authorized' && (user?.role === 'business_owner' || assignedWarehouses.includes(tr.to_warehouse_id)) && <Button size="sm" variant="outline" onClick={() => { setReceivingTransfer(tr); setReceivedCount(String(tr.quantity)); setReceivingNote(''); }}>Confirm receipt</Button>}
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
        <DialogContent className="w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.transfers.create_dialog_title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.transfers.from_warehouse}</Label>
                <Select onValueChange={(v) => setFormData({ ...formData, from_warehouse_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.transfers.select_placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.filter((w: Warehouse) => user?.role === 'business_owner' || assignedWarehouses.includes(w.id)).map((w: Warehouse) => (
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
                Request merchant approval
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receivingTransfer} onOpenChange={open => !open && setReceivingTransfer(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirm receiving warehouse count</DialogTitle></DialogHeader>
          <p className="text-sm tt-muted">Expected: {receivingTransfer?.quantity} unit(s). Enter the number physically received. This can be submitted once.</p>
          <div className="space-y-2"><Label htmlFor="received-count">Quantity received</Label><Input id="received-count" type="number" min="0" max={receivingTransfer?.quantity} step="1" value={receivedCount} onChange={event => setReceivedCount(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="receiving-note">Note for any difference</Label><Textarea id="receiving-note" value={receivingNote} onChange={event => setReceivingNote(event.target.value)} /></div>
          <Button disabled={receiveMutation.isPending || receivedCount.trim()==='' || !Number.isInteger(Number(receivedCount))} onClick={() => receiveMutation.mutate()}>Confirm and add received stock</Button>
        </DialogContent>
      </Dialog>

      {/* Transfer Receipt Dialog — "Stock Transfer Note" preview + print/PDF/hardware actions */}
      <Dialog open={!!receiptTransfer} onOpenChange={(open) => !open && setReceiptTransfer(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto max-w-sm no-print">
          <DialogHeader>
            <DialogTitle>{t.transfers.transfer_note_title}</DialogTitle>
          </DialogHeader>
          {receiptData && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-medium">{receiptData.transferRef}</p>
                <p className="tt-muted">
                  {receiptData.fromWarehouse} <ArrowRight className="inline h-3 w-3" /> {receiptData.toWarehouse}
                </p>
                <p className="tt-muted">{receiptData.productName}{" "}<TranslatedText text={"&times;"} />{" "}{receiptData.quantity}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleBrowserPrintTransfer}>
                  <Printer className="h-4 w-4 mr-2" />
                  {t.common.print}
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleDownloadTransferPDF}>
                  <Download className="h-4 w-4 mr-2" /><TranslatedText text={"PDF"} /></Button>
              </div>
              {(printer.usbSupported || printer.bluetoothSupported) && (
                <div className="border rounded-lg p-3 bg-muted/30">
                  {printer.isConnected ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        {printer.transport === 'usb' ? (
                          <Usb className="h-4 w-4 shrink-0 text-[var(--c-success)]" />
                        ) : (
                          <Bluetooth className="h-4 w-4 shrink-0 text-[var(--c-success)]" />
                        )}
                        <span className="truncate">{printer.deviceName}</span>
                      </div>
                      <Button size="sm" onClick={handleHardwarePrintTransfer} disabled={printer.status === 'printing'}>
                        {printer.status === 'printing' ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Printer className="h-4 w-4 mr-1.5" />
                        )}<TranslatedText text={"Print to device"} /></Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {printer.usbSupported && (
                        <Button size="sm" variant="outline" className="flex-1" onClick={printer.connectUsb}>
                          <Usb className="h-4 w-4 mr-1.5" />{" "}<TranslatedText text={"USB"} /></Button>
                      )}
                      {printer.bluetoothSupported && (
                        <Button size="sm" variant="outline" className="flex-1" onClick={printer.connectBluetooth}>
                          <Bluetooth className="h-4 w-4 mr-1.5" />{" "}<TranslatedText text={"Bluetooth"} /></Button>
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
