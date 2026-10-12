import { NextResponse } from 'next/server';
import { getDownloadInfo } from '@/lib/downloads/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ...getDownloadInfo(),
    deployment_id: process.env.NEXT_PUBLIC_DEPLOYMENT_ID ?? 'local',
    checked_at: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
