# Developing while main changes daily

Use short-lived feature branches from the latest `origin/main`, with small pull requests and frequent integration. One lead coordinates contracts and shared files. Subagents can investigate, implement bounded independent pieces and review changes; heavy local checks remain sequential on the 4 GB laptop.

This guide complements [AGENTS.md](../AGENTS.md). It is a development process, not an automated deployment or database-migration policy.

## Before starting a feature

Inspect first:

```powershell
git status --short
git branch --show-current
git remote -v
git fetch --prune origin
git rev-list --left-right --count HEAD...origin/main
git log --oneline HEAD..origin/main
git diff --name-only HEAD...origin/main
```

`fetch` updates knowledge of GitHub without merging changes into your working files. The count is local-only commits on the left and upstream-only commits on the right. Inspect the history and changed paths before choosing how to integrate. Do not reset or clean away research, local configuration or another agent's work.

### Clean checkout with no feature work yet

When the checkout is clean and its local `main` can fast-forward:

```powershell
git switch main
git merge --ff-only origin/main
git switch -c feat/ai-task-persistence
```

Use a fresh meaningful branch name per task. If fast-forward fails, inspect the divergence; do not force it. Updating `main` before branching avoids a feature starting on yesterday's business rules.

### Existing checkout contains research or unfinished work

Leave it intact and create a clean sibling worktree directly from the fetched upstream ref:

```powershell
git worktree add -b feat/ai-task-persistence ../TradeTrack-ai-task-persistence origin/main
```

