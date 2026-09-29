import { apiContext } from '@/lib/auth/api-context';
import { hasAIEntitlement } from '@/lib/ai/entitlement';
import { getAIProvider } from '@/lib/ai/provider';
import { deliveryAdapter } from '@/lib/ai/delivery';

async function context() {
  const ctx = await apiContext();
  const db = ctx.db as any;
  const { data, error } = await db.rpc('verify_business_subscription');
  if (error || !data || !hasAIEntitlement(data)) throw new Error('AI requires an active introductory period or Growth plan and above.');
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const result = await db.rpc(name, args);
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };
  return { ...ctx, db, rpc };
}
export async function GET() {
  try {
    const { db, org, profile } = await context();
    const { data, error } = await db.from('ai_preferences').select('in_app,email,sms').eq('organization_id', org).eq('user_id', profile.id).maybeSingle();
    if (error) throw error;
    return Response.json({ preferences: data || { in_app: false, email: false, sms: false }, channels: { in_app: true, email: deliveryAdapter('email').enabled, sms: deliveryAdapter('sms').enabled }, provider: getAIProvider().name, stub: getAIProvider().stub });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const { db, org, profile, rpc } = await context();
    const body = await request.json();
    if (['approve','preferences','deliver'].includes(body.action) && body.confirm !== true) throw new Error('Review the preview and explicitly confirm first.');
    if (body.action === 'preferences') {
      await rpc('set_ai_preferences', { in_app_enabled: body.in_app === true, email_enabled: body.email === true, sms_enabled: body.sms === true });
      return Response.json({ saved: true });
    }
    if (body.action === 'approve') {
      await rpc('approve_ai_job', { job: body.job, batch: body.batch || null });
      return Response.json({ approved: true });
    }
    if (body.action === 'deliver') {
      if (!['in_app','email','sms'].includes(body.channel)) throw new Error('Choose a delivery channel.');
      const { data: job, error } = await db.from('ai_jobs').select('*').eq('id', body.job).eq('organization_id', org).eq('user_id', profile.id).single();
      if (error || !job || job.kind !== 'insights') throw new Error('Insight not found.');
      const channel = body.channel as 'in_app' | 'email' | 'sms';
      const adapter = channel === 'in_app' ? null : deliveryAdapter(channel);
      const recipient = channel === 'email' ? profile.email : profile.phone;
      if (adapter && (!adapter.enabled || !recipient)) throw new Error('Channel is disabled or your profile has no delivery address.');
      await rpc('approve_ai_job', { job: job.id, batch: null });
      const delivery = await rpc('reserve_ai_delivery', { job: job.id, delivery_channel: channel });
      try {
        if (adapter) await adapter.send({ recipient: recipient!, title: 'TracKasuwa business insights', message: job.result.summary, idempotencyKey: delivery });
      } catch (e) { await rpc('complete_ai_delivery', { delivery, succeeded: false }); throw e; }
      await rpc('complete_ai_delivery', { delivery, succeeded: true });
      return Response.json({ delivered: true });
    }
    if (!['inventory','insights'].includes(body.action)) throw new Error('Unknown assistant action.');
    if (body.action === 'inventory' && (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 200000)) throw new Error('Paste between 1 and 200,000 characters of product data.');
    const provider = getAIProvider();
    const job = await rpc('reserve_ai_job', { job_kind: body.action });
    try {
      let output;
      if (body.action === 'inventory') {
        // Product-only input: remove recognizable contact details before any provider call.
        const text = body.text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email removed]').replace(/\+\d[\d ()-]{8,}\d/g, '[phone removed]');
        output = { rows: await provider.mapInventory(text), stub: provider.stub };
      } else {
        const read = async (table: string, columns: string) => {
          const rows: any[] = [];
          for (let start = 0; ; start += 1000) {
            const { data, error } = await db.from(table).select(columns).eq('organization_id', org).order('id').range(start, start + 999);
            if (error) throw error;
            rows.push(...data); if (data.length < 1000) return rows;
          }
        };
        const [products, inventory, sales, reversals] = await Promise.all([read('products','id,name,cost_price'), read('inventory','id,product_id,quantity'), read('sales','id,total'), read('financial_reversals','id,sale_id,kind')]);
        const reversed = new Set(reversals.filter(r => r.kind !== 'vendor_payment_correction').map(r => r.sale_id));
        const currentSales = sales.filter(s => !reversed.has(s.id));
        const stock = products.map(p => ({ name: p.name, quantity: inventory.filter(i => i.product_id === p.id).reduce((n,i) => n + Number(i.quantity), 0), cost: Number(p.cost_price) }));
        const insights = await provider.insights({ productCount: products.length, unitsOnHand: stock.reduce((n,p) => n+p.quantity,0), stockCost: stock.reduce((n,p) => n+p.quantity*p.cost,0), salesTotal: currentSales.reduce((n,s) => n+Number(s.total),0), saleCount: currentSales.length, lowStock: stock.filter(p => p.quantity <= 5).slice(0,20).map(({name,quantity}) => ({name,quantity})) });
        output = { insights, summary: insights.map(i => `${i.title}: ${i.message}`).join('\n'), stub: provider.stub };
      }
      await rpc('finish_ai_job', { job, output, failed: false });
      return Response.json({ job, ...output });
    } catch (e) { await rpc('finish_ai_job', { job, output: { error: 'Generation failed' }, failed: true }); throw e; }
  } catch (e) { return failure(e); }
}
function failure(e: unknown) { return Response.json({ error: e instanceof Error ? e.message : 'Assistant unavailable' }, { status: 400 }); }
