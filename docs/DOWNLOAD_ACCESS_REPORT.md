# Download access implementation — 12 October 2026

Implemented: permanent navigation and hero download access, footer platform anchors, stacked mobile hero actions, fixed Android/Windows/Web ordering, recommendation-only device detection, environment-backed HTTPS installers, disabled Coming soon states, optional version/size metadata, Android/Windows help, Safari/PWA steps and four language translations.

## Verification

- Final production build: passed, exit 0 (including TypeScript).
- Focused download/configuration/translation suite: 18 passed.
- Full serial suite: 356 passed, 2 failed, across 54 files. Both failures are timeouts in src/lib/offline/__tests__/sales-offline.test.ts (pending backlog test and setup for historical backlog). Offline implementation and tests were not modified. Initial parallel run also had worker startup timeouts.
- Local production HTTP: /, /download and /api/version returned 200. Landing download links, platform anchors and card order verified.
- git diff --check: passed.
- No connected browser: desktop/mobile visual and click checks could not be completed. Responsive classes and shared menu destinations were inspected; device detection was exercised in DOM tests.
- Public Vercel login domain: external HTTP checks failed from this environment, so live availability remains unverified.

## Changed source and documentation files this follow-up

- .env.example
- README.md
- RELEASING.md
- src/components/marketing/hero.tsx
- src/app/(marketing)/download/page.tsx
- src/app/(marketing)/download/download-client.tsx
- src/app/(marketing)/download/download-client.test.tsx
- src/app/api/version/route.ts
- src/lib/downloads/config.ts
- src/lib/downloads/config.test.ts
- src/i18n/messages.ts
- src/i18n/locales/ha.ts
- src/i18n/locales/yo.ts
- src/i18n/locales/ig.ts
- src/i18n/locales/pcm.ts

## Earlier work already present, verified without editing again

- src/components/marketing/marketing-nav.tsx: Download app in desktop and mobile navigation.
- src/components/marketing/marketing-footer.tsx: Android and Windows anchor links.
- Hero Download app label was already present; this follow-up adds responsive stacking.

## Found and left unchanged

- Android applicationId ng.TracKasuwa.app; versionCode 1; versionName 1.0.0; default https://trackasuwa.vercel.app/login.
- No release signing config or keystore reference in Gradle. No .jks/.keystore found in Android source outside generated folders. External key custody unknown; earlier README mentions a throwaway demo key.
- Windows signing and package configuration unchanged. No installers built or uploaded.
- Vercel configuration, GitHub Releases and deployed website unchanged.
- Existing sign-in and primary pricing/signup actions preserved.
- Existing middleware-to-proxy deprecation warning remains.
- Historical docs/DOWNLOAD_FLOW.md retains older descriptions; README.md and RELEASING.md document the new configuration.

## Generated verification artifacts

- build-evidence/download-access/build-exit.txt
- build-evidence/download-access/build-final.log
- build-evidence/download-access/build.log
- build-evidence/download-access/changed-files.txt
- build-evidence/download-access/focused-final.log
- build-evidence/download-access/focused.log
- build-evidence/download-access/http-smoke.json
- build-evidence/download-access/server.log
- build-evidence/download-access/tests-serial.log
- build-evidence/download-access/tests.log
- docs/DOWNLOAD_ACCESS_REPORT.md (this report)
