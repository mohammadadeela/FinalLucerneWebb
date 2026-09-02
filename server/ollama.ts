import type { Express } from "express";
import { storage } from "./storage";

// ── Ollama backend proxy ─────────────────────────────────────────────────────
// The browser can NOT call a remote Ollama directly (CORS + mixed content), so
// every Ollama request is proxied through these same-origin endpoints. The
// server then talks to Ollama (local, or a Cloudflare Tunnel URL) over plain
// HTTP(S) where CORS does not apply.

const OLLAMA_URL_KEY = "ollama_url";
const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

function log(...args: any[]) {
  // Prefixed so any future Ollama issue is greppable in the server logs.
  console.log("[ollama]", ...args);
}

/**
 * Reduce ANY user-entered URL to a clean `scheme://host[:port]` base with no
 * path. This is what prevents malformed URLs like `/api/chat/api/tags`: even if
 * the admin pastes `https://x.trycloudflare.com/api/tags`, we strip the path so
 * the proxy always appends exactly one known path segment.
 */
export function normalizeOllamaBase(raw: string): string {
  let s = (raw || "").trim();
  if (!s) return "";
  // Tunnels are https; default a bare host to https. Keep explicit http://.
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`; // drops path / query / hash
  } catch {
    return s.replace(/\/+$/, "");
  }
}

async function getOllamaBase(): Promise<string> {
  const stored = await storage.getSiteSetting(OLLAMA_URL_KEY).catch(() => undefined);
  return normalizeOllamaBase(stored || DEFAULT_OLLAMA_URL);
}

/**
 * Returns true if a host points at a private / internal network. Loopback
 * (localhost / 127.x / ::1) is intentionally allowed because that is the legit
 * "Ollama on the same machine as the server" case. Public domains (tunnels) and
 * public IPs are allowed; other RFC1918 / link-local ranges are blocked to limit
 * SSRF even though every route is already admin-only.
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1") return false;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 127) return false;             // loopback allowed
    if (a === 0 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local
    return false;                            // other public IPv4
  }
  // crude IPv6 private/link-local check (fc00::/7, fe80::/10)
  if (/^(fc|fd|fe8|fe9|fea|feb)/.test(h)) return true;
  return false; // a normal hostname / public domain
}

/** Validate a normalized base URL. Returns an error message, or null if ok. */
function validateOllamaUrl(base: string): string | null {
  try {
    const u = new URL(base);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "Only http and https URLs are allowed.";
    }
    if (isBlockedHost(u.hostname)) {
      return "That address points to a private/internal network and is not allowed. Use localhost or a public tunnel URL.";
    }
    return null;
  } catch {
    return "Invalid URL.";
  }
}

function describeErr(err: any): string {
  const name = err?.name || "";
  const msg = String(err?.message || err || "");
  if (name === "TimeoutError" || msg.includes("aborted") || msg.includes("timed out")) {
    return "Timed out reaching Ollama (the tunnel is slow or the model is still loading).";
  }
  if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || name === "TypeError") {
    return "Could not connect to the Ollama URL. Check the tunnel URL is current and that Ollama is running.";
  }
  return msg || "Unknown Ollama error";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface OllamaFetchResult {
  ok: boolean;
  status: number;
  json: any;
  text: string;
}

/**
 * Fetch a single Ollama endpoint with detailed logging, JSON validation and
 * 3 retries using exponential backoff. `pathPart` MUST start with "/" and is
 * the only path ever appended to the normalized base.
 */
async function ollamaFetch(
  base: string,
  pathPart: string,
  opts: { method?: string; body?: any; timeoutMs?: number } = {},
): Promise<OllamaFetchResult> {
  const { method = "GET", body, timeoutMs = 120000 } = opts;
  const url = `${base}${pathPart}`;
  const MAX_ATTEMPTS = 3;
  let lastErr = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      log(`→ attempt ${attempt}/${MAX_ATTEMPTS} ${method} ${url}` +
        (body ? ` body=${JSON.stringify(body).slice(0, 200)}` : ""));
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      log(`← ${res.status} ${url} (${Date.now() - started}ms) body=${text.slice(0, 200)}`);

      let json: any = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          // Invalid JSON from a 2xx means a broken/intercepted tunnel.
          if (res.ok) {
            throw new Error(`Ollama returned non-JSON (status ${res.status}): ${text.slice(0, 120)}`);
          }
        }
      }
      return { ok: res.ok, status: res.status, json, text };
    } catch (err: any) {
      lastErr = describeErr(err);
      log(`✗ attempt ${attempt} failed: ${lastErr}`);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * 2 ** (attempt - 1)); // 500ms, 1s
        continue;
      }
      throw new Error(lastErr);
    }
  }
  throw new Error(lastErr || "Ollama request failed");
}

export function registerOllamaRoutes(app: Express) {
  const requireAdmin = (req: any, res: any): boolean => {
    if (!req.isAuthenticated?.() || (req.user as any)?.role !== "admin") {
      res.status(401).json({ message: "Unauthorized" });
      return false;
    }
    return true;
  };

  // ── Read the currently configured Ollama URL ──────────────────────────────
  app.get("/api/ollama/url", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const stored = await storage.getSiteSetting(OLLAMA_URL_KEY).catch(() => undefined);
    res.json({
      url: normalizeOllamaBase(stored || DEFAULT_OLLAMA_URL),
      isCustom: !!stored,
    });
  });

  // ── Save a new Ollama / tunnel URL (normalized before storing) ────────────
  app.post("/api/ollama/url", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const normalized = normalizeOllamaBase(String(req.body?.url || ""));
    if (!normalized) return res.status(400).json({ message: "A URL is required" });
    const invalid = validateOllamaUrl(normalized);
    if (invalid) return res.status(400).json({ message: invalid });
    await storage.setSiteSetting(OLLAMA_URL_KEY, normalized);
    log(`saved ollama url = ${normalized}`);
    res.json({ url: normalized });
  });

  // ── Health / diagnostics ──────────────────────────────────────────────────
  app.get("/api/ollama/health", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const tunnelUrl = await getOllamaBase();
    const blocked = validateOllamaUrl(tunnelUrl);
    if (blocked) {
      return res.json({ reachable: false, modelCount: 0, models: [], tunnelUrl, error: blocked, upstreamStatus: null });
    }
    try {
      const r = await ollamaFetch(tunnelUrl, "/api/tags", { timeoutMs: 8000 });
      const models: string[] = (r.json?.models || []).map((m: any) => m.name);
      res.json({
        reachable: r.ok,
        modelCount: models.length,
        models,
        tunnelUrl,
        upstreamStatus: r.status,
        error: r.ok ? null : `Ollama replied ${r.status}`,
      });
    } catch (err: any) {
      res.json({
        reachable: false,
        modelCount: 0,
        models: [],
        tunnelUrl,
        upstreamStatus: null,
        error: describeErr(err),
      });
    }
  });

  // ── Tags proxy ────────────────────────────────────────────────────────────
  app.get("/api/ollama/tags", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const base = await getOllamaBase();
    const blocked = validateOllamaUrl(base);
    if (blocked) return res.status(400).json({ message: blocked });
    try {
      const r = await ollamaFetch(base, "/api/tags", { timeoutMs: 8000 });
      res.status(r.ok ? 200 : 502).json(r.json ?? { models: [] });
    } catch (err: any) {
      res.status(502).json({ message: describeErr(err) });
    }
  });

  // ── Chat proxy (OpenAI-compatible vision endpoint) ────────────────────────
  app.post("/api/ollama/chat", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const base = await getOllamaBase();
    const blocked = validateOllamaUrl(base);
    if (blocked) return res.status(400).json({ message: blocked });
    const payload = req.body;
    if (!payload?.model || !payload?.messages) {
      return res.status(400).json({ message: "model and messages are required" });
    }
    try {
      const r = await ollamaFetch(base, "/v1/chat/completions", {
        method: "POST",
        body: payload,
        timeoutMs: 180000,
      });
      res.status(r.ok ? 200 : 502).json(r.json ?? { message: `Ollama replied ${r.status}` });
    } catch (err: any) {
      res.status(502).json({ message: describeErr(err) });
    }
  });
}
