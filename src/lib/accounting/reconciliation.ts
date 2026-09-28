export interface LedgerSale { id: string; created_at: string; total: number; amount_paid: number; change_amount?: number; discount?: number; payment_method: string; payment_status: string; notes?: string | null; }
export interface VendorBalance { id: string; total_value: number; amount_paid: number; status: string; }
export function vendorMismatches(vendors: VendorBalance[], sales: LedgerSale[], corrected: Set<string>) {
  return vendors.filter(v => v.amount_paid >= v.total_value || ['paid', 'completed'].includes(v.status)).flatMap<{ vendor_id: string; sale_id: string | null; issue: string }>(v => {
    const linked = sales.filter(s => s.notes === `Vendor transaction ${v.id}`);
    if (!linked.length) return [{ vendor_id: v.id, sale_id: null, issue: 'Missing linked sale' }];
    return linked.filter(s => (s.payment_status !== 'paid' || s.amount_paid < s.total) && !corrected.has(s.id))
      .map(s => ({ vendor_id: v.id, sale_id: s.id, issue: 'Vendor paid; linked sale is not paid' }));
  });
}
export function dailySales(sales: LedgerSale[], reversed: Set<string>) {
  const totals = new Map<string, { day: string; payment_method: string; sales: number; collected: number; discount: number }>();
  for (const s of sales) {
    if (reversed.has(s.id)) continue;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s.created_at));
    const key = `${day}:${s.payment_method}`;
    const row = totals.get(key) || { day, payment_method: s.payment_method, sales: 0, collected: 0, discount: 0 };
    row.sales += Number(s.total); row.collected += Number(s.amount_paid) - Number(s.change_amount || 0); row.discount += Number(s.discount || 0);
    totals.set(key, row);
  }
  return [...totals.values()];
}
export function csvCell(value: unknown) {
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
