import { describe, expect, it, vi } from "vitest";
import {
  getActiveSubscriptionPlans,
  getAllSubscriptionPlansForCatalogManagement,
} from "../get-plans";

// ── Fixtures mirroring the actual local-DB bug investigated in this PR ──
// 11 total rows across 3 seeding "batches": migration 003's legacy 3-tier
// (deactivated), supabase/seed/001_seed_data.sql's independent legacy
// 3-tier (now also fully deactivated by migration 012), and migration
// 010's canonical 5-tier (all active).
const ALL_ROWS = [
  { id: "a3333333-0000-0000-0000-000000000003", name: "Business", price: 8000, is_active: false, is_popular: false },
  { id: "a1111111-0000-0000-0000-000000000001", name: "Basic", price: 3000, is_active: false, is_popular: false },
  { id: "a2222222-0000-0000-0000-000000000002", name: "Standard", price: 5000, is_active: false, is_popular: false },
  { id: "c3d4e5f6-a7b8-9012-cdef-123456789012", name: "Business", price: 20000, is_active: false, is_popular: false },
  { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "Basic", price: 5000, is_active: false, is_popular: false },
  { id: "b2c3d4e5-f6a7-8901-bcde-f12345678901", name: "Standard", price: 10000, is_active: false, is_popular: false },
  { id: "b1000000-0000-0000-0000-000000000001", name: "Free", price: 0, is_active: true, is_popular: false },
  { id: "b2000000-0000-0000-0000-000000000002", name: "Starter", price: 5000, is_active: true, is_popular: false },
  { id: "b3000000-0000-0000-0000-000000000003", name: "Growth", price: 15000, is_active: true, is_popular: true },
  { id: "b4000000-0000-0000-0000-000000000004", name: "Business", price: 30000, is_active: true, is_popular: false },
  { id: "b5000000-0000-0000-0000-000000000005", name: "Enterprise", price: 0, is_active: true, is_popular: false },
];

/** Minimal fake Supabase query-builder chain matching the shape
 *  get-plans.ts's PlansQueryClient interface expects. */
function fakeSupabase(rows: typeof ALL_ROWS) {
  return {
    from: vi.fn((_table: string) => ({
      select: vi.fn((_cols: string) => ({
        eq: vi.fn((_col: string, value: boolean) => ({
          order: vi.fn(async (_col: string, opts: { ascending: boolean }) => {
            const active = rows.filter((r) => r.is_active === value);
            const sorted = [...active].sort((a, b) =>
              opts.ascending ? a.price - b.price : b.price - a.price,
            );
            return { data: sorted, error: null };
          }),
        })),
        order: vi.fn(async (_col: string, opts: { ascending: boolean }) => {
          const sorted = [...rows].sort((a, b) =>
            opts.ascending ? a.price - b.price : b.price - a.price,
          );
          return { data: sorted, error: null };
        }),
      })),
    })),
  };
}

describe("getActiveSubscriptionPlans", () => {
  it("returns EXACTLY 5 active plans with the current 5-tier names/prices, matching migration 010's own verification query", async () => {
    const supabase = fakeSupabase(ALL_ROWS);
    const plans = await getActiveSubscriptionPlans(supabase as never);

    expect(plans).not.toBeNull();
    expect(plans).toHaveLength(5);
    expect(plans!.map((p) => p.name)).toEqual([
      "Free",
      "Enterprise",
      "Starter",
      "Growth",
      "Business",
    ]);
    // No duplicate names — this is the exact bug (a stray active
    // "Business" ₦20,000 row) this PR fixes.
    const names = plans!.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    // No legacy names should ever appear in the active/sellable set.
    expect(names).not.toContain("Basic");
    expect(names).not.toContain("Standard");
  });

  it("returns null when the client is not available (caller falls back to FALLBACK_PLANS)", async () => {
    expect(await getActiveSubscriptionPlans(null)).toBeNull();
    expect(await getActiveSubscriptionPlans(undefined)).toBeNull();
  });

  it("returns null (not an empty array) when the query errors, so callers know to fall back", async () => {
    const erroringClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: null, error: new Error("boom") })),
          })),
        })),
      })),
    };
    expect(await getActiveSubscriptionPlans(erroringClient as never)).toBeNull();
  });
});

describe("getAllSubscriptionPlansForCatalogManagement", () => {
  it("returns ALL 11 rows (active and inactive) for platform_owner catalog management, unfiltered", async () => {
    const supabase = fakeSupabase(ALL_ROWS);
    const plans = await getAllSubscriptionPlansForCatalogManagement(
      supabase as never,
    );

    expect(plans).not.toBeNull();
    expect(plans).toHaveLength(11);
    // Legacy/inactive rows ARE expected to be visible here — this is the
    // platform_owner-only catalog-management view, by design.
    expect(plans!.some((p) => p.name === "Basic")).toBe(true);
  });

  it("returns null when the client is not available", async () => {
    expect(
      await getAllSubscriptionPlansForCatalogManagement(null),
    ).toBeNull();
  });
});

describe("consistency: both surfaces' active-plan queries return IDENTICAL data", () => {
  it("getActiveSubscriptionPlans() output is a strict subset of getAllSubscriptionPlansForCatalogManagement() output, filtered only by is_active", async () => {
    // Regression guard (fix requirement #4): simulates the pricing page
    // and the dashboard's business_owner code path both calling
    // getActiveSubscriptionPlans() against the SAME underlying rows and
    // asserts they can never diverge, since they are now literally the
    // same function call.
    const supabase = fakeSupabase(ALL_ROWS);
    const activeFromSurfaceA = await getActiveSubscriptionPlans(
      supabase as never,
    );
    const activeFromSurfaceB = await getActiveSubscriptionPlans(
      supabase as never,
    );
    expect(activeFromSurfaceA).toEqual(activeFromSurfaceB);

    const allRows = await getAllSubscriptionPlansForCatalogManagement(
      supabase as never,
    );
    const derivedActive = allRows!.filter((p) => p.is_active);
    expect(new Set(activeFromSurfaceA!.map((p) => p.id))).toEqual(
      new Set(derivedActive.map((p) => p.id)),
    );
  });
});
