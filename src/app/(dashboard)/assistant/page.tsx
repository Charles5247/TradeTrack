'use client';
import { TranslatedText, useCopy } from '@/i18n/text';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AccessGuard } from '@/components/shared/access-guard';
import { StockReceivingReview } from '@/components/ai/stock-receiving-review';
import { InvoiceOrderReview } from '@/components/ai/invoice-order-review';
import { parseImportFile } from '@/lib/imports/parse';
import type { ImportRow } from '@/lib/imports/preview';
import type { Insight } from '@/lib/ai/types';
import { useAuthStore } from '@/store';
import { clearStockReview, createStockReview, loadStockReview, resumeLegacyStockReview, type StockReviewDraft, type StockReviewScope } from '@/lib/ai/stock-review-draft';

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
  const user = useAuthStore(state => state.user);
  return <AccessGuard allow={['business_owner']}>
    {user?.role === 'business_owner' && user.status === 'active' && user.organization_id &&
      <AssistantWorkspace key={`${user.organization_id}:${user.id}`} scope={{ ownerId: user.id, organizationId: user.organization_id }} />}
  </AccessGuard>;
}

function AssistantWorkspace({ scope }: { scope: StockReviewScope }) {
  const copy = useCopy();
  const [question, setQuestion] = useState('');
  const [text, setText] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ stub: boolean; channels: Record<'in_app' | 'email' | 'sms', boolean> } | null>(null); const [preferences, setPreferences] = useState({ in_app: false, email: false, sms: false });
  const [proposal, setProposal] = useState<StockReviewDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(true);
  const [draftError, setDraftError] = useState('');
  const [receiptBusy, setReceiptBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  const [report, setReport] = useState<{ job: string; insights: Insight[]; comparison?: {
    current: { from: string; to: string; sales: number; revenue: number };
    previous: { from: string; to: string; sales: number; revenue: number };
    changePercent: number | null; missingItemSales: number;
    topProducts: { name: string; units: number; revenue: number }[] } } | null>(null);
  const [channel, setChannel] = useState<'in_app' | 'email' | 'sms'>('in_app'); const [notice, setNotice] = useState('');
  const sameAccount = useCallback(() => {
    const current = useAuthStore.getState().user;
    return mounted.current && current?.id === scope.ownerId && current.organization_id === scope.organizationId
      && current.role === 'business_owner' && current.status === 'active';
  }, [scope.ownerId, scope.organizationId]);
  const restoreDraft = useCallback(() => loadStockReview({ ownerId: scope.ownerId, organizationId: scope.organizationId })
    .then(saved => saved || resumeLegacyStockReview({ ownerId: scope.ownerId, organizationId: scope.organizationId }))
    .then(saved => { if (sameAccount()) { setProposal(saved); setDraftError(''); } })
    .catch(cause => { if (sameAccount()) setDraftError(cause instanceof Error ? cause.message : 'Could not open the saved stock review.'); })
    .finally(() => { if (sameAccount()) setDraftLoading(false); }), [sameAccount, scope.ownerId, scope.organizationId]);
  useEffect(() => {
    mounted.current = true;
    void restoreDraft();
    void fetch('/api/ai').then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      if (sameAccount()) { setStatus(data); setPreferences(data.preferences); }
    }).catch(cause => { if (sameAccount()) setError(cause instanceof Error ? cause.message : 'Assistant unavailable'); });
    return () => { mounted.current = false; };
  }, [restoreDraft, sameAccount]);
  const run = async (action: () => Promise<void>) => {
    if (running.current || !sameAccount()) return;
    running.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (cause) { if (sameAccount()) setError(cause instanceof Error ? cause.message : 'Assistant unavailable'); }
    finally { running.current = false; if (sameAccount()) setBusy(false); }
  };
  const proposeStock = async (body: Record<string, unknown>) => {
    if (proposal || draftLoading || draftError) return;
    const result: { job: string; rows: ImportRow[] } = await call(body);
    if (!sameAccount()) return;
    try {
      const saved = await createStockReview(scope, result.job, result.rows);
      if (sameAccount()) setProposal(saved);
    } catch (cause) {
      // A second tab may have opened a review while this request was processing.
      await restoreDraft();
      throw cause;
    }
  };
  const closeReview = async () => {
    const current = await loadStockReview(scope);
    if (!sameAccount()) return;
    if (current && current.job !== proposal?.job)
      throw new Error('Another stock review is now active. Reopen the assistant before closing it.');
    if (current) await clearStockReview(scope, current);
    if (sameAccount()) {
      try { if (window.localStorage.getItem('trackasuwa.ai.stockJob') === current?.job) window.localStorage.removeItem('trackasuwa.ai.stockJob'); } catch { /* Scoped IndexedDB remains authoritative. */ }
      setProposal(null); setText(''); setNotice('Review closed. Completed stock receipts are unchanged.');
    }
  };
  return <div className="min-w-0 space-y-6 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:h-auto [&_button]:min-h-11 [&_button]:py-2">
    <h1 className="tt-page-title"><TranslatedText text={"TracKasuwa assistant"} /></h1>
    <p className="tt-muted text-sm"><TranslatedText text={"Prepare product imports and review insights from your business data."} /></p><p className="rounded-lg border border-border bg-muted p-4 text-sm"><TranslatedText text={status && !status.stub ? "The assistant drafts stock entries and compares invoice photos with sent purchase orders. Review every amount. Invoice comparisons do not receive stock." : "Current assistant preview: fixed rules, with no live AI model or external market data. Photo extraction requires a configured live provider."} /></p>
    <p><Link className="text-sm font-medium text-primary underline underline-offset-4" href="/imports"><TranslatedText text={"Business imports"} /></Link> · <Link className="text-sm font-medium text-primary underline underline-offset-4" href="/notifications"><TranslatedText text={"Notifications"} /></Link></p>
    {busy && <p role="status" className="tt-muted text-sm"><TranslatedText text={"Working on your request?"} /></p>}{!status && !error && <p role="status" className="tt-muted text-sm"><TranslatedText text={"Loading assistant preferences?"} /></p>}{error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    {draftLoading && <p role="status">{copy('Opening your saved stock review...')}</p>}
    {draftError && <div role="alert"><p>{draftError}</p><Button variant="outline" disabled={draftLoading} onClick={() => { setDraftLoading(true); setDraftError(''); void restoreDraft(); }}>{copy('Try opening saved review again')}</Button></div>}
    {proposal && <div className="space-y-2 rounded-lg border border-border p-4">
      <p>{copy('Your stock review is saved on this device for this account. Finish pending receipts before starting another delivery. Closing a review discards rows you have not applied.')}</p>
      <Button variant="outline" disabled={busy || receiptBusy} onClick={() => void run(closeReview)}>{copy('Close this review')}</Button>
    </div>}
    <fieldset id="inventory" disabled={busy || !status || draftLoading || !!draftError || !!proposal} className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6">
      <legend className="tt-section-title px-2"><TranslatedText text={"Stock receiving draft"} /></legend><p>Paste a list, upload a spreadsheet, photo or voice recording. Review every product, quantity and cost before saving stock.</p>
      <Input aria-label={copy("Product CSV or Excel file")} type="file" accept=".csv,.xlsx" onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => { const rows = await parseImportFile(file); const headers = Array.from(new Set(rows.flatMap(Object.keys))); setText([headers.join('\t'), ...rows.map(row => headers.map(h => String(row[h] ?? '').replace(/[\t\r\n]/g,' ')).join('\t'))].join('\n')); }); }} />
      {status?.stub ? <p className="text-sm text-muted-foreground">Photo and voice extraction need a live AI provider configured on the server.</p> : <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Stock-list photo <Input aria-label="Stock-list photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => proposeStock({ action: 'inventory_image', image: await stockPhotoDataUrl(file) })); }} /></label>
        <label className="text-sm">Voice stock list <Input aria-label="Voice stock list" type="file" accept="audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/x-m4a" onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => { if (file.size > 2_000_000) throw new Error('Voice recording must be under 2 MB.'); await proposeStock({ action: 'inventory_audio', audio: await fileDataUrl(file) }); }); }} /></label>
      </div>}
      <Textarea aria-label={copy("Messy product data")}  rows={7} value={text} onChange={e => setText(e.target.value)} />
      <Button  onClick={() => void run(async () => proposeStock({ action: 'inventory', text }))}><TranslatedText text={"Propose mapped rows"} /></Button>
    </fieldset>
    {proposal && <StockReceivingReview key={proposal.job} job={proposal.job} rows={proposal.sourceRows} onBusyChange={setReceiptBusy} />}
    <InvoiceOrderReview enabled={Boolean(status && !status.stub)} />
    <fieldset id="insights" disabled={busy || !status} className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6"><legend className="tt-section-title px-2"><TranslatedText text={"Business insights"} /></legend>
      <Textarea aria-label={copy("Ask about your business")} placeholder={copy("Ask about your sales or stock")} maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} />
      <Button onClick={() => void run(async () => setReport(await call({ action: 'insights', question })))}><TranslatedText text={"Generate organization-only insights"} /></Button>
      {report && <div className="space-y-3">{report.comparison && <div className="rounded-lg border border-border p-4 text-sm">
        <h3 className="font-semibold">{copy('Sales figures from rolling 30-day windows')}</h3>
        <p>{new Date(report.comparison.current.from).toLocaleString()} {copy('to')} {new Date(report.comparison.current.to).toLocaleString()}: {report.comparison.current.sales} {copy('sales')} · ₦{report.comparison.current.revenue.toLocaleString()}</p>
        <p>{new Date(report.comparison.previous.from).toLocaleString()} {copy('to')} {new Date(report.comparison.previous.to).toLocaleString()}: {report.comparison.previous.sales} {copy('sales')} · ₦{report.comparison.previous.revenue.toLocaleString()}</p>
        <p>{report.comparison.changePercent === null ? copy('Not enough prior-period revenue for a percentage comparison.') : `${copy('Revenue change')}: ${report.comparison.changePercent > 0 ? '+' : ''}${report.comparison.changePercent}%`}</p>
        {report.comparison.missingItemSales > 0 && <p>{report.comparison.missingItemSales} {copy('sales have no item rows, so product rankings are incomplete.')}</p>}
        {report.comparison.topProducts.length > 0 && <><p className="mt-2 font-medium">{copy('Top products by recorded line value')}</p><ol className="list-decimal pl-5">{report.comparison.topProducts.map(product => <li key={product.name}>{product.name}: {product.units} {copy('units')} · ₦{product.revenue.toLocaleString()}</li>)}</ol></>}
        <Link className="text-primary underline" href="/reports">{copy('Check reports and source records')}</Link>
      </div>}{report.insights.map(i => <article key={i.title}><h3 className="font-semibold">{i.title}</h3><p>{i.message}</p></article>)}
        <label className="block min-w-0 space-y-2 text-sm font-medium"><TranslatedText text={"Deliver this preview to your profile"} />{" "}<NativeSelect  value={channel} onChange={e => setChannel(e.target.value as typeof channel)}>{(['in_app','email','sms'] as const).map(c => <option key={c} value={c} disabled={!status?.channels[c]}>{c.replace('_',' ')}<TranslatedText text={!status?.channels[c] ? ' (disabled)' : ''} /></option>)}</NativeSelect></label>
        <Button  onClick={() => void run(async () => { await call({ action: 'deliver', job: report.job, channel, confirm: true }); setNotice('Insight delivered.'); })}><TranslatedText text={"Confirm and deliver displayed insights"} /></Button>
      </div>}
    </fieldset>
    <fieldset disabled={busy || !status} className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6"><legend className="tt-section-title px-2"><TranslatedText text={"Your delivery opt-ins"} /></legend>
      {(['in_app','email','sms'] as const).map(c => <label className="block" key={c}><input type="checkbox" checked={preferences[c]} disabled={!status?.channels[c]} onChange={e => setPreferences(p => ({ ...p, [c]: e.target.checked }))} /> {c.replace('_',' ')}<TranslatedText text={!status?.channels[c] ? ' — adapter not configured' : ''} /></label>)}
      <Button  onClick={() => void run(async () => { await call({ action: 'preferences', ...preferences, confirm: true }); setNotice('Delivery preferences saved.'); })}><TranslatedText text={"Confirm delivery preferences"} /></Button>
      <p><TranslatedText text={"Limits: 20 requests per hour; 5 deliveries per channel per hour. Each insight can be delivered once per channel."} /></p>
    </fieldset>
  </div>;
}
