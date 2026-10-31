/* Lucerne POS — opening the POS with no internet.

   This service worker is registered ONLY by the POS page, with the scope "/admin/pos", so it controls the POS and
   the customer display (/admin/pos-customer) and NOTHING else: the storefront and every other page never go
   through it.

   What it does, and nothing more:
   - POS page: network first (always the newest version when online), with the last good copy as the fallback when
     there is no connection, so the POS still opens.
   - /assets/*: the build's files have a content hash in their name, so a cached copy can never be stale: cache first.
   - A few read-only requests the POS needs to start (who is logged in, products, categories, settings): network
     first, last good copy as the fallback. The cached login is deleted the moment the server says "not logged in"
     and on logout, so it never outlives a real sign-out.
   Sales, returns, exchanges and every other request are NOT touched. */

const VERSION = "lucerne-pos-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const API = `${VERSION}-api`;
const API_PATHS = new Set(["/api/auth/me", "/api/products", "/api/categories", "/api/subcategories", "/api/site-settings"]);
const NETWORK_TIMEOUT_MS = 5000;
const MAX_ASSETS = 160;

const OFFLINE_PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lucerne POS</title>
<style>body{font-family:system-ui,"Segoe UI",sans-serif;background:#0f0f0f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}
.c{max-width:420px;background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:32px}h1{font-size:18px;margin:0 0 8px}p{color:#aaa;font-size:13px;line-height:1.7;margin:0 0 16px}button{background:#7c3aed;color:#fff;border:0;border-radius:8px;padding:10px 22px;font-weight:600;cursor:pointer}</style></head>
<body><div class="c"><h1>افتحي نقطة البيع مرة واحدة أثناء الاتصال بالإنترنت</h1><p>بعدها تفتح تلقائياً حتى بدون إنترنت.<br>Open the POS once while online — after that it opens even with no internet.</p><button onclick="location.reload()">إعادة المحاولة / Retry</button></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    // Warm the page and the scripts/styles it lists, so the very first offline start works even if the POS was only opened once.
    try {
      const res = await fetch("/admin/pos", { cache: "no-cache" });
      if (res.ok) {
        const html = await res.clone().text();
        await (await caches.open(SHELL)).put("/admin/pos", res);
        const urls = Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)).map((m) => m[1]);
        const assets = await caches.open(ASSETS);
        await Promise.all(urls.map((u) => assets.add(u).catch(() => {})));
      }
    } catch (_) { /* offline during install: the first online visit will fill the cache */ }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ASSETS, API]);
    for (const name of await caches.keys()) {
      if (name.startsWith("lucerne-pos-") && !keep.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-api-cache") event.waitUntil(caches.delete(API));
});

function fetchWithTimeout(input, init, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(input, Object.assign({}, init, { signal: ctrl.signal })).finally(() => clearTimeout(timer));
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function posPage(url) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetchWithTimeout(url.pathname + url.search, { cache: "no-cache" }, NETWORK_TIMEOUT_MS);
    // Both POS pages are the same app shell, so one saved copy serves them both.
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) await cache.put("/admin/pos", res.clone());
    return res;
  } catch (_) {
    const saved = await cache.match("/admin/pos");
    return saved || new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function assetFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) { await cache.put(req, res.clone()); trim(ASSETS, MAX_ASSETS); }
  return res;
}

async function apiNetworkFirst(req) {
  const cache = await caches.open(API);
  try {
    const res = await fetchWithTimeout(req, undefined, NETWORK_TIMEOUT_MS);
    if (res.ok) await cache.put(req, res.clone());
    else if (res.status === 401 || res.status === 403) await cache.delete(req); // logged out: never keep serving an old login
    return res;
  } catch (err) {
    const saved = await cache.match(req);
    if (saved) return saved;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    event.respondWith(fetch(req).then(async (res) => { if (res.ok) await caches.delete(API); return res; }));
    return;
  }
  if (req.method !== "GET") return;

  if (req.mode === "navigate" && /^\/admin\/pos(-customer)?(\/|$)/.test(url.pathname)) {
    event.respondWith(posPage(url));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(assetFirst(req));
  } else if (API_PATHS.has(url.pathname)) {
    event.respondWith(apiNetworkFirst(req));
  }
});
