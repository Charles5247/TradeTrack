'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { useCopy } from '@/i18n/text';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function DiscountPolicySettings() {
  const copy = useCopy();
  const user = useAuthStore(state => state.user);
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['discount-policy', user?.organization_id], enabled: Boolean(user?.organization_id), queryFn: async () => {
    const { data, error } = await createClient().from('organizations').select('max_discount_percent,discount_approval_minutes').eq('id', user!.organization_id).single();
    if (error) throw error; return data;
  }});
  const [maximum, setMaximum] = useState('');
  const [minutes, setMinutes] = useState('');
  const save = async () => {
    const max = Number(maximum || query.data?.max_discount_percent);
    const expiry = Number(minutes || query.data?.discount_approval_minutes);
    if (max < 0 || max > 100 || expiry < 1 || expiry > 1440) return toast.error(copy('Enter valid discount policy values.'));
    const { error } = await createClient().from('organizations').update({ max_discount_percent: max, discount_approval_minutes: expiry }).eq('id', user!.organization_id);
    if (error) return toast.error(error.message);
    await cache.invalidateQueries({ queryKey: ['discount-policy'] }); toast.success(copy('Discount policy saved'));
  };
  return <Card className="grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto]"><label className="text-sm">{copy('Business maximum discount percent')}<Input type="number" min="0" max="100" step="0.01" placeholder={String(query.data?.max_discount_percent ?? 100)} value={maximum} onChange={event => setMaximum(event.target.value)} /></label><label className="text-sm">{copy('Approval expiry in minutes')}<Input type="number" min="1" max="1440" placeholder={String(query.data?.discount_approval_minutes ?? 15)} value={minutes} onChange={event => setMinutes(event.target.value)} /></label><Button className="self-end" onClick={() => void save()}>{copy('Save discount policy')}</Button></Card>;
}
