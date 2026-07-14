'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowRight, CheckCircle, XCircle, Clock } from 'lucide-react';
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
import { useAuthStore } from '@/store';
import type { WarehouseTransfer, Warehouse, Product } from '@/types';

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
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    from_warehouse_id: '',
    to_warehouse_id: '',
    product_id: '',
    quantity: '',
    notes: '',
  });

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
      setFormData({ from_warehouse_id: '', to_warehouse_id: '', product_id: '', quantity: '', notes: '' });
      toast.success('Transfer created successfully');
    },
    onError: () => toast.error('Failed to create transfer'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'received' | 'cancelled' }) =>
      updateTransferStatus(id, status, user?.id || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      toast.success('Transfer updated successfully');
    },
    onError: () => toast.error('Failed to update transfer'),
  });

  const handleCreate = () => {
    if (!user) return;
    if (!formData.from_warehouse_id || !formData.to_warehouse_id || !formData.product_id) {
      toast.error('Please fill all required fields');
      return;
    }
    if (formData.from_warehouse_id === formData.to_warehouse_id) {
      toast.error('From and To warehouses must be different');
      return;
    }
    const qty = parseInt(formData.quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Enter a valid quantity');
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
    });
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

  const pendingCount = transfers.filter((t) => t.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Warehouse Transfers</h1>
          <p className="text-muted-foreground text-sm">
            {pendingCount} pending transfer{pendingCount !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Transfer
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Sent By</TableHead>
                <TableHead>Received By</TableHead>
                <TableHead>Date Sent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                    No transfers found
                  </TableCell>
                </TableRow>
              ) : (
                transfers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{(t.product as { name?: string } | null)?.name}</p>
                        <p className="text-xs text-muted-foreground">{(t.product as { sku?: string } | null)?.sku}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{(t.from_warehouse as { name?: string } | null)?.name}</TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        {(t.to_warehouse as { name?: string } | null)?.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold">{t.quantity}</TableCell>
                    <TableCell className="text-sm">{(t.sender as { full_name?: string } | null)?.full_name}</TableCell>
                    <TableCell className="text-sm">{(t.receiver as { full_name?: string } | null)?.full_name || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(t.date_sent)}</TableCell>
                    <TableCell>{statusBadge(t.status)}</TableCell>
                    <TableCell className="text-right">
                      {t.status === 'pending' && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-green-600 border-green-200"
                            onClick={() => updateMutation.mutate({ id: t.id, status: 'received' })}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" /> Receive
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-600 border-red-200"
                            onClick={() => updateMutation.mutate({ id: t.id, status: 'cancelled' })}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
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
            <DialogTitle>Create Warehouse Transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Warehouse *</Label>
                <Select onValueChange={(v) => setFormData({ ...formData, from_warehouse_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w: Warehouse) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>To Warehouse *</Label>
                <Select onValueChange={(v) => setFormData({ ...formData, to_warehouse_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
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
              <Label>Product *</Label>
              <Select onValueChange={(v) => setFormData({ ...formData, product_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p: Product) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="Enter quantity"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder="Optional notes..."
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleCreate} disabled={createMutation.isPending}>
                Create Transfer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
