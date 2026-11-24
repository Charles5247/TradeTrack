import { apiContext } from '@/lib/auth/api-context';
import { hasAIEntitlement } from '@/lib/ai/entitlement';
import { getAIProvider } from '@/lib/ai/provider';
import { isLocalPriceSearchEnabled } from '@/lib/ai/local-price';
import { deliveryAdapter } from '@/lib/ai/delivery';
import { periodComparison, recentAnalysis } from '@/lib/ai/analysis';
import { z } from 'zod';
import { assertExpectedAccount } from '@/lib/auth/expected-account';
import type { Database } from '@/lib/supabase/types';

const intakeSourceSchema = z.object({
  kind: z.enum(['text', 'csv', 'xlsx']), text: z.string().max(200000), file_name: z.string().max(255).optional(),
}).strict();
type ActionFunction = 'reserve_ai_job' | 'finish_ai_job' | 'approve_ai_job'
  | 'set_ai_preferences' | 'reserve_ai_delivery' | 'complete_ai_delivery' | 'attach_ai_stock_source';
const productSchema = z.object({ id: z.string(), name: z.string(), cost_price: z.number() });
const inventorySchema = z.object({ id: z.string(), product_id: z.string(), quantity: z.number() });
const saleSchema = z.object({ id: z.string(), created_at: z.string(), total: z.number(), status: z.string(),
  cashier_id: z.string().nullable().optional(), sale_items: z.array(z.object({
    product_id: z.string(), quantity: z.number(), unit_price: z.number().optional(),
  })).nullable().optional().transform(value => value ?? []),
});
const reversalSchema = z.object({ id: z.string(), sale_id: z.string(), kind: z.string() });

