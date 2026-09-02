const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronPOS", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (cfg) => ipcRenderer.invoke("save-config", cfg),
  // Silently prints a receipt (no dialog, no click) to the configured/default printer.
  printReceipt: (html) => ipcRenderer.invoke("print-receipt", html),
  // Lists installed printers so Settings can offer a picker.
  getPrinters: () => ipcRenderer.invoke("get-printers"),
});
