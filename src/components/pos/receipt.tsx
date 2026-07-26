import React from 'react';
import { formatCurrency } from '@/lib/utils/format';
import type { ReceiptData } from '@/lib/receipt/build-receipt';

/**
 * Renders a receipt formatted like a till-roll printout. This component is
 * wrapped in `.print-only` (see globals.css `@media print` rules), meaning
 * it's invisible on screen but is the ONLY thing shown when the browser's
 * print dialog is triggered — every other on-screen element carries
 * `.no-print` so it's hidden during printing. This is what makes the
 * existing "Print" button (window.print()) produce an actual receipt
 * instead of a screenshot of the whole dashboard.
 */
export function Receipt({ data }: { data: ReceiptData }) {
  return (
    <div className="print-only receipt-print-area">
      <div className="receipt-paper">
        <div className="receipt-center receipt-bold receipt-lg">{data.orgName}</div>
        {data.orgAddress && <div className="receipt-center">{data.orgAddress}</div>}
        <div className="receipt-divider" />

        <div className="receipt-row">
          <span>Invoice:</span>
          <span className="receipt-bold">{data.invoiceNumber}</span>
        </div>
        <div className="receipt-row">
          <span>Date:</span>
          <span>{new Date(data.dateISO).toLocaleString()}</span>
        </div>
        {data.cashierName && (
          <div className="receipt-row">
            <span>Cashier:</span>
            <span>{data.cashierName}</span>
          </div>
        )}
        {data.customerName && (
          <div className="receipt-row">
            <span>Customer:</span>
            <span>{data.customerName}</span>
          </div>
        )}
        {data.customerPhone && (
          <div className="receipt-row">
            <span>Phone:</span>
            <span>{data.customerPhone}</span>
          </div>
        )}
        <div className="receipt-divider" />

        {data.items.map((item, i) => (
          <div key={i} className="receipt-item">
            <div>{item.name}</div>
            <div className="receipt-row">
              <span>
                {item.quantity} x {formatCurrency(item.unitPrice)}
              </span>
              <span>{formatCurrency(item.total)}</span>
            </div>
          </div>
        ))}

        <div className="receipt-divider" />
        <div className="receipt-row">
          <span>Subtotal</span>
          <span>{formatCurrency(data.subtotal)}</span>
        </div>
        {data.discount > 0 && (
          <div className="receipt-row">
            <span>Discount</span>
            <span>-{formatCurrency(data.discount)}</span>
          </div>
        )}
        {data.tax > 0 && (
          <div className="receipt-row">
            <span>Tax</span>
            <span>{formatCurrency(data.tax)}</span>
          </div>
        )}
        <div className="receipt-divider" />
        <div className="receipt-row receipt-bold receipt-lg">
          <span>TOTAL</span>
          <span>{formatCurrency(data.total)}</span>
        </div>
        <div className="receipt-row">
          <span>Paid</span>
          <span>{formatCurrency(data.amountPaid)}</span>
        </div>
        {data.changeAmount > 0 && (
          <div className="receipt-row">
            <span>Change</span>
            <span>{formatCurrency(data.changeAmount)}</span>
          </div>
        )}
        <div className="receipt-row">
          <span>Payment</span>
          <span>{data.paymentMethod}</span>
        </div>

        {data.notes && <div className="receipt-center receipt-notes">{data.notes}</div>}

        <div className="receipt-divider" />
        <div className="receipt-center receipt-bold">Thank you for your business!</div>
        <div className="receipt-center receipt-small">Powered by TradeTrack</div>
      </div>
    </div>
  );
}
