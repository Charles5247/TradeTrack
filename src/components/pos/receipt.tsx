import React from "react";
import { formatCurrency } from "@/lib/utils/format";
import type { ReceiptData } from "@/lib/receipt/build-receipt";
import { BarcodeImage } from "@/components/receipts/barcode-image";

/**
 * Renders a sales/vendor receipt formatted like the sample till-roll
 * template: centered shop header, asterisk dividers, "CASH RECEIPT"
 * title, a Description/Price item table, a Totals block, an optional
 * payment-details block (Bank card / Approval Code), a bold "THANK YOU!"
 * footer, and a scannable barcode at the bottom.
 *
 * This component is wrapped in `.print-only` (see globals.css `@media
 * print` rules), meaning it's invisible on screen but is the ONLY thing
 * shown when the browser's print dialog is triggered — every other
 * on-screen element carries `.no-print` so it's hidden during printing.
 * This is what makes the existing "Print" button (window.print()) produce
 * an actual receipt instead of a screenshot of the whole dashboard.
 */
export function Receipt({ data }: { data: ReceiptData }) {
  const showPaymentDetails = Boolean(data.cardMasked || data.approvalCode);

  return (
    <div className="print-only receipt-print-area">
      <div className="receipt-paper">
        {/* Header */}
        <div className="receipt-center receipt-bold receipt-lg receipt-uppercase">
          {data.orgName}
        </div>
        {data.orgAddress && (
          <div className="receipt-center receipt-small">
            Address: {data.orgAddress}
          </div>
        )}
        {data.orgPhone && (
          <div className="receipt-center receipt-small">
            Tel. {data.orgPhone}
          </div>
        )}

        <div className="receipt-divider" />
        <div className="receipt-title">Cash Receipt</div>
        <div className="receipt-divider" />

        {/* Meta */}
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

        {/* Item table */}
        <div className="receipt-table-head">
          <span>Description</span>
          <span>Amount</span>
        </div>
        {data.items.map((item, i) => (
          <div key={i} className="receipt-item-block">
            <div className="receipt-item-meta">
              <span>
                {item.quantity} x {formatCurrency(item.unitPrice)}
              </span>
              <span>{formatCurrency(item.total)}</span>
            </div>
            <div className="receipt-item">
              <span>{item.name}</span>
            </div>
          </div>
        ))}

        <div className="receipt-divider" />

        {/* Totals */}
        <div className="receipt-row">
          <span>Subtotal:</span>
          <span>{formatCurrency(data.subtotal)}</span>
        </div>
        {data.discount > 0 && (
          <div className="receipt-row">
            <span>Discount:</span>
            <span>-{formatCurrency(data.discount)}</span>
          </div>
        )}
        {data.tax > 0 && (
          <div className="receipt-row">
            <span>Tax:</span>
            <span>{formatCurrency(data.tax)}</span>
          </div>
        )}
        <div className="receipt-row receipt-total">
          <span>Total:</span>
          <span>{formatCurrency(data.total)}</span>
        </div>
        <div className="receipt-row">
          <span>{data.paymentMethod === "cash" ? "Cash:" : "Paid:"}</span>
          <span>{formatCurrency(data.amountPaid)}</span>
        </div>
        {data.changeAmount > 0 && (
          <div className="receipt-row">
            <span>Change:</span>
            <span>{formatCurrency(data.changeAmount)}</span>
          </div>
        )}
        {!showPaymentDetails && (
          <div className="receipt-row">
            <span>Payment:</span>
            <span>{data.paymentMethod}</span>
          </div>
        )}

        {/* Payment details (Bank card / Approval Code) */}
        {showPaymentDetails && (
          <>
            <div className="receipt-divider" />
            <div className="receipt-payment-details">
              {data.cardMasked && (
                <div className="receipt-row">
                  <span>Bank card:</span>
                  <span>{data.cardMasked}</span>
                </div>
              )}
              {data.approvalCode && (
                <div className="receipt-row">
                  <span>Approval Code:</span>
                  <span>#{data.approvalCode}</span>
                </div>
              )}
            </div>
          </>
        )}

        {data.notes && (
          <div className="receipt-center receipt-notes">{data.notes}</div>
        )}

        <div className="receipt-divider" />
        <div className="receipt-center receipt-bold receipt-uppercase">
          Thank you!
        </div>
        <div className="receipt-center receipt-small">
          Powered by TradeTrack
        </div>

        {/* Scannable barcode — resolves back to this receipt's full item
            list via /receipts/lookup when scanned. */}
        {data.barcodeValue && (
          <div className="receipt-barcode">
            <BarcodeImage value={data.barcodeValue} />
          </div>
        )}
      </div>
    </div>
  );
}
