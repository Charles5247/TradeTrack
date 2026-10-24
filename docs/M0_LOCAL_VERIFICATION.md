# M0 local proof and PR preparation

The branch is `feat/m0-stock-integrity`. Nothing has been committed, pushed, deployed or migrated to a hosted database. Preserve the unrelated `idea-to-build/` and ZIP deletions; do not use `git add -A`.

## Recorded proof

- `build-evidence/m0/postgres-result.json`: 13 passing real PostgreSQL acceptance groups.
- `build-evidence/m0/vitest-result.json`: full run, 411/413 passed; two backlog timing/setup failures.
- `build-evidence/m0/offline-backlog-result.json`: successful isolated rerun, five tests passed with the original 300 ms assertion.
- Browser actions in `scripts/verify-m0-browser-actions.js`: 15 synthetic browser checks passed, including compressed XLSX; `build-evidence/m0/browser-result.json` and desktop/mobile screenshots retained. This uses actual application components and SQL through a loopback-only adapter; hosted JWT/session issuance is not tested.
- Final combined M0/M1 production build and TypeScript passed after all feature changes; `build-evidence/m1/build.log`. The checkpoint records final suite/lint results, limits and release blockers.

## Reproduction

Requires PostgreSQL 18 installed locally and a disposable cluster owned by this task. Never point these commands at a merchant database. The verifier hardcodes loopback and creates its own randomly named synthetic database.

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D 'C:/TradeTrack/.m0-local/pg-atomic-20261019' -o '-h 127.0.0.1 -p 55439' -l 'C:/TradeTrack/.m0-local/pg-local.log' -w start
$env:M0_KEEP_DB='true'
npm run verify:m0:postgres
npm run verify:m0:browser
```

The existing task cluster listens only on `127.0.0.1:55439`; inspect its own configuration before starting it. `M0_KEEP_DB=true` retains synthetic data and writes `.m0-local/active-target.json` for the browser fixture. Without it the PostgreSQL verifier drops only its own generated database. The browser fixture uses port 57139; no `.env` values or production keys are read.

For the combined M0/M1 database fixture, replace `npm run verify:m0:postgres` with `npm run verify:m1:postgres`. After starting that fixture, open `/m1` and run `scripts/verify-m1-browser-actions.js` in its own CLI session to reproduce the 19 M1 checks. Use a retained synthetic database and restart the fixture after code changes. Do not run the two browser action scripts concurrently; their simulated acknowledgment-loss switches share one test server.

In a second terminal:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=m0-verification open http://127.0.0.1:57139 --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=m0-verification run-code --filename scripts/verify-m0-browser-actions.js
npx --yes --package @playwright/cli playwright-cli -s=m0-verification close
```

Stop the fixture with Ctrl+C in its own terminal (or POST its loopback `/shutdown` endpoint). Stop only the task-owned PostgreSQL cluster with `pg_ctl -D <the exact task cluster above> -w stop`. Do not stop another PostgreSQL service or delete queues to make a run pass.

## PR procedure

1. Review filenames and diff on the feature branch. Use an explicit allowlist for application changes, tests, migrations, planning/checkpoint documents, verifier scripts, package/lockfile, `.env.example`, `.gitignore`, and the filename-only CI guard. Include the staged `.env.local` removal without reading its contents; the local file must remain present.
2. Keep synthetic evidence reports/screenshots when useful to reviewers; exclude `.m0-local/`, browser session files, private backups and unrelated deletions. Never attach old environment-file contents or a raw patch containing them to the PR.
3. Run `npm run check:tracked-env` and `git diff --cached --check`. Inspect the staged filename list and scope before committing. A successful guard does not revoke a historical credential.
4. Review the staged scope and commit. Separate M0/M1 commits are optional; shared integration files must be split carefully. Suggested combined subject: `fix: preserve stock integrity and add reviewed manual receipts`.
5. Push the reviewed branch with `git push -u origin feat/m0-stock-integrity`, then open a draft PR against `main`. Use a body file describing behavior, migrations, flag defaults, actual checks, legacy transfer holds, credential/hosted blockers and rollback compatibility. A PR can be reviewed while production release is blocked.

Do not deploy or enable flags as part of opening the PR. Credential rotation/history decisions remain owner-operated; no production operation is implied by this procedure.

The concrete combined PR body and copyable commit/push/draft-PR commands are in [the PR handoff](STOCK_INTAKE_FOUNDATION_PR.md). Those commands have not been executed.
