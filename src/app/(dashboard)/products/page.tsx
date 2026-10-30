'use client';
import { useCopy } from '@/i18n/text';
import { productVariantLabel } from '@/lib/industries';


import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, Package, MoreHorizontal, Eye, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AccessGuard } from '@/components/shared/access-guard';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Product } from '@/types';
import { ProductForm } from '@/components/products/product-form';
import { useI18n } from '@/i18n';
import { useAuthStore } from '@/store';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { adjustProductStock } from '@/lib/inventory/adjust-stock';
import type { Warehouse } from '@/types';
import { compareListRows, useListPreference, type ListSort, type ProductGroup } from '@/lib/lists/preferences';

type ProductStockRow = { id: string; warehouse_id: string; quantity: number; min_stock_level: number | null; warehouse: { name?: string } | null };
type ProductWithStock = Product & { inventory?: ProductStockRow[]; category?: { name?: string } | null; supplier?: { name?: string } | null };

async function fetchProducts(search?: string, categoryId?: string, sort: ListSort = 'az') {
  const supabase = createClient();
  const products: Product[] = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    let query = supabase
      .from('products')
      .select('*, category:categories(name), supplier:suppliers(name), inventory(id,warehouse_id,quantity,min_stock_level,warehouse:warehouses(name))')
      .order(sort === 'newest' || sort === 'oldest' ? 'created_at' : 'name', { ascending: sort === 'az' || sort === 'oldest' })
      .order('id', { ascending: sort !== 'newest' })
      .range(start, start + pageSize - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
    }
    if (categoryId && categoryId !== 'all') {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;
    if (error) throw error;
    products.push(...((data || []) as unknown as ProductWithStock[]));
    if (!data || data.length < pageSize) break;
  }
  return products as ProductWithStock[];
}

async function fetchCategories() {
  const supabase = createClient();
  const { data } = await supabase.from('categories').select('*').order('name');
  return data || [];
}

