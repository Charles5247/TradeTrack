import { jsPDF } from 'jspdf';
import type { ReceiptData } from '@/lib/receipt/build-receipt';
import { formatCurrency } from '@/lib/utils/format';

/**
 * Renders a single sale as a narrow, receipt-shaped PDF (80mm-ish width,
 * like a till roll) and triggers a download. Useful when there's no
 * physical printer connected — the trader can still keep or share a proper
 * receipt for the sale instead of relying only on the on-screen summary.
 */
export function downloadReceiptPDF(receipt: ReceiptData) {
  // 80mm thermal-roll width in points (1mm ≈ 2.8346pt), generous height that
  // auto-grows isn't supported by jsPDF page size, so we estimate height
  // from line count and pad generously.
  const widthPt = 80 * 2.8346;
  const estimatedLines = 14 + receipt.items.length * 2;
  const heightPt = Math.max(300, estimatedLines * 14);

  const doc = new jsPDF({ unit: 'pt', format: [widthPt, heightPt] });
  const marginX = 10;
  let y = 24;
  const lineHeight = 13;
  const width = widthPt - marginX * 2;

  const center = (text: string, size = 10, bold = false) => {
    doc.setFontSize(size);
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.text(text, widthPt / 2, y, { align: 'center' });
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
    doc.setLineWidth(0.5);
    doc.line(marginX, y, widthPt - marginX, y);
    y += lineHeight * 0.6;
  };

  center(receipt.orgName, 12, true);
  if (receipt.orgAddress) center(receipt.orgAddress, 8);
  y += 4;
  divider();

  row('Invoice:', receipt.invoiceNumber, 9, true);
  row('Date:', new Date(receipt.dateISO).toLocaleString());
  if (receipt.cashierName) row('Cashier:', receipt.cashierName);
  if (receipt.customerName) row('Customer:', receipt.customerName);
  divider();

  receipt.items.forEach((item) => {
    doc.setFontSize(9);
    doc.setFont('courier', 'normal');
    doc.text(item.name, marginX, y, { maxWidth: width });
    y += lineHeight;
    row(
      `  ${item.quantity} x ${formatCurrency(item.unitPrice)}`,
      formatCurrency(item.total),
      9
    );
  });

  divider();
  row('Subtotal', formatCurrency(receipt.subtotal));
  if (receipt.discount > 0) row('Discount', `-${formatCurrency(receipt.discount)}`);
  if (receipt.tax > 0) row('Tax', formatCurrency(receipt.tax));
  divider();
  row('TOTAL', formatCurrency(receipt.total), 11, true);
  row('Paid', formatCurrency(receipt.amountPaid));
  if (receipt.changeAmount > 0) row('Change', formatCurrency(receipt.changeAmount));
  row('Payment', receipt.paymentMethod);
  y += 6;

  if (receipt.notes) {
    center(receipt.notes, 8);
  }

  y += 8;
  center('Thank you for your business!', 9, true);
  center('Powered by TradeTrack', 7);

  doc.save(`receipt-${receipt.invoiceNumber}.pdf`);
}
