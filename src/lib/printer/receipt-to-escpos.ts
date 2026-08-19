import type { ReceiptData } from '@/lib/receipt/build-receipt';
import { formatCurrency } from '@/lib/utils/format';
import { wrapReceiptText } from '@/lib/receipt/receipt-layout';

/**
 * Builds raw ESC/POS command bytes for a receipt. ESC/POS is the de-facto
 * standard command set understood by the overwhelming majority of cheap
 * 58mm/80mm thermal receipt printers sold in Nigeria (and everywhere else),
 * regardless of brand — whether they're connected over USB or Bluetooth.
 *
 * This does NOT talk to any transport itself; it just produces bytes.
 * `webusb-printer.ts` and `webbluetooth-printer.ts` each take these bytes
 * and write them to whichever physical connection they manage.
 *
 * Matches the shared receipt template (asterisk dividers, "CASH RECEIPT"
 * title, Description/Price item table, Totals, optional payment-details
 * block, "THANK YOU!" footer) and prints a scannable CODE128 barcode at
 * the end using the printer's native GS k command — the same barcode
 * value that's rendered in the browser print view and the PDF, so
 * scanning any of the three resolves to the same receipt.
 *
 * NOTE: exact command support (barcode/QR, cut behavior, code page for
 * accented characters) varies slightly between printer models. This covers
 * the common subset (text, bold, alignment, cut, feed, CODE128 barcode)
 * that works on virtually every ESC/POS printer. If a specific printer
 * needs a different code page for non-ASCII characters (e.g. certain
 * Hausa/Yoruba diacritics), that would need a small per-model adjustment
 * here.
 */

const ESC = 0x1b;
const GS = 0x1d;

function textToBytes(text: string): number[] {
  // Plain ASCII/Latin-1 is safe for virtually all ESC/POS printers' default
  // code page. Non-Latin1 characters are replaced with '?' to avoid corrupting
  // the byte stream rather than silently sending garbage bytes.
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes.push(code <= 0xff ? code : 0x3f); // '?' fallback
  }
  return bytes;
}

function line(text = ''): number[] {
  return [...textToBytes(text), 0x0a]; // \n
}

class EscPosBuilder {
  private bytes: number[] = [];

  init() {
    this.bytes.push(ESC, 0x40); // ESC @ — initialize printer
    return this;
  }

  align(mode: 'left' | 'center' | 'right') {
    const n = mode === 'left' ? 0 : mode === 'center' ? 1 : 2;
    this.bytes.push(ESC, 0x61, n); // ESC a n
    return this;
  }

  bold(on: boolean) {
    this.bytes.push(ESC, 0x45, on ? 1 : 0); // ESC E n
    return this;
  }

  doubleSize(on: boolean) {
    this.bytes.push(GS, 0x21, on ? 0x11 : 0x00); // GS ! n (double width+height)
    return this;
  }

  text(str: string) {
    this.bytes.push(...line(str));
    return this;
  }

  feed(lines = 1) {
    for (let i = 0; i < lines; i++) this.bytes.push(0x0a);
    return this;
  }

  divider(width = 32) {
    this.bytes.push(...line('*'.repeat(width)));
    return this;
  }

  /**
   * Prints a CODE128 linear barcode using the standard ESC/POS "GS k"
   * command (function 73, the variable-length form most 58mm/80mm
   * printers support). `height` is in printer dots (~2 dots/mm, so 60 ≈
   * 30mm tall — plenty to be reliably re-scanned).
   */
  barcode(value: string, height = 60) {
    // GS h n — barcode height in dots
    this.bytes.push(GS, 0x68, Math.min(255, height));
    // GS w n — barcode module width (1-6, 2 is a good default for 80mm)
    this.bytes.push(GS, 0x77, 2);
    // GS H n — print human-readable text below barcode: 0 = none (the
    // sample receipt shows no digits under the barcode)
    this.bytes.push(GS, 0x48, 0);
    // GS k m n d1...dn — CODE128, function 73 (m=73), CODE128 payload
    // must be preceded by {B per the CODE128 subset-B convention used by
    // the ESC/POS "GS k" implementation on virtually all clone printers.
    const payload = `{B${value}`;
    const payloadBytes = textToBytes(payload);
    this.bytes.push(GS, 0x6b, 73, payloadBytes.length, ...payloadBytes);
    return this;
  }

