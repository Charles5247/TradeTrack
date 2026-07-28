/**
 * TradeTrack — Merchant Onboarding API
 * POST /api/merchants/onboard
 *
 * Replaces the old "insert merchant under creator's own org" flow with a
 * fully isolated per-merchant onboarding:
 *   1. Create a NEW `organizations` row for this merchant (never reuse the
 *      creator's org — every merchant gets its own tenant).
 *   2. Generate a secure temporary password server-side.
 *   3. Create a Supabase Auth user for the merchant's contact, with
 *      `role: 'business_owner'` scoped to the new organization and
 *      `must_change_password: true` (forces the change-password gate on
 *      first login — see /change-password).
 *   4. Insert the `merchants` row, linked to the new org AND to the new
 *      business_owner user via `business_owner_user_id`, plus
 *      `onboarded_by` recording which platform_owner/business_owner
 *      created it (audit trail).
 *   5. Best-effort: create a dedicated Zainpay virtual account for the new
 *      organization (non-fatal if Zainpay isn't configured — plan/payment
 *      setup can be completed later).
 *   6. On ANY failure after step 1, roll back everything created so far
 *      (auth user → merchants row → organization) so we never leave a
 *      half-onboarded merchant behind.
 *
 * Access: only `platform_owner` may onboard NEW merchants (each merchant
 * becomes its own organization — this is a cross-tenant operation that a
 * business_owner, being confined to their own org, must never be able to
 * perform). This mirrors the `merchants_insert_platform_owner` RLS policy
 * from migration 008, enforced here again at the API layer since this
 * route uses the service-role client (which bypasses RLS).
 *
 * The generated temporary password is returned ONCE in the response body
 * for the Create Merchant UI to display — this pass has no email provider
 * wired up (zero-dependency fallback, per spec). It is never persisted in
 * plaintext anywhere and is not retrievable again after this response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import type { Database } from '@/lib/supabase/types';
import { createMerchantVirtualAccount, ZainpayNotConfiguredError } from '@/lib/zainpay';

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
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
        'Add it to your environment variables to enable merchant onboarding.'
    );
  }
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Generate a secure, human-typeable temporary password. */
function generateTempPassword(): string {
  // 12 chars: mix of upper/lower/digits, avoiding ambiguous look-alikes.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += alphabet[bytes[i] % alphabet.length];
  }
  // Guarantee at least one digit and one uppercase letter for basic
  // password-strength policies.
  return `${pwd}9K`;
}

