'use client';
import { TranslatedText, useCopy } from '@/i18n/text';


import { withTimeout, AUTH_CHECK_TIMEOUT_MS } from "@/lib/utils/timeout";
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageUpload } from './image-upload';
import { productSchema } from '@/lib/validations';
import { createClient } from '@/lib/supabase/client';
import { createAuditEntry } from '@/lib/utils/client-audit';
import { canAddProduct, productLimitMessage, resolveSubscriptionPlan } from '@/lib/subscriptions/plan-limits';
import type { Product } from '@/types';
import type { z } from 'zod';
import type { CodeMatch } from '@/lib/products/lookup-code';
import { useOrganization } from '@/components/shared/organization-provider';
import { industryProfile, type StockUnit } from '@/lib/industries';

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormProps {
  product?: Product | null;
  categories: Array<{ id: string; name: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ProductForm({ product: initialProduct, categories, onSuccess, onCancel }: ProductFormProps) {
  const copy = useCopy();
  const { industry, organization } = useOrganization();
  const workflow = industryProfile(industry);
  const [scannedProduct, setScannedProduct] = useState<CodeMatch | null>(null);
  const [cachedMatch, setCachedMatch] = useState(false);
  const product = scannedProduct ?? initialProduct;
  const [isLoading, setIsLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const [createdCategories, setCreatedCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const availableCategories = [...categories, ...createdCategories.filter(created => !categories.some(category => category.id === created.id))];

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProductFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(productSchema) as any,
    defaultValues: {
      stock_unit: (product?.stock_unit as StockUnit) || 'piece',
      variant_size: product?.variant_size || '',
      variant_colour: product?.variant_colour || '',
      model: product?.model || '',
      name: product?.name || '',
      make: product?.make || '',
      description: product?.description || '',
      sku: product?.sku || '',
      barcode: product?.barcode || '',
      selling_price: product?.selling_price || 0,
      cost_price: product?.cost_price || 0,
      category_id: product?.category_id || null,
      status: (product?.status as ProductFormData['status']) || 'active',
    },
  });

  const addCategory = async () => {
    const name = categoryName.trim();
    if (!name || !organization?.id) return;
    setIsSavingCategory(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('categories').insert({ organization_id: organization.id, name }).select('id,name').single();
      if (error) throw error;
      setCreatedCategories(current => [...current, data]);
      setValue('category_id', data.id, { shouldDirty: true });
      setCategoryName('');
      setIsAddingCategory(false);
      toast.success(copy('Category created'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy('Could not create category'));
    } finally {
      setIsSavingCategory(false);
    }
  };

  const onSubmit = async (data: ProductFormData) => {
    if (cachedMatch) {
      toast.error('This is a cached product. Reconnect and look up the code again before saving.');
      return;
    }
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await withTimeout(supabase.auth.getUser(), AUTH_CHECK_TIMEOUT_MS);
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      const orgId = profile?.organization_id ?? '';

      // Enforce the legacy no-cost plan's max_products ceiling (and any other
      // tier's cap) before creating a NEW product. Updates to existing
      // products are never blocked. Fails open if subscription data is
      // unavailable (offline-first: never block on a transient fetch).
      if (!product?.id && orgId) {
        try {
          const [{ data: subscription }, { data: allPlans }, { count: productCount }] =
            await Promise.all([
              supabase
                .from('subscriptions')
                .select('id, plan_id, status')
                .eq('organization_id', orgId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
              supabase.from('subscription_plans').select('*'),
              supabase
                .from('products')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', orgId),
            ]);

          const plan = resolveSubscriptionPlan(
            subscription as { id: string; plan_id: string; status: string } | null,
            (allPlans as unknown as Array<{
              id: string;
              name: string;
              max_cashiers: number;
              max_products: number | null;
              max_warehouses: number | null;
              features: string[];
              is_active?: boolean;
            }>) || [],
          );

          if (plan && !canAddProduct(productCount ?? 0, plan)) {
            toast.error(productLimitMessage(plan.max_products as number));
            setIsLoading(false);
            return;
          }
        } catch {
          // Fail open: never block product creation on a limit-check error.
        }
      }

      const payload = {
        stock_unit: data.stock_unit,
        variant_size: data.variant_size || null,
        variant_colour: data.variant_colour || null,
        model: data.model || null,
        name: data.name,
        make: data.make || null,
        description: data.description || null,
        sku: data.sku,
        barcode: data.barcode || null,
        selling_price: data.selling_price,
        cost_price: data.cost_price,
        category_id: data.category_id || null,
        supplier_id: product?.supplier_id || null,
        status: data.status,
        organization_id: orgId,
        created_by: product?.created_by || user.id,
        image_url: imageUrl || null,
      };

      if (product?.id) {
        const { error } = await supabase
          .from('products')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', product.id);
        if (error) throw error;

        await createAuditEntry({
          organization_id: orgId,
          user_id: user.id,
          action: 'UPDATE_PRODUCT',
          resource_type: 'product',
          resource_id: product.id,
          old_values: {
            name: product.name,
            selling_price: product.selling_price,
            status: product.status,
            image_url: product.image_url,
          },
          new_values: {
            name: data.name,
            selling_price: data.selling_price,
            status: data.status,
            image_url: imageUrl,
          },
        });

        toast.success('Product updated successfully');
      } else {
        const { data: newProduct, error } = await supabase
          .from('products')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;

        await createAuditEntry({
          organization_id: orgId,
          user_id: user.id,
          action: 'CREATE_PRODUCT',
          resource_type: 'product',
          resource_id: newProduct?.id ?? '',
          new_values: { ...data, image_url: imageUrl },
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
    <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="space-y-4">
      {/* Image Upload */}
      <div className="space-y-2">
        <Label><TranslatedText text={"Product Image"} /></Label>
        <ImageUpload
          currentImageUrl={imageUrl}
          productId={product?.id}
          onImageUploaded={(url) => setImageUrl(url)}
          onImageRemoved={() => setImageUrl(null)}
          onProductMatched={(match, cached) => {
            setScannedProduct(match);
            setCachedMatch(cached);
            setImageUrl(match.image_url ?? null);
            reset({ stock_unit:(match.stock_unit as StockUnit)||'piece',variant_size:match.variant_size||'',variant_colour:match.variant_colour||'',model:match.model||'',name: match.name, make: match.make || '', description: match.description || '', sku: match.sku, barcode: match.barcode || '', selling_price: match.selling_price, cost_price: match.cost_price, category_id: match.category_id || null, status: match.status as ProductFormData['status'] });
          }}
          onCodeSelected={code => setValue('barcode', code, { shouldDirty: true })}
        />
        {scannedProduct && <p role="status" className="text-sm tt-muted"><TranslatedText text={"Editing existing product:"} />{" "}{scannedProduct.name}.{cachedMatch && ' Cached preview only — reconnect and look up the code again before saving.'}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">{copy(workflow.productLabel)} *</Label>
          <Input
            id="name"
            {...register('name')}
            error={errors.name?.message}
            placeholder={copy(workflow.example)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="make"><TranslatedText text={"Make / Brand"} /></Label>
          <Input id="make" {...register('make')} placeholder={copy("e.g., Samsung, Nike")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stock_unit">{copy('Selling unit')}</Label>
        <select id="stock_unit" {...register('stock_unit')} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2">
          {Array.from(new Set([...workflow.units,watch('stock_unit')||'piece'])).map(unit=><option key={unit} value={unit}>{copy(unit)}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">{copy('Stock quantities and prices use this unit. Use whole units; use g, mL or cm for smaller quantities.')}</p>
        <p className="text-xs text-muted-foreground">{copy('Create a separate SKU for every size, colour, model or pack size you stock.')}</p>
      </div>
      {(workflow.variant || product?.variant_size || product?.variant_colour) && <div className="grid grid-cols-2 gap-4">
        <div><Label htmlFor="variant_size">{copy('Size')}</Label><Input id="variant_size" {...register('variant_size')} maxLength={60}/></div>
        <div><Label htmlFor="variant_colour">{copy('Colour')}</Label><Input id="variant_colour" {...register('variant_colour')} maxLength={60}/></div>
      </div>}
      {(workflow.model || product?.model) && <div><Label htmlFor="model">{copy('Model / specification')}</Label><Input id="model" {...register('model')} maxLength={100}/></div>}
      <div className="space-y-2">
        <Label htmlFor="description"><TranslatedText text={"Description"} /></Label>
        <Textarea
          id="description"
          {...register('description')}
          rows={2}
          placeholder={copy("Optional product description")}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sku"><TranslatedText text={"SKU *"} /></Label>
          <Input id="sku" {...register('sku')} placeholder={copy("PROD-001")} error={errors.sku?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="barcode"><TranslatedText text={"Barcode"} /></Label>
          <Input id="barcode" {...register('barcode')} placeholder="1234567890123" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cost_price"><TranslatedText text={"Cost Price (₦) *"} /></Label>
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
          <Label htmlFor="selling_price"><TranslatedText text={"Selling Price (₦) *"} /></Label>
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
          <Label><TranslatedText text={"Category"} /></Label>
          <Select
            value={watch('category_id') ?? ''}
            onValueChange={(val) => setValue('category_id', val || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder={copy("Select category")} />
            </SelectTrigger>
            <SelectContent>
              {availableCategories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableCategories.length === 0 && !isAddingCategory && (
            <div role="status" className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <span>{copy('No categories yet.')}</span>
              <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0" onClick={() => setIsAddingCategory(true)}>{copy('Add category')}</Button>
            </div>
          )}
          {availableCategories.length === 0 && isAddingCategory && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row">
              <Input aria-label={copy('Category name')} value={categoryName} onChange={event => setCategoryName(event.target.value)} maxLength={100} autoFocus />
              <Button type="button" className="min-h-11 shrink-0" disabled={!categoryName.trim() || isSavingCategory || !organization?.id} onClick={() => void addCategory()}>
                {isSavingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{copy('Save category')}
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label><TranslatedText text={"Status"} /></Label>
          <Select
            value={watch('status')}
            onValueChange={(val) => setValue('status', val as ProductFormData['status'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active"><TranslatedText text={"Active"} /></SelectItem>
              <SelectItem value="inactive"><TranslatedText text={"Inactive"} /></SelectItem>
              <SelectItem value="discontinued"><TranslatedText text={"Discontinued"} /></SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1"><TranslatedText text={"Cancel"} /></Button>
        <Button type="submit" className="flex-1" disabled={isLoading || cachedMatch}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          <TranslatedText text={product ? 'Update Product' : 'Create Product'} />
        </Button>
      </div>
    </form>
  );
}
