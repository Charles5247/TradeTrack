export interface CreditBalanceSale {
  id: string;
  total: number;
  amount_paid: number;
  notes?: string | null;
}

export function outstandingBalance(sale: Pick<CreditBalanceSale, 'total' | 'amount_paid'>): number {
  return Math.max(0, Number(sale.total) - Number(sale.amount_paid));
}

export function isOpenCustomerCredit(sale: CreditBalanceSale, reversals: Record<string, string>): boolean {
  return outstandingBalance(sale) > 0
    && !sale.notes?.startsWith('Vendor transaction ')
    && !['void', 'refund', 'return'].includes(reversals[sale.id]);
}
