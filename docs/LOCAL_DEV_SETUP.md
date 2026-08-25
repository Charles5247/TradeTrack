# TradeTrack — Local Dev Database Setup

> **Why this doc exists**: a real bug was found where the local dev
> Supabase database had accumulated 11 `subscription_plans` rows across
> 3 different seeding sources (migration `003`'s legacy 3-tier seed,
> `supabase/seed/001_seed_data.sql`'s *independent* legacy 3-tier seed,
> and migration `010`'s canonical 5-tier seed) instead of the 5 rows a
> clean setup should have. A gap in migration `010`'s defensive
> deactivation logic (fixed in migration `012`, see
> `docs/CHANGELOG.md`) let one stray row from the seed file stay
> `is_active = true`, which is exactly the row that showed up as a
> duplicate "Business ₦20,000" card on the public `/pricing` page. This
> doc exists so nobody has to re-diagnose that from scratch — follow the
> steps below for a known-good local database.

## The one rule: run every migration file, in order, then (optionally) the seed file

There is no migration-runner CLI wired into this repo (see
`docs/DEPLOYMENT.md` §1) — migrations are plain `.sql` files applied
manually, in numeric order, via the Supabase SQL Editor (or `psql`, or
the Supabase CLI's `db reset`/`db push` if you have it set up locally).
**Numeric order matters** — several migrations (e.g. `010`, `012`)
depend on earlier ones having already run.

### Option A — fresh local Supabase via the Supabase CLI (recommended)

If you run Supabase locally via the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase start        # first time only — brings up local Postgres/Auth/etc.
supabase db reset      # re-applies every file in supabase/migrations/, in
                       # order, against a CLEAN database — this is the
                       # single command that guarantees you end up with
                       # exactly migration 010 + 012's 5 canonical plans
                       # and nothing else.
```

`supabase db reset` runs every `supabase/migrations/*.sql` file in
filename order against a freshly wiped local database — this is why it
is the recommended path: it can never end up with the stray-row bug
described above, because there is no way for an old seed run or a
half-applied migration to linger.

If you also want demo data (a sample org, products, demo users), run
the seed file **after** the reset:

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" \
  -f supabase/seed/001_seed_data.sql
```

> **⚠️ Known caveat**: `supabase/seed/001_seed_data.sql` inserts its
> **own**, independent set of 3 `subscription_plans` rows ("Basic"
> ₦5,000 / "Standard" ₦10,000 / "Business" ₦20,000, different UUIDs than
> migration `003`'s legacy rows) — this is a pre-existing, non-canonical
> demo dataset that predates the 5-tier restructure and has never been
> reconciled with it. As of migration `012`, these 3 rows are
> immediately deactivated by name (`is_active = false`) the moment the
> migration that includes that defensive UPDATE has already run — but
> since the seed file runs *after* all migrations in this flow, that
> UPDATE won't re-run automatically. **If you run the seed file, always
> immediately verify the catalog afterward** (see "Verify your setup"
> below) and, if needed, re-run migration `012`'s UPDATE statement by
> hand, or simply don't run the seed file's `subscription_plans` INSERT
> at all if you don't need its demo org/users/products — the 5-tier
> catalog from migrations `010`/`012` is already complete without it.

### Option B — remote/hosted Supabase project (staging, or a shared dev project)

1. Go to your Supabase project → SQL Editor.
2. Run every file in `supabase/migrations/` **in numeric order**:

   ```
   001_initial_schema.sql
   002_rls_policies.sql
   003_payment_and_improvements.sql
   003_2_automatic_generate_invoice.sql
   004_owner_payments_merchants.sql
   005_add_missing_roles.sql
   006_fix_role_policies.sql
   007_feature_updates.sql
   008_role_model_rework.sql
   009_merchant_onboarding_virtual_accounts.sql
   010_five_tier_subscription_plans.sql
   011_purchase_orders.sql
   012_fix_stray_active_legacy_plans.sql
   ```

3. Optionally run `supabase/seed/001_seed_data.sql` for demo data (see
   the caveat above — verify the catalog afterward).
4. Run `npm run setup:demo` (needs `NEXT_PUBLIC_SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`) to create real Supabase
   Auth logins matching the seed file's demo user profile rows — the
   seed SQL only inserts `users` table rows, it does not create
   sign-in-able Auth accounts.

## Verify your setup

Run the automated check added alongside this doc:

```bash
npm run verify:plans
```

This asserts, against your actual database:
- exactly **5** active `subscription_plans` rows exist
- they are named exactly `Free`, `Starter`, `Growth`, `Business`,
  `Enterprise`, at exactly ₦0 / ₦5,000 / ₦15,000 / ₦30,000 / ₦0
  (Enterprise is "Talk to Sales" — no self-serve price)
- `Growth` is the only one flagged `is_popular`
- no legacy names (`Basic`, `Standard`) or duplicate names are active
- the exact same function the public `/pricing` page and the
  dashboard's Subscriptions ▸ Plans tab both call
  (`getActiveSubscriptionPlans()` in
  `src/lib/subscriptions/get-plans.ts`) returns identical, deterministic
  results — i.e. the two surfaces cannot drift apart again.

If it fails, it prints a full diagnostic dump of every row in
`subscription_plans` (id, name, price, `is_active`, `is_popular`,
`created_at`) so you can see exactly which row is wrong, then re-run
the migrations above from a clean database (Option A is the fastest
way to guarantee a clean slate).

You can also spot-check visually once `npm run dev` is running:
- **Public pricing page**: `http://localhost:3000/pricing` should show
  exactly 5 cards (Free, Starter, Growth [Most Popular], Business,
  Enterprise), with "Barcode Label Printing" showing a "Rolling out
  soon" badge and "Purchase Orders" showing as a normal live feature on
  the Business/Enterprise cards.
- **Dashboard**: sign in as `owner@demo.com` (see the demo credentials
  table in the root `README.md`) → Subscriptions ▸ Plans tab. It must
  render the exact same 5 plans, same names, same prices, as `/pricing`.
  (Signing in as `platformowner@tradetrack.ng` instead will show the
  same 5 active plans PLUS the deactivated legacy rows, each with an
  "Inactive" badge and Edit/Delete controls — that is the
  platform-owner-only catalog-management view, by design; see
  `src/lib/subscriptions/get-plans.ts`.)

## Why the dashboard and the pricing page can no longer drift apart

Both surfaces call the exact same shared function,
`getActiveSubscriptionPlans()` in `src/lib/subscriptions/get-plans.ts`,
instead of each writing its own Supabase query. The only role-based
difference is that `platform_owner` in the dashboard's Plans tab
additionally has access to
`getAllSubscriptionPlansForCatalogManagement()` (also in that file) so
they can see and edit/delete legacy/deactivated rows — that function is
explicitly named to make clear it is for catalog management only and
must never be used on a customer-facing "which plans can I buy" surface.
