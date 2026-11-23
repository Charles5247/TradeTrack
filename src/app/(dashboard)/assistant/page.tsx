'use client';
import { useCopy } from '@/i18n/text';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Bell, ChartNoAxesColumnIncreasing, Check, ChevronRight, ClipboardList,
  Clock3, FileText, Package, ReceiptText, Upload, Users, WifiOff, X,
} from 'lucide-react';
import styles from './guided-workspace.module.css';
import { AccessGuard } from '@/components/shared/access-guard';
import { StockReceivingReview } from '@/components/ai/stock-receiving-review';
import { InvoiceOrderReview } from '@/components/ai/invoice-order-review';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { parseImportFile } from '@/lib/imports/parse';
import type { ImportRow } from '@/lib/imports/preview';
import type { Insight } from '@/lib/ai/types';
import { useAuthStore } from '@/store';
import { clearStockReview, createStockReview, loadStockReview, resumeLegacyStockReview, type StockReviewDraft, type StockReviewScope } from '@/lib/ai/stock-review-draft';

const taskPaths = {
  overview: '',
  inventory: '#inventory',
  insights: '#insights',
  stock: '#stock-watch',
  staff: '#staff-activity',
  history: '#tasks',
  invoice: '#invoice-comparison',
  delivery: '#delivery-settings',
} as const;
type WorkspaceScreen = keyof typeof taskPaths;

function screenFromLocation(): WorkspaceScreen {
  const hash = window.location.hash;
  return (Object.keys(taskPaths) as WorkspaceScreen[]).find(screen => taskPaths[screen] === hash) ?? 'overview';
}

const taskHeadings = {
  overview: 'Your workspace',
  inventory: 'Receive stock',
  insights: 'Business insights',
  stock: 'Stock to watch',
  staff: 'Staff activity',
  history: 'Your tasks',
  invoice: 'Compare invoice with order',
  delivery: 'Delivery settings',
} satisfies Record<WorkspaceScreen, string>;

const overviewTasks = [
  { screen: 'insights', title: 'Understand my sales', detail: 'Ask a question and see the supporting figures.', Icon: ChartNoAxesColumnIncreasing },
  { screen: 'stock', title: 'Plan my next restock', detail: 'Check stock levels and find items that need attention.', Icon: Package },
  { screen: 'staff', title: 'Review staff activity', detail: 'Find the records behind sales activity.', Icon: Users },
] as const;

