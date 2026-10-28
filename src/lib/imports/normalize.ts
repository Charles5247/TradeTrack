import { autoMap as baseAutoMap, type ImportKind, type ImportRow } from './preview';

/**
 * Migration normalizer: turns exports from other POS/inventory apps into rows the
 * TracKasuwa importer accepts, WITHOUT discarding or silently changing anything.
 *  - every input row yields exactly one output row (nothing is dropped)
 *  - the untouched source row travels with it (`original`)
 *  - every change is a `Fix` (what, from, to, why); anything that needs a human
 *    decision is `blocked` or severity 'review', never guessed quietly.
 */
export type Severity = 'auto' | 'review';
export interface Fix { field: string; from: string; to: string; reason: string; severity: Severity }
export interface CleanedRow { index: number; data: ImportRow; original: Record<string, unknown>; fixes: Fix[]; blocked: string[] }
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();
const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---- source detection & header mapping -------------------------------------
const LEGACY_ALIASES: Record<string, string[]> = {
  name: ['itemname', 'productname', 'item', 'title'], sku: ['itemnumber', 'sku', 'productcode', 'itemcode', 'code'],
  barcode: ['barcode', 'upc', 'ean', 'gtin'], selling_price: ['sellingprice', 'unitprice', 'saleprice', 'retailprice', 'price'],
  cost_price: ['costprice', 'purchaseprice', 'buyingprice', 'cost'], opening_stock: ['quantity', 'qty', 'stock', 'onhand', 'quantityonhand', 'currentstock'],
  invoice_number: ['saleid', 'invoice', 'invoiceno', 'receipt', 'receiptno', 'orderid'], sold_at: ['date', 'saledate', 'solddate', 'datetime', 'time'],
  total: ['total', 'saletotal', 'amount', 'grandtotal'], amount_paid: ['paid', 'amountpaid', 'tendered'], payment_method: ['paymenttype', 'paymentmethod', 'payment', 'tender'],
};
export function detectSource(headers: string[]): 'phppos' | 'generic' {
  const h = new Set(headers.map(key));
  return ['itemid', 'itemnumber', 'barcodename', 'itemname'].filter(x => h.has(x)).length >= 3 ? 'phppos' : 'generic';
}
/** Existing auto-map first, then legacy aliases for anything still unmapped. */
export function autoMapLegacy(headers: string[], kind: ImportKind): Record<string, string> {
  const map = baseAutoMap(headers, kind);
  for (const [field, src] of Object.entries(map)) {
    if (src) continue;
    map[field] = headers.find(h => (LEGACY_ALIASES[field] || []).includes(key(h))) || '';
  }
  return map;
}

