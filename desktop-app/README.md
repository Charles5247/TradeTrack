# TradeTrack Desktop App (Windows)

A thin Electron shell around the TradeTrack web app, packaged as a
standard NSIS `.exe` installer. See `../android-app/README.md` for the
Android counterpart — both shells follow the same "wrap the existing
offline-first PWA, don't reimplement it" philosophy.

## Why a thin wrapper (not a bundled Next.js server)?

TradeTrack already ships a production-grade offline-first architecture:
a service worker (`public/sw.js`), an IndexedDB-backed local store
(`idb`), and a `SyncEngine` that reconciles local writes with Supabase
once connectivity returns. Bundling a second Next.js server inside
Electron would duplicate that stack for no benefit — the app already
works fully offline in a browser tab. So this shell is just a
`BrowserWindow` pointed at the deployed app URL, with a **persistent
partition** (`persist:tradetrack`) so the IndexedDB cache and service
worker survive app restarts, plus native affordances (menu, external
link handling, update checks) layered on via a `contextBridge` preload
script.

## Files

- `main.js` — Electron main process: creates the window, loads the
  configured app URL, routes external links to the OS browser, polls
  `GET /api/version` for updates.
- `preload.js` — `contextBridge` API (`contextIsolation: true`,
  `nodeIntegration: false`) exposing `window.tradetrackDesktop`.
- `config.js` — resolves the app URL (env var → config file → production
  fallback).
- `menu.js` — native application menu.
- `assets/icon.ico` — multi-resolution Windows icon.
- `package.json` — `electron-builder` NSIS/win/x64 config.

## Building

```bash
cd desktop-app
npm install
npx electron-builder --win --x64 --publish never
```

Output: `dist/TradeTrack-Setup-1.0.0.exe` (NSIS installer).

### Sandbox-specific build notes

Building this on a low-resource Linux host (as opposed to a normal CI
runner or Windows machine) required two extra steps, recorded here for
reproducibility:

1. **`wine32:i386`** must be installed — `electron-builder`'s
   `winCodeSign`/`rcedit` resource-stamping step (setting the icon,
   version info, etc. on the `.exe`) needs a 32-bit wine binary even
   when only packaging an `x64` target:
   ```bash
   sudo dpkg --add-architecture i386
   sudo apt-get update
   sudo apt-get install -y wine32:i386
   ```
2. A **swapfile** helps avoid OOM kills during the native-dependency
   rebuild + NSIS packaging steps on machines with < 2GB RAM:
   ```bash
   sudo fallocate -l 3G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   ```

Neither is needed on a typical developer machine or CI runner with
several GB of RAM and a normal wine install (or when building on
actual Windows/macOS, where electron-builder doesn't need wine at all
for signing/resource-editing).

## Rebuilding with a different domain

`config.js` resolves the production URL in this order, so there are
three ways to point the shell at a different domain — from least to
most permanent:

1. **Environment variable (no rebuild)** — set `TRADETRACK_APP_URL`
   before launching the installed app, e.g. via a wrapper script or
   the OS environment. Takes effect immediately, no rebuild needed.
2. **`tradetrack-config.json` (no rebuild)** — drop a JSON file next
   to the installed executable (or in this directory during local
   testing) containing `{ "appUrl": "https://tradetrack.com" }`. Lets
   a reseller/IT admin repoint an already-installed copy without
   rebuilding or redistributing anything.
3. **Rebuild with the constant changed (permanent default)** — edit
   the single `DEFAULT_APP_URL` constant near the top of `config.js`
   (clearly marked with a comment block), then rebuild:
   ```bash
   npx electron-builder --win --x64 --publish never
   ```

**Do not assume `tradetrack.com` is secured yet.** `DEFAULT_APP_URL`
remains `https://tradetrack.ng` until told otherwise — this mechanism
only makes the domain swappable, it does not perform any actual
domain change.

Whichever method is used, the shell always launches at `{domain}/login`
(see `DEFAULT_LAUNCH_PATH` / `getLaunchUrl()` in `config.js`), not the
domain root — `/` on the web app now serves the public marketing site,
so launching at `/login` means an already-authenticated trader is
forwarded on to `/dashboard` automatically by the web app's own auth
middleware, with no extra step. This launch path is derived from
whichever origin resolves from steps 1–3 above; it is not a second
hardcoded URL, and `getAppUrl()` (the bare origin, used for the
external-link-vs-in-app-navigation check in `main.js`) is unaffected.

## Known limitations

- **Unsigned installer** — no code-signing certificate is available in
  this environment, so Windows SmartScreen will show an "unknown
  publisher" warning on install. Add a certificate and configure
  `win.certificateFile` / `win.certificatePassword` (or a cloud signing
  provider) in `package.json` before wide distribution.
- **Update checks only** — `checkForUpdates()` compares
  `GET /api/version` against `app.getVersion()` but does not
  download/install updates automatically; users must download and run
  the new installer themselves.
- **Windows only** — `package.json`'s `electron-builder` config only
  defines a `win` target (NSIS, x64). There is no macOS build; the
  public Download page must not claim one exists.
