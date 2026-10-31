import { create } from "zustand";

/* Connection monitor.

   `navigator.onLine` alone is not reliable (a device can be on a router with
   no internet and still report "online"), so the browser's offline/online
   events are only treated as hints. The source of truth is a tiny request to
   /api/health: if it answers, we're connected; if it doesn't, we're not.

   - Failed same-origin requests anywhere in the app trigger a health check
     (observe-only: the original error is always re-thrown untouched, so no
     existing screen changes behaviour).
   - While disconnected we re-check every few seconds and flip back
     automatically, so the cashier never has to reload the page.
   - A failed request does NOT immediately mean "offline": we confirm with the
     health check first, so a one-off glitch never flashes a false banner. */

const HEALTH_URL = "/api/health";
const PROBE_TIMEOUT_MS = 6000;
const RECHECK_MS = 4000;
const RESTORED_BANNER_MS = 3500;

type ConnectionState = { online: boolean; justRestored: boolean };

export const useConnection = create<ConnectionState>(() => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  justRestored: false,
}));

let nativeFetch: typeof fetch | null = null;
let checking: Promise<boolean> | null = null;
let recheckTimer: number | undefined;
let restoredTimer: number | undefined;

/** AbortSignal.timeout() where the browser has it, nothing where it doesn't —
 *  so an older browser simply skips the timeout instead of throwing. */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof (AbortSignal as any).timeout === "function"
    ? AbortSignal.timeout(ms)
    : undefined;
}

/** True when an error came from the network layer (no response at all). */
export function isNetworkError(err: unknown): boolean {
  const message = String((err as any)?.message ?? err ?? "");
  return /failed to fetch|networkerror|load failed|network request failed|network_error/i.test(message);
}

/** True when a request was cut off by an AbortSignal.timeout(). */
export function isTimeoutError(err: unknown): boolean {
  return (err as any)?.name === "TimeoutError";
}

async function probe(): Promise<boolean> {
  try {
    const doFetch = nativeFetch ?? window.fetch.bind(window);
    const res = await doFetch(`${HEALTH_URL}?t=${Date.now()}`, {
      cache: "no-store",
      signal: timeoutSignal(PROBE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function scheduleRecheck() {
  if (recheckTimer !== undefined) return;
  recheckTimer = window.setTimeout(() => {
    recheckTimer = undefined;
    void checkConnectionNow();
  }, RECHECK_MS);
}

function applyStatus(ok: boolean) {
  const { online } = useConnection.getState();
  if (ok) {
    if (recheckTimer !== undefined) {
      window.clearTimeout(recheckTimer);
      recheckTimer = undefined;
    }
    if (!online) {
      useConnection.setState({ online: true, justRestored: true });
      window.clearTimeout(restoredTimer);
      restoredTimer = window.setTimeout(
        () => useConnection.setState({ justRestored: false }),
        RESTORED_BANNER_MS,
      );
    }
    return;
  }
  if (online) useConnection.setState({ online: false, justRestored: false });
  scheduleRecheck();
}

/** Runs a real health check right now (de-duplicated) and updates the state. */
export function checkConnectionNow(): Promise<boolean> {
  if (checking) return checking;
  checking = probe()
    .then((ok) => {
      applyStatus(ok);
      return ok;
    })
    .finally(() => {
      checking = null;
    });
  return checking;
}

/** Cheap guard for "should I even try to send this?". Online → instant true.
 *  Marked offline → does a live check first so a stale flag never blocks work. */
export async function ensureOnline(): Promise<boolean> {
  if (useConnection.getState().online) return true;
  return checkConnectionNow();
}

function isSameOrigin(input: RequestInfo | URL): boolean {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(raw, window.location.href).origin === window.location.origin;
  } catch {
    return true;
  }
}

/** Starts watching the connection. Returns a function that stops watching and restores `fetch` exactly as it was.
 *  Only the POS page does this — the customer-facing website is never touched. */
let installCount = 0;
let restore: (() => void) | null = null;

export function installConnectionMonitor(): () => void {
  if (typeof window === "undefined") return () => {};
  installCount++;
  if (!restore) {
    nativeFetch = window.fetch.bind(window);
    const original = window.fetch;
    const originalBound = nativeFetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        return await originalBound(input, init);
      } catch (err) {
        // Only our own server matters; a blocked ad/analytics/CDN request must
        // never make the app think the connection is down.
        if ((err instanceof TypeError || isNetworkError(err)) && isSameOrigin(input)) {
          void checkConnectionNow();
        }
        throw err;
      }
    };
    const onOffline = () => applyStatus(false);
    const onOnline = () => void checkConnectionNow();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    // Started while already disconnected: begin watching for the way back.
    if (navigator.onLine === false) scheduleRecheck();
    restore = () => {
      window.fetch = original;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.clearTimeout(recheckTimer);
      recheckTimer = undefined;
      nativeFetch = null;
      useConnection.setState({ online: true, justRestored: false });
      restore = null;
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    installCount--;
    if (installCount <= 0 && restore) restore();
  };
}
