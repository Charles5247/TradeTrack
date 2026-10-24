# Draft PR: recoverable stock commands and reviewed manual receipts

Suggested title: `fix: preserve stock integrity and add reviewed manual receipts`

Offline sales and split stock writes could lose or repeat inventory effects after failures or concurrent activity. M0 makes checkout, manual adjustments and warehouse transfers atomic and recoverable, isolates account caches and drafts, holds ambiguous legacy work for reconciliation, and moves spreadsheet parsing into a bounded browser worker. Private environment files are removed from tracking and checked by CI; this does not revoke a credential previously exposed in Git history.

M1 adds Inventory → Receive stock behind disabled flags. A manager can enter 10 cartons × 12 units, review +120 units and receipt costs, approve once, and recover the saved result after a lost response without adding another 120. Opening stock is restricted to genuinely initial positions. Reviewed new-product drafts can be shared within a receipt; existing catalog costs and selling prices remain unchanged. Receipt revisions, immutable approvals, original quantities/conversions, source text, ledger and outcomes persist together.

## Validation

See the current [M0 checkpoint](AI_AND_BI_M0_IMPLEMENTATION_CHECKPOINT.md) and [M1 checkpoint](AI_AND_BI_M1_IMPLEMENTATION_CHECKPOINT.md) for exact commands, reports, final build/test status and limitations. Isolated PostgreSQL exercises actual authenticated database roles and concurrency. Browser fixtures run actual components, HTTP handlers and SQL with synthetic session transport; hosted JWT/session issuance and production schema parity are not established by them.

## Release requirements and rollback

This is a reviewable draft, not approval to deploy. Apply the four additive M0/M1 migrations before compatible clients use the commands. Coordinate a pause of old stock writers/synchronization and a compatible-client rollout; a flag cannot repair old open tabs. Resolve credential rotation/history exposure, hosted permissions/schema verification and historical tenant-link audits before production release. Old pending transfers require explicit stock reconciliation.

`NEXT_PUBLIC_ATOMIC_CHECKOUT_ENABLED`, `NEXT_PUBLIC_STOCK_INTAKE_ENABLED` and their private database switches default off. Rollback disables new features while retaining committed receipts, approvals, evidence and unresolved local work. Do not restore unsafe snapshot writers or clear queues. M2 uploads, durable workers, AI processing and BI are not implemented in this PR.

## Git handoff

Branch: `feat/m0-stock-integrity`. No commit, push, hosted migration or deployment has been performed. Review the explicit file allowlist in [local verification](M0_LOCAL_VERIFICATION.md); exclude unrelated `idea-to-build` deletions and the pre-existing audit document. Never attach a raw environment-file diff.

After reviewing and staging the intended files:

```powershell
npm run check:tracked-env
git diff --cached --check
git diff --cached --name-status
git commit -m "fix: preserve stock integrity and add reviewed manual receipts"
git push -u origin feat/m0-stock-integrity
gh pr create --draft --base main --title "fix: preserve stock integrity and add reviewed manual receipts" --body-file docs/STOCK_INTAKE_FOUNDATION_PR.md
```

These are handoff commands; none has been executed by the agent. A reviewer may split M0 and M1 into separate commits before pushing. Keep the PR as a draft until release requirements are assigned and verified.
