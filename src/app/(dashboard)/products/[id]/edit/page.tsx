import { ProductEdit } from '@/components/products/product-edit';

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  return <ProductEdit id={(await params).id} />;
}