  /** Prints a native ESC/POS QR code (model 2, error correction M). */
  qrCode(value: string) {
    const data = textToBytes(value);
    const length = data.length + 3;
    this.bytes.push(GS, 0x28, 0x6b, 4, 0, 49, 65, 50, 0);
    this.bytes.push(GS, 0x28, 0x6b, 3, 0, 49, 67, 5);
    this.bytes.push(GS, 0x28, 0x6b, 3, 0, 49, 69, 49);
    this.bytes.push(GS, 0x28, 0x6b, length & 0xff, length >> 8, 49, 80, 48, ...data);
    this.bytes.push(GS, 0x28, 0x6b, 3, 0, 49, 81, 48);
    return this;
  }

  cut() {
    this.bytes.push(GS, 0x56, 0x00); // GS V 0 — full cut
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/**
 * Converts a ReceiptData object into ESC/POS bytes ready to send to a
 * thermal printer. `charWidth` is the printer's character width per line
 * (32 for most 58mm printers, 48 for 80mm) — used to size the divider line.
 */
export function receiptToEscPos(receipt: ReceiptData, charWidth = 32): Uint8Array {
  const b = new EscPosBuilder();
  b.init();

  const money = (label: string, amount: string) => {
    const pad = Math.max(1, charWidth - label.length - amount.length);
    b.text(label + ' '.repeat(pad) + amount);
  };

  const wrappedText = (text: string, width = charWidth) => {
    const lines = wrapReceiptText(text, width);
    for (const line of lines) {
      b.text(line);
    }
  };

  const hasPaymentDetails = Boolean(receipt.cardMasked || receipt.approvalCode);

  // ── Header ──────────────────────────────────────────────────
  b.align('center');
  b.doubleSize(true);
  b.bold(true);
  b.text(receipt.orgName.toUpperCase());
  b.doubleSize(false);
  b.bold(false);
  if (receipt.orgAddress) b.text(`Address: ${receipt.orgAddress}`);
  if (receipt.orgPhone) b.text(`Telp. ${receipt.orgPhone}`);
  b.feed(1);
  b.divider(charWidth);
  b.bold(true);
  b.text('INVOICE');
  b.bold(false);
  b.text('Current Bill');
  b.divider(charWidth);

  // ── Meta ────────────────────────────────────────────────────
  b.align('left');
  b.text(`Invoice: ${receipt.invoiceNumber}`);
  b.text(`Date: ${new Date(receipt.dateISO).toLocaleString()}`);
  if (receipt.cashierName) b.text(`Cashier: ${receipt.cashierName}`);
  if (receipt.customerName) b.text(`Customer: ${receipt.customerName}`);
  b.divider(charWidth);

  // ── Item table ──────────────────────────────────────────────
  b.text('QTY DESCRIPTION                 AMT');
  receipt.items.forEach((item) => {
    const description = `${item.name} @ ${formatCurrency(item.unitPrice)}`;
    money(`${item.quantity} ${description}`.slice(0, charWidth - 1), formatCurrency(item.total));
  });

  b.divider(charWidth);
  money('Subtotal', formatCurrency(receipt.subtotal));
  if (receipt.discount > 0) money('Discount', `-${formatCurrency(receipt.discount)}`);
  if (receipt.tax > 0) money('Tax', formatCurrency(receipt.tax));

  b.doubleSize(true);
  b.bold(true);
  money('TOTAL', formatCurrency(receipt.total));
  b.doubleSize(false);
  b.bold(false);
  money(receipt.paymentMethod === 'cash' ? 'Cash' : 'Paid', formatCurrency(receipt.amountPaid));
  if (receipt.changeAmount > 0) money('Change', formatCurrency(receipt.changeAmount));
  if (!hasPaymentDetails) b.text(`Payment: ${receipt.paymentMethod}`);
  b.feed(1);

  // ── Payment details (Bank card / Approval Code) ────────────
  if (hasPaymentDetails) {
    b.divider(charWidth);
    if (receipt.cardMasked) money('Bank card', receipt.cardMasked);
    if (receipt.approvalCode) money('Approval Code', `#${receipt.approvalCode}`);
    b.feed(1);
  }

  if (receipt.notes) {
    b.align('center');
    wrappedText(receipt.notes, Math.max(16, charWidth));
  }

  b.divider(charWidth);
  b.align('center');
  b.bold(true);
  b.text('THANK YOU!');
  b.bold(false);
  b.text('Powered by TradeTrack');

  // ── Scannable barcode ───────────────────────────────────────
  if (receipt.barcodeValue) {
    b.feed(1);
    b.qrCode(receipt.barcodeValue);
  }

  b.feed(3);
  b.cut();

  return b.build();
}
