import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

// ─── Zainpay configuration ──────────────────────────────────────────────────
const ZAINPAY_PUBLIC_KEY  = process.env.ZAINPAY_PUBLIC_KEY  ?? '';
const ZAINPAY_PRIVATE_KEY = process.env.ZAINPAY_PRIVATE_KEY ?? '';
const ZAINPAY_BASE_URL    = process.env.ZAINPAY_BASE_URL    ?? 'https://sandbox.zainpay.ng';
const APP_URL             = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// ─── Supabase service-role client ────────────────────────────────────────────
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Types ───────────────────────────────────────────────────────────────────
interface InitializePaymentBody {
  /** Amount in kobo (NGN × 100). e.g. 5000 = ₦50 */
  amount: number;
  /** Subscription plan id being purchased */
  planId: string;
  /** Customer's full name */
  name: string;
  /** Customer's email */
  email: string;
  /** Customer's mobile (optional) */
  mobile?: string;
  /** Zainbox code assigned to this merchant */
  zainboxCode?: string;
  /** Client-generated transaction reference */
  txnRef?: string;
}

interface ZainpayInitResponse {
  code: string;
  description: string;
  data?: {
    authorizationUrl?: string;
    paymentUrl?: string;
    reference?: string;
    txnRef?: string;
    [key: string]: unknown;
  };
}

// ─── POST /api/payments/initialize ───────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Auth check ──────────────────────────────────────────────────────
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // ── 2. Validate environment ────────────────────────────────────────────
    if (!ZAINPAY_PUBLIC_KEY) {
      console.error('[Zainpay] ZAINPAY_PUBLIC_KEY is not configured');
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 503 });
    }

    // ── 3. Parse & validate body ───────────────────────────────────────────
    let body: InitializePaymentBody;
    try {
      body = await request.json() as InitializePaymentBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { amount, planId, name, email, mobile, zainboxCode, txnRef: clientTxnRef } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    // ── 4. Get user profile & organization ────────────────────────────────
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('id, organization_id, email, full_name')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // ── 5. Build Zainpay transaction reference ─────────────────────────────
    const txnRef = clientTxnRef ?? `TT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const callbackUrl = `${APP_URL}/api/payments/verify?txnRef=${txnRef}&planId=${planId}&userId=${user.id}`;

    // ── 6. Build Zainpay payload ───────────────────────────────────────────
    // CRITICAL: amount MUST be String(amount) per Zainpay spec
    const zainpayPayload = {
      amount:      String(amount),        // ← required as string
      txnRef,
      mobileNumber: mobile ?? '',
      zainboxCode:  zainboxCode ?? process.env.ZAINPAY_DEFAULT_ZAINBOX ?? '',
      emailAddress: email,
      callbackUrl,
      name:         name || profile.full_name || email,
    };

    // ── 7. Call Zainpay initialization endpoint ────────────────────────────
    const zainpayRes = await fetch(`${ZAINPAY_BASE_URL}/zainbox/card/initialize/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAINPAY_PUBLIC_KEY}`,
      },
      body: JSON.stringify(zainpayPayload),
    });

    if (!zainpayRes.ok) {
      const errText = await zainpayRes.text();
      console.error('[Zainpay] Init failed:', zainpayRes.status, errText);
      return NextResponse.json(
        { error: 'Payment gateway error', details: errText },
        { status: 502 }
      );
    }

    const zainpayData = await zainpayRes.json() as ZainpayInitResponse;
    console.log('[Zainpay] Init response:', JSON.stringify(zainpayData));

    // ── 8. Check Zainpay response code ─────────────────────────────────────
    if (zainpayData.code !== '00') {
      return NextResponse.json(
        { error: zainpayData.description ?? 'Payment initialization failed' },
        { status: 400 }
      );
    }

    // ── 9. Record pending payment_transaction in DB ────────────────────────
    // Use provider_reference for txnRef; provider_response for metadata
    if (profile.organization_id) {
      await supabaseAdmin
        .from('payment_transactions')
        .insert({
          organization_id:    profile.organization_id,
          plan_id:            planId,
          amount:             amount / 100,         // store in NGN
          currency:           'NGN',
          payment_method:     'transfer',
          status:             'pending',
          provider:           'zainpay',
          provider_reference: txnRef,
          initiated_by:       user.id,
        } as any);
    }

    // ── 10. Audit log ──────────────────────────────────────────────────────
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id:       user.id,
        action:        'payment.initialize',
        resource_type: 'payment_transaction',
        resource_id:   txnRef,
        metadata:      { planId, amount, email },
      } as any);

    // ── 11. Return payment URL ─────────────────────────────────────────────
    const paymentUrl = zainpayData.data?.authorizationUrl
      ?? zainpayData.data?.paymentUrl
      ?? null;

    return NextResponse.json({
      success:    true,
      txnRef,
      paymentUrl,
      reference:  zainpayData.data?.reference ?? txnRef,
      data:       zainpayData.data,
    });

  } catch (error) {
    console.error('[payments/initialize] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── GET — health probe ───────────────────────────────────────────────────────
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint:    'POST /api/payments/initialize',
    gateway:     'Zainpay',
    environment: ZAINPAY_BASE_URL.includes('sandbox') ? 'sandbox' : 'live',
    configured:  Boolean(ZAINPAY_PUBLIC_KEY && ZAINPAY_PRIVATE_KEY),
  });
}
