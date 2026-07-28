/**
 * TradeTrack Desktop — Electron main process.
 *
 * Thin native wrapper around the TradeTrack web app (see config.js for
 * why: the app is already offline-first via service worker + IndexedDB,
 * so there's no need to bundle a second Node/Next.js server inside the
 * installer). This process only owns window/menu/lifecycle management and
 * a lightweight "check for update" call against GET /api/version.
 */

const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const { getAppUrl, getVersionCheckUrl } = require('./config');
const { buildMenu } = require('./menu');

const APP_VERSION = app.getVersion();
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'TradeTrack',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Persist the offline IndexedDB / service-worker cache across app
      // restarts — critical for TradeTrack's offline-first design.
      partition: 'persist:tradetrack',
    },
  });

  Menu.setApplicationMenu(buildMenu(mainWindow, checkForUpdates));

  const targetUrl = getAppUrl();
  mainWindow.loadURL(targetUrl).catch((err) => {
    console.error('[TradeTrack Desktop] Failed to load app URL:', targetUrl, err);
    dialog.showErrorBox(
      'Unable to connect',
      `TradeTrack could not reach ${targetUrl}.\n\n` +
        'Check your internet connection and try again. Once TradeTrack has ' +
        'loaded successfully at least once, it will keep working offline ' +
        'for cached data and queued sales.'
    );
  });

  // Open any external links (e.g. "Learn more" links pointing off-app) in
  // the user's default browser instead of inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(targetUrl)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Lightweight update-check against GET /api/version (see
 * src/app/api/version/route.ts — metadata-only, no binary serving yet).
 * Compares the platform-specific `latest.windows.version` field against
 * this build's own app.getVersion() and, if newer, shows a native dialog
 * linking to the download URL (once one is configured server-side).
 */
function checkForUpdates(showUpToDateDialog = false) {
  const url = getVersionCheckUrl();
  const client = url.startsWith('https') ? https : http;

  const req = client.get(url, { timeout: 8000 }, (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const latest = payload?.latest?.windows?.version;
        const downloadUrl = payload?.latest?.windows?.download_url;
        if (latest && isNewerVersion(latest, APP_VERSION)) {
          dialog
            .showMessageBox(mainWindow, {
              type: 'info',
              title: 'Update available',
              message: `TradeTrack ${latest} is available (you have ${APP_VERSION}).`,
              buttons: downloadUrl ? ['Download', 'Later'] : ['OK'],
            })
            .then((result) => {
              if (downloadUrl && result.response === 0) {
                shell.openExternal(downloadUrl);
              }
            });
        } else if (showUpToDateDialog) {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'TradeTrack',
            message: `You're up to date (v${APP_VERSION}).`,
          });
        }
      } catch (err) {
        console.warn('[TradeTrack Desktop] Update check parse failed:', err);
        if (showUpToDateDialog) {
          dialog.showErrorBox('Update check failed', 'Could not check for updates right now.');
        }
      }
    });
  });

  req.on('error', (err) => {
    console.warn('[TradeTrack Desktop] Update check failed:', err.message);
    if (showUpToDateDialog) {
      dialog.showErrorBox('Update check failed', 'Could not reach the update server.');
    }
  });
}

function isNewerVersion(remote, local) {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

ipcMain.handle('app:get-version', () => APP_VERSION);
ipcMain.handle('app:check-for-updates', () => checkForUpdates(true));

app.whenReady().then(() => {
  createWindow();
  // Check for updates shortly after launch, silently (no dialog if already
  // up to date) — matches the "lightweight check for update call" spec.
  setTimeout(() => checkForUpdates(false), 4000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
