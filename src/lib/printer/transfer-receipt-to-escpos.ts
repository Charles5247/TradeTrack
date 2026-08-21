import type { TransferReceiptData } from '@/lib/receipt/build-transfer-receipt';
import { wrapReceiptText } from '@/lib/receipt/receipt-layout';

/**
 * ESC/POS bytes for the distinct "Stock Transfer Note" thermal-print
 * template — separate from the sales "Cash Receipt" template in
 * receipt-to-escpos.ts but sharing the same primitives (asterisk
 * dividers, bold/double-size, CODE128 barcode, cut).
 */

const ESC = 0x1b;
const GS = 0x1d;

function textToBytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes.push(code <= 0xff ? code : 0x3f);
  }
  return bytes;
}

function line(text = ''): number[] {
  return [...textToBytes(text), 0x0a];
}

class EscPosBuilder {
  private bytes: number[] = [];

  init() {
    this.bytes.push(ESC, 0x40);
    return this;
  }

  align(mode: 'left' | 'center' | 'right') {
    const n = mode === 'left' ? 0 : mode === 'center' ? 1 : 2;
    this.bytes.push(ESC, 0x61, n);
    return this;
  }

  bold(on: boolean) {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  doubleSize(on: boolean) {
    this.bytes.push(GS, 0x21, on ? 0x11 : 0x00);
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

  barcode(value: string, height = 60) {
    this.bytes.push(GS, 0x68, Math.min(255, height));
    this.bytes.push(GS, 0x77, 2);
    this.bytes.push(GS, 0x48, 0);
    const payload = `{B${value}`;
    const payloadBytes = textToBytes(payload);
    this.bytes.push(GS, 0x6b, 73, payloadBytes.length, ...payloadBytes);
    return this;
  }

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
    this.bytes.push(GS, 0x56, 0x00);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

export function transferReceiptToEscPos(data: TransferReceiptData, charWidth = 32): Uint8Array {
  const b = new EscPosBuilder();
  b.init();

  const row = (label: string, value: string) => {
    const pad = Math.max(1, charWidth - label.length - value.length);
    b.text(label + ' '.repeat(pad) + value);
  };

  const wrappedText = (text: string, width = charWidth) => {
    const lines = wrapReceiptText(text, width);
    for (const line of lines) {
      b.text(line);
    }
  };

  b.align('center');
  b.doubleSize(true);
  b.bold(true);
  b.text(data.orgName.toUpperCase());
  b.doubleSize(false);
  b.bold(false);
  if (data.orgAddress) b.text(`Address: ${data.orgAddress}`);
  if (data.orgPhone) b.text(`Telp. ${data.orgPhone}`);
  b.feed(1);
  b.divider(charWidth);
  b.bold(true);
  b.text('STOCK TRANSFER NOTE');
  b.bold(false);
  b.divider(charWidth);

  b.align('left');
  b.text(`Ref: ${data.transferRef}`);
  b.text(`Date: ${new Date(data.dateISO).toLocaleString()}`);
  b.text(`Status: ${data.status.toUpperCase()}`);
  b.divider(charWidth);
  b.text(`From: ${data.fromWarehouse}`);
  b.text(`To:   ${data.toWarehouse}`);
  b.divider(charWidth);

  const productLabel = data.productSku ? `${data.productName} (${data.productSku})` : data.productName;
  wrappedText(productLabel, Math.max(12, charWidth - 6));
  b.text(`Qty: ${data.quantity}`);
  b.divider(charWidth);

  if (data.initiatedBy) b.text(`Initiated by: ${data.initiatedBy}`);
  if (data.approvedBy) b.text(`Approved by: ${data.approvedBy}`);
  if (data.coordinatedBy) b.text(`Coordinated by: ${data.coordinatedBy}`);
  if (data.sentBy) b.text(`Sent by: ${data.sentBy}`);
  if (data.receivedBy) b.text(`Received by: ${data.receivedBy}`);

  if (data.notes) {
    b.align('center');
    wrappedText(data.notes, Math.max(16, charWidth));
  }

  b.divider(charWidth);
  b.align('center');
  b.bold(true);
  b.text('THANK YOU!');
  b.bold(false);
  b.text('Powered by TradeTrack');

  if (data.barcodeValue) {
    b.feed(1);
    b.qrCode(data.barcodeValue);
  }

  b.feed(3);
  b.cut();

  return b.build();
}
