# Releasing TracKasuwa installers

## Production release — 15 October 2026

- Published release: https://github.com/Charles5247/TradeTrack/releases/tag/v1.0.1
- Build run: https://github.com/Charles5247/TradeTrack/actions/runs/38693357925 (Android and Windows succeeded).
- Android: versionCode 2, versionName 1.0.1, applicationId `ng.TracKasuwa.app`. APK signature verified by `apksigner` in CI.
- Android certificate SHA-256: `E2:25:91:A9:FA:31:C3:27:17:AD:5D:4B:9A:73:FD:BB:9C:02:47:8F:65:03:C8:B7:28:8B:45:D8:6B:BC:87:EB`.
- A new production PKCS12 signing key was created because the prior demonstration key was unavailable. Local custody is in the Git-ignored `.release-private/` directory. Keep a secure separate backup of the key and password; do not commit or upload them as release assets.
- The user authorized encrypted GitHub Actions signing secrets: `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`. Restrict repository write access because trusted workflows can use these secrets.
- Windows: 1.0.1, x64 NSIS installer, **not Authenticode-signed**. No Windows certificate is configured.
- Default app origin remains https://trackasuwa.vercel.app. Public APK and EXE asset checks returned HTTP 200, with sizes 41,831 and 81,934,485 bytes.
- No real-device installation or upgrade test has been performed by this environment.

### Repeatable release workflow

1. Increment Android versionCode/versionName and the desktop package and lockfile versions. Update versioned artifact filenames in both workflows.
2. Run **Build installers** (`.github/workflows/installers.yml`) on main. It signs Android using the existing encrypted secrets and verifies the signature.
3. After both jobs succeed, run **Publish verified installers** with that build run ID. It validates the source workflow and branch, publishes the APK/EXE and attaches SHA-256 checksums. Update the release tag for each new release; existing releases are never overwritten.
4. Update the public release URL and version/size environment values in `vercel.json` and deploy. Only public metadata belongs there; API keys must stay in Vercel Project Settings. The current public URL variables are supplied to both build and runtime. To manage them solely in Vercel Project Settings later, remove the corresponding `env` and `build.env` entries from this file and redeploy.
5. Check `/api/version` and `/download` on the live site and test installation on Android and Windows.

## Historical continuity audit — 12 October 2026

- Android applicationId: ng.TracKasuwa.app.
- Current versionCode: 1; versionName: 1.0.0.
- Default origin: https://trackasuwa.vercel.app; Gradle appends /login.
- app/build.gradle contains no signingConfigs block, release signingConfig, or keystore reference. Release APKs require external signing. Its comment mentioning debug signing does not configure signing.
- android-app/README.md records an earlier APK signed with a throwaway demonstration key. Production key custody and compatibility with installed APKs must be verified. Source configuration cannot establish whether someone holds an external keystore.
- No .jks or .keystore file was found in the Android source tree (generated build/cache folders excluded).
- The configured Vercel origin could not be checked live from this environment: HTTP access failed. Verify it before release.
- Signing configuration was not changed by this task.

**Never lose or change the Android signing keystore.** Keep encrypted backups, the alias and credentials outside Git. Normal in-place upgrades must retain the applicationId and signing identity and increase versionCode. This also applies to a future React Native replacement. Locate the previous key and compare certificate fingerprints before distributing an update. Uninstalling to change keys can lose unsynced local data.

## Build the signed Android APK

Use JDK 17, Android SDK platform 34/build-tools 34.0.0, and Gradle 8.7. Put SDK tools on PATH. In android-app/app/build.gradle, increase versionCode for every release (for example 1 to 2) and set versionName. Preserve applicationId. From android-app, run:

    gradle assembleRelease --no-daemon -PappUrl=https://trackasuwa.vercel.app
    zipalign -v -p 4 app/build/outputs/apk/release/app-release-unsigned.apk app-release-aligned.apk
    apksigner sign --ks C:/secure/TracKasuwa-release.keystore --ks-key-alias TracKasuwa --out TracKasuwa-1.0.1.apk app-release-aligned.apk
    apksigner verify --verbose --print-certs TracKasuwa-1.0.1.apk

The version, key path and alias above are examples: use the intended version and existing signing identity. Enter passwords at the prompt. Align before signing; do not modify the APK after signing. Compare the certificate with the previous APK and test an upgrade over it. Only for the first production release, establish and securely back up a production signing key before distribution.

Official reference: https://developer.android.com/tools/apksigner

## Build Windows

On a Windows build machine, from desktop-app:

    npm ci
    npm version 1.0.1 --no-git-tag-version
    npm run build:win -- --publish never

Use the intended version. Output: desktop-app/dist/TracKasuwa-Setup-<version>.exe. Supply a Windows signing certificate through your release environment if available; this task does not provide or change one. Verify the publisher/signature and test installation and upgrade on a clean device. Existing Electron configuration targets Windows x64 and only checks for updates; installation remains manual.

## Publish and configure Vercel

1. Verify https://trackasuwa.vercel.app/login loads before building. Do not substitute trackasuwa.com until its Vercel domain connection is confirmed.
2. Run web tests/build and test the APK/EXE on real devices, including upgrades over previous releases.
3. In GitHub Releases, draft a release for the reviewed commit/tag, e.g. v1.0.1. Attach the signed APK and Windows EXE. Include release notes, actual file sizes and SHA-256 checksums. Never upload keys/passwords or commit installers to source.
4. Publish and verify both asset URLs download while signed out. If the source repository is private, use a separate public releases repository.
5. In Vercel Project Settings > Environment Variables, set NEXT_PUBLIC_ANDROID_APK_URL and NEXT_PUBLIC_WINDOWS_EXE_URL to the HTTPS GitHub Release asset links for the intended environment (normally Production).
6. Set TracKasuwa_ANDROID_LATEST_VERSION and TracKasuwa_WINDOWS_LATEST_VERSION to the matching versions. Optionally set TracKasuwa_ANDROID_FILE_SIZE and TracKasuwa_WINDOWS_FILE_SIZE using actual sizes, e.g. 12 MB.
7. Redeploy. Check /download, /download#android and /download#windows on phone and desktop. Verify /api/version metadata and signed-out downloads.

New URL variables override legacy TracKasuwa_*_DOWNLOAD_URL values. Explicitly blank new values disable downloads even when legacy values remain. Prefer immutable version-specific links and keep old release assets available. Do not attempt Android rollback by lowering versionCode.