async function deleteProduct(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export default function ProductsPage() {
  return (
    <AccessGuard allow={['business_owner', 'admin', 'cashier']}>
      <ProductsPageInner />
    </AccessGuard>
  );
}

function ProductsPageInner() {
  const copy = useCopy();
  const router = useRouter();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const canManageStock = user?.role === 'business_owner' || user?.role === 'admin';
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const preferenceKey = `trackasuwa:list:products:${user?.id || 'session'}`;
  const [sort, setSort] = useListPreference<ListSort>(`${preferenceKey}:sort`, 'az');
  const [groupBy, setGroupBy] = useListPreference<ProductGroup>(`${preferenceKey}:group`, 'none');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [viewProduct, setViewProduct] = useState<ProductWithStock | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<ProductWithStock | null>(null);
  const [adjustWarehouse, setAdjustWarehouse] = useState('');
  const [adjustDirection, setAdjustDirection] = useState<'increase' | 'reduce'>('increase');
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const { data: products = [], isLoading, error: pageError, refetch: retryPage } = useQuery({
    queryKey: ['products', search, categoryFilter, sort],
    queryFn: () => fetchProducts(search || undefined, categoryFilter, sort),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });
  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await createClient().from('warehouses').select('*').order('name');
      if (error) throw error;
      return (data || []) as Warehouse[];
    },
  });

  const stockRows = (product: ProductWithStock) => product.inventory || [];
  const totalStock = (product: ProductWithStock) => stockRows(product).reduce((sum, row) => sum + Number(row.quantity), 0);
  const lowStock = (product: ProductWithStock) => stockRows(product).some(row => Number(row.quantity) <= Number(row.min_stock_level ?? 5));
  const groupName = (product: ProductWithStock) => groupBy === 'category'
    ? product.category?.name || copy('Uncategorised')
    : product.supplier?.name || copy('No supplier');
  const displayProducts = groupBy === 'none' ? products : [...products].sort((left, right) => {
    const groupDelta = groupName(left).localeCompare(groupName(right), undefined, { sensitivity: 'base' });
    return groupDelta || compareListRows(left, right, sort);
  });
  const groupCount = (name: string) => displayProducts.filter(product => groupName(product) === name).length;
  const openAdjustment = (product: ProductWithStock) => {
    setAdjustProduct(product);
    setAdjustWarehouse(stockRows(product)[0]?.warehouse_id || warehouses[0]?.id || '');
    setAdjustDirection('increase'); setAdjustQuantity(''); setAdjustReason('');
  };
  const adjustMutation = useMutation({
    networkMode: 'always',
    mutationFn: adjustProductStock,
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setAdjustProduct(null);
      toast.success(result.offline ? copy('Stock adjustment saved offline and will sync automatically.') : copy('Stock adjusted successfully'));
    },
    onError: error => toast.error(error.message),
  });
  const submitAdjustment = () => {
    if (!adjustProduct || !user || !adjustWarehouse || adjustReason.trim().length < 3) return;
    const quantity = Number(adjustQuantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return toast.error(copy('Enter a valid whole-number adjustment.'));
    const row = stockRows(adjustProduct).find(item => item.warehouse_id === adjustWarehouse);
    adjustMutation.mutate({
      organization_id: String(user.organization_id), user_id: user.id, product_id: adjustProduct.id,
      warehouse_id: adjustWarehouse, inventory_id: row?.id, current_quantity: row?.quantity ?? 0,
      min_stock_level: row?.min_stock_level ?? 5, quantity_change: adjustDirection === 'reduce' ? -quantity : quantity,
      reason: adjustReason,
    });
  };

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(t.products.deleted_success);
    },
    onError: () => toast.error(t.products.delete_failed),
  });

  const handleDelete = (product: Product) => {
    if (confirm(t.products.delete_confirm.replace('{name}', product.name))) {
      deleteMutation.mutate(product.id);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'destructive'> = {
      active: 'success',
      inactive: 'warning',
      discontinued: 'destructive',
    };
    return <Badge variant={variants[status] || 'outline'} className="capitalize">{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      {pageError && <ErrorState title={copy("Could not load this page")} body={pageError.message} onRetry={() => retryPage()} />}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="tt-page-title">{t.products.title}</h1>
          <p className="tt-muted text-sm mt-1">
            {t.products.subtitle.replace('{count}', String(products.length))}
          </p>
        </div>
        {canManageStock && <Button onClick={() => { setEditProduct(null); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          {t.products.add_product}
        </Button>}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder={t.products.search_placeholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" strokeWidth={1.75} />}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t.products.all_categories} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.products.all_categories}</SelectItem>
                {categories.map((cat: { id: string; name: string }) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={value => setSort(value as ListSort)}>
              <SelectTrigger aria-label={copy('Sort by')} className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="az">{copy('A–Z')}</SelectItem><SelectItem value="za">{copy('Z–A')}</SelectItem><SelectItem value="newest">{copy('Newest first')}</SelectItem><SelectItem value="oldest">{copy('Oldest first')}</SelectItem></SelectContent>
            </Select>
            <Select value={groupBy} onValueChange={value => setGroupBy(value as ProductGroup)}>
              <SelectTrigger aria-label={copy('Group by')} className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">{copy('No grouping')}</SelectItem><SelectItem value="category">{copy('Group by category')}</SelectItem><SelectItem value="supplier">{copy('Group by supplier')}</SelectItem></SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      {isLoading ? (
        <LoadingState
          rows={6}
          columnLabels={[
            t.products.image,
            t.products.product_name,
            t.products.sku,
            t.products.category,
            t.products.cost_price,
            t.products.selling_price,
            copy('Stock'),
            t.products.product_status,
            t.common.actions,
          ]}
        />
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Package}
              title={t.products.no_products}
              body={t.products.add_first_product}
              action={
                <Button onClick={() => setIsFormOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" strokeWidth={1.75} />
                  {t.products.add_product}
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t.products.image}</TableHead>
                  <TableHead>{t.products.product_name}</TableHead>
                  <TableHead>{t.products.sku}</TableHead>
                  <TableHead>{t.products.category}</TableHead>
                  <TableHead>{t.products.cost_price}</TableHead>
                  <TableHead>{t.products.selling_price}</TableHead>
                  <TableHead>{copy('Stock')}</TableHead>
                  <TableHead>{t.products.product_status}</TableHead>
                  <TableHead className="text-right">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayProducts.map((product, index) => (
                  <React.Fragment key={product.id}>
                  {groupBy !== 'none' && (index === 0 || groupName(displayProducts[index - 1]) !== groupName(product)) && <TableRow><TableCell colSpan={9} className="bg-muted font-semibold">{groupName(product)} <span className="ml-2 text-xs font-normal text-muted-foreground">{copy('{count} products', { count: groupCount(groupName(product)) })}</span></TableCell></TableRow>}
                  <TableRow key={product.id}>
                    <TableCell>
                      <div
                        className="tt-placeholder w-10 h-10 rounded-md flex items-center justify-center overflow-hidden"
                        style={{ background: 'var(--c-surfaceAlt)' }}
                      >
                        {product.image_url ? (
                          <Image
                            src={product.image_url}
                            alt={product.name}
                            width={40}
                            height={40}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <Package className="h-4 w-4 tt-muted" strokeWidth={1.75} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{productVariantLabel(product)}</p>
                        <p className="text-xs text-muted-foreground">{copy(product.stock_unit || 'piece')}</p>
                        {product.make && (
                          <p className="text-xs tt-muted">{product.make}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="tt-mono text-xs bg-muted px-1.5 py-0.5 rounded">{product.sku}</code>
                    </TableCell>
                    <TableCell>
                      {(product.category as { name?: string } | null)?.name ? (
                        <Badge variant="outline" className="text-xs">
                          {(product.category as { name: string }).name}
                        </Badge>
                      ) : (
                        <span className="tt-muted text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="tt-tabular">{formatCurrency(product.cost_price)}</TableCell>
                    <TableCell className="tt-tabular font-semibold">{formatCurrency(product.selling_price)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{totalStock(product as ProductWithStock)}</span>
                        {lowStock(product as ProductWithStock) && <Badge variant="warning" className="gap-1"><AlertTriangle className="h-3 w-3" />{t.inventory.low_stock}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(product.status)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewProduct(product)}>
                            <Eye className="h-4 w-4 mr-2" strokeWidth={1.75} /> {t.products.view_details}
                          </DropdownMenuItem>
                          {canManageStock && <DropdownMenuItem onClick={() => openAdjustment(product as ProductWithStock)}>
                            <SlidersHorizontal className="h-4 w-4 mr-2" strokeWidth={1.75} /> {t.inventory.adjust_stock}
                          </DropdownMenuItem>}
                          {canManageStock && <>
                          <DropdownMenuItem onClick={() => router.push(`/products/${product.id}/edit`)}>
                            <Edit className="h-4 w-4 mr-2" strokeWidth={1.75} /> {t.products.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(product)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" strokeWidth={1.75} /> {t.products.delete}
                          </DropdownMenuItem>
                          </>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Product Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="tt-head">{editProduct ? t.products.edit_product : t.products.add_product}</DialogTitle>
          </DialogHeader>
          <ProductForm
            product={editProduct}
            categories={categories}
            onSuccess={() => {
              setIsFormOpen(false);
              setEditProduct(null);
              queryClient.invalidateQueries({ queryKey: ['products'] });
            }}
            onCancel={() => {
              setIsFormOpen(false);
              setEditProduct(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* View Product Dialog */}
      {viewProduct && (
        <Dialog open={!!viewProduct} onOpenChange={() => setViewProduct(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="tt-head">{t.products.product_details}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div
                  className="tt-placeholder w-20 h-20 rounded-lg flex items-center justify-center overflow-hidden"
                  style={{ background: 'var(--c-surfaceAlt)' }}
                >
                  {viewProduct.image_url ? (
                    <Image src={viewProduct.image_url} alt={viewProduct.name} width={80} height={80} className="object-cover" />
                  ) : (
                    <Package className="h-8 w-8 tt-muted" strokeWidth={1.75} />
                  )}
                </div>
                <div>
                  <h3 className="tt-section-title text-lg">{productVariantLabel(viewProduct)}</h3>
                  {viewProduct.make && <p className="text-sm tt-muted">{viewProduct.make}</p>}
                  <div className="mt-1">{getStatusBadge(viewProduct.status)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="tt-muted">{t.products.sku}:</span> <span className="font-medium tt-mono">{viewProduct.sku}</span></div>
                <div><span className="tt-muted">{t.products.barcode}:</span> <span className="font-medium tt-mono">{viewProduct.barcode || '—'}</span></div>
                <div><span className="tt-muted">{t.products.cost_price}:</span> <span className="font-medium tt-tabular">{formatCurrency(viewProduct.cost_price)}</span></div>
                <div><span className="tt-muted">{t.products.selling_price}:</span> <span className="font-semibold tt-tabular" style={{ color: 'var(--c-success)' }}>{formatCurrency(viewProduct.selling_price)}</span></div>
                <div><span className="tt-muted">{t.products.margin}:</span> <span className="font-medium tt-tabular">
                  {viewProduct.selling_price > 0 ? Math.round(((viewProduct.selling_price - viewProduct.cost_price) / viewProduct.selling_price) * 100) : 0}%
                </span></div>
                <div><span className="tt-muted">{t.products.added}:</span> <span className="font-medium">{formatDate(viewProduct.created_at)}</span></div>
              </div>
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3"><p className="font-medium">{copy('Stock by location')}</p><Badge variant={lowStock(viewProduct) ? 'warning' : 'success'}>{totalStock(viewProduct)} {copy(viewProduct.stock_unit || 'piece')}</Badge></div>
                {stockRows(viewProduct).length ? stockRows(viewProduct).map(row => (
                  <div key={row.id} className="flex min-h-11 items-center justify-between border-t border-border pt-2 text-sm">
                    <span>{row.warehouse?.name || copy('Location')}</span>
                    <span className={Number(row.quantity) <= Number(row.min_stock_level ?? 5) ? 'font-semibold text-[var(--c-warn)]' : 'font-semibold'}>{row.quantity}</span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">{copy('No stock recorded at any location.')}</p>}
                {canManageStock && <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => { setViewProduct(null); openAdjustment(viewProduct); }}><SlidersHorizontal className="h-4 w-4" />{t.inventory.adjust_stock}</Button>}
              </div>
              {viewProduct.description && (
                <div>
                  <p className="text-sm tt-muted">{t.products.description}</p>
                  <p className="text-sm mt-1">{viewProduct.description}</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!adjustProduct} onOpenChange={open => { if (!open) setAdjustProduct(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t.inventory.adjust_stock}</DialogTitle></DialogHeader>
          {adjustProduct && <div className="space-y-4">
            <p className="font-medium">{productVariantLabel(adjustProduct)}</p>
            <div className="space-y-2"><Label>{copy('Location')}</Label><Select value={adjustWarehouse} onValueChange={setAdjustWarehouse}><SelectTrigger><SelectValue placeholder={copy('Choose a location')} /></SelectTrigger><SelectContent>{warehouses.map(warehouse => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>{t.inventory.movement_type}</Label><Select value={adjustDirection} onValueChange={value => setAdjustDirection(value as 'increase' | 'reduce')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="increase">{t.inventory.stock_in_plus}</SelectItem><SelectItem value="reduce">{t.inventory.stock_out_minus}</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>{t.inventory.quantity_required}</Label><Input type="number" min="1" step="1" value={adjustQuantity} onChange={event => setAdjustQuantity(event.target.value)} /></div>
            <div className="space-y-2"><Label>{t.inventory.reason_required}</Label><Textarea value={adjustReason} onChange={event => setAdjustReason(event.target.value)} minLength={3} required /></div>
            <p className="text-sm text-muted-foreground">{copy('Current stock at this location: {count}', { count: stockRows(adjustProduct).find(row => row.warehouse_id === adjustWarehouse)?.quantity ?? 0 })}</p>
            <Button className="min-h-11 w-full" disabled={!adjustWarehouse || !adjustQuantity || adjustReason.trim().length < 3 || adjustMutation.isPending} onClick={submitAdjustment}>{t.inventory.confirm_adjustment}</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
