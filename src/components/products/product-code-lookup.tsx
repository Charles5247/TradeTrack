'use client';
import { TranslatedText, useCopy } from '@/i18n/text';

import React, { useRef, useState } from 'react';
import { ScanLine, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store';
import { lookupProductCode, type CodeMatch } from '@/lib/products/lookup-code';
import { detectProductCode, supportsBarcodeDetection } from '@/lib/products/detect-code';

export function ProductCodeLookup({ onMatch, onCode }: { onMatch: (product: CodeMatch, cached: boolean) => void; onCode: (code: string) => void }) {
  const copy = useCopy();
  const { user } = useAuthStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof lookupProductCode>> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const supported = supportsBarcodeDetection();
  async function lookup(value: string) {
    setBusy(true); setError(''); setResult(null);
    try { setResult(await lookupProductCode(value, user?.organization_id || '')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Lookup failed. Enter the code manually and try again.'); }
    finally { setBusy(false); }
  }
  return <div className="min-w-0 space-y-4">
    <p className="tt-muted text-sm"><TranslatedText text={supported ? 'Photograph one barcode or QR code, or enter its value below. We search your business catalog; no photo is attached.' : 'Barcode scanning is not supported by this browser. Enter the barcode, QR value or SKU manually below.'} /></p>
    {supported && <Button type="button" variant="outline" className="min-h-11 w-full" disabled={busy} onClick={() => input.current?.click()}><ScanLine className="h-4 w-4" strokeWidth={1.75} />{" "}<TranslatedText text={"Scan with a photo"} /></Button>}
    <input ref={input} aria-label={copy("Barcode photo")} type="file" accept="image/*" capture="environment" className="hidden" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      setBusy(true); setError(''); setResult(null);
      try { const value = await detectProductCode(file); setCode(value); await lookup(value); }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not scan this photo. Enter the code manually.'); }
      finally { setBusy(false); }
    }} />
    <div className="space-y-2"><Label htmlFor="product-code"><TranslatedText text={"Barcode, QR value or SKU"} /></Label><Input id="product-code" value={code} disabled={busy} maxLength={255} onChange={e => { setCode(e.target.value); setResult(null); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (code.trim() && !busy) void lookup(code); } }} /></div>
    <Button type="button" className="min-h-11 w-full" disabled={busy || !code.trim()} onClick={() => void lookup(code)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} <TranslatedText text={busy ? 'Looking up product…' : 'Find product'} /></Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <div className="rounded-lg border border-border bg-muted p-4 space-y-3" role="status">
      {result.product ? <><p className="font-medium break-words">{result.product.name} · {result.product.sku}</p><p className="tt-muted text-sm"><TranslatedText text={result.cached ? 'Cached match. Reconnect before saving. ' : ''} /><TranslatedText text={"Use this product to replace the form fields. Saving will update this existing product, not create a duplicate."} /></p><Button type="button" className="min-h-11 w-full" onClick={() => onMatch(result.product!, result.cached)}><TranslatedText text={"Use this product"} /></Button></> : <><p className="tt-muted text-sm"><TranslatedText text={result.cached ? 'No match in the offline cache. Reconnect to check the full catalog.' : 'No product found in your business catalog.'} /></p>{!result.cached && <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => onCode(code.trim())}><TranslatedText text={"Use code in form"} /></Button>}</>}
    </div>}
  </div>;
}
