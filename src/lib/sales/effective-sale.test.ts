import { describe, expect, it } from 'vitest';
import { countsAsCompletedSale, effectiveSaleStatus } from './effective-sale';

describe('effective sale status', () => {
  it('excludes a duplicate sale void from transaction and revenue counts', () => {
    const sales = [
      { status: 'completed', total: 19400, financial_reversals: [] },
      { status: 'completed', total: 5300, financial_reversals: [] },
      { status: 'completed', total: 5300, financial_reversals: [{ kind: 'void' }] },
    ];
    const completed = sales.filter(countsAsCompletedSale);
    expect(completed).toHaveLength(2);
    expect(completed.reduce((total, sale) => total + sale.total, 0)).toBe(24700);
    expect(effectiveSaleStatus(sales[2])).toBe('cancelled');
  });

  it('excludes refunds and returns while ignoring unrelated corrections', () => {
    expect(countsAsCompletedSale({ status: 'completed', financial_reversals: [{ kind: 'refund' }] })).toBe(false);
    expect(countsAsCompletedSale({ status: 'completed', financial_reversals: [{ kind: 'return' }] })).toBe(false);
    expect(countsAsCompletedSale({ status: 'completed', financial_reversals: [{ kind: 'vendor_payment_correction' }] })).toBe(true);
  });
});
