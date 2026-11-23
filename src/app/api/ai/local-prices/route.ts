import { z } from 'zod';
import { hasAIEntitlement } from '@/lib/ai/entitlement';
import {
  localPriceAreaSchema, localPriceRequestSchema,
} from '@/lib/ai/local-price-contract';
import {
  isLocalPriceSearchEnabled, LocalPriceUnavailable, lookupLocalPrice, registeredPriceArea,
} from '@/lib/ai/local-price';
import { apiContext } from '@/lib/auth/api-context';
import { assertExpectedAccount } from '@/lib/auth/expected-account';

const noStore = { 'Cache-Control': 'private, no-store' };
const idSchema = z.uuid();
const MAX_REQUEST_BYTES = 1024;

class LocalPriceRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function sameRequestOrigin(request: Request) {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const internal = new URL(request.url);
    // Next can normalize the internal URL. Use Host as the browser-facing
    // authority and ignore caller-provided forwarded host overrides.
    const external = new URL(internal.protocol + '//' + (request.headers.get('host') || internal.host));
    const supplied = new URL(origin);
    return !external.username && !external.password && external.pathname === '/' && !external.search && !external.hash
      && !supplied.username && !supplied.password && supplied.pathname === '/' && !supplied.search && !supplied.hash
      && external.origin === supplied.origin;
  } catch {
    return false;
  }
}

async function context(request: Request) {
  if (!sameRequestOrigin(request)) throw new LocalPriceRequestError(403, 'Open price lookup from this application.');
  const ctx = await apiContext(['business_owner']);
  assertExpectedAccount(request, ctx.profile);
  if (!isLocalPriceSearchEnabled()) throw new LocalPriceUnavailable();
  const { data, error } = await ctx.db.rpc('verify_business_subscription');
  if (error) throw new LocalPriceUnavailable();
  if (!data || !hasAIEntitlement(data)) throw new LocalPriceRequestError(403, 'AI is not active for this business.');
  return ctx;
}

async function ensureWarehouse(ctx: Awaited<ReturnType<typeof context>>, warehouseId: string) {
  const { data, error } = await ctx.db.from('warehouses')
    .select('id').eq('organization_id', ctx.org).eq('id', warehouseId).maybeSingle();
  if (error) throw new LocalPriceUnavailable();
  if (!data) throw new LocalPriceRequestError(404, 'Choose a warehouse in your business.');
}

// Feed lookups are capped per process in addition to the bounded number of
// approved feeds per request. Live deployments may enforce stricter quotas.
const lookups = new Map<string, { count: number; expiresAt: number }>();
function reserveLookup(org: string, now = Date.now()) {
  for (const [id, entry] of lookups) {
    if (entry.expiresAt <= now) lookups.delete(id);
  }
  const entry = lookups.get(org);
  if (entry) {
    if (entry.count >= 12) throw new LocalPriceRequestError(429, 'Too many price checks. Try again in a minute.');
    entry.count++;
  } else {
    if (lookups.size >= 256) throw new LocalPriceRequestError(429, 'Price lookup is busy. Try again in a minute.');
    lookups.set(org, { count: 1, expiresAt: now + 60_000 });
  }
}

async function readRequest(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES)
    throw new LocalPriceRequestError(413, 'The price lookup request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new LocalPriceRequestError(400, 'Choose a product and confirm your market area.');
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new LocalPriceRequestError(413, 'The price lookup request is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return localPriceRequestSchema.parse(JSON.parse(text + decoder.decode()));
  } finally {
    reader.releaseLock();
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await context(request);
    const warehouseId = idSchema.parse(new URL(request.url).searchParams.get('warehouseId'));
    await ensureWarehouse(ctx, warehouseId);

    const { data: organization, error } = await ctx.db.from('organizations')
      .select('settings').eq('id', ctx.org).maybeSingle();
    if (error) throw new LocalPriceUnavailable();
    const markets = z.record(z.string(), z.unknown()).safeParse(organization?.settings?.local_price_market_areas);
    const savedArea = localPriceAreaSchema.safeParse(markets.success ? markets.data[warehouseId] : undefined);
    if (savedArea.success) return Response.json({ area: savedArea.data }, { headers: noStore });

    const { data: merchant } = await ctx.db.from('merchants')
      .select('state,city,country').eq('organization_id', ctx.org).maybeSingle();
    const country = merchant?.country?.trim().toLowerCase();
    const area = ['ng', 'nga', 'nigeria'].includes(country ?? '')
      ? registeredPriceArea(merchant?.state, merchant?.city) : null;
    return Response.json({ area }, { headers: noStore });
  } catch (cause) {
    return failure(cause);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await context(request);
    const { productId, warehouseId, area } = await readRequest(request);
    await ensureWarehouse(ctx, warehouseId);
    const { data: product, error } = await ctx.db.from('products')
      .select('name,make,barcode,variant_size,variant_colour,model,stock_unit,units_per_pack')
      .eq('organization_id', ctx.org).eq('id', productId).eq('status', 'active').maybeSingle();
    if (error) throw new LocalPriceUnavailable();
    if (!product) throw new LocalPriceRequestError(404, 'Choose an active product in your business.');
    reserveLookup(ctx.org);
    return Response.json(await lookupLocalPrice({
      name: product.name,
      make: product.make,
      barcode: product.barcode,
      variantSize: product.variant_size,
      variantColour: product.variant_colour,
      model: product.model,
      stockUnit: product.stock_unit,
      unitsPerPack: product.units_per_pack,
    }, area), { headers: noStore });
  } catch (cause) {
    return failure(cause);
  }
}

function failure(cause: unknown) {
  const message = cause instanceof Error ? cause.message : '';
  if (cause instanceof LocalPriceRequestError) {
    return Response.json({ error: cause.message }, { status: cause.status, headers: noStore });
  }
  if (cause instanceof SyntaxError || cause instanceof z.ZodError)
    return Response.json({ error: 'Choose a product and confirm your market area.' }, { status: 400, headers: noStore });
  if (message.startsWith('ACCOUNT_CHANGED:'))
    return Response.json({ error: 'Your account changed. Reopen the assistant in its original account.' }, { status: 409, headers: noStore });
  if (message === 'Sign in required')
    return Response.json({ error: 'Sign in to check local prices.' }, { status: 401, headers: noStore });
  if (message === 'Permission denied')
    return Response.json({ error: 'Only a business owner can check local prices.' }, { status: 403, headers: noStore });
  return Response.json({ error: 'Local price lookup is unavailable. You can keep working on the stock review.' }, { status: 503, headers: noStore });
}
