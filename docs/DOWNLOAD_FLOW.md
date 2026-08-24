# TradeTrack — Download & Distribution Flow

How a trader actually gets TradeTrack onto their device, and how the
pieces (public `/download` page, native shells, update-check API, and
`render.yaml` env vars) fit together.

---

## Overview

TradeTrack is, first and foremost, an **offline-first Progressive Web App
(PWA)** — everything described below is a thin wrapper or install path
around that same web app, not a separate product with its own feature set.

| Platform | Distribution mechanism | Status |
|---|---|---|
| **Windows** | Thin Electron wrapper (`desktop-app/`) → `.exe` NSIS installer, side-loaded (no Microsoft Store listing) | Built |
| **Android** | Thin native WebView wrapper (`android-app/`) → `.apk`, side-loaded (no Play Store listing) | Built |
| **Desktop browser (Chrome/Edge, incl. ChromeOS/Linux)** | Standard PWA "Install App" (`beforeinstallprompt`) | Available today |
| **iOS / macOS** | No native build exists. iOS: PWA "Add to Home Screen" via Safari works today. macOS: `electron-builder` config only defines a `win` target — no Mac build exists at all yet. | "Coming soon" card on `/download`, honest that no downloadable installer exists |

Both native shells (`desktop-app/`, `android-app/`) deliberately **wrap**
the existing offline-first PWA rather than reimplement it — TradeTrack
already ships a service worker (`public/sw.js`), an IndexedDB-backed local
store (`idb`), and a `SyncEngine` (`src/lib/offline/sync-engine.ts`), so
the native shells are just a `BrowserWindow` / `WebView` pointed at the
deployed app URL, plus a handful of native affordances (icon, menu,
external-link handling, update-check polling). See `desktop-app/README.md`
and `android-app/README.md` for full build instructions, signing steps,
and how to repoint a build at a different domain.

---

## The `/download` page (`src/app/(marketing)/download/`)

This is the single public entry point traders use to get the app. It has
two files:

- **`page.tsx`** — Server Component. Reads the `TRADETRACK_*` env vars
  (same ones documented in `render.yaml` and `.env.example`) via
  `getVersionInfo()` and passes them down as props. This mirrors — but
  does **not** call over HTTP — the same data `GET /api/version` returns;
  both read from the same environment variables so they can never drift
  out of sync with each other.
- **`download-client.tsx`** — Client Component. Detects the visitor's OS
  and browser engine (`detectOS()` / `isChromiumBased()`, a simple
  user-agent sniff — it only decides which card to show first, it never
  gates anything security-sensitive) and renders up to four cards:
  1. **Windows Desktop** — direct `.exe` download button (only rendered if
     `TRADETRACK_WINDOWS_DOWNLOAD_URL` is set; otherwise shows "Download
     link not configured yet").
  2. **Android** — a native "Install App (Chrome)" PWA-install button
     (Chromium-based Android browsers only, via `beforeinstallprompt`)
     *and* a direct `.apk` download button (only rendered if
     `TRADETRACK_ANDROID_DOWNLOAD_URL` is set).
  3. **Desktop Browser (Chrome/Edge)** — generic PWA install button, for
     any Chromium-based desktop browser (Windows, macOS, Linux, ChromeOS).
  4. **iOS & macOS** — always shows a "Coming Soon" badge and an honest
     explanation instead of a broken/misleading link, with a pointer to
     use TradeTrack directly in Safari as a stand-in.

The page never claims a download is available when it isn't: every
"Download" button is conditionally rendered on the corresponding env var
actually being set, and the iOS/macOS card is explicit that no build
exists rather than implying one is imminent.

---

## The update-check API (`GET /api/version`)

`src/app/api/version/route.ts` is a small, public, always-on
(`export const dynamic = 'force-dynamic'`) endpoint that the *installed*
Electron and Android shells poll periodically to check whether a newer
build is available (see `desktop-app/main.js`'s `checkForUpdates()`).
Because both native shells are side-loaded (no Play Store / Microsoft
Store), there is no platform-provided update mechanism — this endpoint is
the entire "check for update" story today.

```json
{
  "api_version": "1.0.0",
  "latest": {
    "windows": { "version": "1.0.0", "download_url": "" },
    "android": { "version": "1.0.0", "download_url": "", "unknown_sources_help_url": "" }
  },
  "checked_at": "2026-08-24T00:00:00.000Z"
}
```

**Important — this is metadata only.** It does not serve, host, or proxy
any binary itself, and it does not trigger an automatic download/install —
both shells only *notify* the user that an update exists; the user must
still download and run/install the new build manually (see "Known
limitations" in each shell's README).

---

## Wiring up real installer downloads

Right now, `TRADETRACK_WINDOWS_DOWNLOAD_URL` and
`TRADETRACK_ANDROID_DOWNLOAD_URL` are blank in `render.yaml` / `.env.example`
— no binaries are committed to this git repository (correctly — binary
installers do not belong in source control), and none are hosted yet. To
go from "Built" to "Distributable", for each platform:

1. **Build the installer** — follow `desktop-app/README.md` (`electron-builder
   --win --x64 --publish never` → `dist/TradeTrack-Setup-<version>.exe`) or
   `android-app/README.md` (`gradle assembleRelease` → sign with a securely
   stored production keystore → `TradeTrack-<version>.apk`).
2. **Host the resulting file** somewhere with a stable public URL — a
   releases bucket (S3/R2/Supabase Storage), a GitHub Release asset, or a
   CDN. This repo does not include that hosting step; any static file host
   reachable over HTTPS works.
3. **Set the env var** on Render (or wherever you deploy — see
   `docs/DEPLOYMENT.md`) to that URL:
   - `TRADETRACK_WINDOWS_DOWNLOAD_URL=https://.../TradeTrack-Setup-1.0.0.exe`
   - `TRADETRACK_ANDROID_DOWNLOAD_URL=https://.../TradeTrack-1.0.0.apk`
   - Bump `TRADETRACK_WINDOWS_LATEST_VERSION` / `TRADETRACK_ANDROID_LATEST_VERSION`
     to match, so installed shells' update-check logic correctly detects
     the new version is newer than what they're running.
4. Redeploy. `/download` and `GET /api/version` immediately pick up the new
   values — no code change is required for a routine version bump.

For Android specifically, also set `TRADETRACK_ANDROID_UNKNOWN_SOURCES_HELP_URL`
to a support article explaining how to enable "Install from unknown
sources", since Android will show that warning for any side-loaded APK
that isn't distributed via the Play Store.

---

## Known gaps (carried over from the shell READMEs)

- **No code signing** — the Windows installer is unsigned (SmartScreen
  will warn "unknown publisher"); the Android APK is signed with a
  throwaway sandbox-generated keystore, not a production one. Both need
  a real certificate/keystore before wide distribution — see the
  "Known limitations" sections in `desktop-app/README.md` and
  `android-app/README.md`.
- **No macOS build** — `electron-builder`'s `package.json` config only
  defines a `win` target. The `/download` page's "Coming Soon" card for
  macOS reflects this accurately; it is not a placeholder for something
  already scheduled.
- **No automatic update install** — both shells only *check* for updates
  and prompt the user; they don't silently download/apply them.
