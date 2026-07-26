import type { ReceiptData } from '@/lib/receipt/build-receipt';
import { formatCurrency } from '@/lib/utils/format';

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
 * NOTE: exact command support (barcode/QR, cut behavior, code page for
 * accented characters) varies slightly between printer models. This covers
 * the common subset (text, bold, alignment, cut, feed) that works on
 * virtually every ESC/POS printer. If a specific printer needs a different
 * code page for non-ASCII characters (e.g. certain Hausa/Yoruba diacritics),
 * that would need a small per-model adjustment here.
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
    this.bytes.push(...line('-'.repeat(width)));
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

  b.align('center');
  b.doubleSize(true);
  b.bold(true);
  b.text(receipt.orgName);
  b.doubleSize(false);
  b.bold(false);
  if (receipt.orgAddress) b.text(receipt.orgAddress);
  b.feed(1);
  b.divider(charWidth);

  b.align('left');
  b.text(`Invoice: ${receipt.invoiceNumber}`);
  b.text(`Date: ${new Date(receipt.dateISO).toLocaleString()}`);
  if (receipt.cashierName) b.text(`Cashier: ${receipt.cashierName}`);
  if (receipt.customerName) b.text(`Customer: ${receipt.customerName}`);
  b.divider(charWidth);

  receipt.items.forEach((item) => {
    b.text(item.name);
    const left = `  ${item.quantity} x ${formatCurrency(item.unitPrice)}`;
    const right = formatCurrency(item.total);
    const pad = Math.max(1, charWidth - left.length - right.length);
    b.text(left + ' '.repeat(pad) + right);
  });

  b.divider(charWidth);

  const money = (label: string, amount: string) => {
    const pad = Math.max(1, charWidth - label.length - amount.length);
    b.text(label + ' '.repeat(pad) + amount);
  };

  money('Subtotal', formatCurrency(receipt.subtotal));
  if (receipt.discount > 0) money('Discount', `-${formatCurrency(receipt.discount)}`);
  if (receipt.tax > 0) money('Tax', formatCurrency(receipt.tax));
  b.divider(charWidth);

  b.bold(true);
  money('TOTAL', formatCurrency(receipt.total));
  b.bold(false);
  money('Paid', formatCurrency(receipt.amountPaid));
  if (receipt.changeAmount > 0) money('Change', formatCurrency(receipt.changeAmount));
  b.text(`Payment: ${receipt.paymentMethod}`);
  b.feed(1);

  if (receipt.notes) {
    b.align('center');
    b.text(receipt.notes);
  }

  b.align('center');
  b.bold(true);
  b.text('Thank you for your business!');
  b.bold(false);
  b.text('Powered by TradeTrack');

  b.feed(3);
  b.cut();

  return b.build();
}
