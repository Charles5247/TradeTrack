# Example: Deployment Prompts (Phase 12)

> Shows what Phase 12 prompts look like. Deployment is not an afterthought — it is a structured phase. Context: Finora, Phases 1–11 complete.

---

## [ ] [203] We're setting up Finora's CI/CD pipeline on GitHub Actions — automated checks on every PR and auto-deployment to a Vercel staging environment on merge to main.

**CI pipeline goals —** Every PR must pass all checks before merging. The checks run in parallel where possible: lint + type-check run simultaneously, tests run after they pass (tests are expensive — don't run them if there are basic errors). The pipeline must be fast: target under 3 minutes for CI to complete so developers get quick feedback.

**Two environments —** Finora has two Firebase projects: `finora-staging` and `finora-production`. Staging is deployed automatically on every merge to `main`. Production requires a manual trigger. Staging uses real Firebase services (not emulators) — it is a real app that the team uses for QA. This means the staging Firebase project must be provisioned separately.

**CD to production —** Production deployments are triggered manually via a GitHub Actions `workflow_dispatch` event. A deployment to production requires: (1) all CI checks have passed on the commit being deployed, (2) the staging deployment has been verified. There is no automatic rollback — if production breaks, the team manually triggers a redeployment of the previous commit.

**Secrets management —** Firebase credentials, Upstash Redis URL, and Sentry DSN are stored as GitHub Actions secrets. The workflows reference `secrets.*` — no credentials appear in the workflow YAML files themselves. Each environment (staging, production) has its own set of secrets with different Firebase project credentials.

## Instructions

**CI workflow (\`.github/workflows/ci.yml\`) —** Trigger: `pull_request` targeting `main`. Two jobs. Job 1 `lint-and-typecheck`: runs on `ubuntu-latest`, Node 20 with npm cache, steps: `npm ci`, `npm run lint`, `npx tsc --noEmit`. Job 2 `test`: `needs: lint-and-typecheck`. Steps: `npm ci`, start Firebase Emulators for Auth (port 9099) and Firestore (port 8080) in the background using `firebase emulators:start --project finora-test &`, wait for both ports to be ready using `npx wait-on tcp:8080 tcp:9099 --timeout 30000`, then `npm test -- --coverage --ci`. The `FIREBASE_TOKEN` secret is required for the emulators step.

**Staging deploy workflow (\`.github/workflows/deploy-staging.yml\`) —** Trigger: `push` to `main`. Single job. Steps: checkout, Node 20 with npm cache, `npm ci`, then `npx vercel --token=${{ secrets.VERCEL_TOKEN }} --prod=false`. Requires secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

**Production deploy workflow (\`.github/workflows/deploy-production.yml\`) —** Trigger: `workflow_dispatch` with a required string input named `confirm`. Job condition: `if: github.event.inputs.confirm == 'deploy'` (skips the job for any other value). Steps same as staging deploy but with `--prod` flag and production-specific env secrets passed via `env:` block.

**Required GitHub secrets to configure in the repo settings:**

- `VERCEL_TOKEN` — from Vercel account settings
- `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — from `.vercel/project.json` after running `vercel link`
- `FIREBASE_TOKEN` — from `firebase login:ci`
- `STAGING_FIREBASE_API_KEY`, etc. — all staging Firebase env vars
- `PROD_FIREBASE_API_KEY`, etc. — all production Firebase env vars
- `SENTRY_DSN` — from Sentry project settings

**Install `wait-on`:** `npm install -D wait-on`

## Verification

I'll verify this implementation automatically. I can:

- Create a PR with a TypeScript error → expect the CI lint-and-typecheck job to fail and block the merge.
- Create a PR with a failing test → expect the CI test job to fail.
- Merge a PR to main → expect the deploy-staging workflow to trigger automatically and a Vercel preview URL to appear.
- Trigger `deploy-production` workflow with `confirm: "wrong-word"` → expect the job to be skipped (not run).
- Trigger with `confirm: "deploy"` → expect the production deployment to proceed.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Go to GitHub → Actions → verify the `CI` workflow ran on the last PR and all jobs passed.
- Go to GitHub → Actions → `Deploy to Staging` → verify it ran on the last merge to main and succeeded.
- Visit the staging Vercel URL → verify the app loads, sign in works, and a transaction can be created.

Then give me your honest assessment of:

- Whether the `workflow_dispatch` input guard (`if: github.event.inputs.confirm == 'deploy'`) is a sufficient safeguard against accidental production deployments — or whether a proper deployment approval workflow (using GitHub Environments with required reviewers) would be more appropriate for a production app.

---

## [ ] [206] We're running Finora's pre-launch checklist — a systematic verification of every production readiness requirement before the app goes live.

**What this prompt is —** This is a verification-only prompt. No new code is written. The executing agent goes through each checklist item, checks it, and reports the result. Any item that fails must be fixed before launch proceeds.

**Why run a checklist —** Even after Phase 1–11 is complete, there are deployment-time concerns that code review misses: environment variables pointing to the wrong Firebase project, Sentry not connected to production, analytics missing the measurement ID. The checklist catches these before users hit the app.

## Instructions

The executing agent runs each check and reports ✅ PASS, ⚠️ WARNING, or ❌ FAIL for each item.

**Security:**

- [ ] All Firebase API keys in environment variables (not hardcoded in source). Check: `grep -r "AIzaSy" --include="*.ts" --include="*.tsx" app/ lib/` → expect 0 results.
- [ ] All Firebase Admin credentials in server-only environment variables. Check: `FIREBASE_ADMIN_PRIVATE_KEY` is not in `NEXT_PUBLIC_*` vars.
- [ ] Firestore security rules are deployed to the PRODUCTION Firebase project (not staging). Check: `firebase deploy --only firestore:rules --project finora-production --dry-run`.
- [ ] Session cookies set to `httpOnly: true` and `secure: true`. Check the session cookie handler in `app/api/auth/login/route.ts`.
- [ ] Rate limiting is active. Check: deploy and call `/api/transactions` 25 times in 1 minute → expect 429 on the 21st call.
- [ ] No `console.log` statements that could expose user data. Check: `grep -r "console.log" --include="*.ts" --include="*.tsx" app/ lib/` → review all results.

**Performance:**

- [ ] Lighthouse score ≥ 90 on `/login`. Run: `npx lighthouse https://finora-staging.vercel.app/login --output=json --quiet | jq '.categories.performance.score'`.
- [ ] Lighthouse score ≥ 85 on `/dashboard`. Run the same command for `/dashboard`.
- [ ] Bundle size: `npm run build` → check `.next/analyze/` (if `@next/bundle-analyzer` is configured) → no single chunk exceeds 250KB gzipped.

**Functionality (test on production URL, not staging):**

- [ ] Sign up flow works end-to-end on the production Firebase project.
- [ ] Email verification is sent on sign-up.
- [ ] Transaction creation, editing, and soft-delete all work.
- [ ] The Firestore security rules on the production project are the latest version.

**Monitoring:**

- [ ] Sentry is configured and receiving events. Test: trigger a deliberate error in the production app → check the Sentry dashboard → expect the event to appear within 60 seconds.
- [ ] Firebase Analytics is receiving page views. Check: Firebase Console → Analytics → Realtime → open the production app in a browser → expect page view events.
- [ ] Firebase Crashlytics is connected to the production Firebase project.

**Final step — after all items pass:**
Update `docs/prd.md`: change `STATUS: IN_DEVELOPMENT` to `STATUS: LAUNCHED` and set `LAUNCH_DATE: {today's date}`.

## Verification

I'll verify this implementation automatically. I can:

- Run the security grep checks and report results.
- Run Lighthouse on the staging URL and report performance scores.
- Report which checklist items passed and which failed.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Open Sentry → check that the production project exists → trigger a test error → verify it appears in Sentry within 2 minutes.
- Open the Firebase Console for the production project → Analytics → DebugView → navigate through the app → verify events appear.

Then give me your honest assessment of:

- Whether the Lighthouse score thresholds (90 for login, 85 for dashboard) are realistic for a Next.js app with Firebase Auth initialization — specifically, whether the Firebase SDK's first-load cost will consistently push the score below these thresholds and make this checklist item effectively impossible to pass.
