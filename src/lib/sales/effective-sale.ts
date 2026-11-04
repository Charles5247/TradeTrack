export type ReversalKind = 'void' | 'refund' | 'return' | 'vendor_payment_correction';

export type SaleWithReversals = {
  financial_reversals?: { kind: string }[] | null;
};

export function effectiveSaleStatus<T extends SaleWithReversals & { status: string }>(sale: T): string {
  const reversal = sale.financial_reversals?.find(({ kind }) => kind === 'void' || kind === 'refund' || kind === 'return');
  return reversal ? (reversal.kind === 'void' ? 'cancelled' : 'refunded') : sale.status;
}

export function countsAsCompletedSale(sale: SaleWithReversals & { status: string }): boolean {
  return effectiveSaleStatus(sale) === 'completed';
}
