import { z } from 'zod';
import { apiContext } from '@/lib/auth/api-context';
import type { Database } from '@/lib/supabase/types';
import { assertExpectedAccount } from '@/lib/auth/expected-account';
import {
  reviewActionSchema, reviewSnapshotSchema, serverReviewSchema,
  selectionSchema, approvalSchema, executionSchema, stockReviewIdSchema,
} from '@/lib/ai/stock-review-contract';

type ReviewFunction = 'get_ai_stock_review' | 'save_ai_stock_review' | 'preview_ai_stock_selection'
  | 'approve_ai_stock_selection' | 'execute_ai_stock_selection_row' | 'close_ai_stock_review';

function sameRequestOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Authenticated non-browser API clients still use the same RPC checks.
  try {
    const internal = new URL(request.url);
    // Next can normalise the internal URL to localhost. Host retains the actual
    // browser-facing authority. Do not trust a caller's forwarded-host override.
    const external = new URL(`${internal.protocol}//${request.headers.get('host') || internal.host}`);
    const supplied = new URL(origin);
    return !external.username && !external.password && external.pathname === '/' && !external.search && !external.hash
      && !supplied.username && !supplied.password && supplied.pathname === '/'
      && !supplied.search && !supplied.hash && supplied.origin === external.origin;
  } catch { return false; }
}

async function context(request: Request) {
  const ctx = await apiContext(['business_owner']);
  assertExpectedAccount(request, ctx.profile);
  const rpc = async <Name extends ReviewFunction>(name: Name, args: Database['public']['Functions'][Name]['Args']) => {
    const { data, error } = await ctx.db.rpc(name, args);
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883')
        throw new Error('STOCK_REVIEW_SETUP_REQUIRED: The server review update is not available yet. Keep your draft and contact support.');
      throw new Error(error.message);
    }
    return data;
  };
  return { ...ctx, rpc };
}

export async function GET(request: Request) {
  try {
    const { rpc } = await context(request);
    const job = new URL(request.url).searchParams.get('job');
    if (job !== null && !stockReviewIdSchema.safeParse(job).success) throw new Error('INVALID_JOB: Choose a valid stock review.');
    const data = await rpc('get_ai_stock_review', { p_job_id: job });
    return Response.json(data === null ? null : reviewSnapshotSchema.parse(data));
  } catch (cause) { return failure(cause); }
}

export async function POST(request: Request) {
  try {
    if (!sameRequestOrigin(request)) throw new Error('FORBIDDEN: Open the review from this application before applying stock.');
    const { rpc } = await context(request);
    const body = reviewActionSchema.parse(await request.json());
    switch (body.action) {
      case 'save_review':
        return Response.json(serverReviewSchema.parse(await rpc('save_ai_stock_review', {
          p_job_id: body.job, p_expected_revision: body.expected_revision, p_rows: body.rows,
        })));
      case 'preview_selection':
        return Response.json(selectionSchema.parse(await rpc('preview_ai_stock_selection', {
          p_job_id: body.job, p_revision: body.revision, p_row_indices: body.row_indices, p_physical_received: body.physical_received,
        })));
      case 'approve_selection':
        return Response.json(approvalSchema.parse(await rpc('approve_ai_stock_selection', {
          p_job_id: body.job, p_selection_id: body.selection_id, p_revision: body.revision, p_review_digest: body.review_digest,
        })));
      case 'execute_reviewed':
        return Response.json(executionSchema.parse(await rpc('execute_ai_stock_selection_row', {
          p_job_id: body.job, p_approval_id: body.approval_id, p_row_index: body.row_index,
        })));
      case 'close_review':
        await rpc('close_ai_stock_review', { p_job_id: body.job, p_expected_revision: body.expected_revision });
        return Response.json({ closed: true });
    }
  } catch (cause) { return failure(cause); }
}

function failure(cause: unknown) {
  if (cause instanceof z.ZodError) return Response.json({
    code: 'INVALID_REVIEW_REQUEST', error: 'The stock review could not be validated. Reload it before continuing.',
  }, { status: 400 });
  const message = cause instanceof Error ? cause.message : 'Stock review was not confirmed. Keep the original review and check its status.';
  const prefix = /^([A-Z][A-Z_]+):\s*/.exec(message);
  const code = prefix?.[1] || (message === 'Sign in required' ? 'UNAUTHENTICATED' : message === 'Permission denied' ? 'FORBIDDEN' : 'REVIEW_NOT_CONFIRMED');
  const status = code === 'UNAUTHENTICATED' ? 401 : ['FORBIDDEN', 'STOCK_REVIEW_FORBIDDEN'].includes(code) ? 403
    : ['REVISION_CONFLICT', 'STOCK_REVIEW_CONFLICT', 'ACCOUNT_CHANGED'].includes(code) ? 409 : code === 'STOCK_REVIEW_SETUP_REQUIRED' ? 503 : 400;
  return Response.json({ code, error: prefix ? message.slice(prefix[0].length) : message }, { status });
}
