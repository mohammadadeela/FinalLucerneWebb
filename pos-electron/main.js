const { app, BrowserWindow, Menu, shell, dialog, ipcMain, screen, net } = require("electron");
const path = require("path");
const fs = require("fs");

// ── Load config ────────────────────────────────────────────────────────────
const configPath = path.join(__dirname, "config.json");
let config = { url: "", posPath: "/admin/pos", fullscreen: true, kiosk: false, printerName: "", paperWidthMm: 80 };
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (e) {
  console.error("Could not read config.json:", e.message);
}

let POS_URL = (config.url || "").replace(/\/$/, "") + (config.posPath || "/admin/pos");
let CUSTOMER_URL = (config.url || "").replace(/\/$/, "") + "/admin/pos-customer";

let mainWindow = null;
let customerWindow = null;
let customerRetryTimer = null;

// Accepts what a cashier might realistically type ("lucerne-boutique.com",
// "https://lucerne-boutique.com/") and returns a clean https/http origin, or
// null when it can't possibly be a store address.
function normalizeStoreUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = "https://" + raw;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname) return null;
    const pathname = u.pathname.replace(/\/+$/, "");
    return u.origin + pathname;
  } catch {
    return null;
  }
}

// (Re)loads the store in the main window. Load failures are reported through
// the "did-fail-load" handler below, so the rejected promise is swallowed here
// instead of surfacing as an unhandled rejection.
function loadStore() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!config.url || config.url.includes("YOUR-APP-URL")) {
    mainWindow.loadFile(path.join(__dirname, "setup.html"));
    return;
  }
  mainWindow.loadURL(POS_URL).catch(() => {});
}

// Lucerne logo icon — used by every window so the taskbar/window icon is always the logo
const APP_ICON = path.join(__dirname, "assets", process.platform === "win32" ? "icon.ico" : "icon.png");

// ── Customer-facing display window (2nd monitor) ────────────────────────────
// The web page tries to open /admin/pos-customer itself via window.open() and
// the browser Window Management API, but that API isn't available inside a
// packaged Electron app, so it can never actually detect/move to a second
// monitor on its own. We intercept that window.open() call in the main
// process instead and position the window ourselves using Electron's native
// `screen` module, which reliably enumerates real connected monitors.
function getCustomerDisplay() {
  const displays = screen.getAllDisplays();
  const mainDisplay = mainWindow
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  // Prefer any monitor that isn't the one the POS window is currently on.
  const other = displays.find((d) => d.id !== mainDisplay.id);
  return other || mainDisplay; // Only one monitor connected — fall back to it.
}

function openCustomerWindow(targetUrl) {
  const { x, y, width, height } = getCustomerDisplay().bounds;

  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.setFullScreen(false);
    customerWindow.setBounds({ x, y, width, height });
    customerWindow.setFullScreen(true);
    customerWindow.show();
    customerWindow.focus();
    if (targetUrl && customerWindow.webContents.getURL() !== targetUrl) {
      customerWindow.loadURL(targetUrl).catch(() => {});
    }
    return customerWindow;
  }

  customerWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#0f0f0f",
    icon: APP_ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  customerWindow.setMenu(null);

  customerWindow.once("ready-to-show", () => {
    // Re-apply bounds right before showing in case the monitor layout
    // changed between window creation and page load.
    const bounds = getCustomerDisplay().bounds;
    customerWindow.setBounds(bounds);
    customerWindow.setFullScreen(true);
    customerWindow.show();
  });

  customerWindow.loadURL(targetUrl).catch(() => {});

  // The customer-facing screen must never show a technical error to shoppers.
  // If the connection is down it simply stays on its dark background and
  // quietly retries until the store loads again.
  customerWindow.webContents.on("did-fail-load", (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    if (customerRetryTimer) return;
    customerRetryTimer = setTimeout(() => {
      customerRetryTimer = null;
      if (customerWindow && !customerWindow.isDestroyed()) {
        customerWindow.loadURL(CUSTOMER_URL).catch(() => {});
      }
    }, 5000);
  });
  customerWindow.webContents.on("render-process-gone", (_e, details) => {
    if (details.reason === "clean-exit") return;
    setTimeout(() => {
      if (customerWindow && !customerWindow.isDestroyed()) {
        customerWindow.loadURL(CUSTOMER_URL).catch(() => {});
      }
    }, 2000);
  });

  customerWindow.on("closed", () => {
    clearTimeout(customerRetryTimer);
    customerRetryTimer = null;
    customerWindow = null;
  });

  return customerWindow;
}

