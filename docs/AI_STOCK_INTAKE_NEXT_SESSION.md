# AI stock intake — fresh-session implementation handoff

**26 October 2026 · Start implementation at AI-1/A.**

The user requested that the plan be written and relevant planning documents aligned in this session, with implementation starting in a **new session**. Application code has not changed in this documentation revision. AI-1 through AI-5 are not started. This handoff authorizes the new session to implement the agreed local/development feature; it is not production deployment or hosting-spend approval.

## Paste into the fresh session

```text
Work in C:\TradeTrack. Read AGENTS.md, docs/AI_STOCK_INTAKE_PLAN.md,
docs/STOCK_INTAKE_AND_RETAIL_BI_SPEC.md, docs/AI_AND_BI_MILESTONES.md,
docs/AI_AND_BI_IMPLEMENTATION_HANDOFF.md and this handoff.

Start implementing AI-1, beginning with execution batch A. Follow A/B/C
through a usable printed-photo/digital/scanned-PDF AI intake feature,
including source-linked review, one approval, actual stock saving and recovery.
Finish and verify AI-1 before starting AI-2. Record honest checkpoints if the
work spans sessions; do not return to general replanning or recreate M0/M1/M2.

Keep normal product/stock entry available. Put optional AI actions beside
those existing actions and inside the stock-in dialog. Reuse the current
stock commands/private uploads/durable worker where they fit. Preserve
fractional purchase quantities, convert exactly into whole catalog stock
units, generate stable internal SKUs in application code and never invent
barcodes/prices or substitute model confidence for evidence.

There are no real merchant examples or independent reviewer yet. Use labelled
synthetic fixtures and fixed reference answers; distinguish mock, synthetic
live-provider and real-world evidence. Respect disabled-by-default AI flags,
configured provider budgets, isolated test targets and remaining production
gates. Preserve unrelated work and existing receipts/evidence. Do not reset
databases/outboxes or merge/deploy as a shortcut to completing the feature.
```

## Locked product decisions

- One item/document and mixed batches use the same AI flow. Inputs include printed photos, digital/scanned PDFs, photographed handwriting, CSV/XLSX, pasted lists and recorded stock dictation/corrections. All remain required programme scope.
- Add with AI appears beside product entry; Receive with AI appears beside Inventory stock entry and inside its dialog. Carry current product/location/operation where available. Preserve the familiar product form/stock-in dialog.
- Support new-product starting stock and additional deliveries. Resolve exceptions, inspect every prepared entry, review the summary and approve selected ready receipts once. Clear rows need no individual checkbox.
- Fractions are required in purchase quantities. Whole base-unit stock additions are acceptable; preserve the source quantity/unit. Existing product units never change silently. Do not change core inventory/POS to fractional balances.
- Application code generates missing internal SKUs, stable per reviewed draft. AI never invents manufacturer barcodes or missing prices. Explicitly review new-product identity/unit/required catalog prices.
- English dictation first. Other languages need explicit scope and separate evidence. No conversational voice POS.
- Initial development ceilings: 10 sources, 1,000 rows, 20 MiB/file, 50 combined PDF/image pages and ten minutes/recording. No capacity claim before measurement.
- Real examples and an independent reviewer are unavailable. The accepted written example is not a completed AI test. Synthetic live-provider results cannot certify actual merchant handwriting, accents or usability.
- BI/business insights and unrelated redesign are outside current scope. The previous M0–M11 schedule is superseded by AI-1–AI-5.

## Current checkout and preservation

- Application baseline was `6f11e6a` on `feat/m2-spreadsheet-batches`; documentation commits can follow. Inspect current branch/status/log instead of resetting to that hash.
- PR #25 (`feat/m0-stock-integrity` → main) and PR #26 (`feat/m2-spreadsheet-batches` → foundation branch) were open drafts at discovery. Recheck live state before any Git publication or merge decision. Preserve their useful code/evidence; no blanket rollback.
- Preserve unrelated `idea-to-build/` and `idea-to-build.zip` tracked deletions and `docs/AUDIT_REMEDIATION_REVIEW_2026-10-15.md` untracked work. Stage only task-owned files.
- Manual branch baseline is `c5291a9` (parent of M0/M1 commit `e30380f`). Unit/variant UI also changed upstream in `fb3cb03`; do not sweep unrelated changes into a revert.
- Historical checkpoints remain in `AI_AND_BI_M0_IMPLEMENTATION_CHECKPOINT.md`, `AI_AND_BI_M1_IMPLEMENTATION_CHECKPOINT.md` and `AI_AND_BI_M2_IMPLEMENTATION_CHECKPOINT.md`. Their claims/gates retain their original limitations. They do not complete AI-1.

## Investigation results to carry forward

- Existing Assistant inventory mapping receives text without tenant catalog candidates and has a 1,000-row output ceiling. Ordinary product import is not additive delivery receiving. M2 accepts CSV/XLSX, not the complete AI input set.
- New test batch `b6887c38-e287-446b-9f1e-6bce7a4aeb06`: configured sheets, no parse job, zero prepared rows. A guidance branch sends configured `select_sheets` sources back to setup. It also repeats a prior original without a duplicate acknowledgement. Fix the confirmed guidance/recovery defect rather than instructing the merchant to understand worker stages.
- Older batch `e0ae26ee-2325-4d15-b9f7-a1b554fcb077` still has two rows. Their reported disappearance from the screen remains unresolved. Saved logs contain failed requests/DNS errors; they do not prove the exact rendering cause. Preserve user edits and records.
- App and worker were not running at the 26 October inspection. Check ports/processes before starting anything. No provider call, migration, receipt approval or stock posting was performed during discovery or this document update.

## Environment and evidence

- Known separate hosted development project: `jtqyxfoyllcvptxgwhmk`. Older production ref: `ajrflgewbsosthsjtvuj`. Revalidate `.env.local` and CLI target without printing keys before any database/storage action.
- Private ignored `.m0-local/dev-backend/` contains test login details, example workbooks and prior reports. Do not print/commit passwords, signed URLs or keys; do not reseed/reset user-tested data.
- The historical isolated PostgreSQL cluster is `.m0-local/pg-atomic-20261019`, loopback 55439, user `m0_test`. It is separate from the system PostgreSQL on 5432. Read `scripts/verify-m0-postgres.mjs` before using its harness.
- Run heavy checks sequentially. Installed Next.js has version-specific guides; read them before application code. Recheck actual provider/model contracts; initial candidates are configured `OPENAI_MODEL` for extraction and `gpt-transcribe` for file transcription.
- Live processing requires configured budget/capabilities; never count mock as live proof. Record blockers and continue independent AI-1 work without manufacturing completion or requesting repeated approval for routine authorized local changes.
- Existing `build-evidence/m2/` and 54 focused tests are historical foundation evidence. The new mixed example must independently reconcile +40 rice, +15 beans, +2,500 mL oil, balances 70/35/2,500 and NGN 57,000 after simulated clarification/new-product confirmation.

## First milestone stop condition

AI-1 is complete only when both familiar entry points lead through printed-photo/digital/scanned-PDF preparation, review, one approval, actual receipt/stock saving and recovery, with controlled live-provider/database/browser evidence and manual-regression checks. A missing provider/budget prerequisite is an explicit incomplete gate. Real-world merchant evidence is a separate production gate and remains unavailable. Do not start AI-2 simply because contracts, a mock or a build pass.
