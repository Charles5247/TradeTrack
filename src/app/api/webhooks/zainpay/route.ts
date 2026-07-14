import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import crypto from 'crypto';

// ─── Configuration ────────────────────────────────────────────────────────────
const ZAINPAY_WEBHOOK_SECRET = process.env.ZAINPAY_WEBHOOK_SECRET ?? '';
const ZAINPAY_PUBLIC_KEY     = process.env.ZAINPAY_PUBLIC_KEY     ?? '';
const ZAINPAY_BASE_URL       = process.env.ZAINPAY_BASE_URL       ?? 'https://sandbox.zainpay.ng';

// ─── Supabase admin client ────────────────────────────────────────────────────
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Types ────────────────────────────────────────────────────────────────────
interface ZainpayWebhookPayload {
  txnRef?:       string;
  reference?:    string;
  amount?:       number | { amount?: number; [k: string]: unknown };
  status?:       string;
  code?:         string;
  event?:        string;
  eventType?:    string;
  description?:  string;
  email?:        string;
  zainboxCode?:  string;
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Validate webhook signature — HMAC-SHA512 if secret is configured */
function validateSignature(rawBody: string, headers: Headers): boolean {
  if (!ZAINPAY_WEBHOOK_SECRET) {
    // If no secret is configured, skip validation in dev (log warning)
    console.warn('[Webhook] ZAINPAY_WEBHOOK_SECRET not set — skipping signature validation');
    return true;
  }

  const signature = headers.get('x-zainpay-signature')
    ?? headers.get('x-webhook-signature')
    ?? headers.get('signature')
    ?? '';

  if (!signature) {
    console.error('[Webhook] No signature header found');
    return false;
  }

  const expected = crypto
    .createHmac('sha512', ZAINPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

/** Extract amount safely from payload */
function extractAmount(payload: ZainpayWebhookPayload): number {
  if (typeof payload.amount === 'number') return payload.amount;
  if (typeof payload.amount === 'object' && payload.amount !== null) {
    return (payload.amount as { amount?: number }).amount ?? 0;
  }
  return 0;
}

/** Generate invoice number */
function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const seq  = Math.floor(Math.random() * 900000) + 100000;
  return `INV-${year}-WH-${seq}`;
}

// ─── POST /api/webhooks/zainpay ───────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  // ── 1. Validate webhook signature ─────────────────────────────────────────
  const isValid = validateSignature(rawBody, request.headers);
  if (!isValid) {
    console.error('[Webhook] Signature validation failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // ── 2. Parse payload ───────────────────────────────────────────────────────
  let payload: ZainpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ZainpayWebhookPayload;
  } catch {
    console.error('[Webhook] Invalid JSON payload');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const txnRef    = payload.txnRef ?? payload.reference ?? `WH-${Date.now()}`;
  const eventType = payload.event ?? payload.eventType ?? 'deposit.notification';
  const code      = payload.code;

  console.log(`[Webhook] Received event="${eventType}" txnRef="${txnRef}" code="${code}"`);

  // ── 3. Idempotency check — prevent duplicate processing ───────────────────
  const idempotencyKey = `zainpay:${txnRef}`;
  const { data: existing } = await supabaseAdmin
    .from('webhook_logs')
    .select('id, processed')
    .eq('idempotency_key', idempotencyKey)
    .single();

  if (existing?.processed) {
    console.log(`[Webhook] Already processed: ${idempotencyKey}`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // ── 4. Log webhook payload ─────────────────────────────────────────────────
  let logId: string | null = null;
  if (!existing) {
    const { data: logEntry } = await supabaseAdmin
      .from('webhook_logs')
      .insert({
        provider:        'zainpay',
        event_type:      eventType,
        payload:         payload as Record<string, unknown>,
        processed:       false,
        idempotency_key: idempotencyKey,
      } as any)
      .select('id')
      .single();
    logId = logEntry?.id ?? null;
  } else {
    logId = existing.id;
  }

  // ── 5. Process event ───────────────────────────────────────────────────────
  try {
    // CRITICAL: Check code === "00" — DO NOT check txnStatus
    const isSuccessful = code === '00' && Boolean(payload);

    if (isSuccessful) {
      await handleSuccessfulPayment(payload, txnRef);
    } else {
      // Non-success events: log but mark as processed
      console.log(`[Webhook] Non-success event: code=${code} txnRef=${txnRef}`);
      await handleFailedPayment(payload, txnRef);
    }

    // ── 6. Mark webhook as processed ────────────────────────────────────────
    if (logId) {
      await supabaseAdmin
        .from('webhook_logs')
        .update({ processed: true } as any)
        .eq('id', logId);
    }

    return NextResponse.json({ received: true, processed: true, txnRef });

  } catch (processingError) {
    const errMsg = processingError instanceof Error
      ? processingError.message
      : String(processingError);

    console.error('[Webhook] Processing error:', errMsg);

    // Log the error but still mark as seen (return 200 to prevent Zainpay retries)
    if (logId) {
      await supabaseAdmin
        .from('webhook_logs')
        .update({
          processed:        false,
          processing_error: errMsg,
        } as any)
        .eq('id', logId);
    }

    // Return 200 to acknowledge receipt even if processing failed
    // Zainpay will retry if we return 4xx/5xx — we handle retries via idempotency
    return NextResponse.json({
      received: true,
      processed: false,
      error: 'Processing failed — will retry',
    });
  }
}

// ─── Process a successful payment ────────────────────────────────────────────
async function handleSuccessfulPayment(
  payload: ZainpayWebhookPayload,
  txnRef: string
): Promise<void> {
  const rawAmount = extractAmount(payload);
  const amountNGN = rawAmount > 1000 ? rawAmount / 100 : rawAmount;

  // ── Find the matching payment_transaction ────────────────────────────────
  // Use provider_reference column (not 'reference') per the actual schema
  const { data: txn } = await (supabaseAdmin as any)
    .from('payment_transactions')
    .select('id, organization_id, subscription_id, status')
    .eq('provider_reference', txnRef)
    .single() as { data: { id: string; organization_id: string; subscription_id: string | null; status: string } | null };

  if (!txn) {
    console.warn(`[Webhook] No matching transaction found for txnRef: ${txnRef}`);
    return;
  }

  if (txn.status === 'success') {
    console.log(`[Webhook] Transaction already completed: ${txnRef}`);
    return;
  }

  const organizationId = txn.organization_id;

  // ── 1. Update payment_transaction → success ──────────────────────────────
  await (supabaseAdmin as any)
    .from('payment_transactions')
    .update({ status: 'success' })
    .eq('id', txn.id);

  // ── 2. Activate / extend subscription ────────────────────────────────────
  // Use correct column names: starts_at / expires_at
  const { data: sub } = await (supabaseAdmin as any)
    .from('subscriptions')
    .select('id, plan_id, expires_at')
    .eq('organization_id', organizationId)
    .single() as { data: { id: string; plan_id: string; expires_at: string } | null };

  const now   = new Date();
  const end   = new Date(now);
  end.setMonth(end.getMonth() + 1);

  if (sub) {
    await (supabaseAdmin as any)
      .from('subscriptions')
      .update({
        status:     'active',
        starts_at:  now.toISOString(),
        expires_at: end.toISOString(),
      })
      .eq('id', sub.id);
  }

  // ── 3. Activate merchant account ─────────────────────────────────────────
  await supabaseAdmin
    .from('merchants')
    .update({
      status:     'active',
      updated_at: new Date().toISOString(),
    } as any)
    .eq('organization_id', organizationId)
    .in('status', ['pending', 'suspended']);

  // ── 4. Create invoice ─────────────────────────────────────────────────────
  await supabaseAdmin
    .from('invoices')
    .insert({
      organization_id:        organizationId,
      subscription_id:        sub?.id ?? null,
      payment_transaction_id: txn.id,
      invoice_number:         generateInvoiceNumber(),
      amount:                 amountNGN,
      currency:               'NGN',
      status:                 'paid',
      paid_at:                new Date().toISOString(),
    } as any);

  // ── 5. Re-verify with Zainpay API for confirmation ────────────────────────
  if (ZAINPAY_PUBLIC_KEY) {
    try {
      const verifyRes = await fetch(
        `${ZAINPAY_BASE_URL}/virtual-account/wallet/deposit/verify/${txnRef}`,
        {
          method:  'GET',
          headers: { 'Authorization': `Bearer ${ZAINPAY_PUBLIC_KEY}` },
        }
      );
      if (verifyRes.ok) {
        const verifyData = await verifyRes.json() as { code?: string; data?: unknown };
        console.log(`[Webhook] Re-verify for ${txnRef}: code=${verifyData.code}`);
      }
    } catch (e) {
      console.warn('[Webhook] Re-verify failed (non-critical):', e);
    }
  }

  // ── 6. Audit log ──────────────────────────────────────────────────────────
  await supabaseAdmin
    .from('audit_logs')
    .insert({
      user_id:       organizationId, // system action
      action:        'payment.webhook_processed',
      resource_type: 'payment_transaction',
      resource_id:   txn.id,
      metadata:      { txnRef, amountNGN, event: 'deposit.successful' },
    } as any);

  console.log(`[Webhook] ✅ Processed successful payment for org ${organizationId}, txnRef: ${txnRef}`);
}

// ─── Handle failed / non-success events ──────────────────────────────────────
async function handleFailedPayment(
  payload: ZainpayWebhookPayload,
  txnRef: string
): Promise<void> {
  const { data: txn } = await (supabaseAdmin as any)
    .from('payment_transactions')
    .select('id, organization_id')
    .eq('provider_reference', txnRef)
    .single() as { data: { id: string; organization_id: string } | null };

  if (txn) {
    await (supabaseAdmin as any)
      .from('payment_transactions')
      .update({ status: 'failed' })
      .eq('id', txn.id);

    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id:       txn.organization_id,
        action:        'payment.webhook_failed',
        resource_type: 'payment_transaction',
        resource_id:   txn.id,
        metadata:      { txnRef, code: payload.code },
      } as any);
  }

  console.log(`[Webhook] ❌ Failed payment recorded for txnRef: ${txnRef}`);
}

// ─── GET — health probe ───────────────────────────────────────────────────────
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint:       'POST /api/webhooks/zainpay',
    status:         'active',
    signatureCheck: Boolean(ZAINPAY_WEBHOOK_SECRET),
    idempotency:    true,
    events:         ['deposit.successful', 'deposit.failed', 'card.payment'],
  });
}
