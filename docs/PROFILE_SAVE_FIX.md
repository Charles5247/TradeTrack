# Profile save fix — 2026-09-30

Applied `20260930171249_qualify_permission_helpers.sql` to project
`ajrflgewbsosthsjtvuj` using the existing manual SQL deployment workflow.

Authenticated profile updates failed with SQLSTATE 42P01: `relation "users"
does not exist`. The role-protection trigger has an empty search path; its
user lookup invokes RLS helpers whose legacy bodies referenced unqualified
`users`. All four live account roles reproduced the failure.

The migration qualifies `public.users` and fixes the search path in the six
existing role/organization helpers, preserving predicates, ownership and grants.
No account records or role policies were changed.

Verification:
- Before applying: rollback rehearsal succeeded for admin, business owner,
  cashier and platform owner, each updating exactly one own-profile row.
- After applying: the same rollback-only probe passed for all four roles.
- Accounting tests: 19 passed, including authenticated profile save and denied
  cashier self-promotion. Hosted migration test: 1 passed on separate retry
  after the combined run exhausted a worker's memory.
- Security advisors rerun; the pre-existing two security-definer view errors
  remain outside this fix.

The diagnostic SQL deliberately raises an exception containing role-only
results to roll back every write and expose results through the CLI (which
suppresses NOTICE messages). Its nonzero exit is intentional; inspect results.
