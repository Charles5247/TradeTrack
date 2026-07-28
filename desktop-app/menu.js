/**
 * TradeTrack Desktop — native application menu.
 */

const { Menu, app, shell } = require('electron');
const { getAppUrl } = require('./config');

function buildMenu(mainWindow, checkForUpdates) {
  const template = [
    {
      label: 'TradeTrack',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload(),
        },
        {
          label: 'Go to Dashboard',
          click: () => mainWindow && mainWindow.loadURL(getAppUrl()),
        },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: () => checkForUpdates(true),
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow && mainWindow.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'TradeTrack Website',
          click: () => shell.openExternal(getAppUrl()),
        },
        {
          label: 'About TradeTrack',
          click: () => mainWindow && mainWindow.webContents.executeJavaScript(
            `alert('TradeTrack Desktop v${app.getVersion()}')`
          ),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };
