import { jsPDF } from "jspdf";
import type { ReceiptData } from "@/lib/receipt/build-receipt";
import { formatCurrency } from "@/lib/utils/format";
import { renderBarcodeDataUrl } from "@/lib/barcode/render-barcode";
import { wrapReceiptText } from "@/lib/receipt/receipt-layout";

/**
 * Renders a single sale/vendor-payment receipt as a narrow, receipt-shaped
 * PDF (80mm-ish width, like a till roll) and triggers a download. Matches
 * the shared receipt template: centered shop header, asterisk dividers,
 * "CASH RECEIPT" title, Description/Price item table, Totals, an optional
 * payment-details block, a "THANK YOU!" footer, and a scannable barcode —
 * the same layout used by the browser print view and the ESC/POS printer
 * output, so all three never drift out of sync.
 */
export function downloadReceiptPDF(receipt: ReceiptData) {
  const widthPt = 80 * 2.8346;
  const hasPaymentDetails = Boolean(receipt.cardMasked || receipt.approvalCode);
  const marginX = 10;
  const lineHeight = 9.5;
  const width = widthPt - marginX * 2;

  const estimatedHeight =
    100 +
    6 * lineHeight +
    (receipt.cashierName ? lineHeight : 0) +
    (receipt.customerName ? lineHeight : 0) +
    (receipt.customerPhone ? lineHeight : 0) +
    receipt.items.length * 22 +
    10 * lineHeight +
    (hasPaymentDetails ? 10 * lineHeight : 0) +
    (receipt.notes ? 18 : 0) +
    50;
  const doc = new jsPDF({ unit: "pt", format: [widthPt, Math.max(320, estimatedHeight)] });
  let y = 16;

  const center = (text: string, size = 9, bold = false, upper = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(upper ? text.toUpperCase() : text, widthPt / 2, y, { align: "center" });
    y += lineHeight + 0.5;
  };

  const row = (left: string, right: string, size = 8.5, bold = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const leftWidth = width * 0.54;
    const rightWidth = width * 0.4;
    const leftLines = doc.splitTextToSize(left, leftWidth);
    const rightLines = doc.splitTextToSize(right, rightWidth);
    const lineCount = Math.max(leftLines.length, rightLines.length);
    doc.text(leftLines, marginX, y);
    doc.text(rightLines, widthPt - marginX, y, { align: "right" });
    y += lineCount * lineHeight;
  };

  const divider = () => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const asterisks = "*".repeat(Math.max(20, Math.floor(width / 4.2)));
    doc.text(asterisks, marginX, y);
    y += lineHeight * 0.7;
  };

  const drawWrappedBlock = (text: string, size = 8) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(text, width);
    doc.text(lines, marginX, y);
    y += lines.length * (lineHeight - 0.5);
  };

  // ── Header ──────────────────────────────────────────────────
  center(receipt.orgName, 11.5, true, true);
  if (receipt.orgAddress) center(`Address: ${receipt.orgAddress}`, 8);
  if (receipt.orgPhone) center(`Telp. ${receipt.orgPhone}`, 8);
  divider();
  center("Cash Receipt", 10.5, true, true);
  divider();

  // ── Meta ────────────────────────────────────────────────────
  row("Invoice:", receipt.invoiceNumber, 8.5, true);
  row("Date:", new Date(receipt.dateISO).toLocaleString(), 8.5);
  if (receipt.cashierName) row("Cashier:", receipt.cashierName, 8.5);
  if (receipt.customerName) row("Customer:", receipt.customerName, 8.5);
  if (receipt.customerPhone) row("Phone:", receipt.customerPhone, 8.5);
  divider();

  // ── Item table ──────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("DESCRIPTION", marginX, y);
  doc.text("AMOUNT", widthPt - marginX, y, { align: "right" });
  y += lineHeight * 0.8;

  receipt.items.forEach((item) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const quantityLine = `${item.quantity} x ${formatCurrency(item.unitPrice)}`;
    const lines = wrapReceiptText(item.name, 28);
    doc.text(quantityLine, marginX, y, { maxWidth: width * 0.5 });
    doc.text(formatCurrency(item.total), widthPt - marginX, y, { align: "right" });
    y += lineHeight * 0.9;
    doc.text(lines, marginX, y, { maxWidth: width * 0.8 });
    y += Math.max(1, lines.length) * lineHeight * 0.8;
  });

  divider();
  row("Subtotal:", formatCurrency(receipt.subtotal));
  if (receipt.discount > 0) row("Discount:", `-${formatCurrency(receipt.discount)}`);
  if (receipt.tax > 0) row("Tax:", formatCurrency(receipt.tax));
  row("TOTAL:", formatCurrency(receipt.total), 10, true);
  row(receipt.paymentMethod === "cash" ? "Cash:" : "Paid:", formatCurrency(receipt.amountPaid));
  if (receipt.changeAmount > 0) row("Change:", formatCurrency(receipt.changeAmount));
  if (!hasPaymentDetails) row("Payment:", receipt.paymentMethod);

  // ── Payment details (Bank card / Approval Code) ────────────
  if (hasPaymentDetails) {
    divider();
    if (receipt.cardMasked) row("Bank card:", receipt.cardMasked);
    if (receipt.approvalCode) row("Approval Code:", `#${receipt.approvalCode}`);
  }

  if (receipt.notes) {
    divider();
    drawWrappedBlock(receipt.notes, 8);
  }

  divider();
  center("Thank you!", 9.5, true, true);
  center("Powered by TradeTrack", 7.5);

  // ── Scannable barcode ───────────────────────────────────────
  if (receipt.barcodeValue) {
    const barcodeDataUrl = renderBarcodeDataUrl(receipt.barcodeValue, {
      width: 1.4,
      height: 34,
    });
    if (barcodeDataUrl) {
      const barcodeWidth = width * 0.75;
      const barcodeHeight = 28;
      doc.addImage(
        barcodeDataUrl,
        "PNG",
        (widthPt - barcodeWidth) / 2,
        y + 4,
        barcodeWidth,
        barcodeHeight,
      );
    }
  }

  doc.save(`receipt-${receipt.invoiceNumber}.pdf`);
}
