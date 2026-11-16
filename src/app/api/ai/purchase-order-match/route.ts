import { apiContext } from '@/lib/auth/api-context';
import { hasAIEntitlement } from '@/lib/ai/entitlement';
import { matchInvoiceToOrder, type PurchaseOrderLine } from '@/lib/ai/purchase-order-match';
import type { ImportRow } from '@/lib/imports/preview';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function context() {
  const ctx = await apiContext(['business_owner']);
  const db = ctx.db as any;
  const { data, error } = await db.rpc('verify_business_subscription');
  if (error || !data || !hasAIEntitlement(data)) throw new Error('AI is not active for this business.');
  return { ...ctx, db };
}

export async function GET() {
  try {
    const { db, org } = await context();
    const { data, error } = await db.from('purchase_orders')
      .select('id,status,created_at,supplier:suppliers(name)')
      .eq('organization_id', org).eq('status', 'sent')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return Response.json({ orders: data || [] });
  } catch (cause) { return failure(cause); }
}

export async function POST(request: Request) {
  try {
    const { db, org, profile } = await context();
    const body = await request.json();
    if (!uuid.test(body.job) || !uuid.test(body.order)) throw new Error('Choose a valid invoice draft and sent purchase order.');
    const [{ data: job, error: jobError }, { data: order, error: orderError }] = await Promise.all([
      db.from('ai_jobs').select('id,result,status,kind').eq('id', body.job)
        .eq('organization_id', org).eq('user_id', profile.id).single(),
      db.from('purchase_orders')
        .select('id,status,organization_id,supplier:suppliers(name),purchase_order_items(id,product_id,quantity_ordered,quantity_received,unit_cost,product:products(name,sku,stock_unit))')
        .eq('id', body.order).eq('organization_id', org).eq('status', 'sent').single(),
    ]);
    if (jobError || !job || job.status !== 'ready' || job.kind !== 'inventory'
      || job.result?.source !== 'invoice') throw new Error('Ready invoice draft not found. Upload the invoice again.');
    if (orderError || !order) throw new Error('Sent purchase order not found in your business.');
    const rows = job.result.rows as ImportRow[];
    if (!Array.isArray(rows) || rows.length > 1000) throw new Error('Invoice rows are invalid.');
    return Response.json({ order: { id: order.id, supplier: order.supplier },
      ...matchInvoiceToOrder(rows, order.purchase_order_items as PurchaseOrderLine[]) });
  } catch (cause) { return failure(cause); }
}

function failure(cause: unknown) {
  return Response.json({ error: cause instanceof Error ? cause.message : 'Could not compare the invoice' }, { status: 400 });
}
