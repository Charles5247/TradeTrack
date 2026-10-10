'use client';
import { TranslatedLabel, TranslatedText, useCopy } from '@/i18n/text';


import React, { useEffect, useState } from 'react';
import { Upload, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore, useOrgStore } from '@/store';
import { SUPPORTED_LOCALES, useI18n } from '@/i18n';
import type { Locale } from '@/types';
import { FormTemplate } from '@/components/ui/form-template';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { setAppCurrency, setAppDateFormat } from '@/lib/utils/format';

const initial = { name: '', phone: '', email: '', address: '', currency: 'NGN', timezone: 'Africa/Lagos', logo_url: '', registration_number: '', date_format: 'medium' };
export function BusinessSettings({ localizationOnly = false }: { localizationOnly?: boolean }) {
  const copy = useCopy();
  const { user } = useAuthStore();
  const org = useOrgStore();
  const { locale, setLocale } = useI18n();
  const [language, setLanguage] = useState(locale);
  const [value, setValue] = useState(initial);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const editable = user?.role === 'business_owner' || user?.role === 'admin';
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        if (!user?.organization_id) throw new Error('No business is linked to this account.');
        const { data, error } = await createClient().from('organizations').select('*').eq('id', user.organization_id).single();
        if (error) throw error;
        if (!data) throw new Error('Business profile could not be loaded.');
        const next = Object.fromEntries(Object.entries(initial).map(([key, fallback]) => [key, data[key as keyof typeof data] || fallback])) as typeof initial;
        next.registration_number = String(data.settings?.registration_number || '');
        next.date_format = String(data.settings?.date_format || 'medium');
        if (!disposed) { setValue(next); setSaved(next); setSettings(data.settings || {}); }
      } catch (e) { if (!disposed) setError((e as Error).message || 'Could not load business settings.'); }
      finally { if (!disposed) setLoading(false); }
    })();
    return () => { disposed = true; };
  }, [user?.organization_id, retry]);

  async function save() {
    if (!editable || !user?.organization_id) return;
    if (!value.name.trim()) { setError('Business name is required.'); return; }
    if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) { setError('Enter a valid business email.'); return; }
    setSaving(true); setError('');
    try {
      const { registration_number, date_format, ...profile } = value;
      const { data, error } = await createClient().from('organizations').update({ ...profile, settings: { ...settings, registration_number, date_format }, name: value.name.trim(), updated_at: new Date().toISOString() }).eq('id', user.organization_id).select('id').single();
      if (error) throw error;
      if (!data) throw new Error('Your account cannot update this business.');
      org.setOrganizationName(value.name.trim()); org.setOrganizationPhone(value.phone); org.setOrganizationAddress(value.address); org.setCurrency(value.currency);
      setAppCurrency(value.currency); setAppDateFormat(value.date_format); setLocale(language); setSaved(value);
      toast.success('Business settings saved');
    } catch (e) { setError((e as Error).message || 'Could not save business settings.'); }
    finally { setSaving(false); }
  }

  async function upload(file?: File) {
    if (!file || !editable) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 256 * 1024) {
      setError('Choose a PNG, JPEG or WebP logo smaller than 256 KB.'); return;
    }
    // Small logos live with the existing organization logo field; no orphan uploads.
    const reader = new FileReader();
    reader.onload = () => { setValue(v => ({ ...v, logo_url: String(reader.result) })); setError(''); };
    reader.onerror = () => setError('Could not read this image. Try another file.');
    reader.readAsDataURL(file);
  }
  const field = (key: keyof typeof initial, label: string, type = 'text') => <div className="space-y-1.5"><Label htmlFor={`org_${key}`}><TranslatedLabel>{label}</TranslatedLabel></Label><Input id={`org_${key}`} type={type} value={value[key]} disabled={!editable || saving} onChange={e => setValue({ ...value, [key]: e.target.value })} /></div>;
  if (loading) return <div aria-label={copy("Loading business settings")} className="space-y-5"><Skeleton className="h-72" /><Skeleton className="h-44" /></div>;
  if (error && !saved.name) return <div role="alert" className="rounded-lg border border-destructive/30 p-6"><p>{error}</p><Button className="mt-4" onClick={() => setRetry(v => v + 1)}><TranslatedText text={"Try again"} /></Button></div>;
  return <div className="space-y-4">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <FormTemplate onCancel={() => { setValue(saved); setLanguage(locale); setError(''); }} onSave={editable ? save : undefined} isSaving={saving} sections={[
      ...(!localizationOnly ? [{ title: 'Business profile', description: 'Shown on receipts, invoices, and your Zainpay account.', fields: <div className="grid gap-4 sm:grid-cols-2">{field('name', 'Business name')}{field('registration_number', 'Registered as (CAC)')}{field('phone', 'Phone', 'tel')}{field('email', 'Email', 'email')}<div className="sm:col-span-2">{field('address', 'Address')}</div></div> },
      { title: 'Brand', fields: <div className="flex flex-wrap items-center gap-4"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-dashed bg-muted">{value.logo_url ? <img src={value.logo_url} alt={copy("Business logo")} className="h-full w-full object-contain" /> : <Building2 className="h-8 w-8 text-muted-foreground" />}</div><div className="space-y-2"><p className="font-semibold"><TranslatedText text={"Business logo"} /></p><p className="text-xs text-muted-foreground"><TranslatedText text={"PNG, JPEG or WebP · up to 256 KB · saved with your business profile"} /></p><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><Upload className="h-4 w-4" /><TranslatedText text={"Upload"} /><input aria-label={copy("Upload business logo")} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={!editable || saving} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></label>{value.logo_url && <Button variant="ghost" disabled={!editable || saving} onClick={() => setValue({ ...value, logo_url: '' })}><TranslatedText text={"Remove"} /></Button>}</div></div> }] : []),
      { title: 'Language & currency', description: 'Language applies to this device. Currency and timezone belong to your business.', fields: <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="business_language"><TranslatedText text={"Language"} /></Label><select id="business_language" className="tt-input" value={language} onChange={e => setLanguage(e.target.value as Locale)}>{SUPPORTED_LOCALES.map(l => <option key={l.code} value={l.code}>{l.native}</option>)}</select></div><div className="space-y-1.5"><Label htmlFor="business_currency"><TranslatedText text={"Currency"} /></Label><select id="business_currency" className="tt-input" disabled={!editable} value={value.currency} onChange={e => setValue({ ...value, currency: e.target.value })}>{['NGN', 'USD', 'GBP', 'EUR', 'GHS'].map(c => <option key={c} value={c}>{c === 'NGN' ? 'Naira (₦)' : c}</option>)}</select></div><div className="space-y-1.5"><Label htmlFor="business_timezone"><TranslatedText text={"Timezone"} /></Label><select id="business_timezone" className="tt-input" disabled={!editable} value={value.timezone} onChange={e => setValue({ ...value, timezone: e.target.value })}>{['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'UTC'].map(t => <option key={t}>{t}</option>)}</select></div><div className="space-y-1.5"><Label htmlFor="date-format"><TranslatedText text={"Date format"} /></Label><select id="date-format" className="tt-input" value={value.date_format} disabled={!editable} onChange={e => setValue({ ...value, date_format: e.target.value })}><option value="medium"><TranslatedText text={"24 Aug 2026"} /></option><option value="iso">2026-08-24</option><option value="numeric">24/08/2026</option></select></div></div> },
    ]} />
  </div>;
}