// ---- value parsers ----------------------------------------------------------
export function parseMoney(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = s(v); if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t.replace(/^[^\d(-]*/, ''));
  t = t.replace(/(ngn|naira|[₦#])/gi, '').replace(/\bN(?=\d)/g, '').replace(/[,\s()\-]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t); return neg ? -n : n;
}
export type DateOrder = 'mdy' | 'dmy' | 'unknown';
const DATE_RE = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:[\sT-]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?)?$/i;
/** Look at the WHOLE column: a part >12 settles day/month order; all <=12 stays ambiguous. */
export function detectDateOrder(values: unknown[]): DateOrder {
  let first = false, second = false;
  for (const v of values) { const m = DATE_RE.exec(s(v)); if (!m) continue; if (+m[1] > 12) first = true; if (+m[2] > 12) second = true; }
  return first && !second ? 'dmy' : second && !first ? 'mdy' : 'unknown';
}
export function parseDate(v: unknown, order: DateOrder, offset = '+01:00'): string | null {
  const t = s(v); if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return Number.isFinite(Date.parse(t)) ? t : null;
  const m = DATE_RE.exec(t); if (!m || order === 'unknown') return null;
  const [d, mo] = order === 'dmy' ? [+m[1], +m[2]] : [+m[2], +m[1]];
  let h = m[4] ? +m[4] : 0; const ap = m[6]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${m[3]}-${p(mo)}-${p(d)}T${p(h)}:${m[5] || '00'}:00${offset}`;
}
export interface PayPart { label: string; amount: number }
export function parsePayments(text: unknown): PayPart[] {
  return [...s(text).matchAll(/([A-Za-z][A-Za-z .&-]*?):\s*(-?[\d,]*\.?\d+)/g)].map(m => ({ label: m[1].trim(), amount: Number(m[2].replace(/,/g, '')) }));
}
/** Source wording -> TracKasuwa method. Unknown labels return null (user maps them once). Note: source apps may have mangled letters, so match loosely. */
export function mapPaymentLabel(label: string, custom: Record<string, string> = {}): string | null {
  if (custom[label]) return custom[label];
  if (/^cash$/i.test(label)) return 'cash';
  if (/transfer|bank|ussd|nip/i.test(label) && !/pos/i.test(label)) return 'transfer';
  if (/pos|mon?iepoi?nt|moiepoit|opay|palmpay|card|verve|visa|master/i.test(label)) return 'pos_terminal';
  return null;
}

// ---- products ---------------------------------------------------------------
export function cleanProducts(rows: Record<string, unknown>[], mapping: Record<string, string>, legacyIdColumn?: string): CleanedRow[] {
  const used = new Map<string, number>();
  return rows.map((raw, i) => {
    const fixes: Fix[] = [], blocked: string[] = [];
    const pick = (f: string) => (mapping[f] ? raw[mapping[f]] : undefined);
    const fix = (field: string, from: unknown, to: unknown, reason: string, severity: Severity = 'auto') => fixes.push({ field, from: s(from) || '(blank)', to: String(to), reason, severity });
    const legacy = s(legacyIdColumn ? raw[legacyIdColumn] : '');
    let name = s(pick('name'));
    if (!name) { name = `UNNAMED ITEM (${legacy ? 'legacy id ' + legacy : 'row ' + (i + 1)})`; fix('name', '', name, 'Name is required; placeholder keeps the record. Rename after import.', 'review'); }
    let sku = s(pick('sku'));
    if (!sku) { sku = legacy ? `ITM-${legacy}` : `ITM-ROW-${i + 1}`; fix('sku', '', sku, 'No SKU in source; generated from the old system id so it stays traceable.'); }
    const lk = sku.toLowerCase(), seen = used.get(lk) || 0; used.set(lk, seen + 1);
    if (seen) { const n = `${sku}-${seen + 1}`; fix('sku', sku, n, 'SKU already used by an earlier row in this file; suffix added so both records are kept.', 'review'); sku = n; }
    const money = (f: string): string => {
      const v = pick(f); if (!s(v)) { fix(f, '', 0, 'Blank price set to 0; set the real price after import.', f === 'selling_price' ? 'review' : 'auto'); return '0'; }
      const n = parseMoney(v);
      if (n === null) { blocked.push(`${f}: cannot read "${s(v)}" as a number`); return s(v); }
      if (n < 0) { blocked.push(`${f}: negative price ${n}`); return String(n); }
      if (typeof v === 'string' && String(n) !== s(v)) fix(f, v, n, 'Currency symbol/commas removed.');
      return String(n);
    };
    const selling_price = money('selling_price'), cost_price = money('cost_price');
    const qty = s(pick('opening_stock')); let stock = '0';
    if (!qty) fix('opening_stock', '', 0, 'No quantity in source; treated as 0.');
    else {
      const m = /^(-?\d[\d,]*)(\.\d+)?\s*[a-z]*$/i.exec(qty);
      if (!m) blocked.push(`opening_stock: cannot read "${qty}"`);
      else if (m[2] && Number(m[2]) !== 0) blocked.push(`opening_stock: ${qty} is fractional; stock must be a whole number (decide the unit)`);
      else {
        const n = Number(m[1].replace(/,/g, ''));
        if (n < 0) fix('opening_stock', qty, 0, `Negative stock (${n}) not allowed by the importer; original kept in the migration record.`, 'review');
        else { stock = String(n); if (qty !== stock) fix('opening_stock', qty, n, 'Unit text/commas removed.'); }
      }
    }
    return { index: i + 1, original: raw, fixes, blocked, data: { name, sku, barcode: s(pick('barcode')), selling_price, cost_price, opening_stock: stock } };
  });
}

// ---- sales ------------------------------------------------------------------
export interface SalesOptions { dateOrder?: DateOrder; utcOffset?: string; paymentMap?: Record<string, string>; lineTotalKey?: string; saleTotalKey?: string }
/** Item-line exports -> one row per sale (the importer stores sale totals). All lines stay in `original`. */
export function cleanSales(rows: Record<string, unknown>[], mapping: Record<string, string>, opt: SalesOptions = {}): CleanedRow[] {
  const idKey = mapping.invoice_number, dateKey = mapping.sold_at, payKey = mapping.payment_method;
  const order = opt.dateOrder ?? detectDateOrder(rows.map(r => r[dateKey]));
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) { const rawId = s(r[idKey]); const id = /^(\d+) Edit \1Clone$/.exec(rawId)?.[1] ?? rawId; groups.set(id, [...(groups.get(id) || []), r]); }
  let n = 0;
  return [...groups.entries()].map(([id, lines]) => {
    const head = lines[0], fixes: Fix[] = [], blocked: string[] = [];
    const fix = (field: string, from: unknown, to: unknown, reason: string, severity: Severity = 'auto') => fixes.push({ field, from: s(from), to: String(to), reason, severity });
    if (!id) blocked.push('invoice_number: missing sale id');
    if (lines.length > 1) fix('rows', `${lines.length} item lines`, '1 sale', 'Item lines rolled up to one sale; every line is kept in the migration record.');
    if (s(head[idKey]) !== id) fix('invoice_number', head[idKey], id, 'Screen wording removed; old sale number kept.');
    const saleTotal = opt.saleTotalKey ? parseMoney(head[opt.saleTotalKey]) : null;
    if (lines.some(l => parseMoney(l[opt.lineTotalKey || mapping.total]) === null)) blocked.push('total: unreadable or missing line amount');
    if (opt.saleTotalKey && saleTotal === null) blocked.push('total: unreadable sale total');
    const lineSum = lines.reduce((a, l) => a + (parseMoney(l[opt.lineTotalKey || mapping.total]) ?? 0), 0);
    const total = saleTotal ?? lineSum;
    if (saleTotal !== null && Math.abs(saleTotal - lineSum) > 0.01) fix('total', lineSum, saleTotal, 'Item lines do not add up to the sale total; the sale total was used.', 'review');
    const sold_at = parseDate(head[dateKey], order, opt.utcOffset);
    if (!sold_at) blocked.push(order === 'unknown' ? 'sold_at: day/month order is ambiguous in this file; choose it once for the whole file' : `sold_at: cannot read "${s(head[dateKey])}"`);
    else if (s(head[dateKey]) !== sold_at) fix('sold_at', head[dateKey], sold_at, `Date reformatted (${order === 'dmy' ? 'day first' : 'month first'}, UTC${opt.utcOffset || '+01:00'} assumed).`);
    const parts = parsePayments(head[payKey]); const kinds = new Set<string>();
    for (const p of parts) { const m = mapPaymentLabel(p.label, opt.paymentMap); if (m) kinds.add(m); else blocked.push(`payment_method: unrecognised "${p.label}" - map it once for the whole file`); }
    const paid = parts.reduce((a, p) => a + p.amount, 0);
    if (parts.some(p => p.amount < 0)) fix('amount_paid', head[payKey], paid, 'Negative payment line (change given) netted into one amount paid.');
    const payment_method = kinds.size > 1 ? 'split' : [...kinds][0] || '';
    if (!parts.length) blocked.push('payment_method: no payment found');
    if (parts.length && Math.abs(paid - total) > 0.01) fix('amount_paid', paid, paid, `Paid (${paid}) differs from total (${total}); kept as recorded.`, 'review');
    return { index: ++n, original: { lines }, fixes, blocked, data: { invoice_number: id, sold_at: sold_at || '', total: String(total), amount_paid: String(paid), payment_method } };
  });
}
export function summarizeFixes(rows: CleanedRow[]) {
  const by: Record<string, number> = {}; let review = 0, blocked = 0;
  for (const r of rows) { if (r.blocked.length) blocked++; for (const f of r.fixes) { by[f.reason] = (by[f.reason] || 0) + 1; if (f.severity === 'review') review++; } }
  return { rows: rows.length, rowsBlocked: blocked, reviewItems: review, byReason: by };
}
