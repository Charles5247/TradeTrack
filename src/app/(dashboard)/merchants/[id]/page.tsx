import { MerchantDetail } from '@/components/merchants/merchant-detail';

export default async function MerchantPage({ params }: { params: Promise<{ id: string }> }) {
  return <MerchantDetail id={(await params).id} />;
}
