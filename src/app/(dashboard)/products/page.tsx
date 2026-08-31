'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, Package, MoreHorizontal, Eye } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
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

async function fetchProducts(search?: string, categoryId?: string) {
  const supabase = createClient();
  let query = supabase
    .from('products')
    .select('*, category:categories(name), supplier:suppliers(name)')
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
  }
  if (categoryId && categoryId !== 'all') {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query;
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any) as Product[];
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
    <AccessGuard allow={['business_owner', 'admin']}>
      <ProductsPageInner />
    </AccessGuard>
  );
}

function ProductsPageInner() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search, categoryFilter],
    queryFn: () => fetchProducts(search || undefined, categoryFilter),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="tt-page-title">{t.products.title}</h1>
          <p className="tt-muted text-sm mt-1">
            {t.products.subtitle.replace('{count}', String(products.length))}
          </p>
        </div>
        <Button onClick={() => { setEditProduct(null); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          {t.products.add_product}
        </Button>
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
                  <TableHead>{t.products.product_status}</TableHead>
                  <TableHead className="text-right">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
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
                        <p className="font-medium">{product.name}</p>
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
                          <DropdownMenuItem onClick={() => { setEditProduct(product); setIsFormOpen(true); }}>
                            <Edit className="h-4 w-4 mr-2" strokeWidth={1.75} /> {t.products.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(product)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" strokeWidth={1.75} /> {t.products.delete}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
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
                  <h3 className="tt-section-title text-lg">{viewProduct.name}</h3>
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
    </div>
  );
}
