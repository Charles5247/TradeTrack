import { NextRequest, NextResponse } from 'next/server';
import { verifyCheckout } from '@/lib/subscriptions/zainpay-checkout';
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get('txnRef');
  if (!reference) return NextResponse.json({ error: 'txnRef is required' }, { status: 400 });
  try {
    const result = await verifyCheckout(reference);
    if (request.nextUrl.searchParams.get('redirect') === '1') {
      const destination = new URL('/subscriptions', process.env.NEXT_PUBLIC_APP_URL || request.url);
      destination.searchParams.set('payment', result.subscriptionActivated ? 'success' : result.verified ? 'sandbox' : 'pending');
      destination.searchParams.set('reference', reference);
      return NextResponse.redirect(destination, 303);
    }
    return NextResponse.json({ success: result.verified, ...result, txnRef: reference });
  } catch (error) {
    if (request.nextUrl.searchParams.get('redirect') === '1') {
      const destination = new URL('/subscriptions', process.env.NEXT_PUBLIC_APP_URL || request.url);
      destination.searchParams.set('payment', 'pending');
      destination.searchParams.set('reference', reference);
      return NextResponse.redirect(destination, 303);
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Verification unavailable', verified: false }, { status: 503 });
  }
}
export async function POST(request: NextRequest) {
  let body: { txnRef?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const url = new URL(request.url);
  if (typeof body?.txnRef !== 'string') return NextResponse.json({ error: 'txnRef is required' }, { status: 400 });
  url.search = '';
  url.searchParams.set('txnRef', body.txnRef);
  return GET(new NextRequest(url));
}