const intakeSteps = [
  ['Add what you received', 'Choose a file or paste a supplier message.'],
  ['Check the suggested items', 'Correct quantities, costs and product matches.'],
  ['Approve the exact changes', 'You decide which items are added to stock.'],
] as const;

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
  const [screen, setScreen] = useState<WorkspaceScreen>('overview');
  const [preparingStock, setPreparingStock] = useState(false);
  const [processingSource, setProcessingSource] = useState('');
  const [openedReview, setOpenedReview] = useState(false);
  const [openedInvoice, setOpenedInvoice] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
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
    const restoreScreen = () => {
      const next = screenFromLocation();
      if (next === 'inventory') setOpenedReview(true);
      if (next === 'invoice') setOpenedInvoice(true);
      setScreen(next);
    };
    queueMicrotask(() => {
      if (disposed) return;
      restoreScreen();
      void restoreDraft();
    });
    const openPanelReview = () => {
      setOpenedReview(true);
      setScreen('inventory');
      if (window.location.hash !== taskPaths.inventory) window.history.pushState(null, '', taskPaths.inventory);
      setDraftLoading(true);
      void restoreDraft();
    };
    window.addEventListener('trackasuwa:stock-review-opened', openPanelReview);
    window.addEventListener('hashchange', restoreScreen);
    window.addEventListener('popstate', restoreScreen);
    return () => {
      disposed = true;
      mounted.current = false;
      draftRequest.current += 1;
      window.removeEventListener('trackasuwa:stock-review-opened', openPanelReview);
      window.removeEventListener('hashchange', restoreScreen);
      window.removeEventListener('popstate', restoreScreen);
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
  const inReview = screen === 'inventory' && !!proposal;
  useEffect(() => {
    if (!inReview) heading.current?.focus();
  }, [inReview, screen, preparingStock]);

  function navigate(next: WorkspaceScreen) {
    if (next === 'inventory') setOpenedReview(true);
    if (next === 'invoice') setOpenedInvoice(true);
    if (screen === next) return;
    window.history.pushState(null, '', next === 'overview'
      ? window.location.pathname + window.location.search
      : taskPaths[next]);
    setScreen(next);
    setError('');
    setNotice('');
  }

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
      setOpenedReview(true);
      setProposal(active);
      setNotice('Your existing draft is open. Finish or close it before starting another delivery.');
      return;
    }
    const result: { job: string; rows: ImportRow[] } = await call(body.action === 'inventory' && inputSource ? { ...body, source: inputSource } : body, scope);
    if (!sameAccount()) return;
    try {
      const saved = await createStockReview(scope, result.job, result.rows);
      if (sameAccount()) {
        setOpenedReview(true);
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
  const prepare = (getBody: () => Promise<Record<string, unknown>> | Record<string, unknown>, sourceName: string) => {
    void run(async () => {
      setPreparingStock(true);
      setProcessingSource(sourceName);
      try {
        await proposeStock(await getBody());
      } finally {
        if (sameAccount()) setPreparingStock(false);
      }
    });
  };
  const ask = () => {
    void run(async () => {
      const result = await call({ action: 'insights', question }, scope);
      if (sameAccount()) setReport(result);
    });
  };
  const serviceLocked = busy || !online || !status || !!statusError;
  const intakeLocked = serviceLocked || draftLoading || !!draftError || !!proposal;

  const screenTitle = screen === 'inventory' && preparingStock ? 'Reading your source' : taskHeadings[screen];
  const sourceLabel = proposal?.source?.kind === 'csv' || proposal?.source?.kind === 'xlsx'
    ? 'Spreadsheet'
    : proposal?.source?.kind === 'image' ? 'Stock photo'
    : proposal?.source?.kind === 'audio' ? 'Voice stock list' : 'Stock list';

  const resumeDetails = proposal && <>
    <h3>{copy('Stock receiving review')}</h3>
    <p>{copy(sourceLabel)} · {proposal.sourceRows.length} {copy('items')}</p>
  </>;

  async function readSpreadsheet(file: File) {
    const rows = await parseImportFile(file);
    const headers = Array.from(new Set(rows.flatMap(Object.keys)));
    const prepared = [headers.join('\t'), ...rows.map(row => headers.map(header =>
      String(row[header] ?? '').replace(/[\t\r\n]/g, ' ')).join('\t'))].join('\n');
    const csv = file.name.toLowerCase().endsWith('.csv');
    const source = { kind: csv ? 'csv' as const : 'xlsx' as const, text: csv ? await file.text() : prepared, file_name: file.name };
    if (sameAccount()) {
      setText(prepared);
      setInputSource(source);
    }
  }

  return <div className={styles.workspace}>
    <div className={styles.topbar}>
      <div>{copy('Assistant')} <span aria-hidden="true">/</span> <strong>{copy(inReview ? 'Stock receiving' : screenTitle)}</strong></div>
      <div className={styles.connection}><span data-offline={!online} />{copy(online ? 'Online' : 'Device offline')}</div>
    </div>
    <div className={styles.main}>
      {!inReview && <header className={styles.heading}>
        <div>
          <h1 ref={heading} tabIndex={-1}>{copy(screenTitle)}</h1>
          {screen === 'overview' && <p>{copy('Receive stock and understand what is happening in your shop.')}</p>}
          {screen === 'inventory' && !preparingStock && <p>{copy('Start with what your supplier sent you.')}</p>}
          {screen === 'insights' && <p>{copy('Understand the figures behind your business.')}</p>}
          {screen === 'history' && <p>{copy('Pick up a receiving review saved on this device.')}</p>}
        </div>
        {screen !== 'overview' && <Button variant="ghost" className={styles.back} aria-label={copy('Back to overview')} onClick={() => navigate('overview')}>
          <X aria-hidden="true" /><span>{copy('Back to overview')}</span>
        </Button>}
      </header>}

      {!online && !inReview && <div role="status" className={styles.offline}>
        <WifiOff aria-hidden="true" className="size-5 shrink-0" />
        <div><strong>{copy('You’re offline')}</strong>
          <p>{copy('Saved stock reviews remain on this device. Reconnect to prepare a draft, review exact changes or confirm a receipt.')}</p></div>
      </div>}
      {online && !status && !statusError && screen !== 'overview' && !inReview &&
        <p role="status" className={styles.notice}>{copy('Checking assistant availability…')}</p>}
      {online && statusError && <div className={styles.notice}>
        <p role="alert">{copy(statusError)}</p>
        <Button variant="outline" onClick={() => setStatusAttempt(attempt => attempt + 1)}>{copy('Check availability again')}</Button>
      </div>}
      {busy && !preparingStock && <p role="status" className={styles.notice}>{copy('Working on your request…')}</p>}
      {error && <p role="alert" className={styles.error}>{copy(error)}</p>}
      {notice && <p role="status" className={styles.notice}>{copy(notice)}</p>}

      {screen === 'overview' && <div className={styles.split}>
        <section className={styles.start}>
          <h2>{copy('What needs doing?')}</h2>
          <button type="button" className={styles.receive} onClick={() => navigate('inventory')}>
            <span className={styles.receiptIcon}><ReceiptText aria-hidden="true" /></span>
            <span className={styles.receiveCopy}>
              <strong>{copy(proposal ? 'Resume stock review' : 'Receive new stock')}</strong>
              <span>{copy(proposal ? 'Check the items from your saved delivery.' : 'Turn a supplier list into items ready to review.')}</span>
              <small>{copy(status && !status.stub ? 'CSV, Excel, photos, voice or a message' : 'CSV, Excel or a message')}</small>
            </span>
            <ArrowRight aria-hidden="true" className="size-5 self-start text-[var(--workspace-blue)]" />
          </button>
          <nav className={styles.taskList} aria-label={copy('Assistant tasks')}>
            {overviewTasks.map(({ screen, title, detail, Icon }) => <button type="button" key={screen} onClick={() => navigate(screen)}>
              <span className={styles.taskIcon}><Icon aria-hidden="true" /></span>
              <span><strong>{copy(title)}</strong><small>{copy(detail)}</small></span>
              <ChevronRight aria-hidden="true" className={styles.chevron} />
            </button>)}
          </nav>
          <form className={styles.question} onSubmit={event => {
            event.preventDefault();
            if (serviceLocked || !question.trim()) return;
            navigate('insights');
            ask();
          }}>
            <label htmlFor="assistant-question">{copy('Or ask in your own words')}</label>
            <div>
              <input id="assistant-question" value={question} maxLength={2000} onChange={event => setQuestion(event.target.value)}
                placeholder={copy('Why did my sales change this month?')} disabled={!online} />
              <button type="submit" aria-label={copy('Ask about your business')} disabled={serviceLocked || !question.trim()}><ArrowRight aria-hidden="true" /></button>
            </div>
          </form>
        </section>
        <aside className={styles.rail} aria-labelledby="assistant-resume-heading">
          <h2 id="assistant-resume-heading">{copy(proposal ? 'Pick up where you left off' : 'Your tasks')}</h2>
          {draftLoading && <p role="status">{copy('Opening your saved stock review...')}</p>}
          <div className={styles.document} aria-hidden="true">
            <FileText />
            <span /><span /><span />
          </div>
          {proposal ? <>
            <span className={styles.badge}>{copy('Saved on this device')}</span>
            {resumeDetails}
            <Button variant="outline" onClick={() => navigate('inventory')}>{copy('Resume this task')}<ArrowRight aria-hidden="true" /></Button>
          </> : <>
            <h3>{copy('Stock receiving')}</h3>
            <p>{copy(draftError ? 'Open your tasks to recover your review.' : 'A stock review appears here when you prepare one.')}</p>
            <Button variant="outline" onClick={() => navigate('history')}><Clock3 aria-hidden="true" />{copy('Open your tasks')}</Button>
          </>}
          {proposal && <Button className="mt-2" variant="ghost" onClick={() => navigate('history')}><Clock3 aria-hidden="true" />{copy('Your tasks')}</Button>}
          <div className={styles.trust}>
            <Check aria-hidden="true" />
            <div><strong>{copy('You review every stock change')}</strong>
              <p>{copy('Check the items first. Approve the exact changes when you’re ready.')}</p></div>
          </div>
          <div className={styles.tools}>
            <Button variant="ghost" onClick={() => navigate('invoice')}><ClipboardList aria-hidden="true" />{copy('Compare invoice with order')}</Button>
            <Button variant="ghost" onClick={() => navigate('delivery')}><Bell aria-hidden="true" />{copy('Delivery settings')}</Button>
          </div>
        </aside>
      </div>}

      {(screen === 'inventory' || screen === 'history') && draftError && <div className={styles.notice}>
        <p role="alert" className="text-destructive">{copy(draftError)}</p>
        <Button variant="outline" disabled={draftLoading} onClick={() => { setDraftLoading(true); setDraftError(''); void restoreDraft(); }}>
          {copy('Try opening saved review again')}
        </Button>
      </div>}

      {screen === 'inventory' && !proposal && <section id="inventory" className="min-w-0" aria-label={copy('Stock receiving draft')}>
        <ol className={styles.steps} aria-label={copy('Receiving progress')}>
          {['Add a source', 'Check items', 'Approve', 'Result'].map((label, index) => <li key={label} aria-current={index === 0 ? 'step' : undefined}>
            <span aria-hidden="true">{index + 1}</span>{copy(label)}
          </li>)}
        </ol>
        {preparingStock ? <section className={styles.processing} aria-busy="true">
          <span className={styles.receiptIcon}><ReceiptText aria-hidden="true" /></span>
          <h2>{copy('Preparing your items')}</h2>
          <p role="status">{copy('Reading your stock source and preparing items for you to check.')}</p>
          <progress aria-label={copy('Preparing stock draft')} />
          <div className={styles.processingSource}><FileText aria-hidden="true" />{processingSource}</div>
          <p>{copy('You’ll review quantities and buying costs before approving any changes.')}</p>
        </section> : <div className={styles.intakeLayout}>
          <fieldset disabled={intakeLocked} className={styles.card}>
            <legend className="sr-only">{copy('Stock source')}</legend>
            <h2>{copy('Add your invoice or stock list')}</h2>
            <p>{copy('Choose a source with item names, quantities and buying costs.')}</p>
            {draftLoading && <p role="status">{copy('Opening your saved stock review...')}</p>}
            <label className={styles.upload}>
              <span className={styles.taskIcon}><Upload aria-hidden="true" /></span>
              <strong>{inputSource?.file_name ?? copy(status && !status.stub ? 'Choose a photo or file' : 'Choose a spreadsheet')}</strong>
              <span>{copy(status && !status.stub ? 'Stock photos, CSV or Excel' : 'CSV or Excel stock lists')}</span>
              <span className={styles.browse}>{copy('Browse files')}</span>
              <input type="file" aria-label={copy('Stock source file')} accept={status && !status.stub ? '.csv,.xlsx,image/jpeg,image/png,image/webp' : '.csv,.xlsx'}
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  if (file.type.startsWith('image/')) {
                    prepare(async () => ({ action: 'inventory_image', image: await stockPhotoDataUrl(file) }), file.name);
                  } else {
                    void run(() => readSpreadsheet(file));
                  }
                }} />
            </label>
            <div className={styles.orRule}>{copy('or paste a stock list')}</div>
            <label className={styles.field}>
              <span>{copy(inputSource ? 'Stock list from your file' : 'Supplier message or item list')}</span>
              <Textarea rows={4} maxLength={200000} value={text}
                placeholder={copy('Example: Rice 4 bags at 15000 each')}
                onChange={event => { setText(event.target.value); setInputSource(null); }} />
            </label>
            {status && !status.stub && <details className={styles.voice}>
              <summary>{copy('Add a voice recording')}</summary>
              <label className={styles.field}><span>{copy('Voice stock list')}</span>
                <Input type="file" accept="audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/x-m4a" onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  prepare(async () => {
                    if (file.size > 2_000_000) throw new Error('Voice recording must be under 2 MB.');
                    return { action: 'inventory_audio', audio: await fileDataUrl(file) };
                  }, file.name);
                }} />
              </label>
            </details>}
            <div className={styles.intakeActions}>
              <p>{copy('Check your items before saving stock.')}</p>
              <Button className={styles.primary} disabled={!text.trim()}
                onClick={() => prepare(() => ({ action: 'inventory', text }), inputSource?.file_name ?? copy('Pasted stock list'))}>
                {copy('Prepare stock draft')}<ArrowRight aria-hidden="true" />
              </Button>
            </div>
            {status?.stub && <p>{copy('Preview mode supports text and spreadsheets. Photo and audio processing need a live provider.')}</p>}
          </fieldset>
          <aside className={styles.intakeAside}>
            <span className={styles.taskIcon}><FileText aria-hidden="true" /></span>
            <h2>{copy('From source to checked receipt')}</h2>
            <ol>{intakeSteps.map(([title, detail]) => <li key={title}><strong>{copy(title)}</strong><p>{copy(detail)}</p></li>)}</ol>
            <Link className={styles.sourceLink} href="/imports">{copy('Open manual product imports')}<ArrowRight aria-hidden="true" /></Link>
          </aside>
        </div>}
      </section>}

      {proposal && openedReview && <div id="inventory" hidden={!inReview}>
        <StockReceivingReview key={proposal.job} job={proposal.job} rows={proposal.sourceRows} onBusyChange={setReceiptBusy}
          visible={inReview} onBackToOverview={() => navigate('overview')} />
        <details className={styles.closeDetails}>
          <summary>{copy('Manage this review')}</summary>
          <p>{copy('Closing a review discards unapplied rows. Check pending receipts first.')}</p>
          <Button variant="outline" disabled={!online || busy || receiptBusy} onClick={() => void run(closeReview)}>
            {copy('Close this review')}
          </Button>
        </details>
      </div>}

      {screen === 'history' && <section className={styles.card}>
        <h2>{copy('Stock receiving tasks')}</h2>
        {draftLoading ? <p role="status">{copy('Opening your saved stock review...')}</p> : proposal ? <>
          <button type="button" className={styles.historyTask} onClick={() => navigate('inventory')}>
            <span className={styles.taskIcon}><ReceiptText aria-hidden="true" /></span>
            <span><strong>{copy('Stock receiving review')}</strong><small>{copy(sourceLabel)} · {proposal.sourceRows.length} {copy('items')}</small></span>
            <ChevronRight aria-hidden="true" className={styles.chevron} />
          </button>
          <p>{copy('Saved on this device')}</p>
        </> : !draftError && <div className={styles.empty}>
          <Clock3 aria-hidden="true" />
          <h3>{copy('No receiving review saved')}</h3>
          <p>{copy('Add a source to start a stock receiving task.')}</p>
          <Button onClick={() => navigate('inventory')}>{copy('Receive new stock')}</Button>
        </div>}
      </section>}

      {screen === 'insights' && <div id="insights" className={styles.split}>
        <section className={styles.insights} aria-label={copy('Business insights')}>
          <fieldset disabled={serviceLocked} className={styles.card}>
            <legend className="sr-only">{copy('Ask for insights')}</legend>
            <label className={styles.field}>
              <span>{copy('Ask about your business')}</span>
              <Textarea placeholder={copy('Ask about your sales or stock')} maxLength={2000} value={question} onChange={event => setQuestion(event.target.value)} />
            </label>
            <Button className={styles.primary} onClick={ask}>{copy('Generate insights')}<ArrowRight aria-hidden="true" /></Button>
          </fieldset>
          {report && <div className={styles.answer}>
            {report.comparison && <section>
              <h2>{copy('Sales figures from rolling 30-day windows')}</h2>
              <div className={styles.comparison}>
                {[
                  { label: 'Latest 30 days', period: report.comparison.current },
                  { label: 'Previous 30 days', period: report.comparison.previous },
                ].map(({ label, period }) => (
                  <div key={label}><span>{copy(label)}</span>
                    <strong>₦{period.revenue.toLocaleString()}</strong>
                    <p>{period.sales} {copy('sales')}</p>
                    <p>{new Date(period.from).toLocaleDateString()} – {new Date(period.to).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
              <p>{report.comparison.changePercent === null ? copy('Not enough prior-period revenue for a percentage comparison.') : `${copy('Revenue change')}: ${report.comparison.changePercent > 0 ? '+' : ''}${report.comparison.changePercent}%`}</p>
              {report.comparison.missingItemSales > 0 && <p>{report.comparison.missingItemSales} {copy('sales have no item rows, so product rankings are incomplete.')}</p>}
              {report.comparison.topProducts.length > 0 && <>
                <h3>{copy('Top products by recorded line value')}</h3>
                <ul className={styles.productList}>{report.comparison.topProducts.map((product, index) => <li key={index}>
                  <strong>{product.name}</strong><span>{product.units} {copy('units')} · ₦{product.revenue.toLocaleString()}</span>
                </li>)}</ul>
              </>}
            </section>}
            {report.insights.map((insight, index) => <article key={index}>
              <h3>{insight.title}</h3><p>{insight.message}</p>
            </article>)}
            <fieldset disabled={serviceLocked} className={styles.insightDelivery}>
              <legend className="sr-only">{copy('Deliver insights')}</legend>
              <label className={styles.field}>
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
        <aside className={styles.rail}>
          <h2>{copy('Check the source records')}</h2>
          <p>{copy('Figures come from recorded sales in your business. Product figures can be incomplete when sales have no item details.')}</p>
          <Link className={styles.sourceLink} href="/reports">{copy('Open business reports')}<ArrowRight aria-hidden="true" /></Link>
        </aside>
      </div>}

      {screen === 'stock' && <section className={styles.card}>
        <h2>{copy('Stock levels and replenishment')}</h2>
        <div className={styles.empty}>
          <Package aria-hidden="true" />
          <h3>{copy('Check what you have on hand')}</h3>
          <p>{copy('Open inventory to check current stock. Stock cover and reorder estimates are not available in this workspace yet.')}</p>
          <Link className={styles.sourceLink} href="/inventory">{copy('Open inventory')}<ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>}

      {screen === 'staff' && <section className={styles.card}>
        <h2>{copy('Recorded sales activity')}</h2>
        <div className={styles.empty}>
          <Users aria-hidden="true" />
          <h3>{copy('Check recorded transactions')}</h3>
          <p>{copy('Open sales history for transaction records. A staff activity breakdown is not available in this workspace yet.')}</p>
          <Link className={styles.sourceLink} href="/sales">{copy('Open sales history')}<ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>}

      {openedInvoice && (
        <div id="invoice-comparison" hidden={screen !== 'invoice'}>
          {status && !status.stub ? <fieldset disabled={serviceLocked} className="min-w-0">
            <legend className="sr-only">{copy('Supplier invoice comparison')}</legend>
            <InvoiceOrderReview enabled={online && !statusError} />
          </fieldset> : <section className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6">
            <h2 className="tt-section-title">{copy('Compare supplier invoice with a purchase order')}</h2>
            <p className="text-sm text-muted-foreground">{copy('Photo comparison needs an online assistant connection with photo support.')}</p>
            <Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href="/purchase-orders">{copy('Open purchase orders')}</Link>
          </section>}
        </div>
      )}
      {screen === 'delivery' && (
        <section id="delivery-settings" tabIndex={-1} aria-label={copy('Delivery settings')} className="min-w-0 scroll-mt-24 space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6">
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
      )}
    </div>
  </div>;
}
