'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, Mail, MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { useCopy } from '@/i18n/text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const events = [
  'staff_login','sale_made','low_stock','stock_in','stock_adjustment','discount_requested','discount_approved',
  'discount_rejected','discount_given','pending_payment','pending_transfer','purchase_order_status','import_finished',
  'import_failed','payment_confirmed','payment_failed','trial_ending','trial_expired','subscription_changed','sync_failed','app_update',
] as const;

type Preference = { event_type: string; in_app_enabled: boolean; email_enabled: boolean; sms_enabled: boolean };

export function NotificationPreferences() {
  const copy = useCopy();
  const user = useAuthStore(state => state.user);
  const cache = useQueryClient();
  const orgId = user?.organization_id;
  const [credits, setCredits] = useState('100');
  const [mobile, setMobile] = useState(user?.phone || '');
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const query = useQuery({ queryKey: ['notification-preferences', user?.id], enabled: Boolean(user?.id && orgId), queryFn: async () => {
    const db = createClient();
    const [preferences, settings, credits] = await Promise.all([
      db.from('notification_preferences').select('event_type,in_app_enabled,email_enabled,sms_enabled').eq('user_id', user!.id),
      db.from('notification_channel_settings').select('sms_provider_enabled,sms_unit_price_kobo').eq('organization_id', orgId!).maybeSingle(),
      db.from('sms_credit_accounts').select('balance_credits').eq('organization_id', orgId!).maybeSingle(),
    ]);
    if (preferences.error) throw preferences.error;
    return { preferences: preferences.data as Preference[], settings: settings.data, credits: credits.data };
  }});
  const preference = (eventType: string) => query.data?.preferences.find(item => item.event_type === eventType) || { event_type: eventType, in_app_enabled: true, email_enabled: false, sms_enabled: false };
  const smsReady = Boolean(query.data?.settings?.sms_provider_enabled && query.data.settings.sms_unit_price_kobo && Number(query.data?.credits?.balance_credits || 0) > 0);
  const save = async (eventType: string, channel: 'in_app_enabled' | 'email_enabled' | 'sms_enabled', checked: boolean) => {
    if (!user?.id || !orgId || (channel === 'sms_enabled' && !smsReady)) return;
    const current = preference(eventType);
    const { error } = await createClient().from('notification_preferences').upsert({ ...current, [channel]: checked, user_id: user.id, organization_id: orgId, updated_at: new Date().toISOString() }, { onConflict: 'user_id,event_type' });
    if (error) throw error;
    await cache.invalidateQueries({ queryKey: ['notification-preferences', user.id] });
  };
  const buyCredits = async () => {
    setCheckoutBusy(true); setCheckoutError('');
    try {
      const { data } = await createClient().auth.getSession();
      const response = await fetch('/api/sms-credits/initialize', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` }, body: JSON.stringify({ credits: Number(credits), mobile }) });
      const result = await response.json();
      if (!response.ok || !result.paymentUrl) throw new Error(result.error || 'Could not start checkout');
      window.location.assign(result.paymentUrl);
    } catch (error) { setCheckoutError(error instanceof Error ? error.message : 'Could not start checkout'); setCheckoutBusy(false); }
  };

  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />{copy('Notification preferences')}</CardTitle><CardDescription>{copy('In-app alerts are on by default. Choose email or SMS separately for each event.')}</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm"><AlertTriangle className="h-5 w-5 shrink-0 text-warning" /><p>{copy('Every-sale email and SMS alerts are off by default because they can create high message volume and SMS cost.')}</p></div>
    {query.error && <p role="alert" className="text-sm text-destructive">{copy('Notification preferences need the notification database update before they can be saved.')}</p>}
    <div className="grid grid-cols-[minmax(0,1fr)_52px_52px_52px] items-center gap-2 text-center text-xs font-semibold text-muted-foreground"><span className="text-left">{copy('Event')}</span><Bell className="mx-auto h-4 w-4" /><Mail className="mx-auto h-4 w-4" /><MessageSquare className="mx-auto h-4 w-4" /></div>
    {events.map(eventType => { const row = preference(eventType); return <div key={eventType} className="grid min-h-11 grid-cols-[minmax(0,1fr)_52px_52px_52px] items-center gap-2 border-t py-2"><span className="text-sm capitalize">{copy(eventType.replaceAll('_',' '))}</span>{(['in_app_enabled','email_enabled','sms_enabled'] as const).map(channel => <label key={channel} className="flex min-h-11 min-w-11 items-center justify-center"><input aria-label={`${eventType} ${channel}`} type="checkbox" checked={row[channel]} disabled={query.isLoading || (channel === 'sms_enabled' && !smsReady)} onChange={event => void save(eventType, channel, event.target.checked)} /></label>)}</div>; })}
    <p className="text-sm text-muted-foreground">{smsReady ? copy('SMS cost per message: ₦{amount}. Credits remaining: {credits}.', { amount: Number(query.data?.settings?.sms_unit_price_kobo || 0) / 100, credits: Number(query.data?.credits?.balance_credits || 0) }) : copy('SMS is unavailable until a provider, price and business-funded credits are configured.')}</p>
    {query.data?.settings?.sms_unit_price_kobo && <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto]"><label className="text-sm">{copy('SMS credits')}<Input inputMode="numeric" value={credits} onChange={event => setCredits(event.target.value)} /></label><label className="text-sm">{copy('Payment phone number')}<Input type="tel" value={mobile} onChange={event => setMobile(event.target.value)} /></label><Button className="self-end" disabled={checkoutBusy} onClick={() => void buyCredits()}>{copy('Buy SMS credits')}</Button>{checkoutError && <p role="alert" className="text-sm text-destructive sm:col-span-3">{checkoutError}</p>}</div>}
  </CardContent></Card>;
}
