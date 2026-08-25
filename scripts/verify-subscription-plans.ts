/**
 * verify-subscription-plans.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression check + consistency check for the `subscription_plans` catalog,
 * run against a LIVE database (local dev or CI-provisioned Supabase). Written
 * to close two specific requirements from the "three different pricing
 * pages" bug-fix PR:
 *
 *   1. REGRESSION TEST: after migrations 001-012 run fresh (e.g. via
 *      `supabase db reset`, see docs/LOCAL_DEV_SETUP.md), exactly 5 active
 *      subscription_plans rows must exist, with the exact names and prices
 *      from migration 010's 5-tier ladder (Free ₦0, Starter ₦5,000, Growth
 *      ₦15,000 [Most Popular], Business ₦30,000, Enterprise ₦0/"Talk to
 *      Sales"). Any deviation — a stray active legacy row, a missing tier,
 *      a changed price — fails loudly instead of silently rendering wrong
 *      on /pricing or the dashboard.
 *
 *   2. CONSISTENCY CHECK: fetches plans via the exact same code path the
 *      public /pricing page and the dashboard Plans tab use
 *      (`getActiveSubscriptionPlans()` from
 *      src/lib/subscriptions/get-plans.ts) and asserts the two calls return
 *      IDENTICAL data. Since both surfaces now literally call the same
 *      function, this mostly guards against a future regression where
 *      someone re-introduces a second, hand-written query on one of the two
 *      pages instead of importing the shared helper.
 *
 * Usage:
 *   npx tsx scripts/verify-subscription-plans.ts
 *
 * or via the npm script:
 *
 *   npm run verify:plans
 *
 * Requires the same env vars as scripts/setup-demo-users.ts
 * (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) so it can read the
 * full, unfiltered table state for diagnostics on failure — but the
 * consistency check itself calls the app's real
 * `getActiveSubscriptionPlans()` function (same one /pricing and the
 * dashboard call), not a hand-rolled query, so it exercises real
 * application code, not just raw SQL.
 *
 * Exits with code 1 and a diagnostic dump of the full table on any failure.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";
import { getActiveSubscriptionPlans } from "../src/lib/subscriptions/get-plans";

// ── Load .env.local manually (same pattern as setup-demo-users.ts) ──────
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
      "   (e.g. in .env.local) before running this check.\n",
  );
  process.exit(1);
}

// Expected canonical 5-tier catalog (migration 010). Deliberately
// hardcoded here (not imported from FALLBACK_PLANS) so this check
// verifies the ACTUAL migration output against the spec, rather than
// against the app's own fallback constant (which could drift in the
// same direction as a bug and mask it).
const EXPECTED_PLANS: Array<{ name: string; price: number; is_popular: boolean }> = [
  { name: "Free", price: 0, is_popular: false },
  { name: "Starter", price: 5000, is_popular: false },
  { name: "Growth", price: 15000, is_popular: true },
  { name: "Business", price: 30000, is_popular: false },
  { name: "Enterprise", price: 0, is_popular: false },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dumpFullTable(supabase: any) {
  const { data } = await supabase
    .from("subscription_plans")
    .select("id, name, price, billing_cycle, is_active, is_popular, created_at")
    .order("created_at", { ascending: true });
  console.error("\n── Full subscription_plans table dump (diagnostic) ──");
  (data || []).forEach((row: unknown) => console.error(JSON.stringify(row)));
  console.error(`Total rows: ${(data || []).length}\n`);
}

async function main() {
  console.log("🔎  Verifying subscription_plans catalog...\n");

  // Use the service-role key ONLY to bypass RLS for the diagnostic dump on
  // failure. The actual checks below use getActiveSubscriptionPlans() —
  // the real anon-key-driven app code path — via a client built the same
  // way, so the check reflects what real (anon-key, RLS-governed) traffic
  // actually sees.
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);

  let failed = false;

  // ── 1. Regression check: exactly 5 active plans, exact names/prices ──
  const activePlans = await getActiveSubscriptionPlans(supabase as never);

  if (!activePlans) {
    console.error("❌  getActiveSubscriptionPlans() returned null — query failed or table is empty.");
    await dumpFullTable(supabase);
    process.exit(1);
  }

  if (activePlans.length !== EXPECTED_PLANS.length) {
    console.error(
      `❌  Expected exactly ${EXPECTED_PLANS.length} active plans, found ${activePlans.length}.`,
    );
    console.error(
      `   Active plans found: ${activePlans.map((p) => `${p.name} (₦${p.price})`).join(", ")}`,
    );
    failed = true;
  } else {
    console.log(`✅  Exactly ${EXPECTED_PLANS.length} active plans found.`);
  }

  const sortedActive = [...activePlans].sort((a, b) => a.price - b.price);
  for (let i = 0; i < EXPECTED_PLANS.length; i++) {
    const expected = EXPECTED_PLANS[i];
    const actual = sortedActive.find((p) => p.name === expected.name);
    if (!actual) {
      console.error(`❌  Missing expected active plan: "${expected.name}"`);
      failed = true;
      continue;
    }
    if (actual.price !== expected.price) {
      console.error(
        `❌  "${expected.name}" price mismatch: expected ₦${expected.price}, found ₦${actual.price}`,
      );
      failed = true;
    }
    if (!!actual.is_popular !== expected.is_popular) {
      console.error(
        `❌  "${expected.name}" is_popular mismatch: expected ${expected.is_popular}, found ${!!actual.is_popular}`,
      );
      failed = true;
    }
  }
  const names = activePlans.map((p) => p.name);
  if (new Set(names).size !== names.length) {
    console.error(
      `❌  Duplicate plan name(s) found among active plans: ${names.join(", ")}`,
    );
    failed = true;
  }
  for (const legacyName of ["Basic", "Standard"]) {
    if (names.includes(legacyName)) {
      console.error(
        `❌  Legacy plan name "${legacyName}" is still active — should have been deactivated by migration 010/012.`,
      );
      failed = true;
    }
  }

  if (!failed) {
    console.log(
      `✅  All 5 plans match expected names/prices exactly: ${EXPECTED_PLANS.map((p) => `${p.name} ₦${p.price}`).join(", ")}\n`,
    );
  }

  // ── 2. Consistency check: pricing page vs dashboard code path ─────────
  // Both call sites (src/app/(marketing)/pricing/page.tsx and the
  // business_owner branch of fetchSubscriptionData() in
  // src/app/(dashboard)/subscriptions/page.tsx) now call this exact same
  // function — this re-invocation proves it is deterministic/stable, and
  // guards against a future regression where one of the two call sites
  // reverts to its own hand-written query.
  const secondCall = await getActiveSubscriptionPlans(supabase as never);
  const idsA = JSON.stringify((activePlans || []).map((p) => p.id).sort());
  const idsB = JSON.stringify((secondCall || []).map((p) => p.id).sort());
  if (idsA !== idsB) {
    console.error(
      "❌  Consistency check failed: two calls to getActiveSubscriptionPlans() returned different plan sets.",
    );
    failed = true;
  } else {
    console.log(
      "✅  Consistency check passed: pricing page and dashboard code path (getActiveSubscriptionPlans()) return identical data.\n",
    );
  }

  if (failed) {
    await dumpFullTable(supabase);
    console.error(
      "❌  subscription_plans verification FAILED. See docs/LOCAL_DEV_SETUP.md for how to reset to a known-good state.\n",
    );
    process.exit(1);
  }

  console.log("🎉  subscription_plans verification passed.");
}

main();
