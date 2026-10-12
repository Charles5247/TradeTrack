# Releasing TracKasuwa installers

## Continuity audit — 12 October 2026

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
