'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Clock3, FileText, Receipt, TriangleAlert, WifiOff, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getDB } from '@/lib/offline/db';
import { loadStockReview, saveStockReview, initializeStockReviewRows, saveServerStockReview,
  previewStockSelection, approveStockSelection, submitStockReviewReceipt, recordStockExecution,
  type StockReviewDraft, type StockReviewRow, type StockReviewScope } from '@/lib/ai/stock-review-draft';
import { useAuthStore } from '@/store';
import { useCopy } from '@/i18n/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { ImportRow } from '@/lib/imports/preview';
import { STOCK_UNITS } from '@/lib/industries';
import { useOnlineStatus } from '@/hooks/use-online-status';
import styles from './stock-receiving-review.module.css';

type Product = { id: string; name: string; sku: string; barcode: string | null; stock_unit: string; cost_price: number; organization_id: string; medical_stock_managed?: boolean | null };
type Warehouse = { id: string; name: string; is_main: boolean; organization_id: string };
type ReviewProps = { job: string; rows: ImportRow[]; onBusyChange?: (busy: boolean) => void; onBackToOverview?: () => void; visible?: boolean };
type RowCorrections = Partial<Pick<StockReviewRow, 'productId' | 'warehouseId' | 'quantity' | 'unitCost' | 'zeroConfirmed' | 'mode' | 'newName' | 'newSku' | 'stockUnit' | 'sellingPrice'>>;

function correctedRows(rows: StockReviewRow[], corrections: Map<string, RowCorrections>) {
  return rows.map(row => row.state === 'draft' && corrections.has(row.receiptId)
    ? { ...row, ...corrections.get(row.receiptId), error: undefined, changes: undefined } : row);
}

async function loadAll<T>(table: 'products' | 'warehouses', columns: string, orgId: string): Promise<T[]> {
  const db = createClient();
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await db.from(table).select(columns).eq('organization_id', orgId).range(start, start + 499);
    if (error) throw error;
    rows.push(...(data as T[]));
    if (!data || data.length < 500) return rows;
  }
}
function validCost(value: string) { return /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 9999999999.99; }
function validQuantity(value: string) {
  return /^\d+$/.test(value.trim()) && Number(value) > 0 && Number(value) <= 2147483647;
}
function ready(row: StockReviewRow) {
  const target = row.mode === 'existing' ? !!row.productId : !!(row.newName.trim() && row.newSku.trim()
    && row.newName.trim().length <= 255 && row.newSku.trim().length <= 100
    && STOCK_UNITS.some(unit => unit === row.stockUnit) && validCost(row.sellingPrice));
  return row.state === 'draft' && target && !!row.warehouseId && validQuantity(row.quantity) && validCost(row.unitCost)
    && (Number(row.unitCost) > 0 || row.zeroConfirmed);
}
function initialRows(sourceRows: ImportRow[], products: Product[], warehouses: Warehouse[], job: string): StockReviewRow[] {
  const main = warehouses.find(item => item.is_main)?.id || warehouses[0]?.id || '';
  return sourceRows.map((source, index) => {
    const name = String(source.name || '').trim(), sku = String(source.sku || '').trim(), barcode = String(source.barcode || '').trim();
    const candidates = products.filter(product => !!(barcode && product.barcode?.toLowerCase() === barcode.toLowerCase())
      || !!(sku && product.sku?.toLowerCase() === sku.toLowerCase()) || !!(name && product.name.toLowerCase() === name.toLowerCase()));
    return { receiptId: `${job}:${index}`, source: name || `Source row ${index + 1}`,
      mode: candidates.length === 0 ? 'new' : 'existing', newName: name, newSku: sku, stockUnit: 'piece',
      sellingPrice: String(source.selling_price ?? ''), productId: candidates.length === 1 ? candidates[0].id : '',
      warehouseId: main, quantity: String(source.opening_stock ?? ''), unitCost: String(source.cost_price ?? ''),
      zeroConfirmed: false, state: 'draft' };
  });
}
const amountFormat = new Intl.NumberFormat('en-NG');
function money(minor: string | bigint) {
  const text = String(minor).padStart(3, '0');
  return `₦${amountFormat.format(BigInt(text.slice(0, -2)))}.${text.slice(-2)}`;
}

function costMinor(unitCost: string) {
  if (!validCost(unitCost)) return null;
  const [whole, fraction = ''] = unitCost.trim().split('.');
  return BigInt(`${whole}${fraction.padEnd(2, '0')}`);
}

function lineTotalMinor(quantity: string, unitCost: string) {
  const cost = costMinor(unitCost);
  return cost === null || !validQuantity(quantity) ? null : BigInt(quantity.trim()) * cost;
}

function extractedTotal(rows: ImportRow[]) {
  if (!rows.length) return null;
  let total = BigInt(0);
  for (const row of rows) {
    const line = lineTotalMinor(String(row.opening_stock ?? ''), String(row.cost_price ?? ''));
    if (line === null) return null;
    total += line;
  }
  return total;
}

const SOURCE_LABELS = {
  text: 'Supplier message or item list',
  csv: 'CSV stock list',
  xlsx: 'Excel stock list',
  image: 'Invoice or stock image',
  audio: 'Voice message',
  legacy: 'Saved stock list',
} as const;

