/**
 * TradeTrack - User Management API Routes
 * POST   /api/users   - Create a new user (super_admin only)
 * GET    /api/users   - List all users for the organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/supabase/types';

type UserRow = Database['public']['Tables']['users']['Row'];

async function getAuthenticatedUser(): Promise<UserRow | null> {
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

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile;
}

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
        'Add it to your environment variables to enable user management.'
    );
  }
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── POST /api/users ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getAuthenticatedUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (currentUser.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only Super Admins can create users' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, full_name, role, phone, password, organization_id } = body as Record<string, string>;

    if (!email || !full_name || !role || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: email, full_name, role, password' },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (!['super_admin', 'admin', 'cashier'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const serviceSupabase = getServiceClient();
    const orgId = organization_id || currentUser.organization_id || '';

    // 1. Create auth user
    const { data: authData, error: authErr } = await serviceSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    // 2. Create profile in users table
    const { data: profile, error: profileErr } = await serviceSupabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        full_name,
        role: role as UserRow['role'],
        phone: phone || null,
        organization_id: orgId,
        status: 'active' as UserRow['status'],
        settings: {},
      })
      .select('*')
      .single();

    if (profileErr) {
      // Rollback auth user
      await serviceSupabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // 3. Audit log (best-effort)
    if (orgId) {
      try {
        await serviceSupabase
          .from('audit_logs')
          .insert({
            organization_id: orgId,
            user_id: currentUser.id,
            action: 'CREATE_USER',
            resource_type: 'user',
            resource_id: authData.user.id,
            new_values: { email, full_name, role },
          });
      } catch {
        // Ignore audit errors
      }
    }

    return NextResponse.json({ user: profile }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/users]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── GET /api/users ────────────────────────────────────────────

export async function GET() {
  try {
    const currentUser = await getAuthenticatedUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (currentUser.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const serviceSupabase = getServiceClient();
    const { data: users, error } = await serviceSupabase
      .from('users')
      .select('*')
      .eq('organization_id', currentUser.organization_id ?? '')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
