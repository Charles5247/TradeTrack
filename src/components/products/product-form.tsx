'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { productSchema, type ProductFormData } from '@/lib/validations';
import { createClient } from '@/lib/supabase/client';
import type { Product } from '@/types';

interface ProductFormProps {
  product?: Product | null;
  categories: Array<{ id: string; name: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ProductForm({ product, categories, onSuccess, onCancel }: ProductFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name || '',
      make: product?.make || '',
      description: product?.description || '',
      sku: product?.sku || '',
      barcode: product?.barcode || '',
      selling_price: product?.selling_price || 0,
      cost_price: product?.cost_price || 0,
      category_id: product?.category_id || null,
      status: product?.status || 'active',
    },
  });

  const onSubmit = async (data: ProductFormData) => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase.from('users').select('organization_id').eq('id', user.id).single();

      const payload = {
        ...data,
        organization_id: profile?.organization_id,
        created_by: user.id,
        category_id: data.category_id || null,
        supplier_id: null,
      };

      if (product?.id) {
        // Update
        const { error } = await supabase.from('products').update(payload).eq('id', product.id);
        if (error) throw error;

        // Audit log
        await supabase.from('audit_logs').insert({
          organization_id: profile?.organization_id,
          user_id: user.id,
          action: 'UPDATE',
          resource_type: 'product',
          resource_id: product.id,
          old_values: { name: product.name, selling_price: product.selling_price, status: product.status },
          new_values: { name: data.name, selling_price: data.selling_price, status: data.status },
        });

        toast.success('Product updated successfully');
      } else {
        // Create
        const { data: newProduct, error } = await supabase
          .from('products')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;

        // Audit log
        await supabase.from('audit_logs').insert({
          organization_id: profile?.organization_id,
          user_id: user.id,
          action: 'CREATE',
          resource_type: 'product',
          resource_id: newProduct.id,
          new_values: data,
        });

        toast.success('Product created successfully');
      }

      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save product';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Product Name *</Label>
          <Input id="name" {...register('name')} error={errors.name?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="make">Make/Brand</Label>
          <Input id="make" {...register('make')} placeholder="e.g., Samsung, Nike" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" {...register('description')} rows={2} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sku">SKU *</Label>
          <Input id="sku" {...register('sku')} placeholder="PROD-001" error={errors.sku?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="barcode">Barcode</Label>
          <Input id="barcode" {...register('barcode')} placeholder="1234567890123" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cost_price">Cost Price (₦) *</Label>
          <Input
            id="cost_price"
            type="number"
            step="0.01"
            min="0"
            {...register('cost_price')}
            error={errors.cost_price?.message}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="selling_price">Selling Price (₦) *</Label>
          <Input
            id="selling_price"
            type="number"
            step="0.01"
            min="0"
            {...register('selling_price')}
            error={errors.selling_price?.message}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            defaultValue={product?.category_id || undefined}
            onValueChange={(val) => setValue('category_id', val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            defaultValue={product?.status || 'active'}
            onValueChange={(val) => setValue('status', val as ProductFormData['status'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="discontinued">Discontinued</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {product ? 'Update Product' : 'Create Product'}
        </Button>
      </div>
    </form>
  );
}
