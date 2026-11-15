import { apiContext } from '@/lib/auth/api-context';
import { hasAIEntitlement } from '@/lib/ai/entitlement';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function context() {
  const ctx = await apiContext(['business_owner']);
  // The generated database types lag the AI migrations in this repository.
  const db = ctx.db as any;
  const { data, error } = await db.rpc('verify_business_subscription');
  if (error || !data || !hasAIEntitlement(data)) throw new Error('AI requires an active introductory period or Growth plan and above.');
  return { ...ctx, db };
}

export async function GET(request: Request) {
  try {
    const { db, org, profile } = await context();
    const job = new URL(request.url).searchParams.get('job');
    if (!job || !uuid.test(job)) throw new Error('Choose a valid stock proposal.');
    const { data: proposal, error: proposalError } = await db.from('ai_jobs')
      .select('id,result,status,kind').eq('id', job).eq('organization_id', org)
      .eq('user_id', profile.id).single();
    if (proposalError || !proposal || proposal.kind !== 'inventory' || proposal.status !== 'ready')
      throw new Error('Ready stock proposal not found.');
    const { data: receipts, error } = await db.from('ai_stock_receipts')
      .select('row_index,product_id,warehouse_id,quantity,unit_cost,average_cost')
      .eq('organization_id', org).eq('job_id', job).eq('approved_by', profile.id);
    if (error) throw error;
    return Response.json({ rows: proposal.result?.rows || [], receipts: receipts || [] });
  } catch (cause) { return failure(cause); }
}

export async function POST(request: Request) {
  try {
    const { db } = await context();
    const body = await request.json();
    if (body.confirm !== true || !uuid.test(body.job) || !uuid.test(body.product_id)
      || !uuid.test(body.warehouse_id) || !Number.isSafeInteger(body.row_index)
      || body.row_index < 0 || !Number.isSafeInteger(body.quantity) || body.quantity <= 0
      || typeof body.unit_cost !== 'number' || !Number.isFinite(body.unit_cost)
      || body.unit_cost < 0 || body.unit_cost > 9999999999.99) {
      throw new Error('Review and confirm the exact stock changes first.');
    }
    const { data, error } = await db.rpc('apply_ai_stock_receipt', {
      p_job_id: body.job, p_row_index: body.row_index, p_product_id: body.product_id,
      p_warehouse_id: body.warehouse_id, p_quantity: body.quantity, p_unit_cost: body.unit_cost,
    });
    if (error) throw error;
    return Response.json({ saved: true, average_cost: data });
  } catch (cause) { return failure(cause); }
}

function failure(cause: unknown) {
  return Response.json({ error: cause instanceof Error ? cause.message : 'Stock receipt was not confirmed' }, { status: 400 });
}
