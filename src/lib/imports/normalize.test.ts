import { describe, expect, it } from 'vitest';
import { autoMapLegacy, cleanProducts, cleanSales, detectDateOrder, detectSource, parseDate, parseMoney, parsePayments, mapPaymentLabel, summarizeFixes } from './normalize';
import { validateRow } from './preview';

const phpHeaders = ['Item Number','Product ID','Item Name','Barcode Name','Variation','Quantity','Category','Cost Price','Selling Price','Item Id'];
describe('source + mapping', () => {
  it('recognises the PHP Point of Sale export and maps its headers', () => {
    expect(detectSource(phpHeaders)).toBe('phppos');
    expect(autoMapLegacy(phpHeaders, 'products')).toMatchObject({ name: 'Item Name', sku: 'Item Number', selling_price: 'Selling Price', cost_price: 'Cost Price', opening_stock: 'Quantity' });
  });
});
describe('products: nothing dropped, every change logged', () => {
  const map = autoMapLegacy(phpHeaders, 'products');
  const raw = [
    { 'Item Name': 'Levofloxacin 500mg', 'Item Number': '11', 'Item Id': '4', Quantity: 5, 'Cost Price': '800.00', 'Selling Price': '1500.00' },
    { 'Item Name': '', 'Item Number': '', 'Item Id': '271', Quantity: '', 'Cost Price': '0.00', 'Selling Price': '0.00' },
    { 'Item Name': 'Carvedilol 12.5mg', 'Item Number': '', 'Item Id': '1112', Quantity: -1, 'Cost Price': '800.00', 'Selling Price': '1100.00' },
    { 'Item Name': 'Vit. C  counting', 'Item Number': '', 'Item Id': '788', Quantity: 1910, 'Cost Price': '₦2', 'Selling Price': '10' },
    { 'Item Name': 'Deska', 'Item Number': 'ITM-788', 'Item Id': '5', Quantity: '2.5', 'Cost Price': 'abc', 'Selling Price': '500' },
  ];
  const out = cleanProducts(raw, map, 'Item Id');
  it('one output per input; originals untouched', () => { expect(out).toHaveLength(raw.length); out.forEach((o, i) => expect(o.original).toBe(raw[i])); });
  it('keeps the SKU the client already had, generates the rest from the old id', () => { expect(out[0].data.sku).toBe('11'); expect(out[1].data.sku).toBe('ITM-271'); });
  it('blank name becomes a visible placeholder (review), not a dropped row', () => { expect(out[1].data.name).toBe('UNNAMED ITEM (legacy id 271)'); expect(out[1].fixes.find(f => f.field === 'name')?.severity).toBe('review'); });
  it('negative stock -> 0 with the original value in the log', () => { expect(out[2].data.opening_stock).toBe('0'); expect(out[2].fixes.find(f => f.field === 'opening_stock')).toMatchObject({ from: '-1', to: '0', severity: 'review' }); });
  it('keeps odd spacing in names exactly as typed', () => { expect(out[3].data.name).toBe('Vit. C  counting'); expect(out[3].data.cost_price).toBe('2'); });
  it('colliding SKU gets a suffix so both records survive', () => { expect(out[3].data.sku).toBe('ITM-788'); expect(out[4].data.sku).toBe('ITM-788-2'); expect(out[4].fixes.find(f => f.field === 'sku')?.severity).toBe('review'); });
  it('unreadable or fractional values are blocked with a reason, never guessed', () => { expect(out[4].blocked.join(' ')).toMatch(/fractional/); expect(out[4].blocked.join(' ')).toMatch(/cost_price/); });
  it('everything not blocked passes the existing importer validation', () => { for (const o of out.filter(o => !o.blocked.length)) expect(validateRow(o.data, 'products')).toEqual([]); });
  it('summary counts fixes', () => { expect(summarizeFixes(out).rows).toBe(5); });
});
describe('parsers', () => {
  it('money', () => { expect(parseMoney('₦1,250.50')).toBe(1250.5); expect(parseMoney('N5,000')).toBe(5000); expect(parseMoney('(200)')).toBe(-200); expect(parseMoney('abc')).toBeNull(); });
  it('date order is decided from the whole column, never guessed', () => {
    expect(detectDateOrder(['10/27/2026-07:26 am', '08/22/2025-03:25 am'])).toBe('mdy');
    expect(detectDateOrder(['27/10/2026', '01/02/2025'])).toBe('dmy');
    expect(detectDateOrder(['01/02/2025', '03/04/2025'])).toBe('unknown');
    expect(parseDate('01/02/2025', 'unknown')).toBeNull();
    expect(parseDate('10/27/2026-07:26 am', 'mdy')).toBe('2026-10-27T07:26:00+01:00');
    expect(parseDate('08/22/2025-03:25 pm', 'mdy')).toBe('2025-08-22T15:25:00+01:00');
  });
  it('payments', () => {
    expect(parsePayments('Cash: 6000.00Cash: -5500.00')).toEqual([{ label: 'Cash', amount: 6000 }, { label: 'Cash', amount: -5500 }]);
    expect(mapPaymentLabel('First Bank Transfer')).toBe('transfer'); expect(mapPaymentLabel('MOIEPOIT POS')).toBe('pos_terminal'); expect(mapPaymentLabel('Barter')).toBeNull();
  });
});
describe('sales: item lines -> one sale, totals reconcile', () => {
  const sm = { invoice_number: 'Sale Id', sold_at: 'Date', total: 'Total', payment_method: 'Payment Type' };
  const lines = [
    { 'Sale Id': '1101 Edit 1101Clone', Date: '10/27/2026-07:26 am', Total: 3500, Total_1: 4300, 'Payment Type': 'Cash: 6000.00Cash: -1700.00' },
    { 'Sale Id': '1101 Edit 1101Clone', Date: '10/27/2026-07:26 am', Total: 800, Total_1: 4300, 'Payment Type': 'Cash: 6000.00Cash: -1700.00' },
    { 'Sale Id': '7 Edit 7Clone', Date: '08/22/2025-03:25 am', Total: 25, Total_1: 25, 'Payment Type': 'MOIEPOIT POS: 25.00' },
    { 'Sale Id': '8 Edit 8Clone', Date: '08/23/2025-03:25 am', Total: 100, Total_1: 100, 'Payment Type': 'Cash: 50.00MOIEPOIT POS: 50.00' },
    { 'Sale Id': '9 Edit 9Clone', Date: '08/24/2025-03:25 am', Total: 10, Total_1: 10, 'Payment Type': 'Barter: 10.00' },
  ];
  const out = cleanSales(lines, sm, { saleTotalKey: 'Total_1' });
  it('rolls lines up and keeps every line', () => { expect(out).toHaveLength(4); expect(out[0].original).toEqual({ lines: lines.slice(0, 2) }); expect(out[0].data).toMatchObject({ invoice_number: '1101', total: '4300', amount_paid: '4300', payment_method: 'cash', sold_at: '2026-10-27T07:26:00+01:00' }); });
  it('nets change, maps methods, splits mixed payments', () => { expect(out[0].fixes.some(f => /change/.test(f.reason))).toBe(true); expect(out[1].data.payment_method).toBe('pos_terminal'); expect(out[2].data.payment_method).toBe('split'); });
  it('unknown payment label blocks the row until mapped once, then passes', () => {
    expect(out[3].blocked.join()).toMatch(/Barter/);
    const fixed = cleanSales(lines, sm, { saleTotalKey: 'Total_1', paymentMap: { Barter: 'transfer' } });
    expect(fixed[3].blocked).toEqual([]);
    for (const o of fixed) expect(validateRow(o.data, 'historical_sales')).toEqual([]);
  });
  it('ambiguous dates block until the user picks an order', () => {
    const amb = cleanSales([{ 'Sale Id': '1', Date: '01/02/2025', Total: 5, 'Payment Type': 'Cash: 5' }], sm);
    expect(amb[0].blocked.join()).toMatch(/ambiguous/);
    expect(cleanSales([{ 'Sale Id': '1', Date: '01/02/2025', Total: 5, 'Payment Type': 'Cash: 5' }], sm, { dateOrder: 'dmy' })[0].data.sold_at).toBe('2025-02-01T00:00:00+01:00');
  });
});
