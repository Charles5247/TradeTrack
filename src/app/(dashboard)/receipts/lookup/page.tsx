'use client';
import { TranslatedText, useCopy } from '@/i18n/text';


import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, ArrowRight, ScanLine, ReceiptText, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import { useAuthStore, useOrgStore } from '@/store';
import { detectProductCode, supportsBarcodeDetection } from '@/lib/products/detect-code';
import { downloadReceiptPDF } from '@/lib/pdf/receipt-pdf';
import { Receipt } from '@/components/pos/receipt';
import type { ReceiptData } from '@/lib/receipt/build-receipt';
import { useI18n } from '@/i18n';

interface SaleItem { name: string; sku?: string; quantity: number; unitPrice?: number; discount?: number; total?: number }
interface SaleLookupResult {
  invoiceNumber: string; dateISO: string; cashierName?: string; customerName?: string;
  customerPhone?: string; status: string; paymentStatus: string; paymentMethod: string;
  subtotal: number; discount: number; tax: number; total: number; amountPaid: number;
  changeAmount: number; notes?: string; items: SaleItem[];
}
interface TransferLookupResult {
  transferRef: string; dateISO: string; status: string; fromWarehouse?: string; toWarehouse?: string;
  initiatedBy?: string; approvedBy?: string; coordinatedBy?: string; sentBy?: string; receivedBy?: string;
  notes?: string; items: SaleItem[];
}

