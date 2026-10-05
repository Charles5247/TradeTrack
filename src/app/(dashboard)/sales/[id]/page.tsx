import { SaleDetail } from '@/components/sales/sale-detail';

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  return <SaleDetail id={(await params).id} />;
}
