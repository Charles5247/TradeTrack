import type { CartItem } from "@/types";

/**
 * A single plain-object model of "what a receipt says", independent of how
 * it's rendered. Every receipt output — the on-screen print-only HTML, the
 * downloadable PDF, and the raw ESC/POS bytes sent to a physical thermal
 * printer — is generated FROM this same object, so they can never drift out
 * of sync with each other.
 *
 * The visual template (header, asterisk dividers, "CASH RECEIPT" title,
 * Description/Price item table, totals, payment details, "THANK YOU!"
 * footer, and a scannable linear barcode) is shared across all three
 * renderers — see receipt-pdf.ts, receipt-to-escpos.ts and
 * components/pos/receipt.tsx.
 */
export interface ReceiptData {
  /** Kind of receipt — used to pick the right title/labels. Sales/vendor
   * receipts render "CASH RECEIPT"; warehouse transfers render a distinct
   * "STOCK TRANSFER NOTE" template (see build-transfer-receipt.ts). */
  kind?: "sale";
  orgName: string;
  orgAddress?: string;
  orgPhone?: string;
  invoiceNumber: string;
  dateISO: string;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  changeAmount: number;
  paymentMethod: string;
  /** Masked card number shown in the "Bank card" payment-details row, e.g.
   * "--- --- --- 1234". Only shown for card/POS-terminal payments. */
  cardMasked?: string;
  /** Approval/authorization code shown in the payment-details row for card
   * or transfer payments (e.g. a POS terminal approval code). */
  approvalCode?: string;
  notes?: string;
  currency: string;
  /**
   * The raw value encoded into the barcode printed at the bottom of the
   * receipt. Defaults to the invoice number. Scanning it with any barcode
   * scanner (or the in-app scanner) resolves back to this exact receipt's
   * full item list via /api/receipts/lookup.
   */
  barcodeValue?: string;
}

export interface BuildReceiptInput {
  sale: {
    invoice_number: string;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    amount_paid: number;
    change_amount: number;
    payment_method: string;
    customer_name?: string;
    customer_phone?: string;
    notes?: string;
    created_at?: string;
    card_masked?: string;
    approval_code?: string;
  };
  items: CartItem[];
  orgName: string;
  orgAddress?: string;
  orgPhone?: string;
  cashierName?: string;
  currency?: string;
}

export function buildReceiptData({
  sale,
  items,
  orgName,
  orgAddress,
  orgPhone,
  cashierName,
  currency = "NGN",
}: BuildReceiptInput): ReceiptData {
  return {
    kind: "sale",
    orgName,
    orgAddress,
    orgPhone,
    invoiceNumber: sale.invoice_number,
    dateISO: sale.created_at || new Date().toISOString(),
    cashierName,
    customerName: sale.customer_name,
    customerPhone: sale.customer_phone,
    items: items.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      total: item.unit_price * item.quantity * (1 - item.discount / 100),
    })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    total: sale.total,
    amountPaid: sale.amount_paid,
    changeAmount: sale.change_amount,
    paymentMethod: sale.payment_method,
    cardMasked: sale.card_masked,
    approvalCode: sale.approval_code,
    notes: sale.notes,
    currency,
    barcodeValue: sale.invoice_number,
  };
}