export default function ReceiptLookupPage() {
  const copy = useCopy();
  const { t } = useI18n();
  const { user } = useAuthStore();
  const org = useOrgStore();
  const [lookupError, setLookupError] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const scan = useRef<HTMLInputElement>(null);
  const requestSequence = useRef(0);
  const receiptKey = 'receipt-lookups:' + user?.organization_id + ':' + user?.id;
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<
    | { kind: 'sale'; receipt: SaleLookupResult }
    | { kind: 'transfer'; receipt: TransferLookupResult }
    | null
  >(null);

  const handleLookup = async (requested?: string) => {
    const value = (requested ?? code).trim();
    if (!value) return;
    const sequence = ++requestSequence.current;
    setCode(value);
    setLookupError('');
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/receipts/lookup?code=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (sequence !== requestSequence.current) return;
      if (!res.ok) {
        setLookupError(data.error || t.receiptLookup.not_found);
        return;
      }
      setResult(data);
      setRecent(previous => { const next = [value, ...previous.filter(v => v !== value)].slice(0, 6); try { sessionStorage.setItem(receiptKey, JSON.stringify(next)); } catch {} return next; });
    } catch {
      if (sequence === requestSequence.current) setLookupError(t.receiptLookup.error);
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    try { const stored = JSON.parse(sessionStorage.getItem(receiptKey) || '[]'); setRecent(Array.isArray(stored) ? stored.filter(v => typeof v === 'string').slice(0,6) : []); } catch { setRecent([]); }
    setResult(null);
    setLookupError('');
    setIsLoading(false);
    const initial = new URLSearchParams(window.location.search).get('code');
    if (initial && user?.id) void handleLookup(initial);
    return () => { requestSequence.current++; };
    // Reset cached previews when the authenticated business changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptKey]);
  const receipt: ReceiptData | null = result?.kind === 'sale' ? {
    ...result.receipt, orgName: org.organizationName, orgAddress: org.organizationAddress, orgPhone: org.organizationPhone, currency: org.currency,
    items: result.receipt.items.map(i => ({ name:i.name, quantity:i.quantity, unitPrice:i.unitPrice ?? 0, total:i.total ?? 0 })),
  } : null;

  const reset = () => {
    setResult(null);
    setCode('');
  };

  return (
    <div className="min-w-0 w-full mx-auto space-y-6">
      <div>
        <h1 className="tt-page-title">{t.receiptLookup.title}</h1>
        <p className="tt-muted text-sm">{t.receiptLookup.subtitle}</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-5 no-print">
        <Card><CardContent className="space-y-5 p-6 sm:p-8"><h2 className="tt-eyebrow"><TranslatedText text={"Look up a receipt"} /></h2><form className="flex flex-col gap-3 sm:flex-row" onSubmit={e => { e.preventDefault(); if (!isLoading) void handleLookup(); }}><Input autoFocus aria-label={copy("Receipt number")} className="h-12" value={code} onChange={e => setCode(e.target.value)} placeholder={t.receiptLookup.placeholder} /><Button className="h-12" disabled={isLoading || !code.trim()}>{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{t.receiptLookup.lookup}</Button></form>
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><TranslatedText text={"OR"} /><span className="h-px flex-1 bg-border" /></div>
        <Button variant="outline" className="h-12 w-full" disabled={isLoading || !supportsBarcodeDetection()} onClick={() => scan.current?.click()}><ScanLine className="h-4 w-4" /><TranslatedText text={"Scan barcode or QR"} /></Button>
        <input ref={scan} className="hidden" type="file" accept="image/*" capture="environment" aria-label={copy("Receipt barcode photo")} onChange={async e => { const file = e.target.files?.[0]; e.target.value=''; if (!file) return; try { await handleLookup(await detectProductCode(file)); } catch (err) { setLookupError((err as Error).message); } }} />
        <p className="text-xs text-muted-foreground"><TranslatedText text={"Use a receipt number or a connected barcode scanner. Photo scanning requires a supported browser."} /></p>{lookupError && <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{lookupError}</p>}</CardContent></Card>
        <Card><CardContent className="p-6"><h2 className="tt-eyebrow mb-3"><TranslatedText text={"Recent lookups"} /></h2>{recent.length ? recent.map(value => <div key={value} className="flex items-center justify-between gap-3 border-b border-dashed py-3"><span className="font-mono text-sm">{value}</span><Button variant="ghost" size="sm" disabled={isLoading} onClick={() => handleLookup(value)}><TranslatedText text={"Open"} /></Button></div>) : <p className="text-sm text-muted-foreground"><TranslatedText text={"Your successful lookups in this session will appear here."} /></p>}</CardContent></Card>
      </div>
      <div className="min-w-0 space-y-4">
      {!result && <Card className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center"><ReceiptText className="h-10 w-10 text-muted-foreground" /><h2 className="tt-head"><TranslatedText text={"Receipt preview"} /></h2><p className="text-sm text-muted-foreground"><TranslatedText text={"Look up a receipt to review its items, totals and payment details."} /></p></Card>}
      {receipt && <div className="flex flex-wrap justify-end gap-2 no-print"><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /><TranslatedText text={"Print receipt"} /></Button><Button onClick={() => downloadReceiptPDF(receipt).catch(() => toast.error('Could not download receipt.'))}><Download className="h-4 w-4" /><TranslatedText text={"Download PDF"} /></Button></div>}
      {result?.kind === 'sale' && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="tt-head text-lg">{t.receiptLookup.sale_title}</h2>
              <Badge>{result.receipt.status}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm break-words">
              <div><span className="text-muted-foreground">{t.receiptLookup.invoice}:</span> <span className="font-medium">{result.receipt.invoiceNumber}</span></div>
              <div><span className="text-muted-foreground">{t.receiptLookup.date}:</span> {formatDateTime(result.receipt.dateISO)}</div>
              {result.receipt.cashierName && (
                <div><span className="text-muted-foreground">{t.receiptLookup.cashier}:</span> {result.receipt.cashierName}</div>
              )}
              {result.receipt.customerName && (
                <div><span className="text-muted-foreground">{t.receiptLookup.customer}:</span> {result.receipt.customerName}</div>
              )}
              <div><span className="text-muted-foreground">{t.receiptLookup.payment_method}:</span> {result.receipt.paymentMethod}</div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border divide-y divide-border">
              <div className="grid min-w-[280px] grid-cols-4 gap-2 p-3 bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="col-span-2 break-words">{t.receiptLookup.item}</span>
                <span>{t.receiptLookup.qty}</span>
                <span className="text-right">{t.receiptLookup.total}</span>
              </div>
              {result.receipt.items.map((item, i) => (
                <div key={i} className="grid min-w-[280px] grid-cols-4 gap-2 p-3 text-sm">
                  <span className="col-span-2 break-words">{item.name}{item.sku ? ` (${item.sku})` : ''}</span>
                  <span>{item.quantity}</span>
                  <span className="text-right">{item.total != null ? formatCurrency(item.total) : '—'}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-sm border-t pt-3">
              <div className="flex justify-between"><span>{t.receiptLookup.subtotal}</span><span>{formatCurrency(result.receipt.subtotal)}</span></div>
              {result.receipt.discount > 0 && (
                <div className="flex justify-between"><span>{t.receiptLookup.discount}</span><span>-{formatCurrency(result.receipt.discount)}</span></div>
              )}
              {result.receipt.tax > 0 && (
                <div className="flex justify-between"><span>{t.receiptLookup.tax}</span><span>{formatCurrency(result.receipt.tax)}</span></div>
              )}
              <div className="flex justify-between font-bold text-base"><span>{t.receiptLookup.grand_total}</span><span>{formatCurrency(result.receipt.total)}</span></div>
              <div className="flex justify-between"><span>{t.receiptLookup.amount_paid}</span><span>{formatCurrency(result.receipt.amountPaid)}</span></div>
              {result.receipt.changeAmount > 0 && (
                <div className="flex justify-between"><span>{t.receiptLookup.change}</span><span>{formatCurrency(result.receipt.changeAmount)}</span></div>
              )}
            </div>

            <Button variant="outline" className="no-print w-full" onClick={reset}>{t.receiptLookup.scan_another}</Button>
          </CardContent>
        </Card>
      )}

      {result?.kind === 'transfer' && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="tt-head text-lg">{t.receiptLookup.transfer_title}</h2>
              <Badge>{result.receipt.status}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm break-words">
              <div><span className="text-muted-foreground">{t.receiptLookup.reference}:</span> <span className="font-medium">{result.receipt.transferRef}</span></div>
              <div><span className="text-muted-foreground">{t.receiptLookup.date}:</span> {formatDateTime(result.receipt.dateISO)}</div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{result.receipt.fromWarehouse}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <span className="font-medium">{result.receipt.toWarehouse}</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border divide-y divide-border">
              <div className="grid min-w-[240px] grid-cols-3 gap-2 p-3 bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="col-span-2 break-words">{t.receiptLookup.item}</span>
                <span>{t.receiptLookup.qty}</span>
              </div>
              {result.receipt.items.map((item, i) => (
                <div key={i} className="grid min-w-[240px] grid-cols-3 gap-2 p-3 text-sm">
                  <span className="col-span-2 break-words">{item.name}{item.sku ? ` (${item.sku})` : ''}</span>
                  <span>{item.quantity}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-sm border-t pt-3">
              {result.receipt.initiatedBy && (
                <div className="flex justify-between"><span>{t.receiptLookup.initiated_by}</span><span>{result.receipt.initiatedBy}</span></div>
              )}
              {result.receipt.approvedBy && (
                <div className="flex justify-between"><span>{t.receiptLookup.approved_by}</span><span>{result.receipt.approvedBy}</span></div>
              )}
              {result.receipt.coordinatedBy && (
                <div className="flex justify-between"><span>{t.receiptLookup.coordinated_by}</span><span>{result.receipt.coordinatedBy}</span></div>
              )}
              {result.receipt.sentBy && (
                <div className="flex justify-between"><span>{t.receiptLookup.sent_by}</span><span>{result.receipt.sentBy}</span></div>
              )}
              {result.receipt.receivedBy && (
                <div className="flex justify-between"><span>{t.receiptLookup.received_by}</span><span>{result.receipt.receivedBy}</span></div>
              )}
            </div>

            <Button variant="outline" className="w-full" onClick={reset}>{t.receiptLookup.scan_another}</Button>
          </CardContent>
        </Card>
      )}
      </div></div>
      {receipt && <Receipt data={receipt} />}
    </div>
  );
}
