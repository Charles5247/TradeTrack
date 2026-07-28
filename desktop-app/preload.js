/**
 * TradeTrack Desktop — preload script.
 *
 * Runs in an isolated context with access to a minimal, explicit bridge
 * (contextIsolation: true, nodeIntegration: false — see main.js) so the
 * loaded web app (TradeTrack running in the BrowserWindow) never gets
 * direct Node/Electron API access. Only the few things a POS desktop
 * shell legitimately needs are exposed, via `window.tradetrackDesktop`.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tradetrackDesktop', {
  /** True whenever this page is running inside the Electron shell. */
  isDesktopApp: true,
  platform: process.platform,
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('app:update-available', (_event, payload) => callback(payload));
  },
});
