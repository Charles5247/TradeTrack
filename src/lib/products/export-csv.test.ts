import { expect, it } from 'vitest';
import { productCsv } from './export-csv';

it('exports each warehouse balance and protects spreadsheet cells', () => {
  const csv = productCsv([{ name: '=HYPERLINK("bad")', sku: 'RICE-1', barcode: null,
    stock_unit: 'bag', selling_price: 1500, cost_price: 900, status: 'active',
    category: { name: 'Food' }, inventory: [
      { quantity: 4, warehouse: { name: 'Lagos' } },
      { quantity: 2, warehouse: { name: 'Kano' } },
    ] }]);
  expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  expect(csv).toContain('"Lagos","4","900","1500"');
  expect(csv).toContain('"Kano","2","900","1500"');
  expect(csv.split('\r\n').filter(Boolean)).toHaveLength(3);
});
