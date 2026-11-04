import { apiContext } from '@/lib/auth/api-context';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!id || reason.length < 3) {
      return Response.json({ error: 'Enter a reason of at least 3 characters.' }, { status: 400 });
    }

    const { db, org } = await apiContext();
    const { data: sale, error: saleError } = await db.from('sales')
      .select('id,status').eq('id', id).eq('organization_id', org).maybeSingle();
    if (saleError) throw saleError;
    if (!sale) return Response.json({ error: 'Sale not found.' }, { status: 404 });
    if (sale.status !== 'completed') {
      return Response.json({ error: 'Only completed sales can be reversed.' }, { status: 409 });
    }

    // The database function inserts the reversal and restores only stock
    // actually deducted for this sale in a single transaction.
    const { data, error } = await db.rpc('reverse_financial_sale', {
      target: id,
      reversal_kind: 'void',
      reversal_reason: reason,
    });
    if (error) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ reversal_id: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Reversal failed' }, { status: 403 });
  }
}
