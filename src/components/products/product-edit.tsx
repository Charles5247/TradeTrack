'use client';
import { TranslatedText, useCopy } from '@/i18n/text';


import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { AccessGuard } from '@/components/shared/access-guard';
import { ProductForm } from '@/components/products/product-form';
import { FormTemplate } from '@/components/ui/form-template';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import type { Product } from '@/types';

export function ProductEdit({ id }: { id: string }) {
  return <AccessGuard allow={['business_owner', 'admin']}><ProductRecord id={id} /></AccessGuard>;
}

function ProductRecord({ id }: { id: string }) {
  const copy = useCopy();
  const user = useAuthStore(s => s.user);
  const router = useRouter();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['product-edit', user?.organization_id, id],
    enabled: Boolean(user?.organization_id),
    queryFn: async () => {
      const client = createClient();
      const [product, categories] = await Promise.all([
        client.from('products').select('*').eq('organization_id', user!.organization_id!).eq('id', id).single(),
        client.from('categories').select('id, name').eq('organization_id', user!.organization_id!).order('name'),
      ]);
      if (product.error) throw product.error;
      if (categories.error) throw categories.error;
      return { product: product.data as Product, categories: categories.data };
    },
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState title={copy("Product unavailable")} body={copy("Check your connection and product access.")} onRetry={() => void query.refetch()} />;
  return <div className="space-y-6"><div><h1 className="tt-page-title"><TranslatedText text={"Edit product"} /></h1><p className="tt-muted mt-2"><TranslatedText text={"Update"} />{" "}{query.data.product.name}<TranslatedText text={", pricing and product details."} /></p></div><FormTemplate sections={[{ title: 'Product information', fields: <ProductForm product={query.data.product} categories={query.data.categories} onCancel={() => router.push('/products')} onSuccess={() => { void cache.invalidateQueries({ queryKey: ['products'] }); router.push('/products'); }} /> }]} /></div>;
}
