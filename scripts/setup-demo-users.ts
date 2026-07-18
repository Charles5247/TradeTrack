/**
 * TradeTrack - Demo Users Setup Script
 * ============================================================
 * Creates real Supabase Auth users (with confirmed emails and
 * working passwords) for the demo accounts that already have
 * profile rows in `supabase/seed/001_seed_data.sql`.
 *
 * Without this script, the seed SQL only inserts rows into the
 * `users` table - it does NOT create matching Supabase Auth
 * accounts, so nobody can actually sign in with the documented
 * demo credentials. This script closes that gap.
 *
 * Usage:
 *   npx tsx scripts/setup-demo-users.ts
 *
 * Requires the following environment variables to be set
 * (e.g. via `.env.local`):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * ============================================================
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Load .env.local manually (no dotenv dependency required) ──
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const contents = fs.readFileSync(envPath, "utf-8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "\n❌  Missing required environment variables.\n" +
      "   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set\n" +
      "   (e.g. in .env.local) before running this script.\n",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_ORG_ID = "11111111-1111-1111-1111-111111111111";
const DEMO_PASSWORD = "demo1234";

interface DemoUser {
  /** MUST match the UUID in supabase/seed/001_seed_data.sql */
  id: string;
  email: string;
  full_name: string;
  role: "super_admin" | "admin" | "owner" | "manager" | "cashier";
  organization_id: string | null;
}

const DEMO_USERS: DemoUser[] = [
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "superadmin@tradetrack.ng",
    full_name: "Super Admin",
    role: "super_admin",
    organization_id: null,
  },
  {
    id: "a6000000-0000-0000-0000-000000000001",
    email: "owner@demo.com",
    full_name: "Demo Owner",
    role: "owner",
    organization_id: DEMO_ORG_ID,
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    email: "admin@demo.com",
    full_name: "Demo Admin",
    role: "admin",
    organization_id: DEMO_ORG_ID,
  },
  {
    id: "a5000000-0000-0000-0000-000000000001",
    email: "manager@demo.com",
    full_name: "Demo Manager",
    role: "manager",
    organization_id: DEMO_ORG_ID,
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    email: "cashier@demo.com",
    full_name: "Demo Cashier",
    role: "cashier",
    organization_id: DEMO_ORG_ID,
  },
];

/**
 * Search for an existing Auth user by email (case‑insensitive).
 * Uses the Admin API’s listUsers with filtering.
 */
async function findExistingAuthUserByEmail(email: string) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

/**
 * Ensure a row in public.users matches the demoUser,
 * keyed by the given authUserId (which should now match demoUser.id).
 */
async function ensureProfileRow(demoUser: DemoUser, authUserId: string) {
  const { data: existingProfile } = await supabase
    .from("users")
    .select("id")
    .eq("id", authUserId)
    .maybeSingle();

  if (existingProfile) {
    // Keep role/org in sync with this script’s source of truth
    const { error } = await supabase
      .from("users")
      .update({
        email: demoUser.email,
        full_name: demoUser.full_name,
        role: demoUser.role,
        organization_id: demoUser.organization_id,
        status: "active",
      })
      .eq("id", authUserId);
    if (error) throw error;
    return "updated";
  }

  // Insert a fresh profile row
  const { error } = await supabase.from("users").insert({
    id: authUserId,
    email: demoUser.email,
    full_name: demoUser.full_name,
    role: demoUser.role,
    organization_id: demoUser.organization_id,
    status: "active",
    settings: {},
  });
  if (error) throw error;
  return "created";
}

/**
 * Delete an Auth user (and associated public.users row, if FK is CASCADE).
 */
async function deleteAuthUser(userId: string) {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

/**
 * Main setup logic for a single demo user.
 */
async function setupDemoUser(demoUser: DemoUser) {
  console.log(`\n→ ${demoUser.email} (${demoUser.role})`);

  try {
    const existingAuthUser = await findExistingAuthUserByEmail(demoUser.email);

    let authUserId: string;

    if (existingAuthUser) {
      authUserId = existingAuthUser.id;

      // If the existing Auth user has a different ID than the seed data,
      // we must delete it and recreate with the correct UUID.
      if (authUserId !== demoUser.id) {
        console.log(
          `  ⚠ Existing Auth user has wrong ID (${authUserId}). Deleting and recreating with correct ID...`,
        );
        await deleteAuthUser(authUserId);
        console.log("  ✓ Old Auth user deleted");

        // Now create a fresh user with the correct ID
        const { data: created, error: createErr } =
          await supabase.auth.admin.createUser({
            id: demoUser.id, // ← THIS IS THE CRITICAL FIX
            email: demoUser.email,
            password: DEMO_PASSWORD,
            email_confirm: true,
            user_metadata: {
              full_name: demoUser.full_name,
              role: demoUser.role,
            },
          });

        if (createErr || !created.user) {
          throw createErr ?? new Error("Failed to create new Auth user");
        }

        authUserId = created.user.id;
        console.log(`  ✓ Auth user created with correct ID (${authUserId})`);
      } else {
        // ID matches – just update password / confirmation
        console.log(
          `  ✓ Auth user already exists with correct ID (${authUserId})`,
        );
        const { error: updateErr } = await supabase.auth.admin.updateUserById(
          authUserId,
          {
            password: DEMO_PASSWORD,
            email_confirm: true,
            user_metadata: {
              full_name: demoUser.full_name,
              role: demoUser.role,
            },
          },
        );
        if (updateErr) {
          console.warn(`  ⚠ Could not reset password: ${updateErr.message}`);
        } else {
          console.log("  ✓ Password reset to demo password");
        }
      }
    } else {
      // No existing user – create with the correct UUID
      console.log("  No existing Auth user found, creating...");
      const { data: created, error: createErr } =
        await supabase.auth.admin.createUser({
          id: demoUser.id,
          email: demoUser.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: demoUser.full_name, role: demoUser.role },
        });

      if (createErr || !created.user) {
        throw createErr ?? new Error("Failed to create Auth user");
      }

      authUserId = created.user.id;
      console.log(`  ✓ Auth user created (id: ${authUserId})`);
    }

    // Ensure the public.users profile row exists (using the correct ID)
    const profileResult = await ensureProfileRow(demoUser, authUserId);
    console.log(`  ✓ Profile row ${profileResult} in users table`);

    console.log(`  ✅ Done: ${demoUser.email} / ${DEMO_PASSWORD}`);
    return { email: demoUser.email, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error(`  ❌ Failed: ${message}`);
    return { email: demoUser.email, success: false, error: message };
  }
}

async function main() {
  console.log("============================================================");
  console.log("TradeTrack - Demo Users Setup");
  console.log("============================================================");
  console.log(`Target Supabase project: ${SUPABASE_URL}`);

  const results = [];
  for (const demoUser of DEMO_USERS) {
    results.push(await setupDemoUser(demoUser));
  }

  console.log("\n============================================================");
  console.log("Summary");
  console.log("============================================================");
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  succeeded.forEach((r) => console.log(`  ✅ ${r.email}`));
  failed.forEach((r) => console.log(`  ❌ ${r.email}: ${r.error}`));

  console.log(
    `\n${succeeded.length}/${results.length} demo users ready. Password for all: ${DEMO_PASSWORD}\n`,
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal error while setting up demo users:", err);
  process.exit(1);
});
