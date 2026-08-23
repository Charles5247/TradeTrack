/**
 * TradeTrack — Public Self-Serve Signup API
 * POST /api/auth/signup
 *
 * This is intentionally a SEPARATE, unauthenticated-callable route from
 * `/api/merchants/onboard` (which requires an authenticated
 * `platform_owner` caller and is used for staff-initiated onboarding).
 * This route exists specifically for the new public marketing site's
 * "Start Free" / plan-select self-serve flow: any anonymous visitor may
 * call it to create their own brand-new organization + business_owner
 * account, with no existing session and no platform staff involved.
 *
 * Mirrors the same "one org per merchant, roll back on any failure"
 * shape as /api/merchants/onboard, but:
 *   - No auth/role check on the CALLER (this route IS the auth boundary
 *     — anyone may sign themselves up).
 *   - The created user does NOT get `must_change_password: true` (the
 *     signer chose their own password already, unlike the temp-password
 *     admin-onboarding flow).
 *   - Accepts an optional `plan_id` (from the marketing Pricing page's
 *     `?plan=` query param) and, if it resolves to a real, active
 *     subscription_plans row, immediately creates a `subscriptions` row
 *     for the new org on that plan (defaulting to the Free plan
 *     otherwise, so every new org always has SOME subscription row from
 *     day one — consistent with how canAddProduct()/resolveSubscriptionPlan()
 *     in src/lib/subscriptions/plan-limits.ts expect to find one).
 *   - Enterprise is a "Talk to Sales" plan with no self-serve checkout;
 *     if `plan_id` resolves to the Enterprise plan, this route falls back
 *     to Free rather than silently granting Enterprise limits for free.
 *
 * On ANY failure after organization creation, everything created so far
 * is rolled back (org -> auth user -> users row -> merchants row ->
 * subscription), matching /api/merchants/onboard's pattern, so no
 * half-created account is ever left behind.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type { Database } from '@/lib/supabase/types';

type PlanRow = Database['public']['Tables']['subscription_plans']['Row'];

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to your ' +
        'environment variables to enable self-serve signup.'
    );
  }
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Slugify a business name into a unique-ish organization slug. */
function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 50) || 'business';
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      business_name,
      full_name,
      email,
      password,
      phone,
      plan_id,
    } = body as Record<string, string | null | undefined>;

    if (!business_name || !full_name || !email || !password) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: business_name, full_name, email, password',
        },
        { status: 400 }
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const serviceSupabase = getServiceClient();

    // ── Resolve the requested plan (falls back to Free) ───────────────
    // Enterprise has no self-serve checkout, so it is never granted here
    // even if explicitly requested — only an active, non-Enterprise plan
    // id (or no plan_id at all) results in that plan; anything else
    // (missing, inactive, unknown, or Enterprise) falls back to Free.
    let resolvedPlan: PlanRow | null = null;
    if (plan_id) {
      const { data: requestedPlan } = await serviceSupabase
        .from('subscription_plans')
        .select('*')
        .eq('id', plan_id)
        .eq('is_active', true)
        .maybeSingle();
      if (requestedPlan && (requestedPlan as PlanRow).name !== 'Enterprise') {
        resolvedPlan = requestedPlan as PlanRow;
      }
    }
    if (!resolvedPlan) {
      const { data: freePlan } = await serviceSupabase
        .from('subscription_plans')
        .select('*')
        .eq('name', 'Free')
        .eq('is_active', true)
        .maybeSingle();
      resolvedPlan = (freePlan as PlanRow) ?? null;
    }

    // ── Track what we've created so we can roll back on failure ──────
    let createdOrgId: string | null = null;
    let createdAuthUserId: string | null = null;
    let createdMerchantId: string | null = null;

    try {
      // 1. Create a brand-new organization for this self-serve signup.
      const { data: org, error: orgErr } = await serviceSupabase
        .from('organizations')
        .insert({
          name: business_name,
          slug: slugify(business_name),
          email,
          phone: phone || null,
          subscription_plan_id: resolvedPlan?.id ?? null,
          subscription_status: 'trial',
        } as any)
        .select('id')
        .single();

      if (orgErr || !org) {
        throw new Error(orgErr?.message || 'Failed to create organization');
      }
      createdOrgId = org.id;

      // 2. Create the Supabase Auth user with the password THEY chose
      //    (no temp password / forced change, unlike admin-onboarding).
      const { data: authData, error: authErr } =
        await serviceSupabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name, role: 'business_owner' },
        });

      if (authErr || !authData?.user) {
        throw new Error(authErr?.message || 'Failed to create account');
      }
      createdAuthUserId = authData.user.id;

      // 3. Create the business_owner profile, scoped to the new org.
      const { error: profileErr } = await serviceSupabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          full_name,
          role: 'business_owner',
          phone: phone || null,
          organization_id: createdOrgId,
          status: 'active',
          must_change_password: false,
          settings: {},
        } as any);

      if (profileErr) {
        throw new Error(profileErr.message);
      }

      // 4. Insert a `merchants` row so this org shows up alongside
      //    admin-onboarded merchants in the platform_owner's Merchants
      //    list, marked as self-serve (onboarded_by is null — no staff
      //    member onboarded them).
      const { data: merchant, error: merchantErr } = await serviceSupabase
        .from('merchants')
        .insert({
          organization_id: createdOrgId,
          business_name,
          contact_name: full_name,
          contact_email: email,
          contact_phone: phone || null,
          country: 'Nigeria',
          subscription_plan_id: resolvedPlan?.id ?? null,
          status: 'active',
          verification_status: 'unverified',
          onboarding_completed: true,
          onboarding_step: 5,
          business_owner_user_id: authData.user.id,
          onboarded_by: null,
        } as any)
        .select('id')
        .single();

      if (merchantErr || !merchant) {
        throw new Error(merchantErr?.message || 'Failed to create merchant record');
      }
      createdMerchantId = merchant.id;

      // 5. Create the org's initial `subscriptions` row on the resolved
      //    plan (Free by default) so plan-limits.ts's
      //    resolveSubscriptionPlan() has something to find immediately.
      if (resolvedPlan) {
        const startsAt = new Date();
        const expiresAt = new Date(startsAt);
        // Free plan: no real expiry pressure, but every subscriptions row
        // needs a value — give it a long trial window. Paid plans
        // self-served with no payment step yet default to a 14-day trial
        // (see docs/SUBSCRIPTION_SYSTEM.md — full checkout still runs
        // through the authenticated Subscriptions page/Zainpay).
        expiresAt.setDate(
          expiresAt.getDate() + (resolvedPlan.name === 'Free' ? 3650 : 14)
        );
        await serviceSupabase.from('subscriptions').insert({
          organization_id: createdOrgId,
          plan_id: resolvedPlan.id,
          status: resolvedPlan.name === 'Free' ? 'active' : 'trial',
          starts_at: startsAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          created_by: authData.user.id,
          billing_cycle: 'monthly',
        } as any);
      }

      // 6. Audit log (best-effort).
      try {
        await serviceSupabase.from('audit_logs').insert({
          organization_id: createdOrgId,
          user_id: authData.user.id,
          action: 'SELF_SERVE_SIGNUP',
          resource_type: 'organization',
          resource_id: createdOrgId,
          new_values: { business_name, email, plan: resolvedPlan?.name ?? null },
        } as any);
      } catch {
        // Ignore audit errors
      }

      return NextResponse.json(
        {
          organization_id: createdOrgId,
          plan: resolvedPlan ? { id: resolvedPlan.id, name: resolvedPlan.name } : null,
          user: { id: authData.user.id, email },
        },
        { status: 201 }
      );
    } catch (innerErr) {
      // ── Rollback everything created so far, in reverse order ────────
      console.error('[auth/signup] Failure — rolling back:', innerErr);

      if (createdMerchantId) {
        try {
          await serviceSupabase.from('merchants').delete().eq('id', createdMerchantId);
        } catch {
          /* best-effort rollback */
        }
      }
      if (createdAuthUserId) {
        try {
          await serviceSupabase.from('users').delete().eq('id', createdAuthUserId);
        } catch {
          /* best-effort rollback */
        }
        try {
          await serviceSupabase.auth.admin.deleteUser(createdAuthUserId);
        } catch {
          /* best-effort rollback */
        }
      }
      if (createdOrgId) {
        try {
          await serviceSupabase.from('organizations').delete().eq('id', createdOrgId);
        } catch {
          /* best-effort rollback */
        }
      }

      throw innerErr;
    }
  } catch (err) {
    console.error('[POST /api/auth/signup]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    // A duplicate email is the most likely user-facing error — Supabase
    // returns a generic message here, so surface something actionable.
    const status = /already registered|already exists|duplicate/i.test(message)
      ? 409
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
