import { jsPDF } from 'jspdf';
import type { TransferReceiptData } from '@/lib/receipt/build-transfer-receipt';
import { renderQRCodeDataUrl } from '@/lib/qr/render-qr';

/**
 * Downloadable PDF for a warehouse stock transfer — the distinct
 * "Stock Transfer Note" template (separate from the sales/vendor
 * "Cash Receipt" template in receipt-pdf.ts), sharing the same paper
 * size, asterisk dividers, and scannable barcode.
 */
export async function downloadTransferReceiptPDF(data: TransferReceiptData) {
  const widthPt = 80 * 2.8346;
  const heightPt = 380;
  const doc = new jsPDF({ unit: 'pt', format: [widthPt, heightPt] });
  const marginX = 10;
  let y = 20;
  const lineHeight = 13;
  const width = widthPt - marginX * 2;

  const center = (text: string, size = 10, bold = false, upper = false) => {
    doc.setFontSize(size);
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.text(upper ? text.toUpperCase() : text, widthPt / 2, y, { align: 'center' });
    y += lineHeight;
  };

  const row = (left: string, right: string, size = 9, bold = false) => {
    doc.setFontSize(size);
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.text(left, marginX, y);
    doc.text(right, widthPt - marginX, y, { align: 'right' });
    y += lineHeight;
  };

  const divider = () => {
    doc.setFontSize(8);
    doc.setFont('courier', 'normal');
    const asterisks = '*'.repeat(Math.floor(width / 4.2));
    doc.text(asterisks, marginX, y);
    y += lineHeight * 0.7;
  };

  center(data.orgName, 13, true, true);
  if (data.orgAddress) center(`Address: ${data.orgAddress}`, 8);
  if (data.orgPhone) center(`Telp. ${data.orgPhone}`, 8);
  y += 2;
  divider();
  center('Stock Transfer Note', 11, true, true);
  divider();

  row('Ref:', data.transferRef, 9, true);
  row('Date:', new Date(data.dateISO).toLocaleString());
  row('Status:', data.status.toUpperCase());
  divider();
  row('From:', data.fromWarehouse);
  row('To:', data.toWarehouse);
  divider();

  doc.setFontSize(8);
  doc.setFont('courier', 'bold');
  doc.text('DESCRIPTION', marginX, y);
  doc.text('QTY', widthPt - marginX, y, { align: 'right' });
  y += lineHeight * 0.9;
  doc.setFontSize(9);
  doc.setFont('courier', 'normal');
  const productLabel = data.productSku ? `${data.productName} (${data.productSku})` : data.productName;
  doc.text(productLabel, marginX, y, { maxWidth: width * 0.65 });
  doc.text(String(data.quantity), widthPt - marginX, y, { align: 'right' });
  y += lineHeight;

  divider();
  if (data.initiatedBy) row('Initiated by', data.initiatedBy);
  if (data.approvedBy) row('Approved by', data.approvedBy);
  if (data.coordinatedBy) row('Coordinated by', data.coordinatedBy);
  if (data.sentBy) row('Sent by', data.sentBy);
  if (data.receivedBy) row('Received by', data.receivedBy);

  if (data.notes) {
    y += 2;
    center(data.notes, 8);
  }

  y += 4;
  divider();
  center('Thank you!', 10, true, true);
  center('Powered by TradeTrack', 7);

  if (data.barcodeValue) {
    const qrDataUrl = await renderQRCodeDataUrl(data.barcodeValue);
    if (qrDataUrl) {
      y += 4;
      const qrSize = 78;
      doc.addImage(qrDataUrl, 'PNG', (widthPt - qrSize) / 2, y, qrSize, qrSize);
    }
  }

  doc.save(`transfer-${data.transferRef}.pdf`);
}
