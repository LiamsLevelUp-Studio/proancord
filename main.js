const { app, BrowserWindow, Menu, Tray, desktopCapturer, session, shell, dialog } = require('electron');
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

  mainWindow.webContents.session.clearCache().catch(() => {});
  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      window.proanchatDesktop = { version: '${app.getVersion()}', platform: '${process.platform}' };
    `).catch(() => {});
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.includes('action=restart_update')) {
      event.preventDefault();
      if (autoUpdater) {
        isQuitting = true;
        autoUpdater.quitAndInstall(false, true);
      }
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: 'allow' };
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F11') {
        const isFs = mainWindow.isFullScreen();
        mainWindow.setFullScreen(!isFs);
        event.preventDefault();
      } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
        mainWindow.webContents.reloadIgnoringCache();
        event.preventDefault();
      } else if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
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

function notifyRendererUpdater(data) {
  if (!mainWindow || !mainWindow.webContents) return;
  mainWindow.webContents.executeJavaScript(`
    if (typeof window.__handleDesktopUpdater === 'function') {
      window.__handleDesktopUpdater(${JSON.stringify(data)});
    }
  `).catch(() => {});
}

function initAutoUpdater() {
  if (!app.isPackaged || !autoUpdater) return;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => {
      notifyRendererUpdater({ status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
      notifyRendererUpdater({ status: 'available', version: info.version });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      notifyRendererUpdater({ status: 'downloading', percent: Math.round(progressObj.percent) });
    });

    autoUpdater.on('update-downloaded', (info) => {
      notifyRendererUpdater({ status: 'ready', version: info.version });
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update Ready — Proanchat',
          message: `Proanchat v${info.version} has finished downloading!`,
          detail: 'Would you like to restart Proanchat now to apply the update automatically?',
          buttons: ['Restart and Update Now', 'Later'],
          defaultId: 0
        }).then(({ response }) => {
          if (response === 0) {
            isQuitting = true;
            autoUpdater.quitAndInstall(false, true);
          }
        }).catch(() => {});
      }
    });

    autoUpdater.on('error', (err) => {
      notifyRendererUpdater({ status: 'error', error: err?.message || 'Update check failed' });
    });

    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 2 * 60 * 60 * 1000);
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
