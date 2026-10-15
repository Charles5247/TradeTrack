import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { TRIAL_PLAN_ID } from "@/lib/subscriptions/signup-trial";
import type { Database } from "@/lib/supabase/types";

type PlanRow = Database["public"]["Tables"]["subscription_plans"]["Row"];

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to your " +
        "environment variables to enable self-serve signup.",
    );
  }
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Slugify a business name into a unique-ish organization slug. */
function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 50) || "business";
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { business_name, full_name, email, password, phone, plan_id } =
      body as Record<string, string | null | undefined>;

    if (!business_name || !full_name || !email || !password) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: business_name, full_name, email, password",
        },
        { status: 400 },
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const serviceSupabase = getServiceClient();

    // The Business plan is selected now; trial access starts only after
    // platform-owner verification of the submitted business registration.
    const { data: trialPlan, error: planError } = await serviceSupabase
      .from("subscription_plans").select("*").eq("id", TRIAL_PLAN_ID).single();
    if (planError || !trialPlan) throw new Error("The trial plan is unavailable. Please contact support.");
    const resolvedPlan = trialPlan as PlanRow;

    // ── Track what we've created so we can roll back on failure ──────
    let createdOrgId: string | null = null;
    let createdAuthUserId: string | null = null;
    let createdMerchantId: string | null = null;

    try {
      // 1. Create a brand-new organization for this self-serve signup.
      const { data: org, error: orgErr } = await serviceSupabase
        .from("organizations")
        .insert({
          name: business_name,
          slug: slugify(business_name),
          email,
          phone: phone || null,
          subscription_plan_id: resolvedPlan?.id ?? null,
          subscription_status: "suspended",
        } as any)
        .select("id")
        .single();

      if (orgErr || !org) {
        throw new Error(orgErr?.message || "Failed to create organization");
      }
      createdOrgId = org.id;

      // 2. Create the Supabase Auth user with the password THEY chose
      //    (no temp password / forced change, unlike admin-onboarding).
      const { data: authData, error: authErr } =
        await serviceSupabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name, role: "business_owner" },
        });

      if (authErr || !authData?.user) {
        throw new Error(authErr?.message || "Failed to create account");
      }
      createdAuthUserId = authData.user.id;

      // 3. Create the business_owner profile, scoped to the new org.
      const { error: profileErr } = await serviceSupabase.from("users").insert({
        id: authData.user.id,
        email,
        full_name,
        role: "business_owner",
        phone: phone || null,
        organization_id: createdOrgId,
        status: "active",
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
        .from("merchants")
        .insert({
          organization_id: createdOrgId,
          business_name,
          contact_name: full_name,
          contact_email: email,
          contact_phone: phone || null,
          country: "Nigeria",
          subscription_plan_id: resolvedPlan?.id ?? null,
          status: "active",
          verification_status: "unverified",
          onboarding_completed: true,
          onboarding_step: 5,
          business_owner_user_id: authData.user.id,
          onboarded_by: null,
        } as any)
        .select("id")
        .single();

      if (merchantErr || !merchant) {
        throw new Error(
          merchantErr?.message || "Failed to create merchant record",
        );
      }
      createdMerchantId = merchant.id;

      // 6. Audit log (best-effort).
      try {
        await serviceSupabase.from("audit_logs").insert({
          organization_id: createdOrgId,
          user_id: authData.user.id,
          action: "SELF_SERVE_SIGNUP",
          resource_type: "organization",
          resource_id: createdOrgId,
          new_values: {
            business_name,
            email,
            plan: resolvedPlan?.name ?? null,
          },
        } as any);
      } catch {
        // Ignore audit errors
      }

      return NextResponse.json(
        {
          organization_id: createdOrgId,
          plan: null,
          trial_status: "pending_verification",
          user: { id: authData.user.id, email },
        },
        { status: 201 },
      );
    } catch (innerErr) {
      // ── Rollback everything created so far, in reverse order ────────
      console.error("[auth/signup] Failure — rolling back:", innerErr);

      if (createdMerchantId) {
        try {
          await serviceSupabase
            .from("merchants")
            .delete()
            .eq("id", createdMerchantId);
        } catch {
          /* best-effort rollback */
        }
      }
      if (createdAuthUserId) {
        try {
          await serviceSupabase
            .from("users")
            .delete()
            .eq("id", createdAuthUserId);
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
          await serviceSupabase
            .from("organizations")
            .delete()
            .eq("id", createdOrgId);
        } catch {
          /* best-effort rollback */
        }
      }

      throw innerErr;
    }
  } catch (err) {
    console.error("[POST /api/auth/signup]", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    // A duplicate email is the most likely user-facing error — Supabase
    // returns a generic message here, so surface something actionable.
    const status = /already registered|already exists|duplicate/i.test(message)
      ? 409
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