async function context() {
  const ctx = await apiContext(['business_owner']);
  const db = ctx.db;
  const { data, error } = await db.rpc('verify_business_subscription');
  if (error || !data || !hasAIEntitlement(data)) throw new Error('AI requires an active introductory period or Growth plan and above.');
  const rpc = async <Name extends ActionFunction>(name: Name, args: Database['public']['Functions'][Name]['Args']) => {
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
    const provider = getAIProvider();
    return Response.json({
      preferences: data || { in_app: false, email: false, sms: false },
      channels: { in_app: true, email: deliveryAdapter('email').enabled, sms: deliveryAdapter('sms').enabled },
      provider: provider.name, stub: provider.stub,
      capabilities: {
        inventoryPhoto: typeof provider.mapInventoryImage === 'function',
        invoicePhoto: typeof provider.mapInvoiceImage === 'function',
        inventoryVoice: typeof provider.transcribeInventoryAudio === 'function',
        localPrices: isLocalPriceSearchEnabled(),
        priceWrites: process.env.AI_PRICE_WRITES_ENABLED === 'true',
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const { db, org, profile, rpc } = await context();
    assertExpectedAccount(request, profile);
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
        if (adapter) await adapter.send({ recipient: recipient!, title: 'TracKasuwa business insights',
          message: z.object({ summary: z.string() }).parse(job.result).summary, idempotencyKey: delivery });
      } catch (e) { await rpc('complete_ai_delivery', { delivery, succeeded: false }); throw e; }
      await rpc('complete_ai_delivery', { delivery, succeeded: true });
      return Response.json({ delivered: true });
    }
    if (!['inventory','inventory_image','invoice_image','inventory_audio','insights'].includes(body.action)) throw new Error('Unknown assistant action.');
    if (body.action === 'inventory' && (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 200000)) throw new Error('Paste between 1 and 200,000 characters of product data.');
    if (['inventory_image','invoice_image'].includes(body.action) && (typeof body.image !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.image) || body.image.length > 3_000_000)) throw new Error('Choose a JPEG, PNG or WebP photo under 2 MB.');
    if (body.action === 'inventory_audio' && (typeof body.audio !== 'string' || body.audio.length > 3_000_000)) throw new Error('Choose a voice recording under 2 MB.');
    if (body.question !== undefined && (typeof body.question !== 'string' || body.question.length > 2000)) throw new Error('Keep your business question under 2,000 characters.');
    const suppliedSource = body.action === 'inventory' && body.source !== undefined ? intakeSourceSchema.parse(body.source) : null;
    const provider = getAIProvider();
    const job = z.string().parse(await rpc('reserve_ai_job', { job_kind: body.action === 'insights' ? 'insights' : 'inventory' }));
    try {
      if (body.action !== 'insights') {
        const kind = body.action === 'inventory' ? suppliedSource?.kind || 'text'
          : body.action === 'inventory_audio' ? 'audio' : 'image';
        const content = body.action === 'inventory' ? suppliedSource?.text ?? body.text
          : body.action === 'inventory_audio' ? body.audio : body.image;
        await rpc('attach_ai_stock_source', { p_job_id: job, p_kind: kind, p_content: content,
          p_metadata: { purpose: body.action === 'invoice_image' ? 'po_compare' : 'stock_intake',
            ...(suppliedSource?.file_name ? { file_name: suppliedSource.file_name } : {}) } });
      }
      let output;
      if (body.action === 'invoice_image') {
        if (!provider.mapInvoiceImage) throw new Error('Invoice extraction requires a configured live AI provider.');
        output = { rows: await provider.mapInvoiceImage(body.image), source: 'invoice', stub: false };
      } else if (body.action === 'inventory_image') {
        if (!provider.mapInventoryImage) throw new Error('Photo extraction requires a configured live AI provider.');
        output = { rows: await provider.mapInventoryImage(body.image), stub: false };
      } else if (body.action === 'inventory_audio') {
        if (!provider.transcribeInventoryAudio) throw new Error('Voice extraction requires a configured live AI provider.');
        const transcript = await provider.transcribeInventoryAudio(body.audio);
        output = { rows: await provider.mapInventory(transcript), transcript, stub: false };
      } else if (body.action === 'inventory') {
        // Product-only input: remove recognizable contact details before any provider call.
        const text = body.text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email removed]').replace(/\+\d[\d ()-]{8,}\d/g, '[phone removed]');
        output = { rows: await provider.mapInventory(text), stub: provider.stub };
      } else {
        const read = async (table: 'products' | 'inventory' | 'sales' | 'financial_reversals', columns: string) => {
          const rows: unknown[] = [];
          for (let start = 0; ; start += 1000) {
            const { data, error } = await db.from(table).select(columns).eq('organization_id', org).order('id').range(start, start + 999);
            if (error) throw error;
            rows.push(...data); if (data.length < 1000) return rows;
          }
        };
        const raw = await Promise.all([read('products','id,name,cost_price'), read('inventory','id,product_id,quantity'), read('sales','id,total,status,created_at,cashier_id,sale_items(product_id,quantity,unit_price)'), read('financial_reversals','id,sale_id,kind')]);
        const products = z.array(productSchema).parse(raw[0]), inventory = z.array(inventorySchema).parse(raw[1]);
        const sales = z.array(saleSchema).parse(raw[2]), reversals = z.array(reversalSchema).parse(raw[3]);
        const reversed = new Set(reversals.filter(r => r.kind !== 'vendor_payment_correction').map(r => r.sale_id));
        const currentSales = sales.filter(s => s.status === 'completed' && !reversed.has(s.id));
        const stock = products.map(p => ({ name: p.name, quantity: inventory.filter(i => i.product_id === p.id).reduce((n,i) => n + Number(i.quantity), 0), cost: Number(p.cost_price) }));
        const comparison = periodComparison(products, currentSales);
        const insights = await provider.insights({ analysis: recentAnalysis(products, inventory, currentSales), comparison, productCount: products.length, unitsOnHand: stock.reduce((n,p) => n+p.quantity,0), stockCost: stock.reduce((n,p) => n+p.quantity*p.cost,0), salesTotal: currentSales.reduce((n,s) => n+Number(s.total),0), saleCount: currentSales.length, lowStock: stock.filter(p => p.quantity <= 5).slice(0,20).map(({name,quantity}) => ({name,quantity})) }, body.question);
        const figures = `${comparison.current.from} to ${comparison.current.to}: ${comparison.current.sales} sales, ₦${comparison.current.revenue.toFixed(2)}. Previous ${comparison.previous.from} to ${comparison.previous.to}: ${comparison.previous.sales} sales, ₦${comparison.previous.revenue.toFixed(2)}.`;
        output = { insights, comparison, summary: [figures, ...insights.map(i => `${i.title}: ${i.message}`)].join('\n'), stub: provider.stub };
      }
      await rpc('finish_ai_job', { job, output, failed: false });
      return Response.json({ job, ...output });
    } catch (e) { await rpc('finish_ai_job', { job, output: { error: 'Generation failed' }, failed: true }); throw e; }
  } catch (e) { return failure(e); }
}
function failure(e: unknown) { return Response.json({ error: e instanceof Error ? e.message : 'Assistant unavailable' }, { status: 400 }); }
