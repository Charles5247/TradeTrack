'use client';

/**
 * Purchase Orders — minimal Business-tier feature.
 *
 * Workflow: Create (draft) -> Send (sent) -> Receive (received) or
 * Cancel (cancelled). Receiving updates inventory using the SAME
 * read-qty -> upsert `inventory` -> insert `inventory_movements`
 * pattern already used inline in inventory/page.tsx's adjustStock(),
 * transfers/page.tsx's updateTransferStatus() and vendors/page.tsx's
 * createMutation — no new inventory-mutation mechanism is introduced.
 *
 * Explicitly out of scope for this version (see docs/ROADMAP.md):
 * partial receiving, PO approval workflows, PDF export, purchasing
 * analytics, supplier payment automation, complex procurement.
 *
 * Gated behind the `purchase_orders` Business-tier feature flag via
 * `hasFeature(plan, 'purchase_orders')`, per the pattern documented in
 * docs/SUBSCRIPTION_SYSTEM.md. Falls open (renders normally) if
 * subscription data cannot be loaded, matching this codebase's
 * offline-first "never block core work on a transient fetch" rule
 * used everywhere else feature/limit checks are read (see
 * product-form.tsx's canAddProduct() usage).
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  PackageCheck,
  Trash2,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils/format';
import { useAuthStore } from '@/store';
import type { PurchaseOrder, Supplier, Product, Warehouse } from '@/types';
import { useI18n } from '@/i18n';
import { AccessGuard } from '@/components/shared/access-guard';
import {
  hasFeature,
  resolveSubscriptionPlan,
  upgradePromptMessage,
  type PlanLike,
  type SubscriptionLike,
} from '@/lib/subscriptions/plan-limits';

// ── Data fetching ────────────────────────────────────────────

async function fetchPurchaseOrders() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(
      `
      *,
      supplier:suppliers(name, phone, email),
      creator:users!purchase_orders_created_by_fkey(full_name),
      receiver:users!purchase_orders_received_by_fkey(full_name),
      items:purchase_order_items(
        id, quantity_ordered, quantity_received, unit_cost,
        product:products(id, name, sku)
      )
    `,
    )
    .order('created_at', { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any) as PurchaseOrder[];
}

async function fetchSuppliersAndProducts() {
  const supabase = createClient();
  const [s, p, w] = await Promise.all([
    supabase.from('suppliers').select('*').order('name'),
    supabase
      .from('products')
      .select('id, name, sku, cost_price')
      .eq('status', 'active')
      .order('name'),
    supabase.from('warehouses').select('*').order('is_main', { ascending: false }),
  ]);
  return {
    suppliers: (s.data || []) as Supplier[],
    products: (p.data || []) as Product[],
    warehouses: (w.data || []) as Warehouse[],
  };
}

/** Fails open (returns null/allows) on any error — subscription checks
 *  must never block the page from rendering, matching the rest of the
 *  codebase's offline-first philosophy. */
async function fetchSubscriptionPlan(organizationId: string) {
  try {
    const supabase = createClient();
    const [{ data: subscription }, { data: allPlans }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('id, plan_id, status')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('subscription_plans').select('*'),
    ]);
    return resolveSubscriptionPlan(
      subscription as SubscriptionLike | null,
      (allPlans as unknown as PlanLike[]) || [],
    );
  } catch {
    return null;
  }
}

type POItemForm = { product_id: string; quantity: string; unit_cost: string };

async function createPurchaseOrder(payload: {
  organization_id: string;
  supplier_id: string;
  expected_date: string | null;
  notes: string;
  created_by: string;
  items: POItemForm[];
}) {
  const supabase = createClient();
  const items = payload.items.filter((i) => i.product_id && i.quantity && i.unit_cost);
  const totalValue = items.reduce(
    (sum, i) => sum + parseFloat(i.unit_cost) * parseInt(i.quantity, 10),
    0,
  );

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .insert({
      organization_id: payload.organization_id,
      supplier_id: payload.supplier_id,
      status: 'draft',
      expected_date: payload.expected_date,
      total_value: totalValue,
      notes: payload.notes || null,
      created_by: payload.created_by,
    })
    .select()
    .single();
  if (error) throw error;

  const { error: itemsError } = await supabase.from('purchase_order_items').insert(
    items.map((i) => ({
      purchase_order_id: po.id,
      product_id: i.product_id,
      quantity_ordered: parseInt(i.quantity, 10),
      quantity_received: 0,
      unit_cost: parseFloat(i.unit_cost),
    })),
  );
  if (itemsError) throw itemsError;

  return po;
}

