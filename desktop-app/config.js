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
 * The target ORIGIN (domain root, no path) is resolved in this order:
 *   1. TRADETRACK_APP_URL environment variable (set by the installer /
 *      IT admin for a specific deployment)
 *   2. A `tradetrack-config.json` file next to the packaged app (lets a
 *      reseller/IT admin repoint the installer at their own deployment
 *      without rebuilding)
 *   3. The default production URL baked in at build time below.
 *
 * NOTE: this file intentionally has exactly ONE hardcoded domain, in
 * exactly ONE place — the DEFAULT_APP_URL constant immediately below.
 * Nothing else in this file (or main.js) should ever hardcode a second
 * copy of the domain. If tradetrack.com (or any other domain) is
 * secured as the production domain later, this is the only line that
 * needs to change before running `npm run build:win` again — no other
 * hardcode exists anywhere in the desktop shell.
 */

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────
// >>> UPDATE THIS ONE LINE when the production domain is finalized. <<<
// This is TradeTrack's own hosted deployment origin (no trailing slash,
// no path). Do NOT assume tradetrack.com is secured yet — keep
// tradetrack.ng here until told otherwise. Changing this alone (and
// re-running `npm run build:win`) repoints the installer; it can also
// be overridden without rebuilding via TRADETRACK_APP_URL or
// tradetrack-config.json (see getAppUrl() below).
// ─────────────────────────────────────────────────────────────────
const DEFAULT_APP_URL = 'https://tradetrack.ng';

// The path the shell opens on launch. "/" now serves the public
// marketing site (logged-out); traders should land straight on
// /login instead — the web app's own auth middleware silently
// forwards an already-authenticated session on to /dashboard, so
// returning users see no extra step. This is derived from
// DEFAULT_APP_URL/getAppUrl() above, NOT a second hardcoded domain.
const DEFAULT_LAUNCH_PATH = '/login';

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

// The URL the BrowserWindow actually navigates to on launch: the
// resolved origin (from getAppUrl(), honoring the same env-var /
// config-file / default chain) plus DEFAULT_LAUNCH_PATH. Kept as a
// *derived* value rather than a second hardcoded URL so overriding
// TRADETRACK_APP_URL or tradetrack-config.json's `appUrl` continues to
// work exactly as documented, and so main.js's external-link detection
// (which compares against the plain origin) is unaffected by the
// "start on /login" behavior.
function getLaunchUrl() {
  try {
    const origin = new URL(getAppUrl()).origin;
    return `${origin}${DEFAULT_LAUNCH_PATH}`;
  } catch {
    return `${DEFAULT_APP_URL}${DEFAULT_LAUNCH_PATH}`;
  }
}

module.exports = {
  getAppUrl,
  getLaunchUrl,
  getVersionCheckUrl,
  DEFAULT_APP_URL,
  DEFAULT_LAUNCH_PATH,
};
