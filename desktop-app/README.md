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
