import { NextRequest, NextResponse } from 'next/server';
import { deliverPushJobs } from '@/lib/notifications/push-delivery';

export async function GET(request: NextRequest) {
  const expected = process.env.PUSH_CRON_SECRET;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await deliverPushJobs();
    if ('skipped' in result) {
      return NextResponse.json({ error: 'Web push is not configured' }, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.warn('[push-notifications] delivery unavailable', {
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Push delivery unavailable' }, { status: 503 });
  }
}
