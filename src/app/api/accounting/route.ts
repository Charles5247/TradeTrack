import { apiContext } from '@/lib/auth/api-context';
import { dailySales, vendorMismatches } from '@/lib/accounting/reconciliation';

export async function GET(request: Request) {
  try {
    const { db, org } = await apiContext();
    const table = async (name: string) => {
      const rows: any[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await (db as any).from(name).select('*').eq('organization_id', org).order('id').range(start, start + 999);
        if (error) throw error;
        rows.push(...data); if (data.length < 1000) return rows;
      }
    };
    const [sales, vendors, reversals, movements, closes] = await Promise.all(['sales', 'vendor_transactions', 'financial_reversals', 'inventory_movements', 'cash_up_closes'].map(table));
    const reversed = new Set<string>(reversals.filter(r => r.kind !== 'vendor_payment_correction').map(r => r.sale_id));
    const corrected = new Set<string>(reversals.filter(r => r.kind === 'vendor_payment_correction').map(r => r.sale_id));
    const params = new URL(request.url).searchParams;
    const visible = sales.filter(s => (!params.get('from') || s.created_at >= params.get('from')!) && (!params.get('to') || s.created_at < `${params.get('to')}T23:59:59.999Z`));
    return Response.json({ daily: dailySales(visible.map(s => corrected.has(s.id) ? { ...s, amount_paid: s.total, payment_status: 'paid' } : s), reversed), mismatches: vendorMismatches(vendors, sales, corrected),
      exceptions: [...reversals, ...visible.filter(s => Number(s.discount) > 0), ...movements.filter(m => m.movement_type === 'adjustment')],
      movements: movements.filter(m => m.reference_type === 'inventory_ledger'), closes, sales: visible }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Accounting unavailable' }, { status: 403 }); }
}
export async function POST(request: Request) {
  try {
    const { db } = await apiContext();
    const body = await request.json();
    if (body.confirm !== true) throw new Error('Explicit confirmation required');
    const name = body.action === 'close' ? 'close_cash_up' : 'reverse_financial_sale';
    const args = body.action === 'close'
      ? { cashier: body.cashier_id, opened: body.opened_at, counted_values: body.counted, close_reason: body.reason }
      : { target: body.sale_id, reversal_kind: body.kind, reversal_reason: body.reason };
    const { data, error } = await (db as any).rpc(name, args);
    if (error) throw error;
    return Response.json({ id: data });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Action failed' }, { status: 400 }); }
}
