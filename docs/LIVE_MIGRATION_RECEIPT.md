# Live TracKasuwa migration receipt — 30 September 2026

Project: `ajrflgewbsosthsjtvuj` (the project configured in `.env.local`). The accepted organization invitation enabled CLI access. No application deployment or Git push was performed.

## Applied state

- **013** was already installed. Its functions, triggers, and introduction fields matched the local migration; it was not rerun.
- **018** adds an owner-only `public.digest(bytea,text)` compatibility wrapper around the existing `extensions.pgcrypto` implementation. It is idempotent. On populated hosted databases it must run **before 014**, because 014's existing backfill invokes the hash-chain trigger. No existing migration was edited.
- **014 → 015 → 016 → 017** were committed together with prerequisite 018 in one transaction. The exact executed bundle is `build-evidence/live-migration-apply.sql`.
- **019** was then applied to revoke hosted default anonymous grants from the new public RPCs, remove client access to private helpers, and limit new-table grants to authenticated SELECT plus INSERT on import batches. RLS and owner/admin checks remain in force.

Actual deployment order: existing **013**, then **018 → 014 → 015 → 016 → 017** atomically, then **019**.

The database had no `supabase_migrations.schema_migrations` history table. This rollout used explicit SQL files, matching the repository's existing manual deployment workflow; it did not invent a baseline history for 001–012. Do not run an unreviewed `db push` against this project or rerun 013–017. Reconcile migration history separately before adopting automatic CLI pushes.

## Preservation and verification

- A live rehearsal completed inside a transaction ending with ROLLBACK before the actual commit.
- Both rehearsal and actual application used five-second lock and sixty-second statement timeouts.
- The committed transaction compared hashes of original sale fields (excluding newly assigned official numbers, new device timestamp metadata, and the existing updated-at trigger timestamp) and inventory fields. Both preservation assertions passed.
- All 23 existing sales received organization-local official invoice numbers; existing receipt references and sale amounts were retained. Inventory data was unchanged.
- All 11 new public tables have row-level security enabled.
- Independent post-commit verification checked gapless invoice sequences, audit chain links and sequences, recomputed audit hashes, required triggers, and permission grants.
- One pre-existing audit row remains unchained; the 23 backfill audit events are chained. No historical audit evidence was represented as newly authenticated historical evidence.
- The database and hosted compatibility tests passed: **2 files, 19 tests**. The test setup now models Supabase's direct default grants to `anon` and `authenticated`, which a plain PostgreSQL fixture otherwise misses.
- Typecheck passed. A malformed local generated Next.js route declaration was regenerated; no application source change was needed for that cache issue. Protected-file hashes and `pullPurchaseOrders()` remain unchanged.

## Recovery and boundaries

The backup API returned no listed backups and PITR disabled. Docker/Podman was unavailable for `pg_dump`. A **schema-only** snapshot was captured and validated at `build-evidence/live-backup/schema-definitions.json`; that folder and local CLI connection metadata are ignored by Git. It contains schema definitions, not application table records, and is not a full data backup.

Automatic approval review rejected the attempted full-data local snapshot because that sensitive-data export exceeded the migration authorization. The export was not executed. The permitted schema-only snapshot and rollback rehearsal were used instead. A later usage-limit interruption also prevented the first commit attempt from executing; the successful commit occurred after the renewed access check.

After commit, recovery should use a reviewed additive correction; do not delete the new financial/audit/import tables or blindly revert grants. No destructive rollback or data deletion was performed.

The security advisor also identifies older objects outside this batch: security-definer views `v_subscription_revenue` and `v_merchant_summary`, legacy helper-function grants/search paths, and disabled leaked-password protection. These were not silently changed during a migration-only rollout. Authenticated execution warnings for the new security-definer RPCs are intentional: those are authenticated APIs with explicit actor, organization, role, entitlement, and/or approval checks.

This verifies deployed database structure, grants, and the existing audit/invoice data. It does not claim a live payment, real AI provider, external message delivery, or end-to-end browser workflow test. The original build report's billing and product-decision limitations still apply.

Final machine-readable results and migration SHA-256 values are recorded in `build-evidence/live-deployment-receipt.json`.
