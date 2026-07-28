'use client';

import React, { useState } from 'react';
import { Search, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
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
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<
    | { kind: 'sale'; receipt: SaleLookupResult }
    | { kind: 'transfer'; receipt: TransferLookupResult }
    | null
  >(null);

  const handleLookup = async () => {
    const value = code.trim();
    if (!value) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/receipts/lookup?code=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t.receiptLookup.not_found);
        return;
      }
      setResult(data);
    } catch {
      toast.error(t.receiptLookup.error);
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setCode('');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.receiptLookup.title}</h1>
        <p className="text-muted-foreground text-sm">{t.receiptLookup.subtitle}</p>
      </div>

      {!result && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-2">
              <Input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                placeholder={t.receiptLookup.placeholder}
              />
              <Button onClick={handleLookup} disabled={isLoading || !code.trim()}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    {t.receiptLookup.lookup}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result?.kind === 'sale' && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">{t.receiptLookup.sale_title}</h2>
              <Badge>{result.receipt.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
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

            <div className="border rounded-lg divide-y">
              <div className="grid grid-cols-4 gap-2 p-2 text-xs font-semibold text-muted-foreground">
                <span className="col-span-2">{t.receiptLookup.item}</span>
                <span>{t.receiptLookup.qty}</span>
                <span className="text-right">{t.receiptLookup.total}</span>
              </div>
              {result.receipt.items.map((item, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 p-2 text-sm">
                  <span className="col-span-2">{item.name}{item.sku ? ` (${item.sku})` : ''}</span>
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

            <Button variant="outline" className="w-full" onClick={reset}>{t.receiptLookup.scan_another}</Button>
          </CardContent>
        </Card>
      )}

      {result?.kind === 'transfer' && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">{t.receiptLookup.transfer_title}</h2>
              <Badge>{result.receipt.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">{t.receiptLookup.reference}:</span> <span className="font-medium">{result.receipt.transferRef}</span></div>
              <div><span className="text-muted-foreground">{t.receiptLookup.date}:</span> {formatDateTime(result.receipt.dateISO)}</div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{result.receipt.fromWarehouse}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{result.receipt.toWarehouse}</span>
            </div>

            <div className="border rounded-lg divide-y">
              <div className="grid grid-cols-3 gap-2 p-2 text-xs font-semibold text-muted-foreground">
                <span className="col-span-2">{t.receiptLookup.item}</span>
                <span>{t.receiptLookup.qty}</span>
              </div>
              {result.receipt.items.map((item, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 p-2 text-sm">
                  <span className="col-span-2">{item.name}{item.sku ? ` (${item.sku})` : ''}</span>
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
    </div>
  );
}
