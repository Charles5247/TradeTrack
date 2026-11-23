import { hasAIEntitlement } from '@/lib/ai/entitlement';
import { priceChangeRequestSchema, priceChangeResultSchema } from '@/lib/ai/price-change-contract';
import { apiContext } from '@/lib/auth/api-context';
import { assertExpectedAccount } from '@/lib/auth/expected-account';
import { platformDb } from '@/lib/platform/support';

const responses = {
  PRICE_DISABLED: [503, 'Assistant price changes are unavailable. You can continue receiving stock.'],
  PRICE_FORBIDDEN: [403, 'An active Business Owner with eligible Assistant access is required.'],
  PRICE_INVALID: [400, 'Review the selected product and exact selling price before continuing.'],
  PRICE_NOT_FOUND: [404, 'The price operation or confirmed receipt was not found.'],
  PRICE_PAYLOAD_CHANGED: [409, 'This operation was prepared with different details. Check its original result.'],
  PRICE_UNCHANGED: [409, 'This is already the current selling price.'],
  PRICE_NOT_CONFIGURED: [503, 'Price review is unavailable. Keep your current price and try again later.'],
  PRICE_UNKNOWN: [503, 'The outcome could not be confirmed. Check the original operation before trying again.'],
  ACCOUNT_CHANGED: [409, 'Your account changed. Reopen this task in its original account.'],
  UNAUTHENTICATED: [401, 'Sign in required.'],
} as const;

const noStore = { 'Cache-Control': 'no-store' };

function failure(code: keyof typeof responses) {
  const [status, error] = responses[code];
  return Response.json({ code, error }, { status, headers: noStore });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const internal = new URL(request.url);
    const external = new URL(`${internal.protocol}//${request.headers.get('host') || internal.host}`);
    const supplied = new URL(origin);
    return external.origin === supplied.origin &&
      external.href === `${external.origin}/` && supplied.href === `${supplied.origin}/`;
  } catch {
    return false;
  }
}

function rpcFailure(message: string) {
  if (message === 'PRICE_FORBIDDEN' || message === 'PRICE_INVALID' || message === 'PRICE_NOT_FOUND' ||
    message === 'PRICE_PAYLOAD_CHANGED' || message === 'PRICE_UNCHANGED' || message === 'PRICE_NOT_CONFIGURED') {
    return failure(message);
  }
  return failure('PRICE_UNKNOWN');
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure('PRICE_FORBIDDEN');

  try {
    const payload = priceChangeRequestSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) return failure('PRICE_INVALID');
    const action = payload.data;
    if (action.action !== 'status' && process.env.AI_PRICE_WRITES_ENABLED !== 'true') return failure('PRICE_DISABLED');
    const { db, org, profile } = await apiContext(['business_owner']);
    assertExpectedAccount(request, profile);

    // Expired access still permits an active Owner to reconcile an already
    // submitted operation. Creation and approval always require entitlement.
    let accessUntil: string | undefined;
    if (action.action !== 'status') {
      const { data, error } = await db.rpc('verify_business_subscription');
      if (error) return failure('PRICE_UNKNOWN');
      if (!data || data.organization_id !== org || !hasAIEntitlement(data) ||
        !data.valid_until || !(Date.parse(data.valid_until) > Date.parse(data.server_time))) {
        return failure('PRICE_FORBIDDEN');
      }
      accessUntil = data.valid_until;
    }

    const { data, error } = await platformDb().rpc('manage_ai_price_change', {
      p_actor_id: profile.id,
      p_organization_id: org,
      p_action: action.action,
      p_operation_id: action.operationId,
      ...(accessUntil ? { p_access_until: accessUntil } : {}),
      ...(action.action === 'prepare' ? {
        p_job_id: action.job,
        p_row_index: action.rowIndex,
        // The schema caps this at 12 digits, below Number.MAX_SAFE_INTEGER.
        p_new_price_minor: Number(action.newPriceMinor),
      } : action.action === 'approve' ? { p_review_digest: action.reviewDigest } : {}),
    });
    if (error) return rpcFailure(error.message);
    const result = priceChangeResultSchema.safeParse(data);
    return result.success
      ? Response.json(result.data, { headers: noStore })
      : failure('PRICE_UNKNOWN');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Sign in required') return failure('UNAUTHENTICATED');
    if (message === 'Permission denied') return failure('PRICE_FORBIDDEN');
    if (message.startsWith('ACCOUNT_CHANGED:')) return failure('ACCOUNT_CHANGED');
    return failure('PRICE_UNKNOWN');
  }
}
