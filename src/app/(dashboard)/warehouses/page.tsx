'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Warehouse, Edit, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import type { Warehouse as WarehouseType } from '@/types';
import { useI18n } from '@/i18n';

async function fetchWarehouses() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('warehouses')
    .select(`*, inventory(quantity)`)
    .order('is_main', { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any) as (WarehouseType & { inventory: { quantity: number }[] })[];
}

export default function WarehousesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<WarehouseType | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', address: '', is_main: false });

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['warehouses-full'],
    queryFn: fetchWarehouses,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const supabase = createClient();
      const orgId = (user as unknown as { organization_id: string })?.organization_id;
      if (editWarehouse) {
        const { error } = await supabase.from('warehouses').update(data).eq('id', editWarehouse.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('warehouses').insert({ ...data, organization_id: orgId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses-full'] });
      setIsFormOpen(false);
      setEditWarehouse(null);
      toast.success(editWarehouse ? t.warehouse.updated_success : t.warehouse.created_success);
    },
    onError: () => toast.error(t.warehouse.save_failed),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from('warehouses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses-full'] });
      toast.success(t.warehouse.deleted_success);
    },
    onError: () => toast.error(t.warehouse.delete_failed_inventory),
  });

  const openCreate = () => {
    setEditWarehouse(null);
    setFormData({ name: '', description: '', address: '', is_main: false });
    setIsFormOpen(true);
  };

  const openEdit = (w: WarehouseType) => {
    setEditWarehouse(w);
    setFormData({ name: w.name, description: w.description || '', address: w.address || '', is_main: w.is_main });
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.warehouse.title}</h1>
          <p className="text-muted-foreground text-sm">{t.warehouse.locations_count.replace('{count}', String(warehouses.length))}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t.warehouse.add_warehouse}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-36" />
            </Card>
          ))
        ) : warehouses.map((w) => {
          const totalStock = (w.inventory || []).reduce((s, i) => s + i.quantity, 0);
          return (
            <Card key={w.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Warehouse className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{w.name}</CardTitle>
                      {w.is_main && (
                        <Badge variant="default" className="text-xs mt-0.5">
                          <Star className="h-2.5 w-2.5 mr-1" />{t.warehouse.main_badge}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(w)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    {!w.is_main && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(t.warehouse.delete_confirm.replace('{name}', w.name))) deleteMutation.mutate(w.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {w.description && (
                  <p className="text-sm text-muted-foreground mb-3">{w.description}</p>
                )}
                {w.address && (
                  <p className="text-xs text-muted-foreground mb-3">📍 {w.address}</p>
                )}
                <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                  <span className="text-sm text-muted-foreground">{t.warehouse.total_stock}</span>
                  <span className="font-bold text-lg">{totalStock.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editWarehouse ? t.warehouse.edit_warehouse : t.warehouse.create_warehouse}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t.warehouse.warehouse_name_required}</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t.warehouse.description}</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t.warehouse.address}</Label>
              <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_main"
                checked={formData.is_main}
                onChange={(e) => setFormData({ ...formData, is_main: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="is_main" className="font-normal cursor-pointer">{t.warehouse.main_warehouse_checkbox}</Label>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIsFormOpen(false)}>{t.warehouse.cancel}</Button>
              <Button className="flex-1" onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending}>
                {editWarehouse ? t.warehouse.update : t.warehouse.create}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
