'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useCopy } from '@/i18n/text';

export function AssistantLauncher() {
  const user = useAuthStore(state => state.user);
  const pathname = usePathname();
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const [stockText, setStockText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (user?.role !== 'business_owner') return null;

  const prepareStock = async () => {
    if (!stockText.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/ai', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'inventory', text: stockText }) });
      const result = await response.json();
      if (!response.ok || !result.job || !Array.isArray(result.rows))
        throw new Error(result.error || 'Could not prepare the stock draft.');
      window.localStorage.setItem('trackasuwa.ai.stockJob', result.job);
      window.location.assign('/assistant#inventory');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare the stock draft.'); }
    finally { setBusy(false); }
  };

  const stockContext = pathname?.startsWith('/inventory') || pathname?.startsWith('/products') || pathname?.startsWith('/purchase-orders');
  return <div className={`${pathname?.startsWith('/pos') ? 'hidden lg:flex' : 'flex'} pointer-events-none fixed right-3 top-[calc(var(--header-h)+0.5rem)] z-30 flex-col items-end gap-3 sm:right-6 lg:top-auto lg:bottom-6`}>
    {open && <section role="dialog" aria-label={copy('Trackasuwa assistant')} className="pointer-events-auto max-h-[min(70dvh,30rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h2 className="font-semibold">{copy('Trackasuwa assistant')}</h2><p className="mt-1 text-sm text-muted-foreground">{copy('Prepare work from your business records. You review every change before it is saved.')}</p></div>
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted" aria-label={copy('Close assistant')} onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium">{copy('Paste a stock list')}
          <textarea aria-label={copy('Paste a stock list')} value={stockText}
            onChange={event => setStockText(event.target.value)} maxLength={10000} rows={4}
            placeholder={copy('Example: Rice 4 bags at 15000 each')}
            className="mt-2 w-full rounded-lg border border-input bg-background p-3 text-sm" />
        </label>
        <button type="button" disabled={busy || !stockText.trim()}
          onClick={() => void prepareStock()}
          className="min-h-11 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {copy(busy ? 'Preparing draft...' : 'Prepare and review stock')}
        </button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Link href="/assistant#inventory" onClick={() => setOpen(false)} className="block min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">{copy(stockContext ? 'Prepare stock from this area' : 'Prepare a stock intake draft')}</Link>
        <Link href="/assistant#insights" onClick={() => setOpen(false)} className="block min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">{copy('Review business insights')}</Link>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{copy('AI needs an internet connection. Drafts are suggestions until you approve and apply them.')}</p>
    </section>}
    <button type="button" aria-label={copy(open ? 'Close Trackasuwa assistant' : 'Open Trackasuwa assistant')} aria-expanded={open} onClick={() => setOpen(value => !value)} className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:min-h-14 lg:w-auto lg:gap-2 lg:px-4">
      <Sparkles className="h-5 w-5" aria-hidden="true" /><span className="hidden text-sm font-semibold lg:inline">{copy('Assistant')}</span>
    </button>
  </div>;
}
