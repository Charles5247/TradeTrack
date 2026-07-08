'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertCircle, CheckCircle, Clock, DollarSign } from 'lucide-react';
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
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useAuthStore } from '@/store';
import type { VendorTransaction, Product } from '@/types';

async function fetchVendors() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('vendor_transactions')
    .select(`
      *,
      items:vendor_transaction_items(
        id, quantity, unit_price, total,
        product:products(name, sku)
      ),
      creator:users(full_name)
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as VendorTransaction[];
}

export default function VendorsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewVendor, setViewVendor] = useState<VendorTransaction | null>(null);
  const [formData, setFormData] = useState({
    vendor_name: '',
    vendor_phone: '',
    vendor_email: '',
    date_issued: new Date().toISOString().split('T')[0],
    expected_payment_date: '',
    notes: '',
    items: [{ product_id: '', quantity: '', unit_price: '' }],
  });

  const [products, setProducts] = useState<Product[]>([]);

  React.useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('products').select('id,name,sku,selling_price').eq('status','active').order('name');
      setProducts(data as Product[] || []);
    };
    load();
  }, []);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: fetchVendors,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const supabase = createClient();
      const orgId = (user as unknown as { organization_id: string })?.organization_id;
      const items = data.items.filter((i) => i.product_id && i.quantity && i.unit_price);
      const totalValue = items.reduce((s, i) => s + parseFloat(i.unit_price) * parseInt(i.quantity), 0);

      const { data: vt, error } = await supabase.from('vendor_transactions').insert({
        organization_id: orgId,
        vendor_name: data.vendor_name,
        vendor_phone: data.vendor_phone || null,
        vendor_email: data.vendor_email || null,
        date_issued: data.date_issued,
        expected_payment_date: data.expected_payment_date || null,
        notes: data.notes || null,
        status: 'pending',
        total_value: totalValue,
        amount_paid: 0,
        created_by: user!.id,
      }).select().single();
      if (error) throw error;

      await supabase.from('vendor_transaction_items').insert(
        items.map((i) => ({
          vendor_transaction_id: vt.id,
          product_id: i.product_id,
          quantity: parseInt(i.quantity),
          unit_price: parseFloat(i.unit_price),
          total: parseInt(i.quantity) * parseFloat(i.unit_price),
        }))
      );

      // Deduct inventory
      for (const item of items) {
        const supabase2 = createClient();
        const { data: inv } = await supabase2
          .from('inventory')
          .select('quantity, warehouse_id')
          .eq('product_id', item.product_id)
          .order('quantity', { ascending: false })
          .limit(1)
          .single();
        if (inv && inv.quantity >= parseInt(item.quantity)) {
          await supabase2.from('inventory')
            .update({ quantity: inv.quantity - parseInt(item.quantity) })
            .eq('product_id', item.product_id)
            .eq('warehouse_id', inv.warehouse_id);
        }
      }

      return vt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setIsFormOpen(false);
      toast.success('Vendor transaction created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create'),
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const supabase = createClient();
      const { data: vt } = await supabase.from('vendor_transactions').select('total_value').eq('id', id).single();
      const status = amount >= (vt?.total_value || 0) ? 'completed' : 'partial';
      const { error } = await supabase.from('vendor_transactions').update({ amount_paid: amount, status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Payment recorded');
    },
  });

  const statusBadge = (status: string, expectedDate?: string) => {
    const isOverdue = expectedDate && new Date(expectedDate) < new Date() && status === 'pending';
    if (isOverdue) return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Overdue</Badge>;
    const map: Record<string, Parameters<typeof Badge>[0]['variant']> = {
      pending: 'warning',
      completed: 'success',
      cancelled: 'destructive',
      partial: 'info',
    };
    return <Badge variant={map[status] || 'outline'}>{status}</Badge>;
  };

  const totalPending = vendors
    .filter((v) => v.status === 'pending' || v.status === 'partial')
    .reduce((s, v) => s + (v.total_value - v.amount_paid), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendor Sales</h1>
          <p className="text-muted-foreground text-sm">
            Outstanding debt: <span className="font-semibold text-amber-600">{formatCurrency(totalPending)}</span>
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Vendor Transaction
        </Button>
      </div>

      {/* Alert Banner */}
      {totalPending > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            You have <strong>{formatCurrency(totalPending)}</strong> in outstanding vendor payments. Follow up to collect.
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Date Issued</TableHead>
                <TableHead>Expected Payment</TableHead>
                <TableHead>Total Value</TableHead>
                <TableHead>Amount Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(9)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                  </TableRow>
                ))
              ) : vendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    No vendor transactions found
                  </TableCell>
                </TableRow>
              ) : (
                vendors.map((v) => {
                  const balance = v.total_value - v.amount_paid;
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.vendor_name}</TableCell>
                      <TableCell className="text-sm">{v.vendor_phone || '—'}</TableCell>
                      <TableCell className="text-sm">{formatDate(v.date_issued)}</TableCell>
                      <TableCell className="text-sm">
                        {v.expected_payment_date ? (
                          <span className={new Date(v.expected_payment_date) < new Date() && v.status === 'pending' ? 'text-red-600 font-medium' : ''}>
                            {formatDate(v.expected_payment_date)}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{formatCurrency(v.total_value)}</TableCell>
                      <TableCell className="text-green-600">{formatCurrency(v.amount_paid)}</TableCell>
                      <TableCell className={balance > 0 ? 'text-amber-600 font-semibold' : 'text-green-600'}>
                        {formatCurrency(balance)}
                      </TableCell>
                      <TableCell>{statusBadge(v.status, v.expected_payment_date)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setViewVendor(v)}>
                            View
                          </Button>
                          {(v.status === 'pending' || v.status === 'partial') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-green-600 border-green-200"
                              onClick={() => {
                                const amt = prompt(`Record payment for ${v.vendor_name}\nBalance: ${formatCurrency(balance)}\nEnter amount:`);
                                if (amt && parseFloat(amt) > 0) {
                                  markPaidMutation.mutate({ id: v.id, amount: v.amount_paid + parseFloat(amt) });
                                }
                              }}
                            >
                              <DollarSign className="h-3 w-3 mr-1" /> Pay
                            </Button>
                          )}
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

      {/* Create Form */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Vendor Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendor Name *</Label>
                <Input value={formData.vendor_name} onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={formData.vendor_phone} onChange={(e) => setFormData({ ...formData, vendor_phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Date Issued</Label>
                <Input type="date" value={formData.date_issued} onChange={(e) => setFormData({ ...formData, date_issued: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Expected Payment Date</Label>
                <Input type="date" value={formData.expected_payment_date} onChange={(e) => setFormData({ ...formData, expected_payment_date: e.target.value })} />
              </div>
            </div>

            {/* Items */}
            <div>
              <Label className="mb-2 block">Products *</Label>
              {formData.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-2 mb-2">
                  <Select onValueChange={(v) => {
                    const p = products.find((pr) => pr.id === v);
                    const items = [...formData.items];
                    items[idx] = { ...items[idx], product_id: v, unit_price: String(p?.selling_price || '') };
                    setFormData({ ...formData, items });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => {
                      const items = [...formData.items];
                      items[idx].quantity = e.target.value;
                      setFormData({ ...formData, items });
                    }}
                  />
                  <Input
                    type="number"
                    placeholder="Unit Price"
                    value={item.unit_price}
                    onChange={(e) => {
                      const items = [...formData.items];
                      items[idx].unit_price = e.target.value;
                      setFormData({ ...formData, items });
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFormData({ ...formData, items: [...formData.items, { product_id: '', quantity: '', unit_price: '' }] })}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={() => createMutation.mutate(formData)} disabled={createMutation.isPending}>
                Create Transaction
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewVendor && (
        <Dialog open={!!viewVendor} onOpenChange={() => setViewVendor(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{viewVendor.vendor_name} — Transaction</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Status:</span> {statusBadge(viewVendor.status)}</div>
                <div><span className="text-muted-foreground">Phone:</span> {viewVendor.vendor_phone || '—'}</div>
                <div><span className="text-muted-foreground">Issued:</span> {formatDate(viewVendor.date_issued)}</div>
                <div><span className="text-muted-foreground">Expected:</span> {viewVendor.expected_payment_date ? formatDate(viewVendor.expected_payment_date) : '—'}</div>
                <div><span className="text-muted-foreground">Total:</span> <strong>{formatCurrency(viewVendor.total_value)}</strong></div>
                <div><span className="text-muted-foreground">Paid:</span> <span className="text-green-600 font-medium">{formatCurrency(viewVendor.amount_paid)}</span></div>
              </div>
              <div>
                <p className="font-medium mb-2">Products:</p>
                {(viewVendor.items || []).map((item) => (
                  <div key={item.id} className="flex justify-between py-1 border-b border-border/50">
                    <span>{(item.product as { name?: string } | null)?.name}</span>
                    <span>{item.quantity} × {formatCurrency(item.unit_price)} = <strong>{formatCurrency(item.total)}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
