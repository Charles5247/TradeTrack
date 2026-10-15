# Investor demo readiness audit - 15 October 2026

## Repository state reviewed
Commits a26b301 and 7e16a05 contain responsive header, navigation, POS cards/cart, wrapping, shared spacing and offline performance-test setup fixes. The remaining compact marketing language control changes were present locally and are preserved. The repository alone cannot establish which collaborator authored each edit.

## Gaps found and repaired
- Next.js client navigation used network RSC requests, while the worker only cached full document visits. Authenticated pages now download their HTML and referenced scripts/styles; offline links request the cached documents. Preparation status is visible and reconnect retries preparation.
- Worker cache writes were not awaited; activation deleted unrelated caches. Writes are awaited and deletion is limited to Trackasuwa caches.
- Offline HTML is cleared on logout/account change. Business IndexedDB storage already uses account namespaces.
- Product/inventory/category/warehouse pulls silently ignored errors and stopped at the server response limit. Pulls now paginate, propagate failures, and advance the incremental cursor from the start of a successful pull. Account changes reset that cursor.
- The existing Uzor Electronics demo organization had three database profiles and no merchant record. Added an active, unverified merchant record in production; no passwords, accounts, verification claims or Bozack Textiles records were changed. The repair SQL is included as an idempotent migration.

## Still incomplete / limitations
- No real Safari/iPhone or interactive browser session was available here. Automated checks are not a substitute for the device rehearsal.
- Offline operation requires an initial online login, page preparation and data sync on that browser/device. Safari can evict website storage; do not clear site data while transactions remain queued.
- Core POS/local data workflows have offline storage and sync. Accounting, reports, user administration, platform administration, payments, and live AI still contain server-backed operations. Caching their page shells does not make these operations fully offline.
- Arbitrary detail URLs and lazy-loaded features may need to have been opened online first; navigation warmup covers the role's main menu routes, not every possible record URL.
- Broad mobile visual validation, all-locale translation of the new readiness messages, and converting every server-backed business workflow to local-first remain outstanding.

## Demo rehearsal
1. With internet on, reload the site and accept its app update if offered.
2. Log in to the intended demo role. Wait for 'Pages ready offline' and for data sync to finish; open POS and confirm stock is present.
3. Turn data off, navigate Dashboard/POS/Inventory as permitted, complete a small sale, and confirm it stays queued locally.
4. Restore internet, allow sync, and check the sale from the owner's other device.
5. Refresh the platform-owner merchant list to see Uzor Electronics.

Validation: production build passed; 99 offline/storage/sync regression tests and the HTML/script preparation test passed. Worker JavaScript syntax checked. Live-device rehearsal remains required.
