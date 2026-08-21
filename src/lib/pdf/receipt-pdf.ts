import { jsPDF } from "jspdf";
import type { ReceiptData } from "@/lib/receipt/build-receipt";
import { formatCurrency } from "@/lib/utils/format";
import { renderQRCodeDataUrl } from "@/lib/qr/render-qr";
import { wrapReceiptText } from "@/lib/receipt/receipt-layout";

/** Creates a compact 80mm-style PDF receipt entirely in the browser. */
export async function downloadReceiptPDF(receipt: ReceiptData) {
  const widthPt = 80 * 2.8346;
  const marginX = 10;
  const width = widthPt - marginX * 2;
  const lineHeight = 9.5;
  const hasPaymentDetails = Boolean(receipt.cardMasked || receipt.approvalCode);
  const estimatedHeight =
    175 +
    receipt.items.reduce(
      (total, item) =>
        total + Math.max(1, wrapReceiptText(`${item.name} @ ${formatCurrency(item.unitPrice)}`, 24).length) * lineHeight,
      0,
    ) +
    (hasPaymentDetails ? 30 : 0) +
    (receipt.notes ? 24 : 0) +
    90;
  const doc = new jsPDF({ unit: "pt", format: [widthPt, Math.max(360, estimatedHeight)] });
  let y = 16;

  if (receipt.receiptTemplateUrl) {
    const dataUrl = await loadImageDataUrl(receipt.receiptTemplateUrl);
    if (dataUrl) {
      const format = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(dataUrl, format, 0, 0, widthPt, Math.max(320, estimatedHeight));
    }
  }

  if (receipt.receiptTemplateUrl) {
    try {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = receipt.receiptTemplateUrl;
      image.onload = () => {
        doc.addImage(image, 'JPEG', 0, 0, widthPt, Math.max(320, estimatedHeight));
      };
    } catch {
      // Fallback to plain white background if the uploaded template fails.
    }
  }

  const center = (text: string, size = 9, bold = false, upper = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(upper ? text.toUpperCase() : text, widthPt / 2, y, { align: "center" });
    y += lineHeight + 0.5;
  };
  const divider = () => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("*".repeat(Math.max(20, Math.floor(width / 4.2))), marginX, y);
    y += lineHeight * 0.7;
  };
  const row = (left: string, right: string, size = 8.5, bold = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const leftLines = doc.splitTextToSize(left, width * 0.54);
    const rightLines = doc.splitTextToSize(right, width * 0.4);
    doc.text(leftLines, marginX, y);
    doc.text(rightLines, widthPt - marginX, y, { align: "right" });
    y += Math.max(leftLines.length, rightLines.length) * lineHeight;
  };

  center(receipt.orgName, 11.5, true, true);
  if (receipt.orgAddress) center(`Address: ${receipt.orgAddress}`, 8);
  if (receipt.orgPhone) center(`Telp. ${receipt.orgPhone}`, 8);
  divider();
  center("Invoice", 10.5, true, true);
  center("Current Bill", 9);
  divider();
  row("Invoice:", receipt.invoiceNumber, 8.5, true);
  row("Date:", new Date(receipt.dateISO).toLocaleString(), 8.5);
  if (receipt.cashierName) row("Cashier:", receipt.cashierName, 8.5);
  if (receipt.customerName) row("Customer:", receipt.customerName, 8.5);
  if (receipt.customerPhone) row("Phone:", receipt.customerPhone, 8.5);
  divider();

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("QTY", marginX, y);
  doc.text("DESCRIPTION", marginX + 22, y);
  doc.text("AMOUNT", widthPt - marginX, y, { align: "right" });
  y += lineHeight * 0.9;
  receipt.items.forEach((item) => {
    const description = wrapReceiptText(`${item.name} @ ${formatCurrency(item.unitPrice)}`, 24);
    doc.setFont("helvetica", "normal");
    doc.text(String(item.quantity), marginX, y);
    doc.text(description, marginX + 22, y, { maxWidth: width * 0.52 });
    doc.text(formatCurrency(item.total), widthPt - marginX, y, { align: "right" });
    y += Math.max(1, description.length) * lineHeight * 0.9;
  });

  divider();
  row("Subtotal:", formatCurrency(receipt.subtotal));
  if (receipt.discount > 0) row("Discount:", `-${formatCurrency(receipt.discount)}`);
  if (receipt.tax > 0) row("Tax:", formatCurrency(receipt.tax));
  row("TOTAL:", formatCurrency(receipt.total), 10, true);
  row(receipt.paymentMethod === "cash" ? "Cash:" : "Paid:", formatCurrency(receipt.amountPaid));
  if (receipt.changeAmount > 0) row("Change:", formatCurrency(receipt.changeAmount));
  if (!hasPaymentDetails) row("Payment:", receipt.paymentMethod);
  if (hasPaymentDetails) {
    divider();
    if (receipt.cardMasked) row("Bank card:", receipt.cardMasked);
    if (receipt.approvalCode) row("Approval Code:", `#${receipt.approvalCode}`);
  }
  if (receipt.notes) {
    divider();
    const lines = doc.splitTextToSize(receipt.notes, width);
    doc.text(lines, marginX, y);
    y += lines.length * lineHeight;
  }
  divider();
  center("Thank you!", 9.5, true, true);
  center("Powered by TradeTrack", 7.5);

  if (receipt.barcodeValue) {
    const qrDataUrl = await renderQRCodeDataUrl(receipt.barcodeValue);
    if (qrDataUrl) {
      const qrSize = 78;
      doc.addImage(qrDataUrl, "PNG", (widthPt - qrSize) / 2, y + 4, qrSize, qrSize);
    }
  }
  doc.save(`receipt-${receipt.invoiceNumber}.pdf`);
}