function SourceEvidence({ draft, rowIndex }: { draft: StockReviewDraft; rowIndex?: number }) {
  const copy = useCopy();
  const source = draft.source;
  const extracted = rowIndex === undefined ? draft.sourceRows : draft.sourceRows.slice(rowIndex, rowIndex + 1);
  const total = rowIndex === undefined ? extractedTotal(extracted) : null;
  return <div className={styles.sourcePaper}>
    <div className={styles.sourcePaperHeading}>
      <strong>{copy(source ? SOURCE_LABELS[source.kind] : 'Stock list')}</strong>
      <p>{copy(rowIndex === undefined ? 'Extracted source rows' : 'Extracted source row')} {rowIndex !== undefined && rowIndex + 1}</p>
    </div>
    {extracted.map((row, index) => {
      const cost = costMinor(String(row.cost_price ?? ''));
      const quantity = String(row.opening_stock ?? '');
      const line = cost === null || !validQuantity(quantity) ? null : BigInt(quantity.trim()) * cost;
      return <div key={index} className={styles.sourceLine}>
        <strong>{row.name || copy('Unnamed item')}</strong>
        {row.sku && <p>{row.sku}</p>}
        <div><span>{quantity || '—'} × {cost === null ? '—' : money(cost)}</span>
          <strong>{line === null ? '—' : money(line)}</strong></div>
      </div>;
    })}
    {total !== null && <div className={styles.sourceTotal}><span>{copy('Extracted total')}</span><strong>{money(total)}</strong></div>}
    {source?.evidence_available && source.text !== null ? <details className={styles.sourceOriginal}>
      <summary>{copy('Original source evidence')}</summary>
      <pre tabIndex={0}>{source.text}</pre>
      {source.kind === 'xlsx' && <p>{copy('This is the spreadsheet text captured for the review. The original workbook is not stored here.')}</p>}
    </details> : <p className={styles.sourceOriginal}>{copy('The original file or text is unavailable here. Check the extracted rows against your delivery.')}</p>}
    {source?.hash && <details className={styles.sourceReference}>
      <summary>{copy('Source reference')}</summary><p>{source.hash}</p>
    </details>}
  </div>;
}

function display(value: unknown) { return typeof value === 'string' ? value : JSON.stringify(value) ?? '—'; }

export function StockReceivingReview({ job, onBusyChange, onBackToOverview, visible = true }: ReviewProps) {
  const user = useAuthStore(state => state.user), copy = useCopy();
  if (!user?.organization_id || user.role !== 'business_owner' || user.status !== 'active')
    return <p role="alert">{copy('An active business owner must sign in to review these receipts.')}</p>;
  return <StockReceivingReviewForAccount key={`${user.organization_id}:${user.id}:${job}`}
    scope={{ ownerId: user.id, organizationId: user.organization_id }} job={job} visible={visible} onBusyChange={onBusyChange} onBackToOverview={onBackToOverview} />;
}

