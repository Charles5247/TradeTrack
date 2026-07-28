/**
 * TradeTrack - Individual User Management API Routes
 * PATCH  /api/users/[id] - Update user profile / status / password.
 *                           - platform_owner: any user, any role change.
 *                           - business_owner: only admin/cashier users
 *                             within their OWN org; cannot edit another
 *                             business_owner/platform_owner, cannot
 *                             escalate a target to business_owner/
 *                             platform_owner (no self-elevation via a
 *                             lower-privileged caller either, since only
 *                             those two roles reach this branch at all).
 * DELETE /api/users/[id] - Delete user (platform_owner, or business_owner
 *                           deleting an admin/cashier within their own org)
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();
  return profile;
}

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── PATCH /api/users/[id] ─────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;
    const currentUser = await getAuthenticatedUser();
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const isPlatformOwner = currentUser.role === 'platform_owner';
    const isBusinessOwner = currentUser.role === 'business_owner';
    if (!isPlatformOwner && !isBusinessOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const serviceSupabase = getServiceClient();

    if (isBusinessOwner) {
      const { data: targetUser } = await serviceSupabase
        .from('users')
        .select('id, role, organization_id')
        .eq('id', targetUserId)
        .single();

      if (!targetUser || targetUser.organization_id !== currentUser.organization_id) {
        return NextResponse.json(
          { error: 'Forbidden: Cannot modify users outside your own organization' },
          { status: 403 }
        );
      }
      if (targetUser.role === 'business_owner' || targetUser.role === 'platform_owner') {
        return NextResponse.json(
          { error: 'Forbidden: Business Owners can only manage admin or cashier users' },
          { status: 403 }
        );
      }
    }

    const body = await request.json() as Record<string, unknown>;
    const { full_name, phone, role, status, password } = body;

    if (isBusinessOwner && role !== undefined && role !== 'admin' && role !== 'cashier') {
      return NextResponse.json(
        { error: 'Forbidden: Business Owners can only assign admin or cashier roles' },
        { status: 403 }
      );
    }

    // Build update object with only defined fields
    const profileUpdates: Database['public']['Tables']['users']['Update'] = {
      updated_at: new Date().toISOString(),
    };
    if (full_name !== undefined) profileUpdates.full_name = full_name as string;
    if (phone !== undefined) profileUpdates.phone = (phone as string) || null;
    if (role !== undefined) profileUpdates.role = role as UserRow['role'];
    if (status !== undefined) profileUpdates.status = status as UserRow['status'];

    const { data: updatedProfile, error: profileErr } = await serviceSupabase
      .from('users')
      .update(profileUpdates)
      .eq('id', targetUserId)
      .select('*')
      .single();

    if (profileErr) throw profileErr;

    // If password change requested
    if (password) {
      const pwdStr = password as string;
      if (pwdStr.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
      const { error: pwdErr } = await serviceSupabase.auth.admin.updateUserById(
        targetUserId,
        { password: pwdStr }
      );
      if (pwdErr) throw pwdErr;
    }

    // Audit log (best-effort)
    const orgId = currentUser.organization_id;
    if (orgId) {
      try {
        await serviceSupabase
          .from('audit_logs')
          .insert({
            organization_id: orgId,
            user_id: currentUser.id,
            action: password ? 'RESET_USER_PASSWORD' : 'UPDATE_USER',
            resource_type: 'user',
            resource_id: targetUserId,
            new_values: profileUpdates as Record<string, unknown>,
          });
      } catch { /* ignore */ }
    }

    return NextResponse.json({ user: updatedProfile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE /api/users/[id] ────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;
    const currentUser = await getAuthenticatedUser();
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const isPlatformOwner = currentUser.role === 'platform_owner';
    const isBusinessOwner = currentUser.role === 'business_owner';
    if (!isPlatformOwner && !isBusinessOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (targetUserId === currentUser.id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

    const serviceSupabase = getServiceClient();
    const orgId = currentUser.organization_id;

    if (isBusinessOwner) {
      const { data: targetUser } = await serviceSupabase
        .from('users')
        .select('id, role, organization_id')
        .eq('id', targetUserId)
        .single();

      if (!targetUser || targetUser.organization_id !== currentUser.organization_id) {
        return NextResponse.json(
          { error: 'Forbidden: Cannot delete users outside your own organization' },
          { status: 403 }
        );
      }
      if (targetUser.role === 'business_owner' || targetUser.role === 'platform_owner') {
        return NextResponse.json(
          { error: 'Forbidden: Business Owners can only delete admin or cashier users' },
          { status: 403 }
        );
      }
    }

    // Audit log before deletion (best-effort)
    if (orgId) {
      try {
        await serviceSupabase
          .from('audit_logs')
          .insert({
            organization_id: orgId,
            user_id: currentUser.id,
            action: 'DELETE_USER',
            resource_type: 'user',
            resource_id: targetUserId,
            new_values: { deleted: true },
          });
      } catch { /* ignore */ }
    }

    // Delete profile first (FK constraint)
    await serviceSupabase.from('users').delete().eq('id', targetUserId);

    // Delete auth user
    const { error } = await serviceSupabase.auth.admin.deleteUser(targetUserId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
