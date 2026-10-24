# Draft PR: recoverable stock commands and reviewed manual receipts

Offline receipts, stock adjustments and warehouse transfers can fail between separate writes or race with another stock change. M0 commits each stock command atomically, retains original receipts for explicit recovery and returns the original result on retry. It isolates account caches/drafts and bounds spreadsheet parsing in a browser worker. Private environment files are removed from tracking and checked by the existing repository-hygiene workflow; this does not revoke historical credentials.

M1 adds Inventory → Receive stock behind disabled flags. A manager enters 10 cartons × 12 units, reviews +120 and purchase costs, approves once and can recover the saved receipt after a lost response without adding another 120. Opening balances require an initial position. Reviewed new-product drafts can be shared within a receipt. Existing catalog prices remain unchanged. Immutable approvals, receipt revisions, conversions, source text, ledger and outcomes persist together.

This branch integrates main at a1109e0, preserving its subscription checks, medical batch-stock separation and product-unit rules. Unit, size, colour or model changes require renewed receipt review. Ordinary receiving excludes medical batch-managed products.

A subsequent concurrency check found a transfer/checkout deadlock when creating a new destination position. An additive migration now locks existing inventory before destination creation fires audit triggers. A held-lock regression proves the accounting counter stays available while both stock writers wait, then verifies their final quantities and duplicate replay.

## Validation

- Integrated checkout: 88 tests in 12 files passed, including stock, subscription, medical isolation, API and migration checks. Final TypeScript and Next.js production build passed (57 pages).
- Real PostgreSQL: 13 M0 and 15 M1 acceptance groups passed, including concurrency, rollback, permissions and replay.
- Browser: 15 M0 and 19 M1 checks passed through actual components, API handlers and SQL with synthetic session transport. Desktop/mobile screenshots retained. Hosted JWT/session issuance is not verified by these fixtures.
- Original checkout: the broad run executed 385 passing tests but had ten worker-start errors. All ten missing files subsequently passed (41 tests). The disjoint reports cover 426 tests; this was not one aggregate green run and is not a full run of newer upstream tests.
- Scoped lint passed with two existing warnings; inherited Inventory/POS lint errors are documented. React act warnings remain in test logs.

See [M0 evidence](AI_AND_BI_M0_IMPLEMENTATION_CHECKPOINT.md), [M1 evidence](AI_AND_BI_M1_IMPLEMENTATION_CHECKPOINT.md) and `build-evidence/m1/verification-index.json`.

## Release and rollback

Apply the additive M0/M1 migrations and `20261024042324_stock_transfer_lock_order.sql` before compatible clients use them. Coordinate old-client stock writes/synchronization and a compatible-client rollout; flags cannot repair old open tabs. Confirm credential rotation/history exposure, hosted schema/grants/authorization and historical tenant-link audits before production release. Existing pending transfers require explicit stock reconciliation.

Public checkout/intake flags and private database switches default off. Rollback disables features while retaining committed receipts, approvals, evidence and unresolved work. Do not restore unsafe snapshot writers or clear queues. No hosted migration, deployment, credential rotation or business-data repair is included.

M2 spreadsheet batches, uploads and workers are the next milestone; AI modalities and BI follow later. They are not implemented in this PR.
