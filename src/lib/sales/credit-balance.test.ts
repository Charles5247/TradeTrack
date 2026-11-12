import { expect, it } from 'vitest';
import { isOpenCustomerCredit, outstandingBalance } from './credit-balance';

it('shows a partial customer payment from the amounts despite an old paid status', () => {
  const sale = { id: 'sale-1', total: 15000, amount_paid: 6000, payment_status: 'paid' };
  expect(isOpenCustomerCredit(sale, {})).toBe(true);
  expect(outstandingBalance(sale)).toBe(9000);
  expect(isOpenCustomerCredit(sale, { 'sale-1': 'refund' })).toBe(false);
  expect(isOpenCustomerCredit({ ...sale, notes: 'Vendor transaction abc' }, {})).toBe(false);
});