async function sendPurchaseOrder(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function cancelPurchaseOrder(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Receive a PO in full (no partial receiving in this version). Updates
 * inventory via the SAME read-qty -> upsert `inventory` -> insert
 * `inventory_movements` pattern used elsewhere in the app (see
 * inventory/page.tsx's adjustStock()) — deliberately replicated inline
 * rather than extracted into a new shared helper, since no such shared
 * helper exists anywhere else in the codebase either.
 */
async function receivePurchaseOrder(payload: {
  poId: string;
  organizationId: string;
  warehouseId: string;
  userId: string;
}) {
  const supabase = createClient();

  const { data: items, error: itemsError } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, quantity_ordered')
    .eq('purchase_order_id', payload.poId);
  if (itemsError) throw itemsError;

  for (const item of items || []) {
    const { data: inv } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('product_id', item.product_id)
      .eq('warehouse_id', payload.warehouseId)
      .maybeSingle();

    const oldQty = inv?.quantity || 0;
    const newQty = oldQty + item.quantity_ordered;

    if (inv) {
      await supabase.from('inventory').update({ quantity: newQty }).eq('id', inv.id);
    } else {
      await supabase.from('inventory').insert({
        organization_id: payload.organizationId,
        product_id: item.product_id,
        warehouse_id: payload.warehouseId,
        quantity: item.quantity_ordered,
        min_stock_level: 5,
      });
    }

    await supabase.from('inventory_movements').insert({
      organization_id: payload.organizationId,
      product_id: item.product_id,
      warehouse_id: payload.warehouseId,
      movement_type: 'in',
      quantity: item.quantity_ordered,
      reference_id: payload.poId,
      reference_type: 'purchase_order',
      notes: 'Received from purchase order',
      created_by: payload.userId,
    });

    await supabase
      .from('purchase_order_items')
      .update({ quantity_received: item.quantity_ordered })
      .eq('id', item.id);
  }

  const { error } = await supabase
    .from('purchase_orders')
    .update({
      status: 'received',
      received_by: payload.userId,
      received_at: new Date().toISOString(),
    })
    .eq('id', payload.poId);
  if (error) throw error;
}

// ── Page ─────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  return (
    <AccessGuard allow={['business_owner', 'admin']}>
      <PurchaseOrdersPageInner />
    </AccessGuard>
  );
}

function PurchaseOrdersPageInner() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const orgId = (user as unknown as { organization_id: string } | null)?.organization_id;

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewPO, setViewPO] = useState<PurchaseOrder | null>(null);
  const [formData, setFormData] = useState({
    supplier_id: '',
    expected_date: '',
    notes: '',
    items: [{ product_id: '', quantity: '', unit_cost: '' }] as POItemForm[],
  });

  const { data: plan } = useQuery({
    queryKey: ['purchase-orders-plan', orgId],
    queryFn: () => fetchSubscriptionPlan(orgId as string),
    enabled: !!orgId,
  });

  // Fails OPEN: if the plan can't be resolved (offline/transient error),
  // never block the page — matches this codebase's existing philosophy
  // for feature/limit checks (see product-form.tsx's canAddProduct()).
  const featureLocked = !!plan && !hasFeature(plan, 'purchase_orders');

  const { data: purchaseOrders = [], isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: fetchPurchaseOrders,
    enabled: !featureLocked,
  });

  const { data: { suppliers = [], products = [], warehouses = [] } = {} } = useQuery({
    queryKey: ['po-suppliers-products-warehouses'],
    queryFn: fetchSuppliersAndProducts,
    enabled: !featureLocked,
  });

  const resetForm = () =>
    setFormData({
      supplier_id: '',
      expected_date: '',
      notes: '',
      items: [{ product_id: '', quantity: '', unit_cost: '' }],
    });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      createPurchaseOrder({
        organization_id: orgId as string,
        supplier_id: data.supplier_id,
        expected_date: data.expected_date || null,
        notes: data.notes,
        created_by: user!.id,
        items: data.items,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setIsFormOpen(false);
      resetForm();
      toast.success(t.purchaseOrders.created_success);
    },
    onError: () => toast.error(t.purchaseOrders.create_failed),
  });

  const sendMutation = useMutation({
    mutationFn: sendPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success(t.purchaseOrders.sent_success);
    },
    onError: () => toast.error(t.purchaseOrders.update_failed),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success(t.purchaseOrders.cancelled_success);
    },
    onError: () => toast.error(t.purchaseOrders.update_failed),
  });

  const receiveMutation = useMutation({
    mutationFn: (poId: string) => {
      const destination = warehouses.find((w) => w.is_main) || warehouses[0];
      if (!destination) throw new Error(t.purchaseOrders.no_warehouse);
      return receivePurchaseOrder({
        poId,
        organizationId: orgId as string,
        warehouseId: destination.id,
        userId: user!.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(t.purchaseOrders.received_success);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : t.purchaseOrders.update_failed),
  });

  const itemsSubtotal = (items: POItemForm[]) =>
    items.reduce((sum, i) => {
      const qty = parseInt(i.quantity, 10);
      const cost = parseFloat(i.unit_cost);
      if (isNaN(qty) || isNaN(cost)) return sum;
      return sum + qty * cost;
    }, 0);

  const handleCreate = () => {
    if (!user || !orgId) return;
    if (!formData.supplier_id) {
      toast.error(t.purchaseOrders.select_supplier_required);
      return;
    }
    const validItems = formData.items.filter(
      (i) => i.product_id && i.quantity && i.unit_cost,
    );
    if (validItems.length === 0) {
      toast.error(t.purchaseOrders.add_item_required);
      return;
    }
    for (const i of validItems) {
      const qty = parseInt(i.quantity, 10);
      const cost = parseFloat(i.unit_cost);
      if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
        toast.error(t.purchaseOrders.valid_item_values);
        return;
      }
    }
    createMutation.mutate(formData);
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { icon: React.ElementType; variant: string }> = {
      draft: { icon: Clock, variant: 'outline' },
      sent: { icon: Send, variant: 'info' },
      received: { icon: CheckCircle, variant: 'success' },
      cancelled: { icon: XCircle, variant: 'destructive' },
    };
    const { icon: Icon, variant } = map[status] || map.draft;
    return (
      <Badge
        variant={variant as Parameters<typeof Badge>[0]['variant']}
        className="flex items-center gap-1 w-fit capitalize"
      >
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const draftCount = purchaseOrders.filter((po) => po.status === 'draft').length;
  const sentCount = purchaseOrders.filter((po) => po.status === 'sent').length;

  if (featureLocked) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <div className="text-center max-w-md">
          <p className="font-medium">{t.purchaseOrders.title}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {upgradePromptMessage('purchase_orders')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.purchaseOrders.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.purchaseOrders.subtitle
              .replace('{draft}', String(draftCount))
              .replace('{sent}', String(sentCount))}
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t.purchaseOrders.new_po}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.purchaseOrders.supplier}</TableHead>
                <TableHead>{t.purchaseOrders.items_count}</TableHead>
                <TableHead>{t.purchaseOrders.total_value}</TableHead>
                <TableHead>{t.purchaseOrders.expected_date}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="text-right">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(6)].map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : purchaseOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    {t.purchaseOrders.no_purchase_orders}
                  </TableCell>
                </TableRow>
              ) : (
                purchaseOrders.map((po) => (
                  <TableRow key={po.id} className="cursor-pointer" onClick={() => setViewPO(po)}>
                    <TableCell>
                      <p className="font-medium text-sm">
                        {(po.supplier as { name?: string } | undefined)?.name}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">{po.items?.length ?? 0}</TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(po.total_value)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {po.expected_date ? formatDate(po.expected_date) : '—'}
                    </TableCell>
                    <TableCell>{statusBadge(po.status)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {po.status === 'draft' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => sendMutation.mutate(po.id)}
                            >
                              <Send className="h-3 w-3 mr-1" /> {t.purchaseOrders.send}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-red-600 border-red-200"
                              onClick={() => cancelMutation.mutate(po.id)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> {t.purchaseOrders.cancel_action}
                            </Button>
                          </>
                        )}
                        {po.status === 'sent' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-green-600 border-green-200"
                              onClick={() => receiveMutation.mutate(po.id)}
                              disabled={receiveMutation.isPending}
                            >
                              <PackageCheck className="h-3 w-3 mr-1" /> {t.purchaseOrders.receive}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-red-600 border-red-200"
                              onClick={() => cancelMutation.mutate(po.id)}
                            >
                              {t.purchaseOrders.cancel_action}
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

      {/* Create PO Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.purchaseOrders.create_dialog_title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>{t.purchaseOrders.supplier_required}</Label>
              <Select
                onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t.purchaseOrders.select_supplier} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t.purchaseOrders.expected_date}</Label>
              <Input
                type="date"
                value={formData.expected_date}
                onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
              />
            </div>

            {/* Line items */}
            <div>
              <Label className="mb-2 block">{t.purchaseOrders.line_items_required}</Label>
              {formData.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-2 mb-2">
                  <Select
                    onValueChange={(v) => {
                      const p = products.find((pr) => pr.id === v);
                      const items = [...formData.items];
                      items[idx] = {
                        ...items[idx],
                        product_id: v,
                        unit_cost: String(p?.cost_price ?? ''),
                      };
                      setFormData({ ...formData, items });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t.purchaseOrders.product} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    placeholder={t.purchaseOrders.qty}
                    value={item.quantity}
                    onChange={(e) => {
                      const items = [...formData.items];
                      items[idx] = { ...items[idx], quantity: e.target.value };
                      setFormData({ ...formData, items });
                    }}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t.purchaseOrders.unit_cost}
                    value={item.unit_cost}
                    onChange={(e) => {
                      const items = [...formData.items];
                      items[idx] = { ...items[idx], unit_cost: e.target.value };
                      setFormData({ ...formData, items });
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormData({
                    ...formData,
                    items: [...formData.items, { product_id: '', quantity: '', unit_cost: '' }],
                  })
                }
              >
                <Plus className="h-3 w-3 mr-1" /> {t.purchaseOrders.add_item}
              </Button>
            </div>

            <div className="rounded-md border p-3 bg-muted/30 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">{t.purchaseOrders.total_value}</span>
              <span className="font-semibold">
                {formatCurrency(itemsSubtotal(formData.items))}
              </span>
            </div>

            <div className="space-y-2">
              <Label>{t.purchaseOrders.notes}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder={t.purchaseOrders.notes_placeholder}
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIsFormOpen(false)}>
                {t.purchaseOrders.cancel}
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {t.purchaseOrders.save_draft}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View PO Dialog */}
      <Dialog open={!!viewPO} onOpenChange={(open) => !open && setViewPO(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.purchaseOrders.details_dialog_title}</DialogTitle>
          </DialogHeader>
          {viewPO && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {(viewPO.supplier as { name?: string } | undefined)?.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.purchaseOrders.created_by_label}{' '}
                    {(viewPO.creator as { full_name?: string } | undefined)?.full_name || '—'}
                    {' · '}
                    {formatDateTime(viewPO.created_at)}
                  </p>
                </div>
                {statusBadge(viewPO.status)}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.purchaseOrders.product}</TableHead>
                    <TableHead>{t.purchaseOrders.qty}</TableHead>
                    <TableHead>{t.purchaseOrders.unit_cost}</TableHead>
                    <TableHead className="text-right">{t.purchaseOrders.line_total}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(viewPO.items || []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">
                        {(item.product as { name?: string } | undefined)?.name}
                      </TableCell>
                      <TableCell className="text-sm">{item.quantity_ordered}</TableCell>
                      <TableCell className="text-sm">{formatCurrency(item.unit_cost)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCurrency(item.unit_cost * item.quantity_ordered)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
                <span>{t.purchaseOrders.total_value}</span>
                <span>{formatCurrency(viewPO.total_value)}</span>
              </div>

              {viewPO.notes && (
                <p className="text-sm text-muted-foreground">{viewPO.notes}</p>
              )}

              {viewPO.status === 'received' && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {t.purchaseOrders.received_by_label}{' '}
                  {(viewPO.receiver as { full_name?: string } | undefined)?.full_name || '—'}
                  {viewPO.received_at ? ` · ${formatDateTime(viewPO.received_at)}` : ''}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
