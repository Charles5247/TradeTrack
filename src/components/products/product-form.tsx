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
import { generateId } from '@/lib/utils/id';
import { adjustProductStock } from '@/lib/inventory/adjust-stock';
import { receiveStockAtCost } from '@/lib/inventory/receive-stock';
import { addToSyncQueue, getAllFromOfflineDB, saveToOfflineDB } from '@/lib/offline/db';
import { isOffline } from '@/lib/utils/network';
import { useAuthStore } from '@/store';

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
  const [quantity, setQuantity] = useState('0');
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [stockRows, setStockRows] = useState<Array<{ id: string; warehouse_id: string; quantity: number }>>([]);
  const [showMore, setShowMore] = useState(false);
  React.useEffect(() => {
    let active = true;
    if (isOffline()) {
      void getAllFromOfflineDB<{ id: string; name: string }>('warehouses').then(async rows => {
        if (!active) return;
        setWarehouses(rows);
        setWarehouseId(current => current || rows[0]?.id || '');
        if (product?.id) {
          const balances = (await getAllFromOfflineDB<{ id: string; product_id: string; warehouse_id: string; quantity: number }>('inventory')).filter(row => row.product_id === product.id);
          if (!active) return;
          setStockRows(balances);
          setQuantity(String(balances.find(row => row.warehouse_id === rows[0]?.id)?.quantity ?? 0));
        }
      });
      return () => { active = false; };
    }
    void createClient().from('warehouses').select('id,name').order('name').then(async ({ data }) => {
      if (!active) return;
      const rows = data || [];
      setWarehouses(rows);
      setWarehouseId(current => current || rows[0]?.id || '');
      if (product?.id) {
        const { data: inventory } = await createClient().from('inventory').select('id,warehouse_id,quantity').eq('product_id', product.id);
        if (!active) return;
        const balances = inventory || [];
        setStockRows(balances);
        setQuantity(String(balances.find(row => row.warehouse_id === rows[0]?.id)?.quantity ?? 0));
      }
    });
    return () => { active = false; };
  }, [product?.id]);
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
      units_per_pack: product?.units_per_pack || 1,
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
      const openingQuantity = Number(quantity);
      if (!Number.isSafeInteger(openingQuantity) || openingQuantity < 0) throw new Error('Enter a valid whole-number quantity.');
      if ((openingQuantity > 0 || product?.id) && !warehouseId) throw new Error('Choose a stock location first.');
      const stockRow = stockRows.find(row => row.warehouse_id === warehouseId);
      const stockChange = openingQuantity - (stockRow?.quantity ?? 0);
      const receivingExistingStock = Boolean(product?.id && stockChange > 0);
      let offline = isOffline() || Boolean(imageUrl?.startsWith('offline-image:'));
      const supabase = createClient();
      let user = useAuthStore.getState().user;
      if (!offline) {
        try { user = (await withTimeout(supabase.auth.getUser(), AUTH_CHECK_TIMEOUT_MS)).data.user as typeof user; }
        catch { offline = true; }
      }
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = offline ? { data: null } : await withTimeout(Promise.resolve(supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()), 5000).catch(() => ({ data: null }));

      const orgId = profile?.organization_id ?? organization?.id ?? '';
      if (!orgId) throw new Error('No business is selected.');

      // Enforce the legacy no-cost plan's max_products ceiling (and any other
      // tier's cap) before creating a NEW product. Updates to existing
      // products are never blocked. Fails open if subscription data is
      // unavailable (offline-first: never block on a transient fetch).
      if (!offline && !product?.id && orgId) {
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
        sku: data.sku?.trim() || product?.sku || `AUTO-${generateId()}`,
        units_per_pack: data.units_per_pack,
        barcode: data.barcode || null,
        selling_price: data.selling_price,
        cost_price: receivingExistingStock ? product!.cost_price : data.cost_price,
        category_id: data.category_id || null,
        supplier_id: product?.supplier_id || null,
        status: data.status,
        organization_id: orgId,
        created_by: product?.created_by || user.id,
        image_url: imageUrl || null,
      };

      const id = product?.id || generateId();
      const saveOffline = async () => {
        const now = new Date().toISOString();
        const imageId = imageUrl?.startsWith('offline-image:') ? imageUrl.slice('offline-image:'.length) : null;
        const serverPayload = { ...payload, id, image_url: imageId ? null : payload.image_url, updated_at: now, ...(!product ? { created_at: now } : {}) };
        await saveToOfflineDB('products', [{ ...serverPayload, image_url: imageUrl || null }]);
        await addToSyncQueue('products', product ? 'UPDATE' : 'INSERT', id, serverPayload);
        if (imageId) await addToSyncQueue('product_images', 'INSERT', imageId, { product_id: id });
        if (stockChange && warehouseId) {
          if (receivingExistingStock) await receiveStockAtCost({ organization_id: orgId, product_id: id,
            warehouse_id: warehouseId, quantity: stockChange, unit_cost: data.cost_price,
            notes: 'Stock received from product form' }, { forceOffline: true });
          else await adjustProductStock({ organization_id: orgId, user_id: user.id, product_id: id,
            warehouse_id: warehouseId, inventory_id: stockRow?.id, current_quantity: stockRow?.quantity ?? 0,
            quantity_change: stockChange, reason: product ? 'Quantity updated from product form' : 'Opening stock' });
        }
        toast.success('Saved on this device. Product, photo and stock will upload when you reconnect.');
        onSuccess();
      };
      if (offline) return await saveOffline();

      if (product?.id) {
        let result;
        try { result = await withTimeout(Promise.resolve(supabase
          .from('products')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', product.id)), 5000); }
        catch (error) { if (error instanceof TypeError || (error instanceof Error && /timed out|fetch failed|failed to fetch/i.test(error.message))) return await saveOffline(); throw error; }
        const { error } = result;
        if (error && /fetch failed|failed to fetch/i.test(error.message)) return await saveOffline();
        if (error) throw error;

        if (stockChange > 0) await receiveStockAtCost({ organization_id: orgId, product_id: product.id,
          warehouse_id: warehouseId, quantity: stockChange, unit_cost: data.cost_price,
          notes: 'Stock received from product form' });
        else if (stockChange < 0) await adjustProductStock({ organization_id: orgId, user_id: user.id, product_id: product.id,
          warehouse_id: warehouseId, inventory_id: stockRow?.id, current_quantity: stockRow?.quantity ?? 0,
          quantity_change: stockChange, reason: 'Quantity updated from product form' });

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
        let result;
        try { result = await withTimeout(Promise.resolve(supabase
          .from('products')
          .insert({ ...payload, id })
          .select()
          .single()), 5000); }
        catch (error) { if (error instanceof TypeError || (error instanceof Error && /timed out|fetch failed|failed to fetch/i.test(error.message))) return await saveOffline(); throw error; }
        const { data: newProduct, error } = result;
        if (error && /fetch failed|failed to fetch/i.test(error.message)) return await saveOffline();
        if (error) throw error;
        if (openingQuantity > 0 && warehouseId) {
          try {
            await adjustProductStock({ organization_id: orgId, user_id: user.id, product_id: newProduct.id,
              warehouse_id: warehouseId, quantity_change: openingQuantity, reason: 'Opening stock' });
          } catch (stockError) {
            toast.error(`Product created, but stock was not saved: ${stockError instanceof Error ? stockError.message : 'unknown error'}. Set its quantity on the product page.`);
            onSuccess();
            return;
          }
        }

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
        <div className={showMore ? 'space-y-2' : 'hidden'}>
          <Label htmlFor="make"><TranslatedText text={"Make / Brand"} /></Label>
          <Input id="make" {...register('make')} placeholder={copy("e.g., Samsung, Nike")} />
        </div>
      </div>

      <div className={showMore ? 'space-y-2' : 'hidden'}>
        <Label htmlFor="stock_unit">{copy('Selling unit')}</Label>
        <select id="stock_unit" {...register('stock_unit')} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2">
          {Array.from(new Set([...workflow.units,watch('stock_unit')||'piece'])).map(unit=><option key={unit} value={unit}>{copy(unit)}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">{copy('Stock quantities and prices use this unit. Use whole units; use g, mL or cm for smaller quantities.')}</p>
        <p className="text-xs text-muted-foreground">{copy('Create a separate SKU for every size, colour, model or pack size you stock.')}</p>
      </div>
      {showMore && (workflow.variant || product?.variant_size || product?.variant_colour) && <div className="grid grid-cols-2 gap-4">
        <div><Label htmlFor="variant_size">{copy('Size')}</Label><Input id="variant_size" {...register('variant_size')} maxLength={60}/></div>
        <div><Label htmlFor="variant_colour">{copy('Colour')}</Label><Input id="variant_colour" {...register('variant_colour')} maxLength={60}/></div>
      </div>}
      {showMore && (workflow.model || product?.model) && <div><Label htmlFor="model">{copy('Model / specification')}</Label><Input id="model" {...register('model')} maxLength={100}/></div>}
      <div className={showMore ? 'space-y-2' : 'hidden'}>
        <Label htmlFor="description"><TranslatedText text={"Description"} /></Label>
        <Textarea
          id="description"
          {...register('description')}
          rows={2}
          placeholder={copy("Optional product description")}
        />
      </div>

      <div className={showMore ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'hidden'}>
        <div className="space-y-2">
          <Label htmlFor="sku">Product code (optional)</Label>
          <Input id="sku" {...register('sku')} placeholder="Generated automatically" error={errors.sku?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="barcode"><TranslatedText text={"Barcode"} /></Label>
          <Input id="barcode" {...register('barcode')} placeholder="1234567890123" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cost_price">{copy(product?.id && Number(quantity) > Number(stockRows.find(row => row.warehouse_id === warehouseId)?.quantity ?? 0)
            ? 'Buying cost per unit for the new stock *' : 'Cost price per unit *')}</Label>
          <Input
            id="cost_price"
            type="number"
            step="0.01"
            min="0"
            {...register('cost_price')}
            error={errors.cost_price?.message}
          />
          {product?.id && Number(quantity) > Number(stockRows.find(row => row.warehouse_id === warehouseId)?.quantity ?? 0) &&
            <p className="text-xs text-muted-foreground">{copy('Enter what you paid for the added units. Trackasuwa will calculate the new average and record it in this product’s history.')}</p>}
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

      <div className={showMore ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'hidden'}>
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

      <div><Label htmlFor="units_per_pack">Individual units per pack</Label><Input id="units_per_pack" type="number" min="1" step="1" {...register('units_per_pack')} error={errors.units_per_pack?.message} /><p className="text-xs text-muted-foreground">Enter 1 if this product is not sold in packs.</p></div>
      <div><Label htmlFor="opening-quantity">{product ? 'Quantity at this location' : 'Opening quantity'} (individual units)</Label><Input id="opening-quantity" type="number" min="0" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} /></div>
      {warehouses.length > 1 && <div><Label htmlFor="opening-location">Stock location</Label><select id="opening-location" className="min-h-11 w-full rounded-lg border border-input bg-background px-3" value={warehouseId} onChange={event => { setWarehouseId(event.target.value); setQuantity(String(stockRows.find(row => row.warehouse_id === event.target.value)?.quantity ?? 0)); }}>{warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>}
      <button type="button" className="text-sm font-medium text-primary underline" onClick={() => setShowMore(value => !value)}>{showMore ? 'Hide optional details' : 'More details (category, barcode, image)'}</button>
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
