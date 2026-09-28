import { expect, it } from 'vitest';
import { csvCell, dailySales, vendorMismatches } from '../reconciliation';
const sale = { id: 's', created_at: '2026-09-28T23:30:00Z', payment_method: 'cash', total: 100, amount_paid: 0, payment_status: 'unpaid', notes: 'Vendor transaction v' };
it('detects historical vendor mismatches and recognizes audited corrections', () => {
  const vendor = { id: 'v', total_value: 100, amount_paid: 100, status: 'completed' };
  expect(vendorMismatches([vendor], [sale], new Set())).toHaveLength(1);
  expect(vendorMismatches([vendor], [sale], new Set(['s']))).toHaveLength(0);
  expect(vendorMismatches([vendor], [], new Set())[0].issue).toContain('Missing');
});
it('uses Lagos dates and excludes reversed sales', () => {
  expect(dailySales([sale], new Set())[0]).toMatchObject({ day: '2026-09-29', sales: 100, collected: 0 });
  expect(dailySales([sale], new Set(['s']))).toEqual([]);
});
it('quotes CSV and neutralizes spreadsheet formulas', () => {
  expect(csvCell('a,"b')).toBe('"a,""b"');
  expect(csvCell('=HYPERLINK("x")')).toMatch(/^"'/);
});
