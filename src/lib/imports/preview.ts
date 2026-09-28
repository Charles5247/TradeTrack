export type ImportKind = 'products' | 'suppliers' | 'customers' | 'historical_sales' | 'staff_invites';
export type DuplicateMode = 'skip' | 'update' | 'create';
export type ImportRow = Record<string, string | number>;
export const fields: Record<ImportKind, string[]> = {
  products: ['name','sku','barcode','selling_price','cost_price','opening_stock'],
  suppliers: ['name','email','phone','address'], customers: ['name','email','phone','address'],
  historical_sales: ['invoice_number','sold_at','total','amount_paid','payment_method'],
  staff_invites: ['name','email','role'],
};
const aliases: Record<string,string[]> = { name: ['name','product','productname','fullname','supplier','customer'], sku: ['sku','code','productcode'], barcode: ['barcode','ean'], selling_price: ['price','sellingprice','retailprice'], cost_price: ['cost','costprice'], opening_stock: ['quantity','qty','stock','openingstock'], email: ['email','emailaddress'], phone: ['phone','telephone','mobile'], sold_at: ['date','solddate','soldat'], invoice_number: ['invoice','invoicenumber','receipt'], total: ['total','amount'], amount_paid: ['paid','amountpaid'], payment_method: ['paymentmethod','method'], role: ['role'], address: ['address'] };
export function autoMap(headers: string[], kind: ImportKind) {
  return Object.fromEntries(fields[kind].map(field => [field, headers.find(h => (aliases[field] || [field]).includes(h.toLowerCase().replace(/[^a-z0-9]/g,''))) || '']));
}
export function mapRows(rows: ImportRow[], mapping: Record<string,string>): ImportRow[] {
  return rows.map(row => Object.fromEntries(Object.entries(mapping).map(([field,source]) => [field, row[source] ?? ''])));
}
export function validateRow(row: ImportRow, kind: ImportKind): string[] {
  const errors: string[] = [];
  const required = kind === 'products' ? ['name','sku'] : kind === 'historical_sales' ? ['invoice_number','sold_at','total'] : kind === 'staff_invites' ? ['name','email','role'] : ['name'];
  for (const key of required) if (!String(row[key] ?? '').trim()) errors.push(`${key} is required`);
  for (const key of kind === 'products' ? ['selling_price','cost_price','opening_stock'] : kind === 'historical_sales' ? ['total','amount_paid'] : []) {
    const value = Number(String(row[key] ?? '').replaceAll(',',''));
    if (!Number.isFinite(value) || value < 0 || (key === 'opening_stock' && !Number.isSafeInteger(value))) errors.push(`${key} must be a non-negative ${key === 'opening_stock' ? 'whole number' : 'number'}`);
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email))) errors.push('Invalid email');
  if (kind === 'staff_invites' && !['admin','cashier'].includes(String(row.role).toLowerCase())) errors.push('Role must be admin or cashier');
  if (kind === 'historical_sales' && (!Number.isFinite(Date.parse(String(row.sold_at))) || !['cash','transfer','pos_terminal','split','partial'].includes(String(row.payment_method)))) errors.push('Valid date and payment method required');
  return errors;
}
export interface PreviewRow { index: number; id: string; data: ImportRow; outcome: 'create' | 'update' | 'skip' | 'error'; errors: string[]; existing?: Record<string, any>; }
export function previewImport(rows: ImportRow[], kind: ImportKind, mode: DuplicateMode, existing: Record<string, any>[]): PreviewRow[] {
  const keys = kind === 'products' ? ['sku','barcode'] : kind === 'historical_sales' ? ['invoice_number'] : ['email','phone'];
  const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const index = new Map<string, Record<string,any>[]>();
  for (const row of existing) for (const key of keys) if (normalize(row[key])) { const k = `${key}:${normalize(row[key])}`; index.set(k,[...(index.get(k) || []),row]); }
  const seen = new Set<string>();
  return rows.map((input,i) => {
    const data: ImportRow = Object.fromEntries(Object.entries(input).map(([k,v]) => [k, ['selling_price','cost_price','opening_stock','total','amount_paid'].includes(k) ? String(v).replaceAll(',','').trim() : String(v).trim()]));
    const errors = validateRow(data,kind);
    const matches = new Map<string, Record<string,any>>();
    for (const key of keys) if (normalize(data[key])) for (const row of index.get(`${key}:${normalize(data[key])}`) || []) matches.set(row.id,row);
    if (matches.size > 1) errors.push('Multiple existing records match; resolve the identifiers first');
    const old = [...matches.values()][0];
    if (old && mode === 'update' && kind === 'products' && Number(data.opening_stock || 0) !== 0) errors.push('Opening stock applies only to new products');
    const rowKeys = keys.filter(k => normalize(data[k])).map(k => `${k}:${normalize(data[k])}`);
    if (rowKeys.some(k => seen.has(k))) errors.push('Duplicate identifier within this file');
    rowKeys.forEach(k => seen.add(k));
    if (old && mode === 'create' && kind === 'products' && normalize(old.sku) === normalize(data.sku)) errors.push('Creating another product requires a unique SKU');
    if (old && mode === 'update' && kind === 'historical_sales') errors.push('Historical sales are immutable; skip or create a separate record');
    return { index: i + 1, id: old && mode !== 'create' ? old.id : crypto.randomUUID(), data, errors, existing: old,
      outcome: errors.length ? 'error' : old && mode !== 'create' ? mode : 'create' };
  });
}
