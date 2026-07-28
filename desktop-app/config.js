/**
 * TradeTrack Desktop — runtime configuration.
 *
 * TradeTrack is an offline-first Progressive Web App (IndexedDB + a
 * dependency-free service worker already ship in the Next.js app — see
 * public/sw.js and src/lib/offline/). This Electron shell intentionally
 * does NOT re-bundle a second copy of the Next.js server: it is a thin,
 * auto-updating native wrapper around the same web app, matching the
 * project's confirmed distribution strategy (see README.md → "Distribution
 * Strategy"). The web app's own offline engine (service worker app-shell
 * cache + IndexedDB sync queue) is what keeps the cashier working without
 * internet — this wrapper just gives it a taskbar icon, a native window,
 * and an installer.
 *
 * The target URL is resolved in this order:
 *   1. TRADETRACK_APP_URL environment variable (set by the installer /
 *      IT admin for a specific deployment)
 *   2. A `tradetrack-config.json` file next to the packaged app (lets a
 *      reseller/IT admin repoint the installer at their own deployment
 *      without rebuilding)
 *   3. The default production URL baked in at build time below.
 */

const fs = require('fs');
const path = require('path');

// Default: TradeTrack's own hosted deployment. Update this constant (and
// re-run `npm run build:win`) whenever the production URL changes, or
// override at runtime via TRADETRACK_APP_URL / tradetrack-config.json
// without needing to rebuild the installer at all.
const DEFAULT_APP_URL = 'https://tradetrack.ng';

function readConfigFile() {
  try {
    // Packaged app: look next to the executable (portable, IT-editable).
    const candidates = [
      path.join(process.resourcesPath || '', 'tradetrack-config.json'),
      path.join(__dirname, 'tradetrack-config.json'),
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.appUrl === 'string') {
          return parsed.appUrl;
        }
      }
    }
  } catch {
    // Ignore malformed config — fall back to default.
  }
  return null;
}

function getAppUrl() {
  if (process.env.TRADETRACK_APP_URL) {
    return process.env.TRADETRACK_APP_URL;
  }
  const fromFile = readConfigFile();
  if (fromFile) return fromFile;
  return DEFAULT_APP_URL;
}

// Public update-check endpoint (see src/app/api/version/route.ts) —
// resolved relative to the same origin as the app itself unless overridden.
function getVersionCheckUrl() {
  if (process.env.TRADETRACK_VERSION_URL) {
    return process.env.TRADETRACK_VERSION_URL;
  }
  try {
    const origin = new URL(getAppUrl()).origin;
    return `${origin}/api/version`;
  } catch {
    return `${DEFAULT_APP_URL}/api/version`;
  }
}

module.exports = { getAppUrl, getVersionCheckUrl, DEFAULT_APP_URL };
