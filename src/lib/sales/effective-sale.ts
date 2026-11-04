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

export async function loadVisibleReversals(ids: string[]): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(ids)];
  const batches = [];
  for (let index = 0; index < uniqueIds.length; index += 1000) {
    batches.push(uniqueIds.slice(index, index + 1000));
  }
  const results = await Promise.all(batches.map(async batch => {
    const response = await fetch('/api/sales/reversal-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: batch }), cache: 'no-store',
    });
    if (!response.ok) throw new Error('Unable to load reversed sale statuses.');
    return (await response.json()).reversals as Record<string, string>;
  }));
  return Object.assign({}, ...results) as Record<string, string>;
}

export function withReversalStatus<T extends SaleWithReversals & { id: string }>(sale: T, reversals: Record<string, string>): T {
  const kind = reversals[sale.id];
  return kind ? { ...sale, financial_reversals: [{ kind }] } : sale;
}
