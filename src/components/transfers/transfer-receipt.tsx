import React from 'react';
import type { TransferReceiptData } from '@/lib/receipt/build-transfer-receipt';
import { BarcodeImage } from '@/components/receipts/barcode-image';

/**
 * Distinct receipt/slip template for warehouse stock transfers — visually
 * consistent with the sales receipt (same paper, dividers, barcode) but
 * titled "Stock Transfer Note" and showing From/To warehouse, product,
 * quantity and the three accountability fields (initiated / approved /
 * coordinated by) instead of a totals/payment section.
 */
export function TransferReceipt({ data }: { data: TransferReceiptData }) {
  return (
    <div className="print-only receipt-print-area">
      <div className="receipt-paper">
        <div className="receipt-center receipt-bold receipt-lg receipt-uppercase">
          {data.orgName}
        </div>
        {data.orgAddress && (
          <div className="receipt-center receipt-small">Address: {data.orgAddress}</div>
        )}
        {data.orgPhone && (
          <div className="receipt-center receipt-small">Telp. {data.orgPhone}</div>
        )}

        <div className="receipt-divider" />
        <div className="receipt-title">Stock Transfer Note</div>
        <div className="receipt-divider" />

        <div className="receipt-row">
          <span>Ref:</span>
          <span className="receipt-bold">{data.transferRef}</span>
        </div>
        <div className="receipt-row">
          <span>Date:</span>
          <span>{new Date(data.dateISO).toLocaleString()}</span>
        </div>
        <div className="receipt-row">
          <span>Status:</span>
          <span className="receipt-bold">{data.status.toUpperCase()}</span>
        </div>

        <div className="receipt-divider" />

        <div className="receipt-row">
          <span>From:</span>
          <span>{data.fromWarehouse}</span>
        </div>
        <div className="receipt-row">
          <span>To:</span>
          <span>{data.toWarehouse}</span>
        </div>

        <div className="receipt-divider" />

        <div className="receipt-table-head">
          <span>Description</span>
          <span>Qty</span>
        </div>
        <div className="receipt-item">
          <span>
            {data.productName}
            {data.productSku ? ` (${data.productSku})` : ''}
          </span>
          <span>{data.quantity}</span>
        </div>

        <div className="receipt-divider" />

        {/* Accountability — who requested, approved and coordinates the
            transfer. */}
        <div className="receipt-payment-details">
          {data.initiatedBy && (
            <div className="receipt-row">
              <span>Initiated by</span>
              <span>{data.initiatedBy}</span>
            </div>
          )}
          {data.approvedBy && (
            <div className="receipt-row">
              <span>Approved by</span>
              <span>{data.approvedBy}</span>
            </div>
          )}
          {data.coordinatedBy && (
            <div className="receipt-row">
              <span>Coordinated by</span>
              <span>{data.coordinatedBy}</span>
            </div>
          )}
          {data.sentBy && (
            <div className="receipt-row">
              <span>Sent by</span>
              <span>{data.sentBy}</span>
            </div>
          )}
          {data.receivedBy && (
            <div className="receipt-row">
              <span>Received by</span>
              <span>{data.receivedBy}</span>
            </div>
          )}
        </div>

        {data.notes && <div className="receipt-center receipt-notes">{data.notes}</div>}

        <div className="receipt-divider" />
        <div className="receipt-center receipt-bold receipt-uppercase">Thank you!</div>
        <div className="receipt-center receipt-small">Powered by TradeTrack</div>

        {data.barcodeValue && (
          <div className="receipt-barcode">
            <BarcodeImage value={data.barcodeValue} />
          </div>
        )}
      </div>
    </div>
  );
}
