'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useCopy } from '@/i18n/text';
import {
  localPriceAreaSchema, localPriceDefaultSchema, localPriceResultSchema, NIGERIAN_STATES, type LocalPriceResult,
} from '@/lib/ai/local-price-contract';
import { priceChangeResultSchema, type PriceChangeResult } from '@/lib/ai/price-change-contract';
import type { StockReviewScope } from '@/lib/ai/stock-review-draft';
import { stockReviewIdSchema } from '@/lib/ai/stock-review-contract';

type Props = {
  scope: StockReviewScope;
  productId: string;
  warehouseId: string;
  productName: string;
  job: string;
  rowIndex: number;
  allowPriceWrite: boolean;
};

function decimal(minor: string) {
  const digits = minor.padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function priceMinor(value: string) {
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  return match ? BigInt(match[1] + (match[2] ?? '').padEnd(2, '0')).toString() : null;
}

class PriceRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function LocalPriceCheck(props: Props) {
  const copy = useCopy();
  const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return <Dialog open={open} onOpenChange={next => { if (!busy || next) setOpen(next); }}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline">{copy('Check local price')}</Button>
    </DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
      <DialogTitle>{copy('Check local price')}</DialogTitle>
      <DialogDescription>{props.productName}</DialogDescription>
      {open && <LocalPriceReview {...props} online={online} onBusyChange={setBusy} />}
    </DialogContent>
  </Dialog>;
}

function LocalPriceReview({
  scope, productId, warehouseId, job, rowIndex, allowPriceWrite, online, onBusyChange,
}: Props & { online: boolean; onBusyChange: (busy: boolean) => void }) {
  const copy = useCopy();
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [areaLoading, setAreaLoading] = useState(online);
  const [result, setResult] = useState<LocalPriceResult | null>(null);
  const [sellingPrice, setSellingPrice] = useState('');
  const [priceChange, setPriceChange] = useState<PriceChangeResult | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { ownerId, organizationId } = scope;
  const storedKey = `trackasuwa.ai.price-operation:${organizationId}:${ownerId}:${job}:${rowIndex}`;
  const requestBusy = useRef(false);
  const initialized = useRef(false);
  const areaEdited = useRef(false);
  const controller = useRef(new AbortController());

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    return () => abort.abort();
  }, []);

  useEffect(() => {
    if (!online || initialized.current) return;
    const abort = new AbortController();
    void fetch(`/api/ai/local-prices?warehouseId=${encodeURIComponent(warehouseId)}`, {
      headers: { 'X-Track-Expected-Owner': ownerId, 'X-Track-Expected-Organization': organizationId },
      cache: 'no-store',
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(12000)]),
    }).then(async response => {
      if (!response.ok) return;
      const { area } = localPriceDefaultSchema.parse(await response.json());
      if (area && !areaEdited.current) {
        setState(area.state);
        setCity(area.city ?? '');
      }
    }).catch(() => {
      // The merchant can choose a state even when the default cannot be read.
    }).finally(() => {
      if (!abort.signal.aborted) {
        initialized.current = true;
        setAreaLoading(false);
      }
    });
    return () => abort.abort();
  }, [online, organizationId, ownerId, warehouseId]);

  async function post(endpoint: string, input: Record<string, unknown>) {
    if (!navigator.onLine) throw new Error(copy('Reconnect to continue.'));
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Track-Expected-Owner': ownerId, 'X-Track-Expected-Organization': organizationId },
      body: JSON.stringify(input),
      cache: 'no-store',
      signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(20000)]),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new PriceRequestError(
      typeof data?.error === 'string' ? data.error : copy('This request could not be confirmed.'), response.status);
    return data;
  }

  async function run(work: () => Promise<void>) {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    // Strict mode can tear down effects before any user action takes place.
    if (controller.current.signal.aborted) controller.current = new AbortController();
    try {
      await work();
    } catch (cause) {
      if (!controller.current.signal.aborted) {
        setError(cause instanceof PriceRequestError || (cause instanceof Error && cause.name === 'Error')
          ? cause.message : copy('The request was interrupted. Check its status before trying again.'));
      }
    } finally {
      requestBusy.current = false;
      onBusyChange(false);
      if (!controller.current.signal.aborted) setBusy(false);
    }
  }

  const hasSavedOperation = (() => {
    if (!allowPriceWrite || typeof window === 'undefined') return false;
    try { return stockReviewIdSchema.safeParse(window.localStorage.getItem(storedKey)).success; }
    catch { return false; }
  })();

  function receivePriceChange(data: unknown, operationId: string) {
    const change = priceChangeResultSchema.parse(data);
    if (change.operationId !== operationId || change.job !== job
      || change.productId !== productId || change.rowIndex !== rowIndex) {
      throw new Error(copy('This price change does not match the original review.'));
    }
    setPriceChange(change);
    setRecovering(false);
  }

  async function fetchPriceStatus() {
    const stored = stockReviewIdSchema.safeParse(window.localStorage.getItem(storedKey));
    if (!stored.success) throw new Error(copy('There is no price change to check on this device.'));
    try {
      const data = await post('/api/ai/price-changes', { action: 'status', operationId: stored.data });
      receivePriceChange(data, stored.data);
    } catch (cause) {
      if (cause instanceof PriceRequestError && cause.status === 404) {
        window.localStorage.removeItem(storedKey);
        setPriceChange(null);
        setRecovering(false);
        throw new Error(copy('No price change was recorded. You can review the current price and try again.'));
      }
      throw cause;
    }
  }

  async function preparePrice() {
    const amount = priceMinor(sellingPrice);
    if (amount === null) throw new Error(copy('Enter a valid naira price with up to two decimal places.'));
    if (stockReviewIdSchema.safeParse(window.localStorage.getItem(storedKey)).success) return fetchPriceStatus();
    const operationId = crypto.randomUUID();
    // Save an opaque reference before sending anything. A timeout or refresh
    // can then be resolved against the original operation on the server.
    window.localStorage.setItem(storedKey, operationId);
    setRecovering(true);
    const data = await post('/api/ai/price-changes', { action: 'prepare', job, rowIndex, operationId, newPriceMinor: amount });
    receivePriceChange(data, operationId);
  }

  async function approvePrice() {
    if (!priceChange || priceChange.status !== 'prepared') return;
    setRecovering(true);
    const data = await post('/api/ai/price-changes', {
      action: 'approve', operationId: priceChange.operationId, reviewDigest: priceChange.reviewDigest,
    });
    receivePriceChange(data, priceChange.operationId);
  }

  return <div className="min-w-0 space-y-4 text-sm">
    {!online && <p role="status">{copy('Reconnect to check offers or review a price change.')}</p>}
    {error && <p role="alert" className="break-words text-destructive">{error}</p>}
    {busy && <p role="status">{copy('Working on your price check…')}</p>}
    {!priceChange && !recovering && <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      const area = localPriceAreaSchema.safeParse({ state, ...(city.trim() ? { city: city.trim() } : {}) });
      if (!area.success) { setError(copy('Choose a state and check the city name.')); return; }
      setResult(null);
      setSellingPrice('');
      void run(async () => {
        const data = await post('/api/ai/local-prices', { productId, warehouseId, area: area.data });
        const proposal = localPriceResultSchema.parse(data);
        setResult(proposal);
        if (proposal.status === 'suggested') setSellingPrice(decimal(proposal.suggestedPriceMinor));
      });
    }}>
      <p className="text-muted-foreground">{copy('Confirm the shop area for this comparison.')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>{copy('State or FCT')}
          <NativeSelect required value={state} disabled={busy || areaLoading} onChange={event => { areaEdited.current = true; setState(event.target.value); setCity(''); setResult(null); }}>
            <option value="">{copy('Choose a state')}</option>
            {NIGERIAN_STATES.map(option => <option key={option} value={option}>{option}</option>)}
          </NativeSelect>
        </label>
        <label>{copy('City (optional)')}
          <Input value={city} maxLength={64} disabled={busy || areaLoading} onChange={event => { areaEdited.current = true; setCity(event.target.value); setResult(null); }} />
        </label>
      </div>
      <Button type="submit" disabled={!online || busy || areaLoading || !state}>{copy('Find local offers')}</Button>
    </form>}
    {result && !priceChange && !recovering && <section className="space-y-2" aria-label={copy('Local price evidence')}>
      <h3 className="font-semibold">{result.area.city ? `${result.area.city}, ` : ''}{result.area.state}</h3>
      {result.status === 'suggested' && result.suggestedPriceMinor && <p>
        {copy('Suggested selling price')} <strong>₦{decimal(result.suggestedPriceMinor)}</strong>
        {result.offers.length >= 2 && <span className="block text-muted-foreground">{copy('Observed online range')} ₦{decimal(
          result.offers.reduce((min, offer) => BigInt(offer.priceMinor) < BigInt(min) ? offer.priceMinor : min, result.offers[0].priceMinor),
        )} – ₦{decimal(result.offers.reduce((max, offer) =>
          BigInt(offer.priceMinor) > BigInt(max) ? offer.priceMinor : max, result.offers[0].priceMinor))}</span>}
      </p>}
      {result.status === 'observed' && <p>{copy('One comparable offer found. Review it before setting your price.')}</p>}
      {result.status === 'no_local_price' && <p>{copy('No reliable local price found. Keep your current price or enter one yourself.')}</p>}
      <ul className="divide-y divide-border">
        {result.offers.map(offer => <li key={`${offer.seller}:${offer.url}`} className="space-y-1 break-words py-2">
          <p><a href={offer.url} target="_blank" rel="noreferrer noopener" className="text-primary underline">{offer.seller}</a> · ₦{decimal(offer.priceMinor)}</p>
          <p className="text-muted-foreground">{offer.pack} · {offer.location} · {new Date(offer.checkedAt).toLocaleDateString()}</p>
          <p className="text-muted-foreground">{offer.feeMinor === undefined
            ? copy('Delivery fees not confirmed') : `${copy('Listed delivery fee')} ₦${decimal(offer.feeMinor)}`}</p>
        </li>)}
      </ul>
      {!allowPriceWrite && <Link className="inline-flex min-h-11 items-center text-primary underline"
        href={`/products/${productId}/edit`}>{copy('Open product to edit its selling price')}</Link>}
      {allowPriceWrite && !hasSavedOperation && <div className="space-y-2">
        <label className="block">{copy('Proposed selling price (₦)')}
          <Input inputMode="decimal" value={sellingPrice} disabled={busy} onChange={event => setSellingPrice(event.target.value)} />
        </label>
        <Button type="button" disabled={busy || !online || priceMinor(sellingPrice) === null}
          onClick={() => void run(preparePrice)}>{copy('Review price change')}</Button>
      </div>}
    </section>}
    {(recovering || (hasSavedOperation && !priceChange)) && allowPriceWrite &&
      <Button type="button" variant="outline" disabled={busy || !online}
        onClick={() => void run(fetchPriceStatus)}>{copy('Check original price change status')}</Button>}
    {priceChange && !recovering && <section className="space-y-3" aria-label={copy('Separate price approval')}>
      <p>{copy('This price applies to the product across your business.')}</p>
      <p><strong>₦{decimal(priceChange.oldPriceMinor)} → ₦{decimal(priceChange.newPriceMinor)}</strong></p>
      {priceChange.status === 'prepared' && <Button type="button" disabled={!online || busy} onClick={() => void run(approvePrice)}>
        {copy('Approve price change')}
      </Button>}
      {priceChange.status === 'completed' && <p role="status">{copy('Selling price change confirmed.')}</p>}
      {(priceChange.status === 'conflict' || priceChange.status === 'expired') && <>
        <p role="status">{copy('This review is no longer current. Review the latest price before approving a change.')}</p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run(async () => {
          window.localStorage.removeItem(storedKey);
          setPriceChange(null);
        })}>{copy('Start a fresh review')}</Button>
      </>}
    </section>}
  </div>;
}
