import { jsPDF } from "jspdf";
import type { ReceiptData } from "@/lib/receipt/build-receipt";
import { formatCurrency } from "@/lib/utils/format";
import { renderBarcodeDataUrl } from "@/lib/barcode/render-barcode";

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
  // 80mm thermal-roll width in points (1mm ≈ 2.8346pt), generous height that
  // auto-grows isn't supported by jsPDF page size, so we estimate height
  // from line count and pad generously.
  const widthPt = 80 * 2.8346;
  const hasPaymentDetails = Boolean(receipt.cardMasked || receipt.approvalCode);
  const estimatedLines =
    20 + receipt.items.length * 2 + (hasPaymentDetails ? 3 : 0);
  const heightPt = Math.max(340, estimatedLines * 14);

  const doc = new jsPDF({ unit: "pt", format: [widthPt, heightPt] });
  const marginX = 10;
  let y = 20;
  const lineHeight = 13;
  const width = widthPt - marginX * 2;

  const center = (text: string, size = 10, bold = false, upper = false) => {
    doc.setFontSize(size);
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.text(upper ? text.toUpperCase() : text, widthPt / 2, y, {
      align: "center",
    });
    y += lineHeight;
  };

  const row = (left: string, right: string, size = 9, bold = false) => {
    doc.setFontSize(size);
    doc.setFont("courier", bold ? "bold" : "normal");
    const maxLeftWidth = width * 0.68;
    const trimmedLeft = left.length > 18 ? `${left.slice(0, 17)}…` : left;
    doc.text(trimmedLeft, marginX, y, { maxWidth: maxLeftWidth });
    doc.text(right, widthPt - marginX, y, { align: "right" });
    y += lineHeight;
  };

  const divider = () => {
    doc.setFontSize(8);
    doc.setFont("courier", "normal");
    const asterisks = "*".repeat(Math.floor(width / 4.2));
    doc.text(asterisks, marginX, y);
    y += lineHeight * 0.7;
  };

  // ── Header ──────────────────────────────────────────────────
  center(receipt.orgName, 13, true, true);
  if (receipt.orgAddress) center(`Address: ${receipt.orgAddress}`, 8);
  if (receipt.orgPhone) center(`Telp. ${receipt.orgPhone}`, 8);
  y += 2;
  divider();
  center("Cash Receipt", 11, true, true);
  divider();

  // ── Meta ────────────────────────────────────────────────────
  row("Invoice:", receipt.invoiceNumber, 9, true);
  row("Date:", new Date(receipt.dateISO).toLocaleString());
  if (receipt.cashierName) row("Cashier:", receipt.cashierName);
  if (receipt.customerName) row("Customer:", receipt.customerName);
  if (receipt.customerPhone) row("Phone:", receipt.customerPhone);
  divider();

  // ── Item table ──────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("courier", "bold");
  doc.text("DESCRIPTION", marginX, y);
  doc.text("AMOUNT", widthPt - marginX, y, { align: "right" });
  y += lineHeight * 0.9;

  receipt.items.forEach((item) => {
    doc.setFontSize(8);
    doc.setFont("courier", "normal");
    const itemName =
      item.name.length > 24 ? `${item.name.slice(0, 23)}…` : item.name;
    doc.text(
      `${item.quantity} x ${formatCurrency(item.unitPrice)}`,
      marginX,
      y,
      { maxWidth: width * 0.5 },
    );
    doc.text(formatCurrency(item.total), widthPt - marginX, y, {
      align: "right",
    });
    y += lineHeight * 0.9;
    doc.setFontSize(8);
    doc.text(itemName, marginX, y, { maxWidth: width * 0.7 });
    y += lineHeight;
  });

  divider();
  row("Subtotal", formatCurrency(receipt.subtotal));
  if (receipt.discount > 0)
    row("Discount", `-${formatCurrency(receipt.discount)}`);
  if (receipt.tax > 0) row("Tax", formatCurrency(receipt.tax));
  row("TOTAL", formatCurrency(receipt.total), 12, true);
  row(
    receipt.paymentMethod === "cash" ? "Cash" : "Paid",
    formatCurrency(receipt.amountPaid),
  );
  if (receipt.changeAmount > 0)
    row("Change", formatCurrency(receipt.changeAmount));
  if (!hasPaymentDetails) row("Payment", receipt.paymentMethod);

  // ── Payment details (Bank card / Approval Code) ────────────
  if (hasPaymentDetails) {
    divider();
    if (receipt.cardMasked) row("Bank card", receipt.cardMasked);
    if (receipt.approvalCode) row("Approval Code", `#${receipt.approvalCode}`);
  }
  y += 4;

  if (receipt.notes) {
    center(receipt.notes, 8);
  }

  y += 4;
  divider();
  center("Thank you!", 10, true, true);
  center("Powered by TradeTrack", 7);

  // ── Scannable barcode ───────────────────────────────────────
  if (receipt.barcodeValue) {
    const barcodeDataUrl = renderBarcodeDataUrl(receipt.barcodeValue, {
      width: 1.6,
      height: 36,
    });
    if (barcodeDataUrl) {
      y += 4;
      const barcodeWidth = width * 0.75;
      const barcodeHeight = 30;
      doc.addImage(
        barcodeDataUrl,
        "PNG",
        (widthPt - barcodeWidth) / 2,
        y,
        barcodeWidth,
        barcodeHeight,
      );
    }
  }

  doc.save(`receipt-${receipt.invoiceNumber}.pdf`);
}
