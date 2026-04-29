const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// ── Load config ────────────────────────────────────────────────────────────
const configPath = path.join(__dirname, "config.json");
let config = { url: "", posPath: "/admin/pos", fullscreen: true, kiosk: false };
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (e) {
  console.error("Could not read config.json:", e.message);
}

const POS_URL = (config.url || "").replace(/\/$/, "") + (config.posPath || "/admin/pos");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Lucerne POS — نقطة البيع",
    fullscreen: config.fullscreen === true,
    kiosk: config.kiosk === true,
    backgroundColor: "#0f0f0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      session: require("electron").session.defaultSession,
    },
    icon: path.join(__dirname, "assets", process.platform === "win32" ? "icon.ico" : "icon.png"),
    show: false,
  });

  // Show splash until page loads
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (config.fullscreen) mainWindow.setFullScreen(true);
  });

  // If URL not configured, show setup screen
  if (!config.url || config.url.includes("YOUR-APP-URL")) {
    mainWindow.loadFile(path.join(__dirname, "setup.html"));
  } else {
    mainWindow.loadURL(POS_URL);
  }

  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    mainWindow.loadFile(path.join(__dirname, "error.html"));
    console.error("Load failed:", code, desc);
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: "POS",
      submenu: [
        {
          label: "🔄  تحديث الصفحة / Reload",
          accelerator: "F5",
          click: () => mainWindow?.webContents.reload(),
        },
        {
          label: "⬅️  رجوع / Back",
          accelerator: "Alt+Left",
          click: () => mainWindow?.webContents.canGoBack() && mainWindow.webContents.goBack(),
        },
        { type: "separator" },
        {
          label: "🖥️  ملء الشاشة / Fullscreen",
          accelerator: "F11",
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()),
        },
        { type: "separator" },
        {
          label: "⚙️  إعدادات / Settings",
          click: openSettings,
        },
        { type: "separator" },
        {
          label: "❌  إغلاق / Quit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Open in Browser",
          click: () => shell.openExternal(POS_URL),
        },
        {
          label: "About Lucerne POS",
          click: () => dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "About Lucerne POS",
            message: "Lucerne Boutique POS\nنقطة البيع",
            detail: `Version 1.0.0\nConnected to: ${config.url || "not configured"}`,
          }),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function openSettings() {
  const win = new BrowserWindow({
    width: 500,
    height: 340,
    title: "Settings — Lucerne POS",
    modal: true,
    parent: mainWindow,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile(path.join(__dirname, "settings.html"));
  win.setMenu(null);
}

// ── IPC handlers ────────────────────────────────────────────────────────────
ipcMain.handle("get-config", () => config);

ipcMain.handle("save-config", (_e, newConfig) => {
  try {
    config = { ...config, ...newConfig };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const newUrl = (config.url || "").replace(/\/$/, "") + (config.posPath || "/admin/pos");
    mainWindow?.loadURL(newUrl);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
