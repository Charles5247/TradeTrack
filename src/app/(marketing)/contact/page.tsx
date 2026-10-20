'use client';
import { useState } from 'react';
import { BUSINESS } from '@/lib/business-config';
import { useCopy } from '@/i18n/text';
import { WhatsAppLink } from '@/components/marketing/whatsapp-link';

export default function ContactPage() {
  const copy = useCopy();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [offlineDraft, setOfflineDraft] = useState<Record<string, string> | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>;
    if (!navigator.onLine) { setOfflineDraft(data); setStatus('You are offline. Save a draft and send it when connected.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      setStatus(response.ok ? 'Your message has been saved. We will respond during support hours.' : 'Please contact us on WhatsApp.');
      if (response.ok) localStorage.removeItem('track:contact-draft');
    } catch { setOfflineDraft(data); setStatus('You are offline. Save a draft and send it when connected.'); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-5xl px-4 py-12 sm:py-20">
    <p className="tt-eyebrow">TracKasuwa</p><h1 className="tt-head mt-3 text-4xl sm:text-5xl">{copy('Contact us')}</h1>
    <p className="mt-4 max-w-xl text-lg">{copy('We help you set up and keep your business records in order.')}</p>
    <div className="mt-10 grid gap-10 md:grid-cols-2">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <WhatsAppLink /><p><a className="underline" href={`tel:${BUSINESS.phoneInternational}`}>{BUSINESS.phone}</a></p>
        <p><a className="break-all underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a></p>
        <p>{copy(BUSINESS.location)}</p><p>{copy(BUSINESS.supportHours)}</p>
        <p>{copy('Messages outside support hours are answered the next morning. The app works offline 24/7.')}</p>
        <div id="installation" className="border-t border-border pt-5"><h2 className="text-xl font-semibold">{copy('Book onsite installation')}</h2>
          <p className="mt-3">{copy('First installation is free for new users. Contact us to arrange your setup.')}</p>
          <p className="mt-3">{copy('Returning users: {mobile} per mobile device, {pc} per PC.').replace('{mobile}', `₦${BUSINESS.mobileInstallation.toLocaleString()}`).replace('{pc}', `₦${BUSINESS.pcInstallation.toLocaleString()}`)}</p>
          <p className="mt-3"><WhatsAppLink /></p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        {([['name','Your name',150],['business_name','Business name',200],['phone','Phone / WhatsApp',30]] as const).map(([name,label,max]) => <label key={name} className="block text-sm font-medium">{copy(label)}<input required name={name} maxLength={max} minLength={name === 'phone' ? 7 : 2} type={name === 'phone' ? 'tel' : 'text'} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-3" /></label>)}
        <label className="block text-sm font-medium">{copy('Message')}<textarea required name="message" minLength={5} maxLength={5000} rows={5} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
        <button disabled={busy} className="rounded-lg bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50">{copy(busy ? 'Sending…' : 'Send message')}</button>
        <button type="button" className="ml-3 underline" onClick={e => { const saved = localStorage.getItem('track:contact-draft'); if (!saved) return; const form=e.currentTarget.form; try { const data=JSON.parse(saved); for(const key of ['name','business_name','phone','message']) { const field=form?.elements.namedItem(key) as HTMLInputElement; if(field) field.value=String(data[key] ?? ''); } } catch { setStatus('Please check the form fields.'); } }}>{copy('Restore draft')}</button>
        {offlineDraft && <button type="button" className="block underline" onClick={() => { localStorage.setItem('track:contact-draft',JSON.stringify(offlineDraft)); setOfflineDraft(null); setStatus('Draft saved on this device.'); }}>{copy('Save draft on this device')}</button>}
        <p role="status">{copy(status)}</p>
      </form>
    </div>
  </section>;
}