Choose a new branch/path if either already exists. Each worktree has separate checked-out files and index while sharing repository history. Keep secrets and environment configuration separate and target-check any backend access; worktrees do not isolate a shared Supabase project. See [Git's worktree documentation](https://git-scm.com/docs/git-worktree).

Do not copy `node_modules`, browser profiles, `.env.local` or large research archives into a PR. Install dependencies only when the task requires them and after inspecting the lockfile/scripts; run heavy setup/checks sequentially. A docs-only worktree does not need a fresh dependency installation.

## While the feature is being built

1. Start each work session with `git status` and `git fetch --prune origin`.
2. Inspect upstream changes to files, contracts, permissions, tests and migrations the feature touches.
3. Save only your intended changes in small commits before integrating upstream. Leave unrelated local changes alone; use another worktree when needed.
4. For a shared or already-pushed feature branch, merge the refreshed upstream history:

```powershell
git merge origin/main
```

This command requires a worktree ready for integration. It preserves published history. Resolve conflicts deliberately, preserving both current business rules and the approved feature contract. Do not select “ours” or “theirs” wholesale. If you cannot resolve a conflict safely, inspect the scope and use `git merge --abort` to return from your own in-progress merge; do not discard unrelated files.

For an entirely private branch, a reviewed rebase may be appropriate, but it is not the default for shared work. Do not rebase other people's published commits or force-push without explicit coordination/authorisation. If `main` is only ahead and you have no local commits, `git merge --ff-only origin/main` is the safe integration check. [Git documents the fast-forward-only behaviour](https://git-scm.com/docs/git-pull).

After integration, revisit assumptions, not only conflict markers. A merge can be textually clean while changing a receipt API, role rule, sale-cost snapshot, offline key or metric definition underneath the feature.

## Daily source changes and feature contracts

| Upstream change | Required response before continuing |
|---|---|
| API/domain function or request/result shape | Reconcile the canonical contract and consumers/mocks; reuse new functionality instead of implementing it twice |
| Product units, costs, sales or warehouse rules | Recheck arithmetic, affected data and merchant wording; run targeted business regressions |
| Auth, tenant scope, staff visibility or entitlement | Recheck positive and negative access cases, including existing drafts/results |
| Offline DB/version/queue semantics | Review compatibility, persistent keys, pending data and reconnect/replay behaviour |
| Migration or function/trigger change | Compare local/deployed schema state and dependency order; rehearse only on an authorised target before application |
| `package.json` or lockfile | Review the dependency change and refresh the chosen worktree's install if needed; do not replace lockfiles blindly |
| UI launcher/review/forms/i18n | Reuse the current components and behaviour; validate mobile/keyboard/source review instead of restoring a historical mockup |
| Native shell/installer/release workflow | Read the relevant Android/desktop instructions; signing keys and release publication remain separately authorised |

Keep one canonical contract per boundary. When two agents work on frontend and backend, agree that contract first and give them non-overlapping ownership. The lead integrates and an independent reviewer checks consequential stock/financial/security/recovery changes.

## Before opening or updating a PR

With only intended work committed and no unresolved conflicts:

```powershell
git fetch --prune origin
git merge origin/main
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Run checks appropriate to the changed behaviour. Current common commands are:

```powershell
npm run test -- <relevant-test-paths> --maxWorkers=1
npm run typecheck
npm run lint -- <changed-source-paths>
node scripts/check-tracked-env.mjs
```

The angle-bracket paths are placeholders to replace. Documentation-only changes need relevant document/link/diff/hygiene checks; they do not automatically require rebuilding the entire app. Behaviour changes need meaningful regression checks; financial/tenant/migration work needs its isolated domain/security evidence. CI checks do not establish provider accuracy or merchant usability.

Stage named files rather than the whole worktree, inspect the staged diff and push the feature branch:

```powershell
git add -- path/to/intended-file
git diff --cached --stat
git diff --cached --check
git commit -m "feat(ai): add the approved task-persistence slice"
git push -u origin feat/ai-task-persistence
```

Open a PR against `main`, with the actual outcome, compatibility/migration implications, validation and remaining limitations. Use a body file for multiline descriptions. Do not include private keys, local environment, real merchant documents, browser state, unreviewed SQL dumps or unrelated research in the PR. Merging and deploying remain separate actions.

If `main` changes again while review is underway, refresh and merge it into the feature branch, resolve semantic conflicts and rerun the affected checks. The branch is current **as of a recorded upstream commit**, not guaranteed to remain current forever. Keep branches short-lived and split large capabilities into useful tested increments rather than maintaining a long isolated AI fork.

## After a PR is merged

Fetch again and start the next slice from the refreshed upstream ref. If local history differs because the PR was squash/rebase-merged, create the next branch from `origin/main` rather than forcing the old feature branch to match it. Keep any old worktree until its intended work is safely published or preserved; remove it only after checking it is clean and no longer needed.

## Git updates and database updates are separate

Pulling source downloads migration files; it does not apply them or prove production deployed them. Before running the updated app against a backend, compare expected schema/functions/grants and environment identity. Follow the project Supabase and [deployment guidance](DEPLOYMENT.md). Do not automatically execute `db push`, resets, seed/demo scripts or trial/billing changes as part of a daily pull.

Test on the authorised disposable project with controlled fixtures. Rehearse migrations and preservation/rollback checks there, and record the exact app/schema artifact and environment. Production needs its own access, authorisation and deployment evidence.

## Source refresh recorded on 15 November 2026

The working checkout advanced from `096be4d` to `563ba1dea39822942ebbe1b54be33bc58ce0639e`, incorporating 16 upstream commits and 102 changed paths. Thirteen commits were fetched first; three more arrived while the guidance was being prepared and were integrated before publication. Changes included AI stock-review UI, caller-supplied receipt IDs/offline deduplication, launcher obstruction handling, staff visibility, sales/credit, owner-only reversals, insight notifications, subscription and Android updates. Existing uncommitted research was preserved. New migration files were fetched, not applied.

Earlier local research/planning at `096be4d` remains historical evidence. In particular, do not implement a new receipt-ID parameter or recreate the stock-review component without checking their new upstream implementations. Their presence does not by itself prove durable exact approval, cross-reload recovery, hosted schema parity or provider quality. Recheck those boundaries at the new commit before approving an implementation slice.

This guidance PR is intentionally based on the refreshed `main`; its authored changes are project instructions and this workflow, not a second copy of commits already in the base branch. Local/unpublished research is not silently published as part of this guidance change.
