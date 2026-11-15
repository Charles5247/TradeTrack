'use client';
import { TranslatedText, useCopy } from '@/i18n/text';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AccessGuard } from '@/components/shared/access-guard';
import { StockReceivingReview } from '@/components/ai/stock-receiving-review';
import { parseImportFile } from '@/lib/imports/parse';
import type { ImportRow } from '@/lib/imports/preview';
import type { Insight } from '@/lib/ai/types';

async function call(body: Record<string, unknown>) {
  const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
async function fileDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.readAsDataURL(file);
  });
}

async function stockPhotoDataUrl(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo.');
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not open this photo.')); image.src = url; });
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This device cannot prepare the photo. Try a smaller image file.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encoded = canvas.toDataURL('image/jpeg', 0.78);
    if (encoded.length > 3_000_000) throw new Error('Photo is too large after resizing. Try a clearer, closer photo.');
    return encoded;
  } finally { URL.revokeObjectURL(url); }
}
export default function AssistantPage() {
  const copy = useCopy();
  const [question, setQuestion] = useState('');
  const [text, setText] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ stub: boolean; channels: Record<'in_app' | 'email' | 'sms', boolean> } | null>(null); const [preferences, setPreferences] = useState({ in_app: false, email: false, sms: false });
  const [proposal, setProposal] = useState<{ job: string; rows: ImportRow[] } | null>(null);
  const [report, setReport] = useState<{ job: string; insights: Insight[] } | null>(null);
  const [channel, setChannel] = useState<'in_app' | 'email' | 'sms'>('in_app'); const [notice, setNotice] = useState('');
  useEffect(() => {
    void fetch('/api/ai').then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setStatus(data); setPreferences(data.preferences); }).catch(e => setError(e.message));
    const job = window.localStorage.getItem('trackasuwa.ai.stockJob');
    if (job) void fetch(`/api/ai/stock-receipts?job=${encodeURIComponent(job)}`)
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(data => { if (Array.isArray(data.rows)) setProposal({ job, rows: data.rows }); })
      .catch(() => window.localStorage.removeItem('trackasuwa.ai.stockJob'));
  }, []);
  const rememberProposal = (result: { job: string; rows: ImportRow[] }) => {
    window.localStorage.setItem('trackasuwa.ai.stockJob', result.job);
    setProposal(result);
  };
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Assistant unavailable'); } finally { setBusy(false); } };
  return <AccessGuard allow={['business_owner']}><div className="min-w-0 space-y-6 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:h-auto [&_button]:min-h-11 [&_button]:py-2">
    <h1 className="tt-page-title"><TranslatedText text={"TracKasuwa assistant"} /></h1>
    <p className="tt-muted text-sm"><TranslatedText text={"Prepare product imports and review insights from your business data."} /></p><p className="rounded-lg border border-border bg-muted p-4 text-sm"><TranslatedText text={status && !status.stub ? "Current assistant preview: AI can map inventory and summarize records. Review all import changes before applying. Document receiving and purchase-order reconciliation are still being built." : "Current assistant preview: fixed rules, with no live AI model or external market data. Document receiving and purchase-order reconciliation are still being built."} /></p>
    <p><Link className="text-sm font-medium text-primary underline underline-offset-4" href="/imports"><TranslatedText text={"Business imports"} /></Link> · <Link className="text-sm font-medium text-primary underline underline-offset-4" href="/notifications"><TranslatedText text={"Notifications"} /></Link></p>
    {busy && <p role="status" className="tt-muted text-sm"><TranslatedText text={"Working on your request?"} /></p>}{!status && !error && <p role="status" className="tt-muted text-sm"><TranslatedText text={"Loading assistant preferences?"} /></p>}{error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    <fieldset id="inventory" disabled={busy || !status} className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6">
      <legend className="tt-section-title px-2"><TranslatedText text={"Stock receiving draft"} /></legend><p>Paste a list, upload a spreadsheet, photo or voice recording. Review every product, quantity and cost before saving stock.</p>
      <Input aria-label={copy("Product CSV or Excel file")} type="file" accept=".csv,.xlsx" onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => { const rows = await parseImportFile(file); const headers = Array.from(new Set(rows.flatMap(Object.keys))); setText([headers.join('\t'), ...rows.map(row => headers.map(h => String(row[h] ?? '').replace(/[\t\r\n]/g,' ')).join('\t'))].join('\n')); }); }} />
      {status?.stub ? <p className="text-sm text-muted-foreground">Photo and voice extraction need a live AI provider configured on the server.</p> : <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Stock-list photo <Input aria-label="Stock-list photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => rememberProposal(await call({ action: 'inventory_image', image: await stockPhotoDataUrl(file) }))); }} /></label>
        <label className="text-sm">Voice stock list <Input aria-label="Voice stock list" type="file" accept="audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/x-m4a" onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => { if (file.size > 2_000_000) throw new Error('Voice recording must be under 2 MB.'); rememberProposal(await call({ action: 'inventory_audio', audio: await fileDataUrl(file) })); }); }} /></label>
      </div>}
      <Textarea aria-label={copy("Messy product data")}  rows={7} value={text} onChange={e => setText(e.target.value)} />
      <Button  onClick={() => void run(async () => rememberProposal(await call({ action: 'inventory', text })))}><TranslatedText text={"Propose mapped rows"} /></Button>
    </fieldset>
    {proposal && <StockReceivingReview key={proposal.job} job={proposal.job} rows={proposal.rows} />}
    <fieldset id="insights" disabled={busy || !status} className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6"><legend className="tt-section-title px-2"><TranslatedText text={"Business insights"} /></legend>
      <Textarea aria-label={copy("Ask about your business")} placeholder={copy("Ask about your sales or stock")} maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} />
      <Button onClick={() => void run(async () => setReport(await call({ action: 'insights', question })))}><TranslatedText text={"Generate organization-only insights"} /></Button>
      {report && <div className="space-y-3">{report.insights.map(i => <article key={i.title}><h3 className="font-semibold">{i.title}</h3><p>{i.message}</p></article>)}
        <label className="block min-w-0 space-y-2 text-sm font-medium"><TranslatedText text={"Deliver this preview to your profile"} />{" "}<NativeSelect  value={channel} onChange={e => setChannel(e.target.value as typeof channel)}>{(['in_app','email','sms'] as const).map(c => <option key={c} value={c} disabled={!status?.channels[c]}>{c.replace('_',' ')}<TranslatedText text={!status?.channels[c] ? ' (disabled)' : ''} /></option>)}</NativeSelect></label>
        <Button  onClick={() => void run(async () => { await call({ action: 'deliver', job: report.job, channel, confirm: true }); setNotice('Insight delivered.'); })}><TranslatedText text={"Confirm and deliver displayed insights"} /></Button>
      </div>}
    </fieldset>
    <fieldset disabled={busy || !status} className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6"><legend className="tt-section-title px-2"><TranslatedText text={"Your delivery opt-ins"} /></legend>
      {(['in_app','email','sms'] as const).map(c => <label className="block" key={c}><input type="checkbox" checked={preferences[c]} disabled={!status?.channels[c]} onChange={e => setPreferences(p => ({ ...p, [c]: e.target.checked }))} /> {c.replace('_',' ')}<TranslatedText text={!status?.channels[c] ? ' — adapter not configured' : ''} /></label>)}
      <Button  onClick={() => void run(async () => { await call({ action: 'preferences', ...preferences, confirm: true }); setNotice('Delivery preferences saved.'); })}><TranslatedText text={"Confirm delivery preferences"} /></Button>
      <p><TranslatedText text={"Limits: 20 requests per hour; 5 deliveries per channel per hour. Each insight can be delivered once per channel."} /></p>
    </fieldset>
  </div></AccessGuard>;
}
