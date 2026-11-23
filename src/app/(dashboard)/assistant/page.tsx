'use client';
import { useCopy } from '@/i18n/text';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bell, ChartNoAxesColumnIncreasing, ClipboardList, PackagePlus, WifiOff } from 'lucide-react';
import { AccessGuard } from '@/components/shared/access-guard';
import { StockReceivingReview } from '@/components/ai/stock-receiving-review';
import { InvoiceOrderReview } from '@/components/ai/invoice-order-review';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { parseImportFile } from '@/lib/imports/parse';
import type { ImportRow } from '@/lib/imports/preview';
import type { Insight } from '@/lib/ai/types';
import { useAuthStore } from '@/store';
import { clearStockReview, createStockReview, loadStockReview, resumeLegacyStockReview, type StockReviewDraft, type StockReviewScope } from '@/lib/ai/stock-review-draft';

const deliveryChannels = ['in_app', 'email', 'sms'] as const;

async function call(body: Record<string, unknown>, scope: StockReviewScope) {
  if (!navigator.onLine) throw new Error('Reconnect to use the assistant. Saved stock reviews remain on this device.');
  const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json',
    'X-Track-Expected-Owner': scope.ownerId, 'X-Track-Expected-Organization': scope.organizationId }, body: JSON.stringify(body) });
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
  const online = useOnlineStatus();
  const [question, setQuestion] = useState('');
  const [text, setText] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [inputSource, setInputSource] = useState<{ kind: 'csv' | 'xlsx'; text: string; file_name: string } | null>(null);
  const [status, setStatus] = useState<{ stub: boolean; channels: Record<'in_app' | 'email' | 'sms', boolean> } | null>(null); const [preferences, setPreferences] = useState({ in_app: false, email: false, sms: false });
  const [statusError, setStatusError] = useState('');
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [proposal, setProposal] = useState<StockReviewDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(true);
  const [draftError, setDraftError] = useState('');
  const [receiptBusy, setReceiptBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  const draftRequest = useRef(0);
  const receivingHeading = useRef<HTMLHeadingElement>(null);
  const focusReview = useRef(false);
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
  const restoreDraft = useCallback(async () => {
    const request = ++draftRequest.current;
    const account = { ownerId: scope.ownerId, organizationId: scope.organizationId };
    const canUpdate = () => request === draftRequest.current && sameAccount();
    try {
      const current = await loadStockReview(account);
      if (!canUpdate()) return;
      const saved = current || (navigator.onLine ? await resumeLegacyStockReview(account) : null);
      if (!canUpdate()) return;
      setProposal(saved);
      setDraftError('');
    } catch (cause) {
      if (canUpdate()) setDraftError(cause instanceof Error ? cause.message : 'Could not open the saved stock review.');
    } finally {
      if (canUpdate()) setDraftLoading(false);
    }
  }, [sameAccount, scope.ownerId, scope.organizationId]);
  useEffect(() => {
    let disposed = false;
    mounted.current = true;
    queueMicrotask(() => { if (!disposed) void restoreDraft(); });
    const openPanelReview = () => {
      focusReview.current = true;
      setDraftLoading(true);
      void restoreDraft();
    };
    window.addEventListener('trackasuwa:stock-review-opened', openPanelReview);
    return () => {
      disposed = true;
      mounted.current = false;
      draftRequest.current += 1;
      window.removeEventListener('trackasuwa:stock-review-opened', openPanelReview);
    };
  }, [restoreDraft]);
  useEffect(() => {
    if (!online || !navigator.onLine) return;
    const request = new AbortController();
    void fetch('/api/ai', { signal: request.signal }).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      if (!request.signal.aborted && sameAccount()) {
        setStatus(data);
        setPreferences(data.preferences);
        setStatusError('');
      }
    }).catch(cause => {
      if (!request.signal.aborted && sameAccount()) {
        setStatusError(cause instanceof Error ? cause.message : 'Assistant unavailable');
      }
    });
    return () => request.abort();
  }, [online, sameAccount, statusAttempt]);
  useEffect(() => {
    if (proposal && focusReview.current) {
      focusReview.current = false;
      receivingHeading.current?.focus();
    }
  }, [proposal]);
  const run = async (action: () => Promise<void>) => {
    if (running.current || !sameAccount()) return;
    running.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (cause) { if (sameAccount()) setError(cause instanceof Error ? cause.message : 'Assistant unavailable'); }
    finally { running.current = false; if (sameAccount()) setBusy(false); }
  };
  const proposeStock = async (body: Record<string, unknown>) => {
    if (!sameAccount() || proposal || draftLoading || draftError) return;
    if (!navigator.onLine) throw new Error('Reconnect to prepare a stock draft.');
    const active = await loadStockReview(scope);
    if (!sameAccount()) return;
    if (active) {
      focusReview.current = true;
      setProposal(active);
      setNotice('Your existing draft is open below. Finish or close it before starting another delivery.');
      return;
    }
    const result: { job: string; rows: ImportRow[] } = await call(body.action === 'inventory' && inputSource ? { ...body, source: inputSource } : body, scope);
    if (!sameAccount()) return;
    try {
      const saved = await createStockReview(scope, result.job, result.rows);
      if (sameAccount()) {
        focusReview.current = true;
        setProposal(saved);
      }
    } catch (cause) {
      // A second tab may have opened a review while this request was processing.
      await restoreDraft();
      throw cause;
    }
  };
  const closeReview = async () => {
    if (!navigator.onLine) throw new Error('Reconnect before closing this review. Your draft remains on this device.');
    const current = await loadStockReview(scope);
    if (!sameAccount()) return;
    if (current && current.job !== proposal?.job)
      throw new Error('Another stock review is now active. Reopen the assistant before closing it.');
    if (current) await clearStockReview(scope, current);
    if (sameAccount()) {
      try { if (window.localStorage.getItem('trackasuwa.ai.stockJob') === current?.job) window.localStorage.removeItem('trackasuwa.ai.stockJob'); } catch { /* Scoped IndexedDB remains authoritative. */ }
      setProposal(null); setText(''); setInputSource(null); setNotice('Review closed. Completed stock receipts are unchanged.');
    }
  };
  const serviceLocked = busy || !online || !status || !!statusError;
  const intakeLocked = serviceLocked || draftLoading || !!draftError || !!proposal;

  return <div className="mx-auto max-w-6xl min-w-0 space-y-7 pb-20 [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2">
    <header className="space-y-2">
      <h1 className="tt-page-title">{copy('TracKasuwa assistant')}</h1>
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
        {copy('Receive stock, check supplier deliveries and see what is happening in your business.')}
      </p>
    </header>

    <nav aria-label={copy('Assistant tasks')} className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <a href="#inventory" className="flex min-w-0 items-center gap-4 rounded-[var(--radius-lg)] border border-border border-s-4 border-s-primary bg-card px-4 py-5 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PackagePlus aria-hidden="true" className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">{copy(proposal ? 'Resume stock review' : 'Receive new stock')}</span>
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
            {copy(proposal ? 'Pick up the saved delivery review.' : 'Add a supplier list, then check what arrived before saving it.')}
          </span>
        </span>
        <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-primary" />
      </a>
      <div className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-card px-4 sm:px-5">
        <a href="#insights" className="flex min-h-12 items-center gap-3 py-3 text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
          <ChartNoAxesColumnIncreasing aria-hidden="true" className="size-4 shrink-0 text-primary" />{copy('Business insights')}
        </a>
        <a href="#invoice-comparison" className="flex min-h-12 items-center gap-3 py-3 text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
          <ClipboardList aria-hidden="true" className="size-4 shrink-0 text-primary" />{copy('Compare invoice with order')}
        </a>
        <a href="#delivery-settings" className="flex min-h-12 items-center gap-3 py-3 text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
          <Bell aria-hidden="true" className="size-4 shrink-0 text-primary" />{copy('Delivery settings')}
        </a>
      </div>
    </nav>

    {!online && <div role="status" className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4 text-sm">
      <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{copy('You’re offline. You can work on a saved draft on this device. Reconnect to prepare a new draft, review exact changes or confirm a receipt.')}</p>
    </div>}
    {online && !status && !statusError && <p role="status" className="text-sm text-muted-foreground">{copy('Checking assistant availability…')}</p>}
    {online && statusError && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm">
      <p role="alert" className="min-w-0 flex-1 break-words">{copy(statusError)}</p>
      <Button variant="outline" onClick={() => setStatusAttempt(attempt => attempt + 1)}>
        {copy('Check availability again')}
      </Button>
    </div>}
    {busy && <p role="status" className="text-sm text-muted-foreground">{copy('Working on your request…')}</p>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{copy(error)}</p>}
    {notice && <p role="status" className="text-sm">{copy(notice)}</p>}

    <section className="space-y-4" aria-labelledby="stock-intake-heading">
      <fieldset id="inventory" tabIndex={-1} disabled={intakeLocked} className="min-w-0 scroll-mt-24 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6">
        <legend className="sr-only">{copy('Stock receiving draft')}</legend>
        <div className="space-y-2">
          <h2 id="stock-intake-heading" ref={receivingHeading} tabIndex={-1} className="tt-section-title">
            {copy(proposal ? 'Continue stock intake' : 'Add a stock source')}
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {copy(proposal
              ? 'Check products, warehouses, quantities and buying costs against the goods you received.'
              : 'Paste a stock list or add a CSV or Excel file. You’ll check each item before approving any stock changes.')}
          </p>
        </div>
        {draftLoading && <p role="status" className="text-sm text-muted-foreground">{copy('Opening your saved stock review...')}</p>}
        {!proposal && !draftLoading && !draftError && <>
          <label className="block min-w-0 space-y-2 text-sm font-medium">
            <span>{copy('Product CSV or Excel file')}</span>
            <Input type="file" accept=".csv,.xlsx" className="h-auto min-h-11 py-2 file:me-2" onChange={event => {
              const file = event.target.files?.[0];
              if (!file) return;
              void run(async () => {
                const rows = await parseImportFile(file);
                const headers = Array.from(new Set(rows.flatMap(Object.keys)));
                const prepared = [headers.join('\t'), ...rows.map(row => headers.map(header => String(row[header] ?? '').replace(/[\t\r\n]/g, ' ')).join('\t'))].join('\n');
                const csv = file.name.toLowerCase().endsWith('.csv');
                const source = { kind: csv ? 'csv' as const : 'xlsx' as const, text: csv ? await file.text() : prepared, file_name: file.name };
                if (sameAccount()) { setText(prepared); setInputSource(source); }
              });
            }} />
          </label>
          <label className="block min-w-0 space-y-2 text-sm font-medium">
            <span>{copy(inputSource ? 'Stock list from your file' : 'Or paste a stock list')}</span>
            <Textarea rows={5} maxLength={200000} value={text}
              placeholder={copy('Example: Rice 4 bags at 15000 each')} onChange={event => { setText(event.target.value); setInputSource(null); }} />
          </label>
          <Button onClick={() => void run(async () => proposeStock({ action: 'inventory', text }))}>
            {copy('Prepare stock draft')}<ArrowRight aria-hidden="true" />
          </Button>
          {status?.stub && <p className="text-sm text-muted-foreground">
            {copy('Preview mode uses fixed rules for text and spreadsheets. Photos and audio require a live connection to the assistant provider.')}
          </p>}
          {status && !status.stub && <details className="border-t border-border pt-2">
            <summary className="flex min-h-11 cursor-pointer items-center py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
              {copy('Add a photo or recording instead')}
            </summary>
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <label className="block min-w-0 space-y-2 text-sm font-medium"><span>{copy('Stock-list photo')}</span>
                <Input type="file" accept="image/jpeg,image/png,image/webp" className="h-auto min-h-11 py-2" onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void run(async () => proposeStock({ action: 'inventory_image', image: await stockPhotoDataUrl(file) }));
                }} />
              </label>
              <label className="block min-w-0 space-y-2 text-sm font-medium"><span>{copy('Voice stock list')}</span>
                <Input type="file" accept="audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/x-m4a" className="h-auto min-h-11 py-2" onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void run(async () => {
                    if (file.size > 2_000_000) throw new Error('Voice recording must be under 2 MB.');
                    await proposeStock({ action: 'inventory_audio', audio: await fileDataUrl(file) });
                  });
                }} />
              </label>
            </div>
          </details>}
        </>}
      </fieldset>
      {draftError && <div className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
        <p role="alert" className="break-words text-destructive">{copy(draftError)}</p>
        <Button variant="outline" disabled={draftLoading} onClick={() => { setDraftLoading(true); setDraftError(''); void restoreDraft(); }}>
          {copy('Try opening saved review again')}
        </Button>
      </div>}
      {proposal && <>
        <StockReceivingReview key={proposal.job} job={proposal.job} rows={proposal.sourceRows} onBusyChange={setReceiptBusy} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="max-w-xl text-sm text-muted-foreground">{copy('Closing a review discards rows that have not been applied. Check pending receipts first.')}</p>
          <Button variant="outline" disabled={!online || busy || receiptBusy} onClick={() => void run(closeReview)}>
            {copy('Close this review')}
          </Button>
        </div>
      </>}
      <Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4" href="/imports">
        {copy('Open manual product imports')}
      </Link>
    </section>

    <div id="invoice-comparison" tabIndex={-1} className="scroll-mt-24">
      {status && !status.stub ? <fieldset disabled={serviceLocked} className="min-w-0">
        <legend className="sr-only">{copy('Supplier invoice comparison')}</legend>
        <InvoiceOrderReview enabled={online && !statusError} />
      </fieldset> : <section className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6">
        <h2 className="tt-section-title">{copy('Compare supplier invoice with a purchase order')}</h2>
        <p className="text-sm text-muted-foreground">{copy('Photo comparison needs an online assistant connection with photo support.')}</p>
        <Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href="/purchase-orders">{copy('Open purchase orders')}</Link>
      </section>}
    </div>

    <section id="insights" tabIndex={-1} aria-labelledby="insights-heading" className="min-w-0 scroll-mt-24 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6">
      <h2 id="insights-heading" className="tt-section-title">{copy('Business insights')}</h2>
      <fieldset disabled={serviceLocked} className="min-w-0 space-y-3">
        <legend className="sr-only">{copy('Ask for insights')}</legend>
        <label className="block space-y-2 text-sm font-medium">
          <span>{copy('Ask about your business')}</span>
          <Textarea placeholder={copy('Ask about your sales or stock')} maxLength={2000} value={question} onChange={event => setQuestion(event.target.value)} />
        </label>
        <Button onClick={() => void run(async () => {
          const result = await call({ action: 'insights', question }, scope);
          if (sameAccount()) setReport(result);
        })}>{copy('Generate organization-only insights')}</Button>
      </fieldset>
      {report && <div className="space-y-3">{report.comparison && <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <h3 className="font-semibold">{copy('Sales figures from rolling 30-day windows')}</h3>
        <p>{new Date(report.comparison.current.from).toLocaleString()} {copy('to')} {new Date(report.comparison.current.to).toLocaleString()}: {report.comparison.current.sales} {copy('sales')} · ₦{report.comparison.current.revenue.toLocaleString()}</p>
        <p>{new Date(report.comparison.previous.from).toLocaleString()} {copy('to')} {new Date(report.comparison.previous.to).toLocaleString()}: {report.comparison.previous.sales} {copy('sales')} · ₦{report.comparison.previous.revenue.toLocaleString()}</p>
        <p>{report.comparison.changePercent === null ? copy('Not enough prior-period revenue for a percentage comparison.') : `${copy('Revenue change')}: ${report.comparison.changePercent > 0 ? '+' : ''}${report.comparison.changePercent}%`}</p>
        {report.comparison.missingItemSales > 0 && <p>{report.comparison.missingItemSales} {copy('sales have no item rows, so product rankings are incomplete.')}</p>}
        {report.comparison.topProducts.length > 0 && <><p className="mt-2 font-medium">{copy('Top products by recorded line value')}</p><ol className="list-decimal pl-5">{report.comparison.topProducts.map(product => <li key={product.name}>{product.name}: {product.units} {copy('units')} · ₦{product.revenue.toLocaleString()}</li>)}</ol></>}
        <Link className="text-primary underline" href="/reports">{copy('Check reports and source records')}</Link>
      </div>}{report.insights.map(insight => <article key={insight.title} className="break-words text-sm"><h3 className="font-semibold">{insight.title}</h3><p>{insight.message}</p></article>)}
        <fieldset disabled={serviceLocked} className="min-w-0 space-y-3 border-t border-border pt-4">
          <legend className="sr-only">{copy('Deliver insights')}</legend>
          <label className="block min-w-0 space-y-2 text-sm font-medium">
            <span>{copy('Deliver this preview to your profile')}</span>
            <NativeSelect value={channel} onChange={event => setChannel(event.target.value as typeof channel)}>
              {deliveryChannels.map(option => <option key={option} value={option} disabled={!status?.channels[option]}>
                {copy(option.replace('_', ' '))}{!status?.channels[option] && copy(' (disabled)')}
              </option>)}
            </NativeSelect>
          </label>
          <Button disabled={!status?.channels[channel]} onClick={() => void run(async () => {
            await call({ action: 'deliver', job: report.job, channel, confirm: true }, scope);
            if (sameAccount()) setNotice('Insight delivered.');
          })}>{copy('Confirm and deliver displayed insights')}</Button>
        </fieldset>
      </div>}
    </section>

    <section id="delivery-settings" tabIndex={-1} aria-labelledby="delivery-settings-heading" className="min-w-0 scroll-mt-24 space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6">
      <h2 id="delivery-settings-heading" className="tt-section-title">{copy('Delivery settings')}</h2>
      <fieldset disabled={serviceLocked} className="min-w-0 space-y-3">
        <legend className="sr-only">{copy('Your delivery opt-ins')}</legend>
        {deliveryChannels.map(option => <label key={option} className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={preferences[option]} disabled={!status?.channels[option]}
            onChange={event => setPreferences(current => ({ ...current, [option]: event.target.checked }))} />
          <span>{copy(option.replace('_', ' '))}{status && !status.channels[option] && copy(' (unavailable)')}</span>
        </label>)}
        <Button variant="outline" onClick={() => void run(async () => {
          await call({ action: 'preferences', ...preferences, confirm: true }, scope);
          if (sameAccount()) setNotice('Delivery preferences saved.');
        })}>{copy('Confirm delivery preferences')}</Button>
      </fieldset>
      <p className="text-sm text-muted-foreground">{copy('Limits: 20 requests per hour and 5 deliveries per channel per hour. Each insight can be delivered once per channel.')}</p>
      <Link className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4" href="/notifications">
        {copy('Open notifications')}
      </Link>
    </section>
  </div>;
}
