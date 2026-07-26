import type { CartItem } from "@/types";

/**
 * A single plain-object model of "what a receipt says", independent of how
 * it's rendered. Every receipt output — the on-screen print-only HTML, the
 * downloadable PDF, and the raw ESC/POS bytes sent to a physical thermal
 * printer — is generated FROM this same object, so they can never drift out
 * of sync with each other.
 */
export interface ReceiptData {
  orgName: string;
  orgAddress?: string;
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
  notes?: string;
  currency: string;
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
  };
  items: CartItem[];
  orgName: string;
  orgAddress?: string;
  cashierName?: string;
  currency?: string;
}

export function buildReceiptData({
  sale,
  items,
  orgName,
  orgAddress,
  cashierName,
  currency = "NGN",
}: BuildReceiptInput): ReceiptData {
  return {
    orgName,
    orgAddress,
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
    notes: sale.notes,
    currency,
  };
}
