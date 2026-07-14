import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

// ─── Zainpay configuration ──────────────────────────────────────────────────
const ZAINPAY_PUBLIC_KEY = process.env.ZAINPAY_PUBLIC_KEY  ?? '';
const ZAINPAY_BASE_URL   = process.env.ZAINPAY_BASE_URL    ?? 'https://sandbox.zainpay.ng';

// ─── Supabase admin client ────────────────────────────────────────────────────
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Zainpay verification response types ─────────────────────────────────────
interface ZainpayAmountDetail {
  amount?: number;
  [key: string]: unknown;
}

interface ZainpayVerifyData {
  txnRef?:     string;
  reference?:  string;
  amount?:     number | ZainpayAmountDetail;
  status?:     string;
  txnStatus?:  string;  // DO NOT use this field per spec — check code === "00" instead
  [key: string]: unknown;
}

interface ZainpayVerifyResponse {
  code:         string;
  description:  string;
  data?:        ZainpayVerifyData;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract amount safely from nested Zainpay response structure */
function extractAmount(data: ZainpayVerifyData): number {
  // data.amount can be a number OR an object { amount: number }
  if (typeof data.amount === 'number') return data.amount;
  if (typeof data.amount === 'object' && data.amount !== null) {
    return (data.amount as ZainpayAmountDetail).amount ?? 0;
  }
  return 0;
}

/** Convert amount in kobo to NGN */
function koboToNGN(kobo: number): number {
  return kobo / 100;
}

/** Generate invoice number */
function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const seq  = Math.floor(Math.random() * 900000) + 100000;
  return `INV-${year}-${seq}`;
}

// ─── GET /api/payments/verify ─────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const txnRef  = searchParams.get('txnRef');
    const planId  = searchParams.get('planId');
    const userId  = searchParams.get('userId');

    // ── 1. Validate required params ────────────────────────────────────────
    if (!txnRef) {
      return NextResponse.json({ error: 'txnRef is required' }, { status: 400 });
    }

    // ── 2. Check for duplicate verification (idempotency) ─────────────────
    // Use as any to bypass column name type restrictions
    const { data: existingTxn } = await (supabaseAdmin as any)
      .from('payment_transactions')
      .select('id, status, organization_id')
      .eq('provider_reference', txnRef)
      .single() as { data: { id: string; status: string; organization_id: string } | null };

    if (existingTxn?.status === 'success') {
      return NextResponse.json({
        success:  true,
        verified: true,
        alreadyProcessed: true,
        txnRef,
        message: 'Payment already verified and processed',
      });
    }

    // ── 3. Call Zainpay verify endpoint ────────────────────────────────────
    // Pattern: GET /virtual-account/wallet/deposit/verify/${txnRef}
    const verifyUrl = `${ZAINPAY_BASE_URL}/virtual-account/wallet/deposit/verify/${txnRef}`;
    const zainpayRes = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ZAINPAY_PUBLIC_KEY}`,
        'Content-Type':  'application/json',
      },
    });

    if (!zainpayRes.ok) {
      const errText = await zainpayRes.text();
      console.error('[Zainpay] Verify HTTP error:', zainpayRes.status, errText);
      return NextResponse.json(
        { error: 'Payment gateway error', details: errText },
        { status: 502 }
      );
    }

    const zainpayJson = await zainpayRes.json() as ZainpayVerifyResponse;
    console.log('[Zainpay] Verify response:', JSON.stringify(zainpayJson));

    // ── 4. CRITICAL: Check code === "00" — DO NOT check txnStatus ─────────
    //    Per Zainpay spec: success is data.code === "00" && data.data exists.
    //    txnStatus is unreliable — never use it as the success indicator.
    const isVerified = zainpayJson.code === '00' && Boolean(zainpayJson.data);

    if (!isVerified) {
      // Update local transaction as failed
      if (existingTxn) {
        await (supabaseAdmin as any)
          .from('payment_transactions')
          .update({ status: 'failed' })
          .eq('id', existingTxn.id);
      }

      return NextResponse.json({
        success:  false,
        verified: false,
        txnRef,
        code:     zainpayJson.code,
        message:  zainpayJson.description ?? 'Payment verification failed',
      });
    }

    // ── 5. Extract verified amount ─────────────────────────────────────────
    const rawAmount      = extractAmount(zainpayJson.data!);
    const amountNGN      = rawAmount > 1000 ? koboToNGN(rawAmount) : rawAmount; // auto-detect kobo vs NGN
    const organizationId = existingTxn?.organization_id;

    // ── 6. Update payment_transaction → success ────────────────────────────
    if (existingTxn) {
      await (supabaseAdmin as any)
        .from('payment_transactions')
        .update({ status: 'success' })
        .eq('id', existingTxn.id);
    }

    // ── 7. Activate / extend subscription ─────────────────────────────────
    if (organizationId && planId) {
      // Get current subscription — use correct column names (starts_at, expires_at)
      const { data: sub } = await (supabaseAdmin as any)
        .from('subscriptions')
        .select('id, status, expires_at')
        .eq('organization_id', organizationId)
        .single() as { data: { id: string; status: string; expires_at: string } | null };

      const now     = new Date();
      const start   = now.toISOString();
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();

      if (sub) {
        await (supabaseAdmin as any)
          .from('subscriptions')
          .update({
            status:     'active',
            plan_id:    planId,
            starts_at:  start,
            expires_at: endDate,
          })
          .eq('id', sub.id);
      } else {
        await (supabaseAdmin as any)
          .from('subscriptions')
          .insert({
            organization_id: organizationId,
            plan_id:         planId,
            status:          'active',
            starts_at:       start,
            expires_at:      endDate,
          });
      }

      // ── 8. Insert invoice record ─────────────────────────────────────────
      const invoiceNumber = generateInvoiceNumber();
      await supabaseAdmin
        .from('invoices')
        .insert({
          organization_id:        organizationId,
          subscription_id:        sub?.id ?? null,
          payment_transaction_id: existingTxn?.id ?? null,
          invoice_number:         invoiceNumber,
          amount:                 amountNGN,
          currency:               'NGN',
          status:                 'paid',
          paid_at:                new Date().toISOString(),
        } as any);

      // ── 9. Update merchant status if applicable ────────────────────────
      await (supabaseAdmin as any)
        .from('merchants')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('status', 'pending');
    }

    // ── 10. Audit log ──────────────────────────────────────────────────────
    const auditUserId = userId ?? existingTxn?.organization_id ?? 'system';
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id:       auditUserId,
        action:        'payment.verified',
        resource_type: 'payment_transaction',
        resource_id:   txnRef,
        metadata:      {
          code:      zainpayJson.code,
          amount:    amountNGN,
          planId,
          txnRef,
        },
      } as any);

    return NextResponse.json({
      success:      true,
      verified:     true,
      txnRef,
      amount:       amountNGN,
      currency:     'NGN',
      message:      'Payment verified and subscription activated',
      subscriptionActivated: Boolean(organizationId && planId),
    });

  } catch (error) {
    console.error('[payments/verify] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── POST — alternative verify trigger (for clients that prefer POST) ─────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: { txnRef?: string; planId?: string; userId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Reuse GET logic by forwarding as query params
    const url = new URL(request.url);
    if (body.txnRef)  url.searchParams.set('txnRef',  body.txnRef);
    if (body.planId)  url.searchParams.set('planId',  body.planId);
    if (body.userId)  url.searchParams.set('userId',  body.userId);

    const fakeRequest = new NextRequest(url.toString(), { method: 'GET', headers: request.headers });
    return GET(fakeRequest);

  } catch (error) {
    console.error('[payments/verify POST] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
