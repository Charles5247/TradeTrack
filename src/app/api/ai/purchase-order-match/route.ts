import { apiContext } from '@/lib/auth/api-context';
import { hasAIEntitlement } from '@/lib/ai/entitlement';
import { matchInvoiceToOrder } from '@/lib/ai/purchase-order-match';
import { assertExpectedAccount } from '@/lib/auth/expected-account';
import { reviewSnapshotSchema } from '@/lib/ai/stock-review-contract';
import { z } from 'zod';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invoiceSchema = z.object({ status: z.literal('ready'), kind: z.literal('inventory'),
  result: z.object({ source: z.literal('invoice'), rows: reviewSnapshotSchema.shape.rows.max(1000) }),
});
const orderSchema = z.object({ id: z.string(), supplier: z.object({ name: z.string() }).nullable(),
  purchase_order_items: z.array(z.object({ id: z.string(), product_id: z.string(), quantity_ordered: z.number(),
    quantity_received: z.number(), unit_cost: z.number(), product: z.object({ name: z.string(), sku: z.string(), stock_unit: z.string() }),
  })),
});

async function context() {
  const ctx = await apiContext(['business_owner']);
  const db = ctx.db;
  const { data, error } = await db.rpc('verify_business_subscription');
  if (error || !data || !hasAIEntitlement(data)) throw new Error('AI is not active for this business.');
  return { ...ctx, db };
}

export async function GET(request: Request) {
  try {
    const { db, org, profile } = await context();
    assertExpectedAccount(request, profile);
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
    assertExpectedAccount(request, profile);
    const body = await request.json();
    if (!uuid.test(body.job) || !uuid.test(body.order)) throw new Error('Choose a valid invoice draft and sent purchase order.');
    const [{ data: job, error: jobError }, { data: order, error: orderError }] = await Promise.all([
      db.from('ai_jobs').select('id,result,status,kind').eq('id', body.job)
        .eq('organization_id', org).eq('user_id', profile.id).single(),
      db.from('purchase_orders')
        .select('id,status,organization_id,supplier:suppliers(name),purchase_order_items(id,product_id,quantity_ordered,quantity_received,unit_cost,product:products(name,sku,stock_unit))')
        .eq('id', body.order).eq('organization_id', org).eq('status', 'sent').single(),
    ]);
    const parsedJob = invoiceSchema.safeParse(job);
    if (jobError || !parsedJob.success) throw new Error('Ready invoice draft not found. Upload the invoice again.');
    if (orderError || !order) throw new Error('Sent purchase order not found in your business.');
    const parsedOrder = orderSchema.parse(order);
    return Response.json({ order: { id: parsedOrder.id, supplier: parsedOrder.supplier },
      ...matchInvoiceToOrder(parsedJob.data.result.rows, parsedOrder.purchase_order_items) });
  } catch (cause) { return failure(cause); }
}

function failure(cause: unknown) {
  return Response.json({ error: cause instanceof Error ? cause.message : 'Could not compare the invoice' }, { status: 400 });
}
