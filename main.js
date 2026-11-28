const { app, BrowserWindow, Menu, Tray, desktopCapturer, session, shell } = require('electron');
const path = require('path');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (_) {}

const fs = require('fs');

const APP_URL = 'https://proanchat.com/';
let ICON_PATH = path.join(__dirname, 'icon.png');
if (!fs.existsSync(ICON_PATH) && fs.existsSync(path.join(__dirname, 'build', 'icon.png'))) {
  ICON_PATH = path.join(__dirname, 'build', 'icon.png');
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function setupMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  if (typeof session.defaultSession.setDisplayMediaRequestHandler === 'function') {
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        callback({ video: sources[0], audio: 'loopback' });
      } catch (_) {
        callback({});
      }
    });
  }
}

function createTray() {
  if (tray) return;
  try {
    tray = new Tray(ICON_PATH);
    tray.setToolTip('Proanchat');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Proanchat', click: showMainWindow },
      { type: 'separator' },
      {
        label: 'Quit Proanchat',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]));
    tray.on('click', showMainWindow);
    tray.on('double-click', showMainWindow);
  } catch (_) {}
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#08080a',
    icon: ICON_PATH,
    title: 'Proanchat',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const baseUa = mainWindow.webContents.getUserAgent();
  mainWindow.webContents.setUserAgent(`${baseUa} ProanchatDesktop/${app.getVersion()}`);

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: 'allow' };
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      const isFs = mainWindow.isFullScreen();
      mainWindow.setFullScreen(!isFs);
      event.preventDefault();
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initAutoUpdater() {
  if (!app.isPackaged || !autoUpdater) return;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', () => {});
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 4 * 60 * 60 * 1000);
  } catch (_) {}
}

app.on('second-instance', showMainWindow);

app.whenReady().then(() => {
  app.setAppUserModelId('com.proanchat.desktop');
  setupMediaPermissions();
  createTray();
  createWindow();
  initAutoUpdater();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
  else showMainWindow();
});