function StockReceivingReviewForAccount({ scope, job, onBusyChange, onBackToOverview, visible }: Omit<ReviewProps, 'rows'> & { scope: StockReviewScope }) {
  const copy = useCopy();
  const isOnline = useOnlineStatus();
  const [products, setProducts] = useState<Product[]>([]), [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [draft, setDraft] = useState<StockReviewDraft | null>(null), current = useRef<StockReviewDraft | null>(null);
  const mounted = useRef(true), working = useRef(false);
  const corrections = useRef(new Map<string, RowCorrections>());
  const saving = useRef(false), flushRequested = useRef(false);
  const [savingCorrections, setSavingCorrections] = useState(false), [correctionError, setCorrectionError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]), [physicalReceived, setPhysicalReceived] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [catalogError, setCatalogError] = useState(''), [reviewing, setReviewing] = useState(false), [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<'all' | 'attention' | 'ready'>('all');
  const [focusedRow, setFocusedRow] = useState<string | null>(null);
  const [resultRequested, setResultRequested] = useState(false);
  const [editingRemaining, setEditingRemaining] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { ownerId, organizationId } = scope;
  const sameAccount = useCallback(() => {
    const active = useAuthStore.getState().user;
    return mounted.current && active?.id === ownerId && active.organization_id === organizationId
      && active.role === 'business_owner' && active.status === 'active';
  }, [ownerId, organizationId]);
  const accept = useCallback((saved: StockReviewDraft) => {
    if (!sameAccount()) throw new Error('The signed-in account changed. Reopen this review.');
    current.current = saved;
    setDraft(corrections.current.size && saved.rows
      ? { ...saved, rows: correctedRows(saved.rows, corrections.current), dirty: true, selection: undefined } : saved);
    return saved;
  }, [sameAccount]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onBusyChange?.(loading || busy || savingCorrections || correctionError); }, [loading, busy, savingCorrections, correctionError, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const onlineAtOpen = navigator.onLine;
        const scopedDraft = loadStockReview({ ownerId, organizationId });
        const [productResult, warehouseResult, savedResult] = await Promise.allSettled([
          onlineAtOpen ? loadAll<Product>('products', 'id,name,sku,barcode,stock_unit,cost_price,organization_id,medical_stock_managed', organizationId) : Promise.reject(new Error('Offline')),
          onlineAtOpen ? loadAll<Warehouse>('warehouses', 'id,name,is_main,organization_id', organizationId) : Promise.reject(new Error('Offline')),
          scopedDraft,
        ]);
        if (cancelled || !sameAccount()) return;
        if (savedResult.status === 'rejected') throw savedResult.reason;
        let saved = savedResult.value;
        if (!saved || saved.job !== job) throw new Error('This saved stock review is no longer active. Reopen the assistant.');
        let availableProducts = productResult.status === 'fulfilled' ? productResult.value : [];
        let availableWarehouses = warehouseResult.status === 'fulfilled' ? warehouseResult.value : [];
        if (productResult.status === 'rejected' || warehouseResult.status === 'rejected') {
          try {
            const db = await getDB();
            const [cachedProducts, cachedWarehouses] = await Promise.all([db.getAll('products'), db.getAll('warehouses')]);
            if (cancelled || !sameAccount()) return;
            if (productResult.status === 'rejected') availableProducts = cachedProducts.filter(item => item.organization_id === organizationId);
            if (warehouseResult.status === 'rejected') availableWarehouses = cachedWarehouses.filter(item => item.organization_id === organizationId);
          } catch { /* Pending receipts remain recoverable without catalog access. */ }
          setCatalogError('Showing available catalog data from this device. Reconnect and reload the review to check current stock.');
        }
        availableProducts = availableProducts.filter(item => item.organization_id === organizationId && !item.medical_stock_managed);
        availableWarehouses = availableWarehouses.filter(item => item.organization_id === organizationId);
        setProducts(availableProducts); setWarehouses(availableWarehouses);
        if (!saved.rows) saved = await initializeStockReviewRows({ ownerId, organizationId }, saved,
          initialRows(saved.sourceRows, availableProducts, availableWarehouses, job));
        if (cancelled || !sameAccount()) return;
        accept(saved);
      } catch (cause) { if (!cancelled && sameAccount()) setError(cause instanceof Error ? cause.message : 'Could not open the saved stock review.'); }
      finally { if (!cancelled && sameAccount()) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [accept, job, ownerId, organizationId, reload, sameAccount]);
  const run = (action: () => Promise<void>) => {
    if (working.current || saving.current || corrections.current.size || !sameAccount()) return;
    working.current = true; setBusy(true); setError('');
    void action().catch(async cause => {
      if (!sameAccount()) return;
      setError(cause instanceof Error ? cause.message : 'This stock change has not been confirmed.');
      // Recover cached pending approval/operations after a lost response without dispatching them.
      try { const saved = await loadStockReview(scope); if (saved && sameAccount()) accept(saved); } catch { /* Retain the current review and original error. */ }
    }).finally(() => { working.current = false; if (sameAccount()) setBusy(false); });
  };
  const saveCorrections = (): void => {
    if (saving.current || working.current || !sameAccount()) return;
    saving.current = true; setSavingCorrections(true); setCorrectionError(false); setError('');
    let deviceFailed = false;
    // Device and account writes share one serial lane. Inputs remain editable;
    // newer field values are coalesced and applied after the in-flight revision.
    void (async () => {
      while (sameAccount()) {
        const active = current.current;
        if (!active?.rows || active.pendingApproval || active.conflict) return;
        if (corrections.current.size) {
          const batch = new Map(corrections.current); corrections.current.clear();
          try { accept(await saveStockReview(scope, active, correctedRows(active.rows, batch))); }
          catch (cause) {
            deviceFailed = true;
            // Keep every unsaved value. A later correction wins over the failed
            // batch for the same field, never the other way around.
            for (const [id, changes] of batch)
              corrections.current.set(id, { ...changes, ...corrections.current.get(id) });
            if (sameAccount()) {
              setCorrectionError(true);
              setError(cause instanceof Error ? cause.message : 'Corrections could not be saved on this device. Keep this screen open and retry.');
            }
            return;
          }
          continue;
        }
        if (!flushRequested.current) return;
        flushRequested.current = false;
        if (navigator.onLine && active.dirty && !active.rows.some(row => row.state !== 'draft' && row.state !== 'saved')) {
          try { accept(await saveServerStockReview(scope, active)); }
          catch (cause) {
            if (!sameAccount()) return;
            const message = cause instanceof Error ? cause.message : 'Corrections were not saved to your account.';
            accept({ ...active, syncError: message });
          }
        }
      }
    })().finally(() => {
      saving.current = false;
      if (!sameAccount()) return;
      setSavingCorrections(false);
      // A new event can arrive after the loop returns but before this microtask.
      const active = current.current;
      if (!deviceFailed && active?.rows && !active.pendingApproval && !active.conflict
        && (corrections.current.size || flushRequested.current)) saveCorrections();
    });
  };
  const flushCorrections = () => {
    if (working.current || !sameAccount()) return;
    flushRequested.current = true; saveCorrections();
  };
  const edit = (receiptId: string, changes: RowCorrections, discrete = false) => {
    const active = current.current;
    if (working.current || !sameAccount() || !active?.rows || active.pendingApproval || active.conflict
      || active.rows.find(row => row.receiptId === receiptId)?.state !== 'draft') return;
    corrections.current.set(receiptId, { ...corrections.current.get(receiptId), ...changes });
    setDraft(value => value?.rows ? { ...value, rows: correctedRows(value.rows, new Map([[receiptId, changes]])), dirty: true, selection: undefined } : value);
    setReviewing(false); setSelectedIds([]); setPhysicalReceived(false);
    if (discrete) flushRequested.current = true;
    saveCorrections();
  };
  const rows = draft?.rows || [];
  const canReceive = (row: StockReviewRow) => ready(row) && !catalogError && products.some(item => item.id === row.productId)
    && warehouses.some(item => item.id === row.warehouseId);
  // A new shop can have no products yet.
  const eligible = (row: StockReviewRow) => row.mode === 'new' ? ready(row) && !catalogError && warehouses.some(item => item.id === row.warehouseId) : canReceive(row);
  const selected = rows.filter(row => selectedIds.includes(row.receiptId) && eligible(row));
  const needsAttention = rows.filter(row => row.state === 'draft' && (!eligible(row) || !!row.error));
  const readyRows = rows.filter(row => eligible(row) && !row.error);
  const completedCount = rows.filter(row => row.state === 'saved').length;
  const pendingApprovalRows = new Set(draft?.pendingApproval?.groups.map(group => group.row_index));
  const awaitingResult = (row: StockReviewRow, index: number) => row.state === 'queued' || row.state === 'confirmation_pending'
    || (row.state === 'draft' && pendingApprovalRows.has(index));
  const pendingCount = rows.filter(awaitingResult).length;
  const remainingCount = rows.length - completedCount - pendingCount;
  const visibleRows = rows.filter(row => filter === 'all' || row.state !== 'draft' || row.receiptId === focusedRow
    || selectedIds.includes(row.receiptId) || (filter === 'attention' ? needsAttention : readyRows).includes(row));
  const selection = reviewing && !draft?.pendingApproval ? draft?.selection : undefined;
  const hasOutcome = resultRequested || !!draft?.pendingApproval || pendingCount > 0 || completedCount > 0;
  const stage = selection ? 'approval' : draft?.pendingApproval || (hasOutcome && !editingRemaining) ? 'result' : 'review';
  const locked = loading || busy || !!draft?.pendingApproval || !!draft?.conflict;
  const actionsLocked = locked || savingCorrections || correctionError;
  const onlineActionsLocked = actionsLocked || !isOnline;
  useEffect(() => {
    if (!loading && visible) heading.current?.focus();
  }, [loading, stage, visible]);
  const prepare = () => run(async () => {
    if (!navigator.onLine) throw new Error('Reconnect to review current stock changes.');
    if (!physicalReceived || !current.current || selected.length === 0) return;
    const indices = selected.map(row => rows.indexOf(row));
    accept(await previewStockSelection(scope, current.current, indices)); setReviewing(true);
  });
  const execute = async (index: number) => {
    if (!sameAccount()) throw new Error('The signed-in account changed. Reopen this review.');
    if (!navigator.onLine) throw new Error('Reconnect to check this receipt before continuing.');
    const active = current.current, row = active?.rows?.[index];
    if (!active || !row?.attempt || row.state !== 'confirmation_pending') return;
    const result = await submitStockReviewReceipt(scope, row.attempt);
    if (!sameAccount()) throw new Error('The signed-in account changed. Reopen this review.');
    accept(await recordStockExecution(scope, current.current!, result));
  };
  const apply = () => run(async () => {
    if (!navigator.onLine) throw new Error('Reconnect before approving stock. No new stock has been submitted.');
    const active = current.current;
    if (!active?.selection || !reviewing) return;
    const indices = active.selection.groups.map(group => group.row_index);
    const approved = accept(await approveStockSelection(scope, active));
    setResultRequested(true);
    setEditingRemaining(false);
    setReviewing(false); setSelectedIds([]); setPhysicalReceived(false);
    if (approved.pendingApproval) return;
    for (const index of indices) {
      if (!sameAccount()) throw new Error('The signed-in account changed. Reopen this review.');
      try { await execute(index); }
      catch (cause) {
        if (!sameAccount()) throw cause;
        const latest = current.current;
        if (latest?.rows) accept(await saveStockReview(scope, latest, latest.rows.map((row, rowIndex) => rowIndex === index
          ? { ...row, error: 'Receipt confirmation pending. Check its original status before retrying.' } : row)));
      }
    }
  });
  const check = (index?: number, retry = false, discardLocalEdits = false) => run(async () => {
    if (!navigator.onLine) throw new Error('Reconnect to check the original receipt.');
    const original = index === undefined ? undefined : current.current?.rows?.[index]?.attempt;
    const saved = await loadStockReview(scope, { discardLocalEdits });
    if (!saved) throw new Error('This review could not be reopened.');
    accept(saved); setReviewing(false); setSelectedIds([]); setPhysicalReceived(false);
    if (stage === 'result') setResultRequested(true);
    if (saved.syncError) throw new Error(saved.syncError);
    if (retry && index !== undefined) {
      const row = saved.rows?.[index];
      if (row?.state === 'saved' || row?.state === 'draft') return;
      if (!row?.attempt?.approval_id || row.attempt.operation_id !== original?.operation_id)
        throw new Error('Keep the original receipt. Its reviewed approval must be resolved before any retry.');
      await execute(index);
    }
  });
  const stageIndex = stage === 'review' ? 1 : stage === 'approval' ? 2 : 3;
  const title = stage === 'review' ? 'Check the stock' : stage === 'approval' ? 'Approve changes' : 'Receipt summary';
  const subtitle = stage === 'review' ? 'Compare the source, correct the details, then choose what to receive.'
    : stage === 'approval' ? 'Review exactly what this receipt will change.' : 'See which items were received and what needs attention.';
  const sourceLabel = copy(draft?.source ? SOURCE_LABELS[draft.source.kind] : 'Saved stock list');
  const sourceTotal = stage === 'review' && draft ? extractedTotal(draft.sourceRows) : null;
  const navigationLocked = loading || busy || savingCorrections || correctionError;
  const navigateBack = () => {
    if (!working.current && !saving.current && corrections.current.size === 0) onBackToOverview?.();
  };
  const rowWarnings = (row: StockReviewRow) => <>
    {row.error && <p role="alert" className={styles.rowError}>{row.error}</p>}
    {row.changes?.map(change => <p key={change.field} className={styles.rowError}>{change.field}: {copy('Reviewed')} {display(change.reviewed)} → {copy('Current')} {display(change.current)}. {copy('Check the proposed row above and review again.')}</p>)}
  </>;
  const selectionTotal = selected.reduce((sum, row) => sum + (lineTotalMinor(row.quantity, row.unitCost) ?? BigInt(0)), BigInt(0));

  return <section className={styles.review} aria-label={copy('Review stock receiving')}>
    <header className={styles.heading}>
      <div><h1 ref={heading} tabIndex={-1}>{copy(title)}</h1><p>{copy(subtitle)}</p></div>
      {onBackToOverview && stage !== 'result' && <Button variant="ghost" className={styles.back} disabled={navigationLocked} onClick={navigateBack}>
        <X aria-hidden="true" /><span>{copy('Back to overview')}</span></Button>}
    </header>
    {!isOnline && <div role="status" className={styles.notice} data-tone="warning">
      <WifiOff aria-hidden="true" />
      <div><strong>{copy('You’re offline')}</strong><p>{copy('You can keep editing draft items on this device. Reconnect to review current changes, approve stock or check a receipt.')}</p></div>
    </div>}
    <ol aria-label={copy('Stock review progress')} className={styles.steps}>
      {['Add a source', 'Check items', 'Approve', 'Result'].map((label, index) => <li key={label}
        aria-current={stageIndex === index ? 'step' : undefined} data-complete={stageIndex > index}>
        <span className={styles.stepNumber} aria-hidden="true">{stageIndex > index ? <Check /> : index + 1}</span>
        <span>{copy(label)}</span>
      </li>)}
    </ol>
    {loading ? <p role="status" className={styles.state}>{copy('Opening your saved stock review...')}</p> : <>
      {error && <p role="alert" className={styles.notice} data-tone="error">{error}</p>}
      {correctionError && <div className={styles.controls}>
        <Button variant="outline" onClick={saveCorrections}>{copy('Retry saving corrections')}</Button>
        <Button variant="outline" onClick={() => {
          if (saving.current || working.current || !sameAccount()) return;
          corrections.current.clear(); flushRequested.current = false; setCorrectionError(false);
          setLoading(true); setError(''); setCatalogError(''); setReload(value => value + 1);
        }}>{copy('Discard unsaved corrections and reload')}</Button>
      </div>}
      {draft?.syncError && <p role="alert" className={styles.notice} data-tone="error">{draft.syncError}</p>}
      {catalogError && <p role="status" className={styles.notice}>{copy(catalogError)}</p>}
      {draft?.conflict && <div role="alert" className={styles.recovery}>
        <p>{copy('This account review changed on another device. Your unsaved device corrections are preserved below. They have not replaced the account review.')}</p>
        <Button variant="outline" disabled={navigationLocked || !isOnline} onClick={() => check(undefined, false, true)}>{copy('Reload account review and discard these device edits')}</Button>
      </div>}
      {(error || catalogError || draft?.syncError) && <Button variant="outline" disabled={busy || savingCorrections || correctionError} onClick={() => {
        setLoading(true); setError(''); setCatalogError(''); setReviewing(false); setSelectedIds([]); setPhysicalReceived(false); setReload(value => value + 1);
      }}>{copy('Reload saved review')}</Button>}
      {busy && <p role="status" className={styles.state}>{copy('Working on your stock review...')}</p>}

      {stage === 'review' && <>
        {rows.length === 0 ? <div className={styles.empty}><Receipt aria-hidden="true" /><h2>{copy('No product rows were found')}</h2>
          <p>{copy('Close this review and correct the source.')}</p></div> : <>
          <div className={styles.context}>
            <span className={styles.contextIcon}><Receipt aria-hidden="true" /></span>
            <div className={styles.contextSource}><strong>{sourceLabel}</strong><span>{rows.length} {copy(rows.length === 1 ? 'item in this review' : 'items in this review')}</span>
              <p role="status">{copy(correctionError ? 'Some corrections are only on this screen. Retry saving before leaving.'
                : savingCorrections ? 'Saving your corrections...'
                : draft?.dirty ? 'Corrections saved on this device; not yet saved to your account.'
                : draft?.serverRevision ? 'Review saved to your account. Selection is not approval.'
                : 'Review saved on this device; not yet saved to your account.')}</p>
            </div>
            {sourceTotal !== null && <div className={styles.contextTotal}><span>{copy('Extracted total')}</span><strong>{money(sourceTotal)}</strong></div>}
          </div>
          <div className={styles.columns}>
            <div className={styles.items}>
              {hasOutcome && <div className={styles.returnToResult}>
                <p>{completedCount} {copy('confirmed')} · {pendingCount} {copy('awaiting confirmation')}</p>
                <Button variant="outline" disabled={navigationLocked} onClick={() => setEditingRemaining(false)}>{copy('View receipt summary')}</Button>
              </div>}
              <div className={styles.toolbar}>
                <div role="group" aria-label={copy('Filter stock review items')} className={styles.filters}>
                  {([{ key: 'all', name: 'All items', count: rows.length }, { key: 'ready', name: 'Ready', count: readyRows.length },
                    { key: 'attention', name: 'To check', count: needsAttention.length }] as const).map(item =>
                    <Button key={item.key} type="button" variant="ghost" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                      {copy(item.name)} <span>{item.count}</span>
                    </Button>)}
                </div>
                <Button variant="ghost" disabled={locked || correctionError || readyRows.length === 0} onClick={() => {
                  if (working.current || !sameAccount()) return;
                  setSelectedIds(readyRows.map(row => row.receiptId)); setPhysicalReceived(false);
                }}><Check aria-hidden="true" />{copy('Select ready')}</Button>
              </div>
              {needsAttention.length > 0 && <p className={styles.attentionHint}><TriangleAlert aria-hidden="true" />
                {needsAttention.length} {copy(needsAttention.length === 1 ? 'item needs a check.' : 'items need a check.')} {copy('You can receive other ready items first.')}
              </p>}
              {!visibleRows.length && <div role="status" className={styles.empty}><Check aria-hidden="true" /><h2>{copy('No items in this view')}</h2><p>{copy('Choose All items to see the full review.')}</p></div>}
              <div className={styles.itemStack}>
                {rows.map((row, index) => {
                  if (!visibleRows.includes(row)) return null;
                  const product = products.find(item => item.id === row.productId);
                  const warehouse = warehouses.find(item => item.id === row.warehouseId);
                  const name = row.mode === 'new' ? row.newName || row.source : product?.name || row.source;
                  const unit = row.mode === 'new' ? row.stockUnit : product?.stock_unit;
                  const sku = row.mode === 'new' ? row.newSku : product?.sku;
                  const matchNeeded = row.mode === 'new' || !row.productId || !row.warehouseId;
                  const attention = needsAttention.includes(row);
                  const total = lineTotalMinor(row.quantity, row.unitCost);
                  const label = row.state === 'saved' ? 'Stock saved' : row.state !== 'draft' ? 'Receipt confirmation pending'
                    : !eligible(row) || row.error ? (matchNeeded ? 'Check product' : 'Check values') : 'Ready to review';
                  return <article key={row.receiptId} className={styles.item} data-attention={attention}
                    onFocus={() => setFocusedRow(row.receiptId)} onBlur={event => {
                      if (!event.currentTarget.contains(event.relatedTarget)) setFocusedRow(null);
                    }}>
                    <div className={styles.itemTop}>
                      {row.state === 'draft' ? <label className={styles.itemSelection}>
                        <input type="checkbox" checked={selectedIds.includes(row.receiptId)}
                          disabled={locked || correctionError || !eligible(row)}
                          aria-label={`${copy('Include this row')}: ${name}`}
                          onChange={event => {
                            if (working.current || !sameAccount()) return;
                            setSelectedIds(ids => event.target.checked ? [...ids, row.receiptId] : ids.filter(id => id !== row.receiptId));
                            setReviewing(false); setPhysicalReceived(false);
                          }} />
                        <span className="sr-only">{copy('Include this row')}</span>
                      </label> : <span className={styles.itemSymbol}>{row.state === 'saved' ? <Check aria-hidden="true" /> : <Clock3 aria-hidden="true" />}</span>}
                      <div className={styles.itemName}><h2>{name}</h2><p>{sku || copy('Product match needed')}</p></div>
                      <span className={styles.pill} data-tone={row.state === 'saved' ? 'success' : attention || row.state !== 'draft' ? 'warning' : undefined}>{copy(label)}</span>
                    </div>

                    {row.state === 'draft' && <>
                      <details className={styles.match} data-attention={matchNeeded} open={matchNeeded || undefined}>
                        <summary>{copy(matchNeeded ? 'Which product did you receive?' : 'Edit product or warehouse')}</summary>
                        <div className={styles.matchFields}>
                          <label>{copy('Stock destination')}<NativeSelect disabled={locked} value={row.mode === 'new' ? '__new__' : row.productId}
                            onChange={event => edit(row.receiptId, event.target.value === '__new__' ? { mode: 'new', productId: '' } : { mode: 'existing', productId: event.target.value }, true)}>
                            <option value="">{copy('Choose product')}</option><option value="__new__">{copy('Create a new product')}</option>
                            {products.map(item => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}
                          </NativeSelect></label>
                          <label>{copy('Receiving warehouse')}<NativeSelect disabled={locked} value={row.warehouseId}
                            onChange={event => edit(row.receiptId, { warehouseId: event.target.value }, true)}>
                            <option value="">{copy('Choose warehouse')}</option>
                            {warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </NativeSelect></label>
                          {row.mode === 'new' && <>
                            <label>{copy('New product name')}<Input disabled={locked} maxLength={255} value={row.newName} onChange={event => edit(row.receiptId, { newName: event.target.value })} onBlur={flushCorrections} /></label>
                            <label>{copy('New product SKU')}<Input disabled={locked} maxLength={100} value={row.newSku} onChange={event => edit(row.receiptId, { newSku: event.target.value })} onBlur={flushCorrections} /></label>
                            <label>{copy('Stock unit')}<NativeSelect disabled={locked} value={row.stockUnit} onChange={event => edit(row.receiptId, { stockUnit: event.target.value }, true)}>
                              {STOCK_UNITS.map(option => <option key={option} value={option}>{copy(option)}</option>)}
                            </NativeSelect></label>
                            <label>{copy('Selling price per unit')}<Input disabled={locked} type="number" inputMode="decimal" min="0" step="0.01" value={row.sellingPrice} onChange={event => edit(row.receiptId, { sellingPrice: event.target.value })} onBlur={flushCorrections} /></label>
                          </>}
                        </div>
                      </details>
                      <div className={styles.itemFields}>
                        <label>{copy('Quantity physically received')}
                          <span className={styles.inputUnit}><Input disabled={locked} type="number" inputMode="numeric" min="1" max="2147483647" step="1" value={row.quantity}
                            onChange={event => edit(row.receiptId, { quantity: event.target.value })} onBlur={flushCorrections} />
                            {unit && <span>{copy(unit)}</span>}</span>
                        </label>
                        <label>{copy('Buying cost per unit')}
                          <span className={styles.inputUnit}><span>₦</span><Input disabled={locked} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" value={row.unitCost}
                            onChange={event => edit(row.receiptId, { unitCost: event.target.value, zeroConfirmed: false })} onBlur={flushCorrections} /></span>
                        </label>
                        <div className={styles.lineTotal}><span>{copy('Line total')}</span><strong>{total === null ? '—' : money(total)}</strong></div>
                      </div>
                      {row.unitCost.trim() !== '' && Number(row.unitCost) === 0 && <label className={styles.check}><input type="checkbox" disabled={locked}
                        checked={row.zeroConfirmed} onChange={event => edit(row.receiptId, { zeroConfirmed: event.target.checked }, true)} />{copy('Confirm this stock really has zero buying cost')}</label>}
                      {row.unitCost.trim() !== '' && !validCost(row.unitCost) && <p className={styles.rowError}>{copy('Enter a buying cost with no more than two decimal places, up to ₦9,999,999,999.99.')}</p>}
                    </>}
                    {rowWarnings(row)}
                    <footer className={styles.itemFooter}>
                      <span>{warehouse ? <>{copy('Receive into')} <strong>{warehouse.name}</strong></> : <>{copy('Extracted source row')} {index + 1}</>}</span>
                      {draft && visible && <Dialog>
                        <DialogTrigger asChild><Button variant="ghost"><FileText aria-hidden="true" />{copy('View source')}</Button></DialogTrigger>
                        <DialogContent className={styles.sourceDialog}>
                          <DialogTitle>{copy('Check against the source')}</DialogTitle>
                          <DialogDescription>{copy('Compare the original values with your review.')}</DialogDescription>
                          <SourceEvidence draft={draft} rowIndex={index} />
                        </DialogContent>
                      </Dialog>}
                    </footer>
                  </article>;
                })}
              </div>
              {rows.some(row => row.state === 'draft') && <div className={styles.reviewActions}>
                <label className={styles.physical}><input type="checkbox" disabled={locked || correctionError} checked={physicalReceived} onChange={event => setPhysicalReceived(event.target.checked)} />
                  <span><strong>{copy('I checked that these goods have arrived')}</strong><small>{copy('Only receive stock physically delivered to the selected warehouses.')}</small></span>
                </label>
                <div className={styles.reviewAction}>
                  <div><strong>{selected.length} {copy(selected.length === 1 ? 'item selected' : 'items selected')}</strong><span>{money(selectionTotal)} {copy('receipt cost')}</span></div>
                  <Button disabled={onlineActionsLocked || selected.length === 0 || !physicalReceived} onClick={prepare}>{copy('Review exact stock changes')}<ArrowRight aria-hidden="true" /></Button>
                </div>
              </div>}
            </div>
            {draft && <aside className={styles.sourcePane}>
              <h2>{copy('Check against the source')}</h2>
              <SourceEvidence draft={draft} />
              <p>{copy('Use View source on an item to compare its extracted values.')}</p>
            </aside>}
          </div>
        </>}
        <Link href="/inventory" className={styles.manual}>{copy('Open inventory for the manual workflow')}</Link>
      </>}

      {selection && <section className={styles.approval} aria-label={copy('These exact changes will be applied')}>
        <header className={styles.approvalIntro}>
          <span className={styles.approvalIcon}><Check aria-hidden="true" /></span>
          <div><h2>{copy(busy ? 'Approving this receipt' : 'Ready for your approval')}</h2>
            <p>{copy(busy ? 'Wait for this request to finish before trying again.' : 'These are proposed changes. No stock has been received for this selection yet.')}</p></div>
          <span className={styles.pill} data-tone="warning">{copy(busy ? 'Approval in progress' : 'Awaiting approval')}</span>
        </header>
        <dl className={styles.destination}>
          <div><dt>{copy('Receive into')}</dt><dd>{Array.from(new Set(selection.groups.map(group => group.warehouse_name))).join(', ')}</dd></div>
          <div><dt>{copy('Source')}</dt><dd>{sourceLabel}</dd></div>
        </dl>
        <div className={styles.effects}>
          {selection.groups.map(group => <article key={group.operation_id} className={styles.effect}>
            <div><h3>{group.product_name}</h3><p>{group.warehouse_name}</p></div>
            <div className={styles.effectStock}><span>{copy('Stock at this warehouse')}</span>
              <strong>{group.stock_before} → {group.stock_after} <small>{copy(group.stock_unit)}</small></strong></div>
            <div className={styles.effectCost}><span>{copy('Receive')} {group.quantity} × {money(group.unit_cost_minor)}</span>
              <strong>{money(BigInt(group.quantity) * BigInt(group.unit_cost_minor))}</strong></div>
            <details className={styles.effectDetails}><summary>{copy('How the average cost changes')}</summary>
              <p>{copy('Average buying cost across all warehouses')}: {money(group.cost_before_minor)} → {money(group.cost_after_minor)}.</p>
            </details>
            <p className={styles.effectNote}>{group.mode === 'new'
              ? `${copy('Create product and receive stock together')}. ${copy('Selling price per unit')}: ${money(group.selling_price_minor || '0')}.`
              : copy('Existing product; selling price unchanged.')}
              {group.cost_kind === 'free' && <> {copy('Buying cost explicitly confirmed as zero.')}</>}</p>
          </article>)}
        </div>
        <div className={styles.approvalTotal}><span>{copy('Total receipt cost')}</span>
          <strong>{money(selection.groups.reduce((sum, group) => sum + BigInt(group.quantity) * BigInt(group.unit_cost_minor), BigInt(0)))}</strong></div>
        <div className={styles.notice}><Check aria-hidden="true" /><div><strong>{copy('You are approving only the items above.')}</strong>
          <p>{copy('Unselected items stay in the draft. Changed business records may require another review.')}</p></div></div>
        <div className={styles.approvalActions}>
          <Button variant="outline" disabled={actionsLocked} onClick={() => setReviewing(false)}>{copy('Back to check items')}</Button>
          <Button disabled={onlineActionsLocked} onClick={apply}><Check aria-hidden="true" />{copy(`Approve and apply ${selection.groups.length} stock receipt${selection.groups.length === 1 ? '' : 's'}`)}</Button>
        </div>
      </section>}

      {stage === 'result' && <section className={styles.result} aria-label={copy('Stock receipt outcome')}>
        <header className={styles.resultHeading}>
          <span className={styles.resultIcon} data-tone={busy || pendingCount || remainingCount ? 'warning' : 'success'}>
            {busy || pendingCount ? <Clock3 aria-hidden="true" /> : remainingCount ? <TriangleAlert aria-hidden="true" /> : <Check aria-hidden="true" />}
          </span>
          <h2>{copy(busy ? 'Recording your receipt' : pendingCount || draft?.pendingApproval ? 'The outcome is not confirmed yet'
            : remainingCount ? 'Some items still need a review' : 'Stock receipt completed')}</h2>
          <p>{copy(busy ? 'Keep this task open while Track Kasuwa checks the result.'
            : draft?.pendingApproval ? 'Approval confirmation pending. No additional stock will be submitted until its original approval is found.'
            : pendingCount ? 'Check the original operation before trying again.'
            : remainingCount ? 'Any confirmed items are preserved. Review the remaining items when you are ready.'
            : 'Track Kasuwa confirmed receipt of the selected items.')}</p>
        </header>
        <dl className={styles.resultCounts}>
          <div><dt>{copy('items saved')}</dt><dd>{completedCount}</dd></div>
          <div><dt>{copy('awaiting status')}</dt><dd>{pendingCount}</dd></div>
          <div><dt>{copy('remaining in draft')}</dt><dd>{remainingCount}</dd></div>
        </dl>
        <ul className={styles.resultLines}>{rows.map((row, index) => {
          const pending = awaitingResult(row, index);
          const name = row.mode === 'new' ? row.newName || row.source : products.find(item => item.id === row.productId)?.name || row.source;
          const stateLabel = row.state === 'saved' ? 'Stock saved'
            : pendingApprovalRows.has(index) ? 'Approval confirmation pending'
            : row.state === 'confirmation_pending' ? 'Receipt confirmation pending'
            : row.state === 'queued' ? 'Queued for upload — not yet confirmed' : 'Not received';
          return <li key={row.receiptId}>
            <div className={styles.resultLineHeading}><strong>{name}</strong>
              <span className={styles.pill} data-tone={row.state === 'saved' ? 'success' : pending ? 'warning' : undefined}>{copy(stateLabel)}</span></div>
            {rowWarnings(row)}
            {row.state === 'saved' && <Link className={styles.manual} href={`/products/${row.savedProductId || row.productId}/edit`}>{copy('View product')}</Link>}
            {row.state !== 'draft' && <details className={styles.sourceReference}>
              <summary>{copy('Receipt details')}</summary>
              <p>{copy('Receiving warehouse')}: {warehouses.find(item => item.id === row.warehouseId)?.name || row.warehouseId}</p>
              <p>{copy('Quantity physically received')}: {row.quantity} · {copy('Buying cost per unit')}: ₦{row.unitCost}</p>
              {row.mode === 'new' && <p>{copy('Create SKU')} {row.newSku} · {copy('Selling price per unit')}: ₦{row.sellingPrice}</p>}
              <p>{copy('Receipt reference')}: {row.attempt?.receipt_id || row.receiptId}</p>
              {row.attempt?.operation_id && <p>{copy('Operation reference')}: {row.attempt.operation_id}</p>}
            </details>}
            {pending && row.state !== 'draft' && <>
              <div className={styles.controls}><Button variant="outline" disabled={onlineActionsLocked} onClick={() => check(index)}>{copy('Check receipt status')}</Button>
                {row.state === 'confirmation_pending' && row.attempt?.approval_id && <Button variant="outline" disabled={onlineActionsLocked} onClick={() => check(index, true)}>{copy('Retry same receipt')}</Button>}</div>
              {!row.attempt?.approval_id && <p>{copy('This older receipt can only be checked here. Resolve its original result before preparing another receipt.')}</p>}
            </>}
          </li>;
        })}</ul>
        <div className={styles.resultActions}>
          {(pendingCount > 0 || draft?.pendingApproval) && <Button disabled={busy || savingCorrections || correctionError || !isOnline} onClick={() => check()}>
            <Clock3 aria-hidden="true" />{copy(draft?.pendingApproval ? 'Check approval status' : 'Check original operation')}
          </Button>}
          {remainingCount > 0 && !draft?.pendingApproval && <Button variant={pendingCount ? 'outline' : 'default'} disabled={navigationLocked} onClick={() => { setFilter('all'); setEditingRemaining(true); }}>
            {copy('Review remaining items')}<ArrowRight aria-hidden="true" />
          </Button>}
          {onBackToOverview && <Button variant={pendingCount || remainingCount || draft?.pendingApproval ? 'outline' : 'default'} disabled={navigationLocked} onClick={navigateBack}>{copy('Back to overview')}</Button>}
        </div>
        {draft && <details className={styles.resultSource}>
          <summary>{copy('Check against the source')}</summary><SourceEvidence draft={draft} />
        </details>}
      </section>}
    </>}
  </section>;
}
