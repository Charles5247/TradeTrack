import { jsPDF } from 'jspdf';
import type { TransferReceiptData } from '@/lib/receipt/build-transfer-receipt';
<<<<<<< HEAD
import { renderQRCodeDataUrl } from '@/lib/qr/render-qr';
=======
import { renderBarcodeDataUrl } from '@/lib/barcode/render-barcode';
import { wrapReceiptText } from '@/lib/receipt/receipt-layout';
>>>>>>> 1b4cb589b4c2da26a56bc265568a3bde488d910b

/**
 * Downloadable PDF for a warehouse stock transfer — the distinct
 * "Stock Transfer Note" template (separate from the sales/vendor
 * "Cash Receipt" template in receipt-pdf.ts), sharing the same paper
 * size, asterisk dividers, and scannable barcode.
 */
export async function downloadTransferReceiptPDF(data: TransferReceiptData) {
  const widthPt = 80 * 2.8346;
  const marginX = 10;
  const lineHeight = 9.5;
  const width = widthPt - marginX * 2;
  const estimatedHeight = 120 + (data.initiatedBy ? 9.5 : 0) + (data.approvedBy ? 9.5 : 0) + (data.coordinatedBy ? 9.5 : 0) + (data.sentBy ? 9.5 : 0) + (data.receivedBy ? 9.5 : 0) + (data.notes ? 24 : 0) + 60;
  const doc = new jsPDF({ unit: 'pt', format: [widthPt, Math.max(320, estimatedHeight)] });
  let y = 16;

  const center = (text: string, size = 9, bold = false, upper = false) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(upper ? text.toUpperCase() : text, widthPt / 2, y, { align: 'center' });
    y += lineHeight + 0.5;
  };

  const row = (left: string, right: string, size = 8.5, bold = false) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const leftLines = doc.splitTextToSize(left, width * 0.54);
    const rightLines = doc.splitTextToSize(right, width * 0.42);
    const lineCount = Math.max(leftLines.length, rightLines.length);
    doc.text(leftLines, marginX, y);
    doc.text(rightLines, widthPt - marginX, y, { align: 'right' });
    y += lineCount * lineHeight;
  };

  const divider = () => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const asterisks = '*'.repeat(Math.max(20, Math.floor(width / 4.2)));
    doc.text(asterisks, marginX, y);
    y += lineHeight * 0.7;
  };

  center(data.orgName, 11.5, true, true);
  if (data.orgAddress) center(`Address: ${data.orgAddress}`, 8);
  if (data.orgPhone) center(`Telp. ${data.orgPhone}`, 8);
  divider();
  center('Stock Transfer Note', 10.5, true, true);
  divider();

  row('Ref:', data.transferRef, 8.5, true);
  row('Date:', new Date(data.dateISO).toLocaleString(), 8.5);
  row('Status:', data.status.toUpperCase(), 8.5);
  divider();
  row('From:', data.fromWarehouse);
  row('To:', data.toWarehouse);
  divider();

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DESCRIPTION', marginX, y);
  doc.text('QTY', widthPt - marginX, y, { align: 'right' });
  y += lineHeight * 0.8;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const productLabel = data.productSku ? `${data.productName} (${data.productSku})` : data.productName;
  const wrappedProduct = wrapReceiptText(productLabel, 28);
  doc.text(wrappedProduct, marginX, y, { maxWidth: width * 0.75 });
  doc.text(String(data.quantity), widthPt - marginX, y, { align: 'right' });
  y += Math.max(1, wrappedProduct.length) * lineHeight * 0.8;

  divider();
  if (data.initiatedBy) row('Initiated by:', data.initiatedBy);
  if (data.approvedBy) row('Approved by:', data.approvedBy);
  if (data.coordinatedBy) row('Coordinated by:', data.coordinatedBy);
  if (data.sentBy) row('Sent by:', data.sentBy);
  if (data.receivedBy) row('Received by:', data.receivedBy);

  if (data.notes) {
    divider();
    const lines = doc.splitTextToSize(data.notes, width);
    doc.text(lines, marginX, y, { maxWidth: width });
    y += lines.length * lineHeight * 0.8;
  }

  divider();
  center('Thank you!', 9.5, true, true);
  center('Powered by TradeTrack', 7.5);

  if (data.barcodeValue) {
<<<<<<< HEAD
    const qrDataUrl = await renderQRCodeDataUrl(data.barcodeValue);
    if (qrDataUrl) {
      y += 4;
      const qrSize = 78;
      doc.addImage(qrDataUrl, 'PNG', (widthPt - qrSize) / 2, y, qrSize, qrSize);
=======
    const barcodeDataUrl = renderBarcodeDataUrl(data.barcodeValue, { width: 1.4, height: 34 });
    if (barcodeDataUrl) {
      const barcodeWidth = width * 0.75;
      const barcodeHeight = 28;
      doc.addImage(barcodeDataUrl, 'PNG', (widthPt - barcodeWidth) / 2, y + 4, barcodeWidth, barcodeHeight);
>>>>>>> 1b4cb589b4c2da26a56bc265568a3bde488d910b
    }
  }

  doc.save(`transfer-${data.transferRef}.pdf`);
}
