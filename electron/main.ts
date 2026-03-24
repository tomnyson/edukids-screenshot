import {
  app, BrowserWindow, ipcMain, desktopCapturer,
  dialog, clipboard, nativeImage, NativeImage, screen, session,
  globalShortcut, Tray, Menu,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Flag set to true just before app.quit() so window 'close' handler lets the exit happen
let isQuitting = false;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = !!process.env.VITE_DEV_SERVER_URL;

const getPreloadPath = () => {
  if (isDev) return path.join(__dirname, 'preload.js');
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-electron', 'preload.js');
};

// Resolve tray icon PNG — works in both dev and production
const getTrayIconPath = () => {
  if (isDev) {
    // In dev mode, __dirname is the dist-electron folder after build,
    // but we serve from source — use the project root
    return path.join(__dirname, '..', 'build', 'tray-icon.png');
  }
  // In production, icon is copied into Resources by electron-builder
  return path.join(process.resourcesPath, 'build', 'tray-icon.png');
};

// ── Tray icon ────────────────────────────────────────────────────────
function createTrayIcon(): NativeImage {
  const iconPath = getTrayIconPath();
  let img: NativeImage;
  if (fs.existsSync(iconPath)) {
    img = nativeImage.createFromPath(iconPath);
    // macOS Status Bar icon must be 22×22pt (44×44 for Retina @2x)
    // Large PNGs must be explicitly resized or they won't appear
    img = img.resize({ width: 22, height: 22 });
  } else {
    img = nativeImage.createEmpty();
  }
  return img;
}

// ── Tray menu ─────────────────────────────────────────────────────────────────
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: '📷  Chụp vùng  (⌘⇧2)',
      click: () => triggerCapture('region'),
    },
    {
      label: '🖥️  Chụp toàn màn hình  (⌘⇧3)',
      click: () => triggerCapture('full'),
    },
    { type: 'separator' },
    {
      label: '🪟  Mở cửa sổ',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: 'Thoát',
      click: () => {
        isQuitting = true;
        tray?.destroy();
        tray = null;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Screenshot Tool');
  tray.setContextMenu(buildTrayMenu());

  // Left-click on macOS menu bar icon → show context menu (same as right-click)
  tray.on('click', () => {
    tray?.popUpContextMenu();
  });
}

// ── Main window ───────────────────────────────────────────────────────────────
const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#030712',
    // Start hidden — app lives in tray
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    const indexHtml = path.join(app.getAppPath(), 'dist', 'index.html');
    mainWindow.loadFile(indexHtml);
  }

  // When user closes the window, hide it instead of quitting (keep tray alive)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
};

function showMainWindow() {
  if (!mainWindow) createMainWindow();
  mainWindow!.show();
  mainWindow!.focus();
}

// ── Capture helpers ───────────────────────────────────────────────────────────
async function triggerCapture(mode: 'region' | 'full') {
  // Ensure window is loaded and ready
  if (!mainWindow) {
    createMainWindow();
    // Wait for the renderer to be ready before sending IPC
    mainWindow!.once('ready-to-show', () => {
      setTimeout(() => {
        mainWindow?.webContents.send(
          mode === 'region' ? 'trigger-capture-region' : 'trigger-capture-full'
        );
      }, 300);
    });
  } else {
    mainWindow.webContents.send(
      mode === 'region' ? 'trigger-capture-region' : 'trigger-capture-full'
    );
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // macOS: prevent app icon from appearing in Dock when running as tray-only app
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  // Allow getUserMedia (screen capture) in renderer process.
  session.defaultSession.setPermissionRequestHandler((_wc: any, permission: string, callback: (granted: boolean) => void) => {
    const allowed = ['media', 'display-capture', 'screen'].includes(permission);
    callback(allowed);
  });
  session.defaultSession.setPermissionCheckHandler((_wc: any, permission: string) => {
    return ['media', 'display-capture', 'screen'].includes(permission);
  });

  createTray();
  createMainWindow(); // preload the window so captures are instant

  // Cmd+Shift+2 → region capture
  globalShortcut.register('CommandOrControl+Shift+2', () => triggerCapture('region'));
  // Cmd+Shift+3 → full screen capture
  globalShortcut.register('CommandOrControl+Shift+3', () => triggerCapture('full'));
});

// Keep app alive when all windows are closed (tray app)
app.on('window-all-closed', () => {
  // On macOS tray apps, do NOT quit when the window is closed
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  // Standard macOS activate (dock click) — show the window
  showMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  // Destroy all windows so no 'close' handler can call preventDefault
  if (overlayWindow) { overlayWindow.destroy(); overlayWindow = null; }
  if (mainWindow) { mainWindow.destroy(); mainWindow = null; }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
});

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
    });
    return sources.map(s => ({ id: s.id, name: s.name }));
  } catch (err) {
    console.error('get-sources error:', err);
    return [];
  }
});

ipcMain.handle('save-image', async (_, dataUrl: string, defaultName: string) => {
  if (!mainWindow) return false;
  showMainWindow(); // bring window up for the save dialog
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Screenshot',
    defaultPath: defaultName,
    filters: [{ name: 'Images', extensions: ['png', 'jpg'] }],
  });
  if (filePath) {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return true;
  }
  return false;
});

ipcMain.handle('copy-image', async (_, dataUrl: string) => {
  const image = nativeImage.createFromDataURL(dataUrl);
  clipboard.writeImage(image);
  return true;
});

ipcMain.handle('hide-window', () => {
  mainWindow?.hide();
});

ipcMain.handle('show-window', () => {
  showMainWindow();
});

// ── Overlay (region selector) ─────────────────────────────────────────────────
let overlayWindow: BrowserWindow | null = null;
let overlayDataUrl: string | null = null;

ipcMain.handle('get-overlay-image', () => overlayDataUrl);

ipcMain.handle('start-region-capture', async (_, dataUrl: string) => {
  if (overlayWindow) return;
  overlayDataUrl = dataUrl;

  const display = screen.getPrimaryDisplay();

  overlayWindow = new BrowserWindow({
    ...display.bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    hasShadow: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  overlayWindow.setBounds(display.bounds);
  overlayWindow.setResizable(false);
  overlayWindow.setMovable(false);

  if (isDev) {
    overlayWindow.loadURL(process.env.VITE_DEV_SERVER_URL! + '#overlay');
  } else {
    const indexHtml = path.join(app.getAppPath(), 'dist', 'index.html');
    overlayWindow.loadFile(indexHtml, { hash: 'overlay' });
  }
});

ipcMain.handle('close-overlay', (_, finalDataUrl: string | null) => {
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
    overlayDataUrl = null;
  }
  if (finalDataUrl && mainWindow) {
    // Show the editor window with the captured image
    showMainWindow();
    mainWindow.webContents.send('region-captured', finalDataUrl);
  }
});
