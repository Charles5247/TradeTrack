# Signup repair

Production diagnosis: signup references Business plan `b4000000-0000-0000-0000-000000000004`, but the live catalog contained Business under `c3d4e5f6-a7b8-9012-cdef-123456789012`. The merchant table enforces a foreign key to that catalog. The canonical record was absent, producing a concrete database failure when signup created the merchant.

The targeted repair migration has been applied to the linked live database. It copies the existing Business price (NGN 20,000), 10-cashier allowance and warehouse allowance into a hidden trial catalog record, with 700 products and 30 days. Existing paid plans and customer rows are unchanged. The trigger creates exactly one trial subscription during signup.

Verification: a local regression reproduced the missing foreign-key failure, then passed after applying the repair twice. The live organization/merchant/device-limit/subscription flow also passed inside a transaction that rolled back every test row. No Auth account or public testimonial was created. This proves the database path, not a real-user browser signup.

The API now attaches a reference to unexpected signup failures and logs the failing stage, rather than exposing raw database errors to a trader. It supplies an explicit merchant UUID. The UUID default itself was present in production and was not the diagnosed cause.

Assumptions: the existing live Business plan remains the commercial source for this repair; hidden trial catalog records are entitlement records, not an additional paid offer. No payment is initiated.

Screenshots: not applicable to the database repair. No connected browser was available for browser signup verification.

This urgent repair does not claim that all Phase 1A acceptance criteria or the full requested rollout are complete. Remaining payment compatibility and broader hosted write-guard deployment require separate verification.
