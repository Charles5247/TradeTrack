# TracKasuwa rollout audit — 19 October 2026

Status: Phase 1A in progress. Nothing from this session has been deployed or merged.
Delivery order remains 1A → 1B → 4 → 2 → 3. Later phases must wait for 1A release verification.

## Signup failure: evidence

- The pre-fix signup handler queried the canonical Business plan and threw “The trial plan is unavailable. Please contact support.” on a missing row **or any query error**. The precise production database error has not been observed.
- The October 14 migration also suspended new organizations until platform verification and a registration number, contradicting immediate trial access.
- Local commits `dfea58c` and `ff10667`, present before this session, remove that lookup and add a migration to provision the Business row and start a 30-day self-serve trial at database time.
- A read-only GitHub check found remote HEAD at `cd5f491`, two commits behind local main. The existing fixes are not on that remote branch. This does not independently establish the deployed Vercel revision or migration state.
- Automatic approval review rejected a live Supabase plan check because it would transmit the local service-role credential to an unverified endpoint. No live database read or write was performed.

## Changes in this session

- Carry `/signup?plan=…` through signup into `organizations.settings.preferred_plan_id`. Invalid or missing preferences become null; they never change trial entitlement or initiate a payment. The preference must be validated against the current catalog at future checkout.
- Show the subscription link to trial merchants regardless of business verification, including after expiry.
- Add persistent day-20, day-27 and day-30 in-app reminders using estimated server time. Paid access beyond the trial suppresses these reminders.
- Route the new reminder through English/Hausa/Yoruba/Igbo/Pidgin i18n. Machine translations require native-speaker review.
- Add route tests for signup without a plan, with a plan, and with an invalid preference; test reminder boundaries and restored access after expiry.

## Phase 1A remaining acceptance gaps

- Trial still inherits Business product limits. Implement the 700-product cap consistently in the database and offline write paths while retaining Business cashier limits and all shipped features.
- Existing transaction guards cover sales and selected transaction flows; they do not prove universal read-only behavior for every edit/delete path after expiry. Audit all write boundaries, including queued offline work, without losing previously accepted sales.
- Add durable, normalized phone/email trial eligibility with concurrent-signup protection and a recovery path for honest users. Current Auth email uniqueness alone is insufficient.
- Implement non-destructive archival after 90 days, with explicit retention and reactivation semantics. Do not confuse archive with account deletion.
- Consume the stored future-plan preference in subscription checkout without autocharging or changing existing payment behavior.
- Prove confirmed payment restores access end to end against the payment/database path, not only cached client verification.
- Verify migrations, signup, account recovery, exports, and expiry against the intended hosted environment; test responsive screens and obtain screenshots.
- Create the phase PR, merge it, deploy migrations/application in a compatible order, and verify production before starting Phase 1B.

## Assumptions and release limits

- The current Business trial plan UUID remains canonical; existing prices and paid entitlements are unchanged by this session.
- A pricing choice is a preference, not consent to charge. A malformed preference must not block signup.
- Reminder milestones stay visible until the next milestone so a trader who was offline on the exact day still sees them.
- No production account was created, no payment was sent, no customer data was changed, and no fake testimonials were added.
- No real-device or screenshot verification has been performed in this session.

## Verification

- Initial subscription and full migration database suites: 67 tests passed.
- TypeScript check before the reminder additions: passed.
- Final focused signup/subscription/database/offline regression run: 89 tests passed across 7 files.
- Final `npm.cmd run typecheck`: passed.