// Re-position the customer window automatically if monitors are
// connected/disconnected while the app is running (e.g. cashier plugs in
// the customer-facing monitor after launching the app). Registered from
// app.whenReady() below — the `screen` module can't be touched before that.
function repositionCustomerWindow() {
  if (customerWindow && !customerWindow.isDestroyed()) {
    const { x, y, width, height } = getCustomerDisplay().bounds;
    customerWindow.setFullScreen(false);
    customerWindow.setBounds({ x, y, width, height });
    customerWindow.setFullScreen(true);
  }
}

// Auto-trigger the exact same "تكبير الشاشة / Fullscreen" button the
// cashier would otherwise have to click by hand — hides the admin
// sidebar/topbar, engages the page's own fullscreen mode, and moves the
// customer display over, all through the page's real button click so it
// behaves identically either way. Retries briefly since the POS page is a
// client-rendered SPA and may not have the button mounted the instant
// "did-finish-load" fires.
function enlargePosView(attempt = 0) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(
      `(function() {
        var btn = document.querySelector('[data-testid="button-pos-fullscreen-toggle"]');
        if (!btn) return "no-button";
        var alreadyBig = btn.title && btn.title.indexOf('تصغير') !== -1;
        if (!alreadyBig) btn.click();
        return alreadyBig ? "already-big" : "clicked";
      })();`,
      true,
    )
    .then((result) => {
      if (result === "no-button" && attempt < 10) {
        setTimeout(() => enlargePosView(attempt + 1), 300);
      }
    })
    .catch(() => {
      if (attempt < 10) setTimeout(() => enlargePosView(attempt + 1), 300);
    });
}

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
    icon: APP_ICON,
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
    loadStore();
    // Open the customer display and auto-enlarge the POS view every time
    // the page (re)loads — first launch, F5 reload, or after a settings
    // change — not just the very first load.
    mainWindow.webContents.on("did-finish-load", () => {
      openCustomerWindow(CUSTOMER_URL);
      enlargePosView();
    });
  }

  // Show the friendly error page only when the MAIN page itself fails to load.
  // This event also fires for failed sub-resources/frames and for harmless
  // aborted navigations (code -3, e.g. a redirect or a reload mid-load);
  // replacing the POS with an error screen for those would be wrong.
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    if (validatedURL && validatedURL.startsWith("file:")) return; // never loop on our own pages
    if (!mainWindow || mainWindow.isDestroyed()) return;
    console.error("Load failed:", code, desc, validatedURL);
    mainWindow.loadFile(path.join(__dirname, "error.html"), {
      query: { code: String(code), desc: String(desc || "") },
    });
  });

  // If the page's process crashes or freezes, recover instead of leaving the
  // cashier with a blank/frozen window.
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    if (details.reason === "clean-exit") return;
    console.error("Renderer gone:", details.reason);
    setTimeout(loadStore, 1000);
  });
  mainWindow.on("unresponsive", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    dialog
      .showMessageBox(mainWindow, {
        type: "warning",
        title: "Lucerne POS",
        message: "الصفحة لا تستجيب\nThe page is not responding",
        detail: "يمكنك الانتظار قليلاً أو إعادة تحميل الصفحة.\nYou can wait a moment or reload the page.",
        buttons: ["انتظار / Wait", "إعادة تحميل / Reload"],
        defaultId: 0,
        cancelId: 0,
      })
      .then(({ response }) => {
        if (response === 1) mainWindow?.webContents.reload();
      })
      .catch(() => {});
  });

  // The POS web page opens the customer-facing screen itself via
  // window.open("/admin/pos-customer", ...). Catch that here so we can
  // create/position a real second BrowserWindow on the secondary monitor
  // instead of letting Electron open a default, unpositioned popup.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes("/admin/pos-customer") || url.includes("pos-customer")) {
      openCustomerWindow(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (customerWindow && !customerWindow.isDestroyed()) customerWindow.close();
  });

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
          label: "🖵  شاشة العميل / Customer Screen",
          accelerator: "F6",
          click: () => openCustomerWindow(CUSTOMER_URL),
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
    icon: APP_ICON,
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
    const incoming = { ...(newConfig || {}) };

    // Validate what the cashier typed BEFORE touching anything, so a typo can
    // never leave the app pointing at an address that can't load.
    if (incoming.url !== undefined) {
      const cleaned = normalizeStoreUrl(incoming.url);
      if (!cleaned) return { ok: false, error: "invalid-url" };
      incoming.url = cleaned;
    }
    if (incoming.posPath !== undefined) {
      const p = String(incoming.posPath || "").trim();
      incoming.posPath = p ? (p.startsWith("/") ? p : "/" + p) : "/admin/pos";
    }
    if (incoming.paperWidthMm !== undefined) {
      const w = Number(incoming.paperWidthMm);
      if (!Number.isFinite(w) || w < 30 || w > 120) return { ok: false, error: "invalid-width" };
      incoming.paperWidthMm = w;
    }

    // Write first; only apply and reload if the file was really saved, so the
    // screen never claims success for a setting that is lost on restart.
    const next = { ...config, ...incoming };
    try {
      fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
    } catch (err) {
      console.error("Could not write config.json:", err.message);
      return { ok: false, error: "write-failed" };
    }
    config = next;
    POS_URL = (config.url || "").replace(/\/$/, "") + (config.posPath || "/admin/pos");
    CUSTOMER_URL = (config.url || "").replace(/\/$/, "") + "/admin/pos-customer";
    loadStore();
    if (customerWindow && !customerWindow.isDestroyed()) {
      customerWindow.loadURL(CUSTOMER_URL).catch(() => {});
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Connection-error screen helpers ─────────────────────────────────────────
// The error page uses these to actually retry (its old "Retry" button only
// reloaded the error page itself) and to open Settings.
ipcMain.handle("retry-load", () => {
  loadStore();
  return { ok: true };
});

ipcMain.handle("open-settings", () => {
  openSettings();
  return { ok: true };
});

// Real reachability check against the store's own health endpoint — more
// trustworthy than "is a network adapter up?", which says nothing about
// whether the store can actually be reached.
ipcMain.handle("check-connection", async () => {
  const base = (config.url || "").replace(/\/$/, "");
  if (!base) return { ok: false };
  try {
    const doFetch = typeof net.fetch === "function" ? net.fetch.bind(net) : fetch;
    const res = await doFetch(base + "/api/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
});

// ── Silent receipt printing ─────────────────────────────────────────────────
// Called from the POS web page (via preload) the instant a sale completes.
// Renders the receipt HTML in an invisible window and prints it straight to
// the configured (or system default) printer with NO print dialog and NO
// click required — this is the piece a normal browser can never do, since
// window.print() in a browser always shows the native dialog.
// Tells the cashier something useful BEFORE trying to print, instead of a
// cryptic driver error afterwards. Returns an error code, or null when fine.
async function checkPrinterReady() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  let printers;
  try {
    printers = await mainWindow.webContents.getPrintersAsync();
  } catch {
    return null; // can't list printers — just attempt the print
  }
  if (!printers || printers.length === 0) return "no-printer";
  if (config.printerName && !printers.some((p) => p.name === config.printerName)) {
    return "printer-not-found";
  }
  return null;
}

const PRINT_HANG_TIMEOUT_MS = 60000;

ipcMain.handle("print-receipt", async (_e, html) => {
  if (typeof html !== "string" || !html.trim()) return { ok: false, error: "empty-receipt" };
  const notReady = await checkPrinterReady();
  if (notReady) return { ok: false, error: notReady };
  return new Promise((resolveRaw) => {
    // Settle exactly once, and never hang forever: if the printer/spooler
    // stops answering, the cashier gets a clear failure instead of silence.
    let finished = false;
    let hangTimer = null;
    const resolve = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(hangTimer);
      resolveRaw(result);
    };
    // The window must render at the SAME width the paper actually is —
    // otherwise text wraps differently between what gets measured and what
    // gets printed (a wider on-screen window wraps to fewer, taller lines
    // than the narrow 80mm paper does), so the calculated page height ends
    // up too short and the bottom of the receipt — footer, policy text —
    // gets cut off. 1mm = 96/25.4 CSS px.
    //
    // paperWidthMm (Settings screen) should be the exact measured
    // printable width, not the nominal paper size — most thermal printers
    // can't mark all the way to the edge of the paper roll itself, so the
    // printable area is narrower than the paper. A tiny 1mm safety margin
    // covers only rounding, not printer guesswork, since the configured
    // value is already the real usable width.
    const PRINT_EDGE_SAFETY_MM = 1;
    const paperWidthMm = Math.max(30, (config.paperWidthMm || 77) - PRINT_EDGE_SAFETY_MM);
    const paperWidthPx = Math.round((paperWidthMm / 25.4) * 96);
    const printWin = new BrowserWindow({
      width: paperWidthPx,
      height: 1600,
      useContentSize: true, // width/height above apply to content, not window chrome
      x: -4000,
      y: -4000,
      // A fully hidden (show:false) window can have its layout/paint pass
      // skipped or cut short by Chromium, which was the real cause of
      // receipts printing only partway through. Actually rendering the
      // window — just positioned far off-screen — fixes that; the cashier
      // never sees it appear.
      show: true,
      frame: false,
      skipTaskbar: true,
      resizable: false,
      webPreferences: { sandbox: true },
    });
    let settled = false;
    const cleanup = () => {
      if (!printWin.isDestroyed()) printWin.close();
    };
    hangTimer = setTimeout(() => {
      cleanup();
      resolve({ ok: false, error: "print-timeout" });
    }, PRINT_HANG_TIMEOUT_MS);
    const doPrint = () => {
      if (settled) return;
      settled = true;
      // Give the page a moment to fully finish layout and paint (fonts,
      // the inline SVG logo) before measuring/printing it — doing this
      // immediately on did-finish-load was racing ahead of the layout.
      setTimeout(async () => {
        if (printWin.isDestroyed()) return;
        // Measure the receipt's actual rendered height, at the real print
        // width set above, so the print page size matches exactly. Take
        // the larger of body/documentElement scrollHeight — they can
        // disagree slightly depending on margin collapsing.
        let contentHeightPx = 1200;
        try {
          contentHeightPx = await printWin.webContents.executeJavaScript(
            "Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)",
          );
        } catch {}
        // 1 CSS px = 25400/96 microns. The printed receipt was still
        // getting cut off at a fixed point even after matching the print
        // width exactly, which points to the printer driver not fully
        // honoring an exact custom page height — so on top of the normal
        // unit conversion, pad generously: +15% and a fixed 25mm on top,
        // cheap insurance since unused length just doesn't get printed on
        // a continuous thermal roll.
        const MICRONS_PER_PX = 25400 / 96;
        const PAPER_WIDTH_MICRONS = Math.round(paperWidthMm * 1000);
        const heightMicrons =
          Math.ceil(contentHeightPx * MICRONS_PER_PX * 1.15) + 25000;
        printWin.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: config.printerName || undefined,
            pageSize: { width: PAPER_WIDTH_MICRONS, height: heightMicrons },
            // Explicit zeroed custom margins instead of the "none" keyword
            // — more consistently honored across Electron/driver versions.
            margins: { marginType: "custom", top: 0, bottom: 0, left: 0, right: 0 },
          },
          (success, failureReason) => {
            cleanup();
            resolve({ ok: success, error: success ? null : failureReason });
          },
        );
      }, 500);
    };
    printWin.webContents.on("did-finish-load", doPrint);
    printWin.webContents.on("did-fail-load", (_ev, _code, desc) => {
      cleanup();
      resolve({ ok: false, error: desc || "load-failed" });
    });
    printWin.loadURL("data:text/html;charset=UTF-8," + encodeURIComponent(html));
  });
});

// Lets the Settings screen list installed printers so the cashier can pick
// which one receipts should silently go to (defaults to the system default
// printer when left blank).
ipcMain.handle("get-printers", async () => {
  try {
    return (await mainWindow?.webContents.getPrintersAsync()) || [];
  } catch {
    return [];
  }
});

// ── Safety nets ─────────────────────────────────────────────────────────────
// Without these, an unexpected error in the main process pops up Electron's
// raw "A JavaScript error occurred in the main process" dialog in front of
// the cashier. Log it instead and keep the POS running.
process.on("uncaughtException", (err) => console.error("[main] uncaughtException:", err));
process.on("unhandledRejection", (reason) => console.error("[main] unhandledRejection:", reason));

// ── App lifecycle ────────────────────────────────────────────────────────────
// Windows groups the taskbar button by this id and shows the app's own icon
// (the Lucerne logo) instead of the default Electron icon.
app.setAppUserModelId("com.lucerneboutique.pos");

app.whenReady().then(() => {
  createWindow();
  // Safe to touch the `screen` module only from here on.
  screen.on("display-added", repositionCustomerWindow);
  screen.on("display-removed", repositionCustomerWindow);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
