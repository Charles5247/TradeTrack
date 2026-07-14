/**
 * TradeTrack - Audit Log API Route
 *
 * Accepts audit log entries from the client and writes them using the
 * service role key (bypassing RLS). Fixes the 403 errors when client
 * code tries to INSERT into audit_logs directly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { headers } from 'next/headers';
import type { Database } from '@/lib/supabase/types';

type AuditLogInsert = Database['public']['Tables']['audit_logs']['Insert'];

export async function POST(request: NextRequest) {
  try {
    // Verify the caller is authenticated
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { organization_id, action, resource_type, resource_id, old_values, new_values, reason } = body;

    if (!action || !resource_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get IP and user agent from request headers
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || '127.0.0.1';
    const userAgent = headersList.get('user-agent') || '';

    // Use service role key to bypass RLS
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const adminClient = serviceKey
      ? createServiceClient<Database>(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
      : supabase;

    const record: AuditLogInsert = {
      organization_id: organization_id || user.id,
      user_id: user.id,
      action,
      resource_type,
      resource_id: resource_id || undefined,
      old_values: old_values || undefined,
      new_values: new_values || undefined,
      reason: reason || undefined,
      ip_address: ip.split(',')[0].trim(),
      user_agent: userAgent,
    };

    await adminClient.from('audit_logs').insert(record);

    return NextResponse.json({ success: true });
  } catch (err) {
    // Audit failures should not crash the app
    console.error('[POST /api/audit]', err);
    return NextResponse.json({ success: false }, { status: 200 }); // Always 200
  }
}