/** Slugify a business name into a unique-ish organization slug. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50) || 'merchant';
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getAuthenticatedUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (currentUser.role !== 'platform_owner') {
      return NextResponse.json(
        { error: 'Forbidden: Only Platform Owners can onboard new merchants' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      business_name,
      business_type,
      registration_number,
      tax_id,
      contact_name,
      contact_email,
      contact_phone,
      address,
      city,
      state,
      country,
      notes,
      subscription_plan_id,
    } = body as Record<string, string | null | undefined>;

    if (!business_name || !contact_name || !contact_email) {
      return NextResponse.json(
        { error: 'Missing required fields: business_name, contact_name, contact_email' },
        { status: 400 }
      );
    }

    const serviceSupabase = getServiceClient();

    // ── Track what we've created so we can roll back on failure ──────────
    let createdOrgId: string | null = null;
    let createdAuthUserId: string | null = null;
    let createdMerchantId: string | null = null;

    try {
      // 1. Create a brand-new organization for this merchant.
      const { data: org, error: orgErr } = await serviceSupabase
        .from('organizations')
        .insert({
          name: business_name,
          slug: slugify(business_name),
          email: contact_email,
          phone: contact_phone || null,
          address: address || null,
          subscription_plan_id: subscription_plan_id || null,
          subscription_status: 'trial',
        } as any)
        .select('id')
        .single();

      if (orgErr || !org) {
        throw new Error(orgErr?.message || 'Failed to create organization');
      }
      createdOrgId = org.id;

      // 2. Generate temp password + create the business_owner auth user.
      const tempPassword = generateTempPassword();

      const { data: authData, error: authErr } = await serviceSupabase.auth.admin.createUser({
        email: contact_email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: contact_name, role: 'business_owner' },
      });

      if (authErr || !authData?.user) {
        throw new Error(authErr?.message || 'Failed to create business owner account');
      }
      createdAuthUserId = authData.user.id;

      // 3. Create the business_owner profile, scoped to the NEW org, with
      //    must_change_password forced for the first-login gate.
      const { error: profileErr } = await serviceSupabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: contact_email,
          full_name: contact_name,
          role: 'business_owner' as UserRow['role'],
          phone: contact_phone || null,
          organization_id: createdOrgId,
          status: 'active' as UserRow['status'],
          must_change_password: true,
          settings: {},
        } as any);

      if (profileErr) {
        throw new Error(profileErr.message);
      }

      // 4. Insert the merchants row, linked to both the org and the new
      //    business_owner user, plus who onboarded them.
      const { data: merchant, error: merchantErr } = await serviceSupabase
        .from('merchants')
        .insert({
          organization_id: createdOrgId,
          business_name,
          business_type: business_type || null,
          registration_number: registration_number || null,
          tax_id: tax_id || null,
          contact_name,
          contact_email,
          contact_phone: contact_phone || null,
          address: address || null,
          city: city || null,
          state: state || null,
          country: country || 'Nigeria',
          notes: notes || null,
          subscription_plan_id: subscription_plan_id || null,
          status: 'pending',
          verification_status: 'unverified',
          onboarding_completed: false,
          onboarding_step: 1,
          business_owner_user_id: authData.user.id,
          onboarded_by: currentUser.id,
        } as any)
        .select('id')
        .single();

      if (merchantErr || !merchant) {
        throw new Error(merchantErr?.message || 'Failed to create merchant record');
      }
      createdMerchantId = merchant.id;

      // 5. Best-effort Zainpay dedicated virtual account (non-fatal).
      let virtualAccount: { accountNumber: string; bankName: string; accountName: string } | null = null;
      try {
        const vacct = await createMerchantVirtualAccount({
          organizationId: createdOrgId,
          businessName: business_name,
          contactEmail: contact_email,
          contactPhone: contact_phone,
        });
        await serviceSupabase
          .from('organizations')
          .update({
            zainpay_virtual_account_number: vacct.accountNumber,
            zainpay_virtual_account_bank: vacct.bankName,
            zainpay_virtual_account_name: vacct.accountName,
            zainpay_customer_reference: vacct.customerRef,
          } as any)
          .eq('id', createdOrgId);
        virtualAccount = {
          accountNumber: vacct.accountNumber,
          bankName: vacct.bankName,
          accountName: vacct.accountName,
        };
      } catch (vacctErr) {
        if (vacctErr instanceof ZainpayNotConfiguredError) {
          console.warn('[merchants/onboard]', vacctErr.message);
        } else {
          console.error('[merchants/onboard] Zainpay virtual account creation failed (non-fatal):', vacctErr);
        }
      }

      // 6. Audit log (best-effort).
      try {
        await serviceSupabase
          .from('audit_logs')
          .insert({
            organization_id: createdOrgId,
            user_id: currentUser.id,
            action: 'ONBOARD_MERCHANT',
            resource_type: 'merchant',
            resource_id: createdMerchantId,
            new_values: { business_name, contact_email },
          } as any);
      } catch {
        // Ignore audit errors
      }

      return NextResponse.json(
        {
          merchant,
          organization_id: createdOrgId,
          business_owner: {
            id: authData.user.id,
            email: contact_email,
            temp_password: tempPassword,
          },
          virtual_account: virtualAccount,
        },
        { status: 201 }
      );
    } catch (innerErr) {
      // ── Rollback everything created so far, in reverse order ──────────
      console.error('[merchants/onboard] Failure — rolling back:', innerErr);

      if (createdMerchantId) {
        try {
          await serviceSupabase.from('merchants').delete().eq('id', createdMerchantId);
        } catch { /* best-effort rollback */ }
      }
      if (createdAuthUserId) {
        try {
          await serviceSupabase.from('users').delete().eq('id', createdAuthUserId);
        } catch { /* best-effort rollback */ }
        try {
          await serviceSupabase.auth.admin.deleteUser(createdAuthUserId);
        } catch { /* best-effort rollback */ }
      }
      if (createdOrgId) {
        try {
          await serviceSupabase.from('organizations').delete().eq('id', createdOrgId);
        } catch { /* best-effort rollback */ }
      }

      throw innerErr;
    }
  } catch (err) {
    console.error('[POST /api/merchants/onboard]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
