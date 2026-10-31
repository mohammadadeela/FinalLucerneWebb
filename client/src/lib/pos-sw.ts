/* Lets the POS open with no internet (POS pages only — see client/public/pos-sw.js).
   Registered only from the POS page, and only in the real (production) build. */

export function registerPosServiceWorker() {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  // Scope "/admin/pos" = the POS and the customer display. The storefront is never controlled by it.
  navigator.serviceWorker.register("/pos-sw.js", { scope: "/admin/pos" }).catch(() => {});
}

/** On logout, forget the saved login so a signed-out PC can't open the POS from the cache. */
export function clearPosOfflineLoginCache() {
  try {
    navigator.serviceWorker?.getRegistration("/admin/pos").then((reg) => {
      (reg?.active || reg?.waiting)?.postMessage({ type: "clear-api-cache" });
    });
  } catch { /* no service worker: nothing to clear */ }
}
