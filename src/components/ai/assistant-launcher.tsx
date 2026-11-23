'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useCopy } from '@/i18n/text';
import { createStockReview, loadStockReview } from '@/lib/ai/stock-review-draft';
import { useOnlineStatus } from '@/hooks/use-online-status';

export function AssistantLauncher() {
  const user = useAuthStore(state => state.user);
  if (user?.role !== 'business_owner' || user.status !== 'active' || !user.organization_id) return null;
  return <AssistantPanel key={`${user.organization_id}:${user.id}`} ownerId={user.id} organizationId={user.organization_id} />;
}

function AssistantPanel({ ownerId, organizationId }: { ownerId: string; organizationId: string }) {
  const pathname = usePathname();
  const copy = useCopy();
  const isOnline = useOnlineStatus();
  const panelId = useId();
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const preparing = useRef(false);
  const [open, setOpen] = useState(false);
  const [stockText, setStockText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);

  const closePanel = () => {
    setOpen(false);
    launcher.current?.focus();
  };

  const prepareStock = async () => {
    if (!stockText.trim() || preparing.current || !navigator.onLine) return;
    preparing.current = true;
    setBusy(true); setError('');
    try {
      const scope = { ownerId, organizationId };
      const active = await loadStockReview(scope);
      const current = useAuthStore.getState().user;
      if (current?.id !== scope.ownerId || current.organization_id !== scope.organizationId
        || current.role !== 'business_owner' || current.status !== 'active')
        throw new Error('Your account changed. Open the assistant again.');
      if (active) {
        setError('An unfinished stock review is already open. Open that review before preparing another delivery.');
        return;
      }
      if (!navigator.onLine) throw new Error('Reconnect to prepare a stock draft.');
      const response = await fetch('/api/ai', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Track-Expected-Owner': scope.ownerId,
          'X-Track-Expected-Organization': scope.organizationId },
        body: JSON.stringify({ action: 'inventory', text: stockText }) });
      const result = await response.json();
      const after = useAuthStore.getState().user;
      if (after?.id !== scope.ownerId || after.organization_id !== scope.organizationId
        || after.role !== 'business_owner' || after.status !== 'active') return;
      if (!response.ok || !result.job || !Array.isArray(result.rows))
        throw new Error(result.error || 'Could not prepare the stock draft.');
      await createStockReview(scope, result.job, result.rows);
      const owner = useAuthStore.getState().user;
      if (owner?.id !== scope.ownerId || owner.organization_id !== scope.organizationId
        || owner.role !== 'business_owner' || owner.status !== 'active') return;
      setStockText('');
      setOpen(false);
      if (pathname === '/assistant') window.dispatchEvent(new Event('trackasuwa:stock-review-opened'));
      window.location.assign('/assistant#inventory');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare the stock draft.'); }
    finally { preparing.current = false; setBusy(false); }
  };

  const stockContext = pathname?.startsWith('/inventory') || pathname?.startsWith('/products') || pathname?.startsWith('/purchase-orders');
  const mobilePosition = pathname === '/assistant'
    ? 'bottom-[max(1rem,env(safe-area-inset-bottom))]'
    : 'top-[calc(var(--header-h)+0.5rem)]';
  return <div className={`${pathname?.startsWith('/pos') ? 'hidden lg:flex' : 'flex'} ${mobilePosition} pointer-events-none fixed right-3 z-30 flex-col items-end gap-3 sm:right-6 lg:top-auto lg:bottom-6`}>
    {open && <section id={panelId} role="dialog" aria-label={copy('Trackasuwa assistant')} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closePanel(); } }} className="pointer-events-auto max-h-[min(70dvh,30rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h2 className="font-semibold">{copy('Trackasuwa assistant')}</h2><p className="mt-1 text-sm text-muted-foreground">{copy('Prepare work from your business records. You review every change before it is saved.')}</p></div>
        <button ref={closeButton} type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted" aria-label={copy('Close assistant')} onClick={closePanel}><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium">{copy('Paste a stock list')}
          <textarea aria-label={copy('Paste a stock list')} value={stockText}
            onChange={event => setStockText(event.target.value)} maxLength={10000} rows={4}
            placeholder={copy('Example: Rice 4 bags at 15000 each')}
            className="mt-2 w-full rounded-lg border border-input bg-background p-3 text-sm" />
        </label>
        <button type="button" disabled={busy || !isOnline || !stockText.trim()}
          onClick={() => void prepareStock()}
          className="min-h-11 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {copy(busy ? 'Preparing draft...' : 'Prepare and review stock')}
        </button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Link href="/assistant#inventory" onClick={() => setOpen(false)} className="block min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">{copy(!isOnline ? 'Open a saved stock review' : stockContext ? 'Prepare stock from this area or resume review' : 'Open stock intake or resume review')}</Link>
        <Link href="/assistant#insights" onClick={() => setOpen(false)} className="block min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">{copy('Review business insights')}</Link>
      </div>
      <p role="status" className="mt-3 text-sm text-muted-foreground">{copy(isOnline ? 'Review the proposed changes before approving stock.' : 'Offline. Open a saved review on this device or reconnect to prepare new work.')}</p>
    </section>}
    <button ref={launcher} type="button" aria-label={copy(open ? 'Close Trackasuwa assistant' : 'Open Trackasuwa assistant')} aria-controls={open ? panelId : undefined} aria-expanded={open} onClick={() => setOpen(value => !value)} className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:min-h-14 lg:w-auto lg:gap-2 lg:px-4">
      <Sparkles className="h-5 w-5" aria-hidden="true" /><span className="hidden text-sm font-semibold lg:inline">{copy('Assistant')}</span>
    </button>
  </div>;
}
