/**
 * Aegis desktop shell.
 *
 * - Single-instance lock (a second `parix` launch focuses the running window
 *   instead of opening a second one).
 * - Tray icon with show/hide/quit so Parix has a persistent presence.
 * - In production: loads the built Vite bundle from ../dist/index.html.
 *   In dev (AEGIS_DEV_URL set): loads the dev server URL so HMR works.
 *
 * Boot sequence: the PowerShell launcher starts Hands + Atrium first, then
 * launches this process. The renderer talks to the Aegis relay on
 * ws://localhost:8766 directly — no IPC required.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("node:path");
const { existsSync } = require("node:fs");

const isDev = !!process.env.AEGIS_DEV_URL;
const DEV_URL = process.env.AEGIS_DEV_URL || "http://localhost:3000";
const PROD_INDEX = path.join(__dirname, "..", "dist", "index.html");

let mainWindow = null;
let tray = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

function resolveIconPath() {
  const candidates = [
    path.join(__dirname, "icons", "parix.ico"),
    path.join(__dirname, "icons", "parix.png"),
    path.join(__dirname, "..", "public", "favicon.ico"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function createWindow() {
  const iconPath = resolveIconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: "Parix — Aegis",
    icon: iconPath ?? undefined,
    autoHideMenuBar: true,
    backgroundColor: "#0b0b0c",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Open external links in the user's default browser instead of inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else if (existsSync(PROD_INDEX)) {
    mainWindow.loadFile(PROD_INDEX);
  } else {
    // No build yet — fall through to dev URL so a fresh install isn't a blank screen.
    mainWindow.loadURL(DEV_URL);
  }

  // Closing the window hides to tray; only the tray Quit menu actually exits.
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = resolveIconPath();
  const image = iconPath
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(image);
  tray.setToolTip("Parix — Aegis");

  const menu = Menu.buildFromTemplate([
    {
      label: "Open Aegis",
      click: () => {
        if (!mainWindow) createWindow();
        else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit Parix",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);

  tray.on("click", () => {
    if (!mainWindow) {
      createWindow();
      return;
    }
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Keep the app alive in the tray on every platform — Aegis is a long-lived
  // companion process, not a document window.
});

app.on("before-quit", () => {
  app.isQuitting = true;
});
