# Medical inventory pilot — 21 October 2026

Status: development foundation; **not approved for a full pharmacy launch**. The server feature flag `MEDICAL_STOCK_PILOT_ENABLED` defaults to false. The new migration has not been applied to production.

Implemented locally:

- Industry selection on self-service and platform onboarding. Medical navigation and server/database operations require a medical business type; technology, fashion and other businesses keep ordinary retail navigation.

- Product enrollment for batch tracking, with base-unit quantities and pack conversion.
- Batch receipt by storage location; expired receipts are quarantined.
- Earliest-expiry-first allocation, excluding expired and held stock.
- Fully paid general-stock sales and manager-only free issues with immutable stock history.
- Idempotent receipt and issue requests; insufficient-stock operations roll back.
- Legacy inventory and checkout guards for enrolled products.
- Offline medical drafts requiring online confirmation before handover.
- Atomic ordinary retail sale, inventory and sync-queue writes.

Verification on 21 October:

- TypeScript and production build passed.
- Medical rules, medical database and accounting database suites: 39 tests passed.
- Offline atomicity suite: 3 tests passed separately using one fork. The combined run had a worker startup timeout, so it was not a clean combined pass.
- No live database or physical-device acceptance testing has been completed.

Required before Friday's full-workflow pilot:

1. Complete and review prescription/controlled-stock dispensing requirements with the responsible pharmacist. Current code deliberately rejects dispensing these classifications.
2. Implement and verify batch transfers, returns, quarantine/recall/release actions and operational audit views.
3. Decide and test the offline dispensing policy. Current medical drafts do not authorize handing over stock while offline.
4. Handle complete/paginated stock retrieval; the current pilot API limits results to 1000 rows and recent history to 100 events.
5. Add explicit payment confirmation and review the cashier flow, receipts and base-unit pricing.
6. Reconcile live schema prerequisites and legacy opening stock. Drain pending queues on every device before enrolling products; stale clients must not keep selling enrolled products through ordinary POS.
7. Test competing terminals, lost responses, reloads, account switching, expiry at Nigeria midnight, role/tenant isolation and backups on the actual pilot devices.
8. Apply reviewed migrations in staging, rehearse rollout and recovery, then verify the production deployment before enabling the feature flag.

Rollback: disabling the feature flag stops access to the medical workspace but does not convert batch stock back into legacy inventory. Preserve batch records and write guards. Do not drop tables or remove guards as a shortcut to resuming ordinary checkout; reconcile stock first.

Image-only release is PR #22 and does not enable this pilot.
