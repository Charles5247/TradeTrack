'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, AlertTriangle, XCircle, TrendingUp, TrendingDown, Plus, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import { useAuthStore } from '@/store';
import type { Warehouse } from '@/types';

async function fetchInventory(warehouseId: string, filter: string, search: string) {
  const supabase = createClient();
  let query = supabase
    .from('inventory')
    .select(`
      *,
      product:products(id, name, sku, barcode, selling_price, cost_price, image_url, status),
      warehouse:warehouses(name)
    `)
    .order('updated_at', { ascending: false });

  if (warehouseId && warehouseId !== 'all') {
    query = query.eq('warehouse_id', warehouseId);
  }
  if (filter === 'low') {
    query = query.filter('quantity', 'gt', 0).filter('quantity', 'lt', 10);
  } else if (filter === 'out') {
    query = query.eq('quantity', 0);
  }

  const { data, error } = await query;
  if (error) throw error;

  const items = data || [];
  if (search) {
    return items.filter((i: Record<string, unknown>) => {
      const product = i.product as { name?: string; sku?: string } | null;
      return product?.name?.toLowerCase().includes(search.toLowerCase()) ||
             product?.sku?.toLowerCase().includes(search.toLowerCase());
    });
  }
  return items;
}

async function adjustStock(payload: {
  organization_id: string;
  user_id: string;
  product_id: string;
  warehouse_id: string;
  quantity_change: number;
  movement_type: 'in' | 'out' | 'adjustment';
  notes?: string;
  reason?: string;
}) {
  const supabase = createClient();

  const { data: inv } = await supabase
    .from('inventory')
    .select('id, quantity')
    .eq('product_id', payload.product_id)
    .eq('warehouse_id', payload.warehouse_id)
    .single();

  const oldQty = inv?.quantity || 0;
  const newQty = Math.max(0, oldQty + payload.quantity_change);

  if (inv) {
    await supabase
      .from('inventory')
      .update({ quantity: newQty })
      .eq('id', inv.id);
  } else {
    await supabase.from('inventory').insert({
      organization_id: payload.organization_id,
      product_id: payload.product_id,
      warehouse_id: payload.warehouse_id,
      quantity: Math.max(0, payload.quantity_change),
      min_stock_level: 5,
    });
  }

  // Record movement
  await supabase.from('inventory_movements').insert({
    organization_id: payload.organization_id,
    product_id: payload.product_id,
    warehouse_id: payload.warehouse_id,
    movement_type: payload.movement_type,
    quantity: payload.quantity_change,
    notes: payload.notes,
    created_by: payload.user_id,
  });

  // Audit log
  await supabase.from('audit_logs').insert({
    organization_id: payload.organization_id,
    user_id: payload.user_id,
    action: 'ADJUST_STOCK',
    resource_type: 'inventory',
    resource_id: payload.product_id,
    old_values: { quantity: oldQty },
    new_values: { quantity: newQty },
    reason: payload.reason,
  });
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [adjustDialog, setAdjustDialog] = useState<Record<string, unknown> | null>(null);
  const [adjustType, setAdjustType] = useState<'in' | 'out' | 'adjustment'>('in');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase.from('warehouses').select('*').order('name');
      return data as Warehouse[] || [];
    },
  });

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['inventory', warehouseFilter, statusFilter, search],
    queryFn: () => fetchInventory(warehouseFilter, statusFilter, search),
  });

  const adjustMutation = useMutation({
    mutationFn: adjustStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setAdjustDialog(null);
      setAdjustQty('');
      setAdjustNotes('');
      toast.success('Stock adjusted successfully');
    },
    onError: () => toast.error('Failed to adjust stock'),
  });

  const handleAdjust = () => {
    if (!adjustDialog || !user) return;
    const qty = parseInt(adjustQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    const change = adjustType === 'out' ? -qty : qty;
    const product = adjustDialog.product as { id: string } | null;
    adjustMutation.mutate({
      organization_id: (user as unknown as {organization_id: string}).organization_id,
      user_id: user.id,
      product_id: String(product?.id),
      warehouse_id: String(adjustDialog.warehouse_id),
      quantity_change: change,
      movement_type: adjustType,
      notes: adjustNotes,
      reason: adjustReason,
    });
  };

  const getStockBadge = (qty: number, min: number) => {
    if (qty === 0) return <Badge variant="destructive">Out of Stock</Badge>;
    if (qty <= min) return <Badge variant="warning">Low Stock</Badge>;
    return <Badge variant="success">In Stock</Badge>;
  };

  const stats = {
    total: inventory.length,
    inStock: inventory.filter((i: {quantity: number}) => i.quantity > 0).length,
    low: inventory.filter((i: {quantity: number; min_stock_level: number}) => i.quantity > 0 && i.quantity <= i.min_stock_level).length,
    out: inventory.filter((i: {quantity: number}) => i.quantity === 0).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground text-sm">Track stock levels across all warehouses</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="h-8 w-8 text-blue-600 bg-blue-100 dark:bg-blue-900/30 rounded-lg p-1.5" />
            <div>
              <p className="text-sm text-muted-foreground">Total Items</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-green-600 bg-green-100 dark:bg-green-900/30 rounded-lg p-1.5" />
            <div>
              <p className="text-sm text-muted-foreground">In Stock</p>
              <p className="text-2xl font-bold text-green-600">{stats.inStock}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-amber-600 bg-amber-100 dark:bg-amber-900/30 rounded-lg p-1.5" />
            <div>
              <p className="text-sm text-muted-foreground">Low Stock</p>
              <p className="text-2xl font-bold text-amber-600">{stats.low}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-600 bg-red-100 dark:bg-red-900/30 rounded-lg p-1.5" />
            <div>
              <p className="text-sm text-muted-foreground">Out of Stock</p>
              <p className="text-2xl font-bold text-red-600">{stats.out}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search product..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-60"
        />
        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {warehouses.map((w: Warehouse) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="out">Out of Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Min Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(8)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : inventory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No inventory records found
                  </TableCell>
                </TableRow>
              ) : (
                inventory.map((item: Record<string, unknown>) => {
                  const product = item.product as { id: string; name: string; sku: string } | null;
                  const warehouse = item.warehouse as { name: string } | null;
                  const qty = Number(item.quantity);
                  const minStock = Number(item.min_stock_level);
                  return (
                    <TableRow key={String(item.id)} className={qty === 0 ? 'bg-red-50 dark:bg-red-950/20' : qty <= minStock ? 'bg-amber-50 dark:bg-amber-950/20' : ''}>
                      <TableCell className="font-medium">{product?.name}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{product?.sku}</code></TableCell>
                      <TableCell>{warehouse?.name}</TableCell>
                      <TableCell>
                        <span className={`font-bold ${qty === 0 ? 'text-red-600' : qty <= minStock ? 'text-amber-600' : 'text-green-600'}`}>
                          {qty}
                        </span>
                      </TableCell>
                      <TableCell>{minStock}</TableCell>
                      <TableCell>{getStockBadge(qty, minStock)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.updated_at ? formatDateTime(String(item.updated_at)) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-green-600 border-green-200"
                            onClick={() => { setAdjustDialog(item); setAdjustType('in'); }}
                          >
                            <TrendingUp className="h-3 w-3 mr-1" /> Stock In
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-red-600 border-red-200"
                            onClick={() => { setAdjustDialog(item); setAdjustType('out'); }}
                          >
                            <TrendingDown className="h-3 w-3 mr-1" /> Out
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Adjust Dialog */}
      <Dialog open={!!adjustDialog} onOpenChange={() => setAdjustDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustType === 'in' ? 'Stock In' : adjustType === 'out' ? 'Stock Out' : 'Adjust Stock'}
            </DialogTitle>
          </DialogHeader>
          {adjustDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Product: <span className="font-medium text-foreground">
                  {(adjustDialog.product as {name: string} | null)?.name}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Current Stock: <span className="font-medium text-foreground">{String(adjustDialog.quantity)}</span>
              </p>
              <div className="space-y-2">
                <Label>Movement Type</Label>
                <Select value={adjustType} onValueChange={(v) => setAdjustType(v as typeof adjustType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Stock In (+)</SelectItem>
                    <SelectItem value="out">Stock Out (-)</SelectItem>
                    <SelectItem value="adjustment">Manual Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min="1"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  placeholder="Enter quantity"
                />
              </div>
              <div className="space-y-2">
                <Label>Reason (required for audit)</Label>
                <Input
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g., New delivery, damaged goods"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  rows={2}
                  placeholder="Additional notes..."
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setAdjustDialog(null)}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleAdjust} disabled={adjustMutation.isPending}>
                  Confirm Adjustment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
