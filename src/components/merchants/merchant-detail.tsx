'use client';
import { TranslatedText, useCopy } from '@/i18n/text';


import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { AccessGuard } from '@/components/shared/access-guard';
import { DetailTemplate } from '@/components/ui/detail-template';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils/format';

export function MerchantDetail({ id }: { id: string }) {
  return <AccessGuard allow={['platform_owner']}><MerchantRecord id={id} /></AccessGuard>;
}

function MerchantRecord({ id }: { id: string }) {
  const copy = useCopy();
  const query = useQuery({ queryKey: ['merchant-detail', id], queryFn: async () => {
    const { data, error } = await createClient().from('merchants').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  } });
  if (query.isPending) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState title={copy("Merchant unavailable")} body={copy("The merchant could not be loaded. Check your connection and platform access.")} onRetry={() => void query.refetch()} />;
  const merchant = query.data;
  const information = (entries: [string, string | null][]) => <dl className="space-y-4">{entries.map(([label, value]) => <div key={label}><dt className="tt-eyebrow mb-1">{label}</dt><dd className="break-words">{value || 'Not provided'}</dd></div>)}</dl>;
  return <DetailTemplate title={merchant.business_name} subtitle={`Joined ${formatDateTime(merchant.created_at)}`}
    statusBadge={<Badge variant={merchant.status === 'active' ? 'success' : 'secondary'}>{merchant.status}</Badge>}
    secondary={<Button asChild variant="outline"><Link href="/merchants"><TranslatedText text={"Merchant directory"} /></Link></Button>}
    meta={[{ label: 'Verification', value: merchant.verification_status }, { label: 'Business type', value: merchant.business_type || 'Not provided' }]}
    mainContent={<Card><CardHeader><CardTitle><TranslatedText text={"Business profile"} /></CardTitle></CardHeader><CardContent>{information([['Registration number', merchant.registration_number], ['Tax ID', merchant.tax_id], ['Address', merchant.address], ['City / State', [merchant.city, merchant.state].filter(Boolean).join(', ')], ['Country', merchant.country]])}</CardContent></Card>}
    sideContent={<><Card><CardHeader><CardTitle><TranslatedText text={"Primary contact"} /></CardTitle></CardHeader><CardContent>{information([['Name', merchant.contact_name], ['Email', merchant.contact_email], ['Phone', merchant.contact_phone]])}</CardContent></Card><Card><CardHeader><CardTitle><TranslatedText text={"Platform notes"} /></CardTitle></CardHeader><CardContent className="whitespace-pre-wrap break-words text-muted-foreground">{merchant.notes || 'No notes recorded.'}</CardContent></Card></>} />;
}
