'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, AlertTriangle, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { StatCard } from '@/components/ui/stat-card';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils/format';

import { useAuthStore } from '@/store';
import type { Warehouse } from '@/types';
import { AccessGuard } from '@/components/shared/access-guard';
import { useI18n } from '@/i18n';
import { recordInventoryAdjustment, type InventoryAdjustmentPayload } from '@/lib/offline/inventory-adjustment';


import { CheckoutRecovery } from '@/components/inventory/checkout-recovery';
import { AdjustmentRecovery } from '@/components/inventory/adjustment-recovery';

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

async function adjustStock(payload: InventoryAdjustmentPayload) {
  return recordInventoryAdjustment(payload);
}

export default function InventoryPage() {
  return (
    <AccessGuard allow={['business_owner', 'admin']}>
      <InventoryPageInner />
    </AccessGuard>
  );
}

function InventoryPageInner() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  useEffect(() => { setWarehouseFilter(new URLSearchParams(window.location.search).get('warehouse') || 'all'); }, []);
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
    networkMode: 'always',
    mutationFn: adjustStock,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setAdjustDialog(null);
      setAdjustQty('');
      setAdjustNotes('');
      if (result?.offline) {
        toast.success(t.inventory.adjusted_success, {
          description: 'Saved offline — will sync automatically once you\u2019re back online.',
        });
      } else {
        toast.success(t.inventory.adjusted_success);
      }
    },
    onError: () => toast.error(t.inventory.adjust_failed),
  });

  const handleAdjust = () => {
    if (!adjustDialog || !user) return;
    const qty = parseInt(adjustQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error(t.inventory.invalid_quantity);
      return;
    }
    const change = adjustType === 'out' ? -qty : qty;
    const product = adjustDialog.product as { id: string } | null;
    adjustMutation.mutate({
      organization_id: (user as unknown as { organization_id: string }).organization_id,
      user_id: user.id,
      product_id: String(product?.id),
      warehouse_id: String(adjustDialog.warehouse_id),
      inventory_id: adjustDialog.id ? String(adjustDialog.id) : undefined,
      current_quantity: Number(adjustDialog.quantity ?? 0),
      min_stock_level: Number(adjustDialog.min_stock_level ?? 5),
      quantity_change: change,
      movement_type: adjustType,
      notes: adjustNotes,
      reason: adjustReason,
    });
  };

  const getStockBadge = (qty: number, min: number) => {
    if (qty === 0) return <Badge variant="destructive">{t.inventory.out_of_stock}</Badge>;
    if (qty <= min) return <Badge variant="warning">{t.inventory.low_stock}</Badge>;
    return <Badge variant="success">{t.inventory.in_stock}</Badge>;
  };

  const stats = {
    total: inventory.length,
    inStock: inventory.filter((i: { quantity: number }) => i.quantity > 0).length,
    low: inventory.filter((i: { quantity: number; min_stock_level: number }) => i.quantity > 0 && i.quantity <= i.min_stock_level).length,
    out: inventory.filter((i: { quantity: number }) => i.quantity === 0).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="tt-page-title">{t.inventory.title}</h1>
          <p className="tt-muted text-sm mt-1">{t.inventory.subtitle}</p>
        </div>
        {process.env.NEXT_PUBLIC_STOCK_INTAKE_ENABLED==='true' && <Button asChild><Link href="/inventory/intake">Receive stock</Link></Button>}
      </div>

      <CheckoutRecovery />
      <AdjustmentRecovery />
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label={t.inventory.total_items}
          value={stats.total}
          icon={Package}
          loading={isLoading}
        />
        <StatCard
          label={t.inventory.in_stock}
          value={stats.inStock}
          icon={TrendingUp}
          loading={isLoading}
        />
        <StatCard
          label={t.inventory.low_stock}
          value={stats.low}
          icon={AlertTriangle}
          loading={isLoading}
        />
        <StatCard
          label={t.inventory.out_of_stock}
          value={stats.out}
          icon={XCircle}
          loading={isLoading}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={t.inventory.search_placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-60"
        />
        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t.inventory.all_warehouses} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.inventory.all_warehouses}</SelectItem>
            {warehouses.map((w: Warehouse) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t.inventory.all_stock} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.inventory.all_stock}</SelectItem>
            <SelectItem value="low">{t.inventory.low_stock}</SelectItem>
            <SelectItem value="out">{t.inventory.out_of_stock}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingState
          rows={6}
          columnLabels={[
            t.inventory.product,
            t.inventory.sku,
            t.inventory.warehouse,
            t.inventory.quantity,
            t.inventory.min_stock,
            t.common.status,
            t.inventory.last_updated,
            t.common.actions,
          ]}
        />
      ) : inventory.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={Package} title={t.inventory.no_inventory} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.inventory.product}</TableHead>
                  <TableHead>{t.inventory.sku}</TableHead>
                  <TableHead>{t.inventory.warehouse}</TableHead>
                  <TableHead>{t.inventory.quantity}</TableHead>
                  <TableHead>{t.inventory.min_stock}</TableHead>
                  <TableHead>{t.common.status}</TableHead>
                  <TableHead>{t.inventory.last_updated}</TableHead>
                  <TableHead className="text-right">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item: Record<string, unknown>) => {
                  const product = item.product as { id: string; name: string; sku: string } | null;
                  const warehouse = item.warehouse as { name: string } | null;
                  const qty = Number(item.quantity);
                  const minStock = Number(item.min_stock_level);
                  const rowTone =
                    qty === 0
                      ? 'var(--c-danger)'
                      : qty <= minStock
                        ? 'var(--c-warn)'
                        : null;
                  return (
                    <TableRow
                      key={String(item.id)}
                      style={
                        rowTone
                          ? { background: `color-mix(in oklch, ${rowTone}, transparent 94%)` }
                          : undefined
                      }
                    >
                      <TableCell className="font-medium">{product?.name}</TableCell>
                      <TableCell><code className="tt-mono text-xs bg-muted px-1.5 py-0.5 rounded">{product?.sku}</code></TableCell>
                      <TableCell>{warehouse?.name}</TableCell>
                      <TableCell>
                        <span
                          className="font-bold tt-tabular"
                          style={{ color: rowTone ?? 'var(--c-success)' }}
                        >
                          {qty}
                        </span>
                      </TableCell>
                      <TableCell className="tt-tabular">{minStock}</TableCell>
                      <TableCell>{getStockBadge(qty, minStock)}</TableCell>
                      <TableCell className="text-xs tt-muted">
                        {item.updated_at ? formatDateTime(String(item.updated_at)) : '\u2014'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            style={{ color: 'var(--c-success)', borderColor: 'color-mix(in oklch, var(--c-success), transparent 60%)' }}
                            onClick={() => { setAdjustDialog(item); setAdjustType('in'); }}
                          >
                            <TrendingUp className="h-3 w-3 mr-1" strokeWidth={1.75} /> {t.inventory.stock_in}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            style={{ color: 'var(--c-danger)', borderColor: 'color-mix(in oklch, var(--c-danger), transparent 60%)' }}
                            onClick={() => { setAdjustDialog(item); setAdjustType('out'); }}
                          >
                            <TrendingDown className="h-3 w-3 mr-1" strokeWidth={1.75} /> {t.inventory.stock_out}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Adjust Dialog */}
      <Dialog open={!!adjustDialog} onOpenChange={() => setAdjustDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustType === 'in' ? t.inventory.stock_in : adjustType === 'out' ? t.inventory.stock_out : t.inventory.adjust_stock}
            </DialogTitle>
          </DialogHeader>
          {adjustDialog && (
            <div className="space-y-4">
              <p className="text-sm tt-muted">
                {t.inventory.product_label} <span className="font-medium text-foreground">
                  {(adjustDialog.product as { name: string } | null)?.name}
                </span>
              </p>
              <p className="text-sm tt-muted">
                {t.inventory.current_stock_label} <span className="font-medium text-foreground tt-tabular">{String(adjustDialog.quantity)}</span>
              </p>
              <div className="space-y-2">
                <Label>{t.inventory.movement_type}</Label>
                <Select value={adjustType} onValueChange={(v) => setAdjustType(v as typeof adjustType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">{t.inventory.stock_in_plus}</SelectItem>
                    <SelectItem value="out">{t.inventory.stock_out_minus}</SelectItem>
                    <SelectItem value="adjustment">{t.inventory.manual_adjustment}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.inventory.quantity_required}</Label>
                <Input
                  type="number"
                  min="1"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  placeholder={t.inventory.enter_quantity}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.inventory.reason_required}</Label>
                <Input
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder={t.inventory.reason_placeholder}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.common.notes}</Label>
                <Textarea
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  rows={2}
                  placeholder={t.inventory.notes_placeholder}
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setAdjustDialog(null)}>
                  {t.common.cancel}
                </Button>
                <Button className="flex-1" onClick={handleAdjust} disabled={adjustMutation.isPending}>
                  {t.inventory.confirm_adjustment}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
