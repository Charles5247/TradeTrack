# TradeTrack Android App

A minimal native Android **WebView shell** around the TradeTrack web app —
the mobile counterpart to the Electron desktop shell in `../desktop-app`.

## Why a WebView wrapper (not React Native)?

TradeTrack is already an offline-first PWA: it ships a service worker
(`public/sw.js`), an IndexedDB-backed local store, and a `SyncEngine` that
reconciles local writes with Supabase once connectivity returns. A WebView
shell gets all of that for free — the same way Chrome for Android does —
without needing to port any business logic to native code or maintain a
second UI layer. This keeps the Android app small (the release APK is a
few hundred KB before ProGuard/R8 shrinking) and trivial to keep in sync
with the web app: there is no native code to update when app features
change, only `MainActivity.APP_URL` if the production domain ever changes.

If a fuller native experience (push notifications, biometric unlock,
background sync outside the browser) is needed later, this shell is the
natural place to add `WebViewCompat`/`androidx.webkit` feature checks or to
graduate to a React Native/Capacitor wrapper — but for the offline-POS use
case, sticking close to the existing PWA architecture (matching the
Electron shell's philosophy) was judged the lower-risk, faster path.

## Project layout

```
android-app/
├── app/
│   ├── build.gradle                 # App module config (SDK 34, minSdk 24)
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml      # INTERNET permission, single launcher Activity
│       ├── java/ng/tradetrack/app/
│       │   └── MainActivity.java    # WebView shell (JS/DOM storage/DB enabled)
│       └── res/
│           ├── mipmap-*/            # App icon at all densities
│           └── values/              # strings.xml, styles.xml
├── build.gradle                     # Root build file (AGP version)
├── settings.gradle
└── gradle.properties                # Constrained JVM heap for low-RAM build hosts
```

## Building

Requires: JDK 17+, Android SDK (`platform-tools`, `platforms;android-34`,
`build-tools;34.0.0`), and Gradle 8.7 (or the wrapper, once
`gradle wrapper` has been run once with network access to
`services.gradle.org`).

```bash
export ANDROID_HOME=/path/to/android-sdk
cd android-app
echo "sdk.dir=$ANDROID_HOME" > local.properties
gradle assembleRelease --no-daemon
```

Output: `app/build/outputs/apk/release/app-release-unsigned.apk`.

### Signing

Android requires every installable APK to be signed. This build does
**not** commit a keystore (private signing keys should never live in
source control). To produce an installable APK:

```bash
# 1. Generate a keystore (do this once, store it securely, back it up —
#    losing it means you can never publish an update under the same
#    signature again):
keytool -genkeypair -v \
  -keystore tradetrack-release.keystore -alias tradetrack \
  -keyalg RSA -keysize 2048 -validity 10000

# 2. Align + sign (from Android SDK build-tools):
zipalign -v -p 4 \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  app-release-aligned.apk

apksigner sign \
  --ks tradetrack-release.keystore --ks-key-alias tradetrack \
  --out TradeTrack-1.0.0.apk \
  app-release-aligned.apk

apksigner verify --verbose TradeTrack-1.0.0.apk
```

The APK distributed alongside this project was signed with a
throwaway, sandbox-generated keystore for demonstration/testing
purposes only — **replace it with a securely-stored production
keystore before publishing to the Play Store or distributing broadly**,
since whoever holds that key can publish updates that Android will
accept as coming from the same app.

## Known limitations

- Unsigned by any recognized CA / not published through Play Store, so
  users must enable "Install from unknown sources" to sideload it.
- No push notifications, no background sync outside of what the
  WebView + service worker already provide while the app is foregrounded.
- `APP_URL` in `MainActivity.java` is a compile-time constant (matches
  the desktop shell's `config.js` production fallback URL) rather than
  a runtime-configurable setting; update and rebuild to point at a
  different environment.
