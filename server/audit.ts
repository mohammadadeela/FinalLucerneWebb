// Audit log — records what admins and employees do.
//
// One middleware watches every mutating /api request (POST/PUT/PATCH/DELETE).
// When the request was made by a staff account (admin/employee), or is a
// login attempt on a staff account, it writes one row to audit_logs after
// the response is sent. Logging is fire-and-forget and never changes the
// outcome of the request it observes.

import type { Express, Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";

export interface AuditEntry {
  userId: number | null;
  userName: string;
  userRole: string;
  action: string;
  method: string;
  path: string;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  details: Record<string, unknown> | null;
  status: number;
  ip: string | null;
}

/* ── Route → action mapping ─────────────────────────────────────────────
   Order matters: first match wins. Keys are what the client translates. */
const ROUTE_ACTIONS: { re: RegExp; method?: string; action: string; entity?: string }[] = [
  { re: /^\/api\/auth\/login$/, action: "auth.login", entity: "user" },
  { re: /^\/api\/auth\/logout$/, action: "auth.logout", entity: "user" },
  { re: /^\/api\/auth\/change-password$/, action: "auth.change_password", entity: "user" },
  { re: /^\/api\/auth\/profile$/, action: "auth.profile", entity: "user" },

  { re: /^\/api\/pos\/orders$/, method: "POST", action: "pos.sale", entity: "invoice" },
  { re: /^\/api\/pos\/orders$/, method: "DELETE", action: "pos.delete_invoices", entity: "invoice" },
  { re: /^\/api\/pos\/orders\/transfer-status$/, action: "pos.transfer", entity: "invoice" },
  { re: /^\/api\/pos\/orders\/\d+$/, action: "pos.update_invoice", entity: "invoice" },
  { re: /^\/api\/pos\/return$/, action: "pos.return", entity: "invoice" },

  { re: /^\/api\/products$/, method: "POST", action: "product.create", entity: "product" },
  { re: /^\/api\/products\/bulk-edit$/, action: "product.bulk_edit", entity: "product" },
  { re: /^\/api\/products\/bulk-flags$/, action: "product.bulk_flags", entity: "product" },
  { re: /^\/api\/products\/\d+\/variant-stock$/, action: "product.stock", entity: "product" },
  { re: /^\/api\/products\/\d+$/, method: "PUT", action: "product.update", entity: "product" },
  { re: /^\/api\/products\/\d+$/, method: "DELETE", action: "product.delete", entity: "product" },
  { re: /^\/api\/admin\/products\/bulk-discount$/, action: "product.bulk_discount", entity: "product" },
  { re: /^\/api\/admin\/products\/remove-discount$/, action: "product.remove_discount", entity: "product" },
  { re: /^\/api\/admin\/products\/expire-new-arrivals$/, action: "product.expire_new", entity: "product" },
  { re: /^\/api\/admin\/products\/(import|bulk-import)$/, action: "product.import", entity: "product" },
  { re: /^\/api\/admin\/bulk-create$/, action: "product.import", entity: "product" },
  { re: /^\/api\/admin\/products\/main-photos$/, action: "product.photos", entity: "product" },
  { re: /^\/api\/admin\/product-groups/, action: "product.group", entity: "product" },

  { re: /^\/api\/orders\/\d+\/status$/, action: "order.status", entity: "order" },
  { re: /^\/api\/orders\/bulk-status$/, action: "order.status", entity: "order" },
  { re: /^\/api\/orders\/bulk$/, method: "DELETE", action: "order.delete", entity: "order" },
  { re: /^\/api\/admin\/orders\/\d+\/items/, action: "order.items", entity: "order" },
  { re: /^\/api\/admin\/exchange-requests\/\d+$/, action: "exchange.update", entity: "exchange" },

  { re: /^\/api\/admin\/users\/bulk$/, method: "DELETE", action: "user.delete", entity: "user" },
  { re: /^\/api\/admin\/users\/bulk$/, action: "user.update", entity: "user" },
  { re: /^\/api\/admin\/users\/\d+$/, method: "DELETE", action: "user.delete", entity: "user" },
  { re: /^\/api\/admin\/users\/\d+$/, action: "user.update", entity: "user" },

  { re: /^\/api\/categories$/, method: "POST", action: "category.create", entity: "category" },
  { re: /^\/api\/categories\/\d+$/, method: "DELETE", action: "category.delete", entity: "category" },
  { re: /^\/api\/categories\/\d+$/, action: "category.update", entity: "category" },
  { re: /^\/api\/subcategories$/, method: "POST", action: "category.create", entity: "subcategory" },
  { re: /^\/api\/subcategories\/\d+$/, method: "DELETE", action: "category.delete", entity: "subcategory" },
  { re: /^\/api\/subcategories\/\d+$/, action: "category.update", entity: "subcategory" },

  { re: /^\/api\/admin\/discount-codes$/, method: "POST", action: "discount.create", entity: "discount" },
  { re: /^\/api\/admin\/discount-codes\/\d+$/, method: "DELETE", action: "discount.delete", entity: "discount" },
  { re: /^\/api\/admin\/discount-codes\/\d+$/, action: "discount.update", entity: "discount" },
  { re: /^\/api\/admin\/send-(discount-code|sale)-(email|whatsapp)$/, action: "marketing.send", entity: "campaign" },

  { re: /^\/api\/site-settings/, action: "settings.update", entity: "settings" },
  { re: /^\/api\/admin\/db\//, action: "database.edit", entity: "database" },
  { re: /^\/api\/admin\/ai-/, action: "ai.generate", entity: "product" },
];

// Mutating requests that are noise for an audit trail (customer-facing or
// high-frequency plumbing). Never logged even for staff.
const IGNORED = [
  /^\/api\/cart/, /^\/api\/chat$/, /^\/api\/events\//, /^\/api\/upload/, /^\/api\/notifications/,
  /^\/api\/lahza/, /^\/api\/loyalty/, /^\/api\/exchange-requests$/, /^\/api\/reviews/, /^\/api\/wishlist/,
  /^\/api\/auth\/(firebase|phone|twilio|wa-|send-signup|verify-signup|forgot|reset|verify-reset|register)/,
];

const SECRET_KEYS = /pass|token|secret|otp|code$|verification|apikey|api_key|key$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 3) return "…";
  if (Array.isArray(value)) {
    return value.length > 20 ? { count: value.length, sample: value.slice(0, 3).map((v) => redact(v, depth + 1)) } : value.map((v) => redact(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.test(k)) { out[k] = "•••"; continue; }
      out[k] = redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") {
    if (value.startsWith("data:")) return `[data ${Math.round(value.length / 1024)}kB]`;
    return value.length > 300 ? value.slice(0, 300) + "…" : value;
  }
  return value;
}

function classify(method: string, path: string): { action: string; entity: string | null } {
  for (const r of ROUTE_ACTIONS) {
    if (r.method && r.method !== method) continue;
    if (r.re.test(path)) return { action: r.action, entity: r.entity ?? null };
  }
  return { action: "other", entity: null };
}

function pickName(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().slice(0, 120);
  }
  return null;
}

function summarize(action: string, method: string, path: string, body: any, result: any) {
  const idFromPath = (path.match(/\/(\d+)(?:\/|$)/) || [])[1] ?? null;
  const entityId = idFromPath ?? (result && typeof result === "object" && result.id != null ? String(result.id) : body?.id != null ? String(body.id) : null);
  let entityName = pickName(result?.name, body?.name, result?.fullName, body?.fullName, result?.code, body?.code, body?.email);
  const details: Record<string, unknown> = {};

  switch (action) {
    case "pos.sale":
      details.total = result?.totalAmount ?? body?.totalAmount ?? null;
      details.paymentMethod = result?.paymentMethod ?? body?.paymentMethod ?? null;
      details.cashAmount = result?.cashAmount ?? body?.cashAmount ?? null;
      details.cardAmount = result?.cardAmount ?? body?.cardAmount ?? null;
      details.discount = result?.discountAmount ?? body?.discountAmount ?? null;
      details.items = Array.isArray(body?.items) ? body.items.reduce((n: number, i: any) => n + (Number(i.quantity) || 0), 0) : null;
      details.exchange = typeof body?.note === "string" && (body.note.includes("فاتورة تبديل") || body.note.includes("EXCHANGE INVOICE"));
      entityName = result?.id != null ? `#${result.id}` : null;
      break;
    case "pos.return":
      details.orderId = body?.orderId ?? null;
      details.mode = body?.mode === "exchange" ? "exchange" : "return";
      details.items = Array.isArray(body?.items) ? body.items.reduce((n: number, i: any) => n + (Number(i.quantity) || 0), 0) : null;
      details.override = body?.override === true;
      entityName = body?.orderId != null ? `#${body.orderId}` : null;
      break;
    case "pos.delete_invoices":
      details.ids = Array.isArray(body?.ids) ? body.ids.slice(0, 50) : null;
      details.count = Array.isArray(body?.ids) ? body.ids.length : null;
      break;
    case "product.update":
    case "product.create":
      details.fields = body && typeof body === "object" ? Object.keys(body).filter((k) => !/image|video|description/i.test(k)).slice(0, 30) : null;
      details.price = body?.price ?? null;
      details.discountPrice = body?.discountPrice ?? null;
      details.costPrice = body?.costPrice ?? null;
      details.categoryId = body?.categoryId ?? null;
      break;
    case "product.stock":
      details.changes = redact(body);
      break;
    case "product.bulk_edit":
    case "product.bulk_flags":
    case "product.bulk_discount":
    case "product.remove_discount":
      details.count = Array.isArray(body?.ids) ? body.ids.length : null;
      details.updates = redact(body?.updates ?? body?.flags ?? body?.discount ?? null);
      break;
    case "order.status":
      details.status = body?.status ?? null;
      details.count = Array.isArray(body?.ids) ? body.ids.length : null;
      break;
    case "order.delete":
    case "user.delete":
      details.count = Array.isArray(body?.ids) ? body.ids.length : 1;
      break;
    case "user.update":
      details.role = body?.role ?? null;
      details.isBlocked = body?.isBlocked ?? null;
      details.changes = redact(body);
      break;
    case "auth.login":
      details.email = body?.email ?? null;
      entityName = pickName(result?.fullName, body?.email);
      break;
    case "settings.update":
      details.keys = body && typeof body === "object" ? Object.keys(body.settings ?? body).slice(0, 30) : null;
      break;
    case "database.edit":
      details.table = (path.match(/\/table\/([^/]+)/) || [])[1] ?? null;
      details.body = redact(body);
      break;
    default:
      details.body = redact(body);
  }
  return { entityId, entityName, details };
}

/* ── Storage ─────────────────────────────────────────────────────────── */
export async function ensureAuditTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id serial PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      user_id integer,
      user_name text NOT NULL,
      user_role text NOT NULL,
      action text NOT NULL,
      method text NOT NULL,
      path text NOT NULL,
      entity_type text,
      entity_id text,
      entity_name text,
      details jsonb,
      status integer NOT NULL,
      ip text
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id)`);
}

async function writeEntry(e: AuditEntry) {
  await db.execute(sql`
    INSERT INTO audit_logs (user_id, user_name, user_role, action, method, path, entity_type, entity_id, entity_name, details, status, ip)
    VALUES (${e.userId}, ${e.userName}, ${e.userRole}, ${e.action}, ${e.method}, ${e.path}, ${e.entityType}, ${e.entityId}, ${e.entityName},
            ${e.details ? JSON.stringify(e.details) : null}::jsonb, ${e.status}, ${e.ip})
  `);
}

/* ── Middleware ──────────────────────────────────────────────────────── */
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const path = req.path;
  if (!path.startsWith("/api/")) return next();
  if (IGNORED.some((re) => re.test(path))) return next();

  // Capture the JSON body the route sends, so we can name what was created.
  let captured: any = undefined;
  const originalJson = res.json.bind(res);
  res.json = ((payload: any) => {
    captured = payload;
    return originalJson(payload);
  }) as any;

  res.on("finish", () => {
    void (async () => {
      try {
        const user = (req.user as any) || null;
        const isStaff = !!user && ["admin", "employee"].includes(user.role);
        const isLogin = path === "/api/auth/login";
        const { action, entity } = classify(req.method, path);

        let entry: AuditEntry | null = null;
        if (isLogin) {
          const email = String(req.body?.email || "").trim().toLowerCase();
          if (res.statusCode < 400 && isStaff) {
            entry = base(user, "auth.login", 200);
          } else if (res.statusCode >= 400 && email) {
            // Only staff accounts' failed logins are interesting.
            const target = await storage.getUserByEmail(email).catch(() => undefined);
            if (target && ["admin", "employee"].includes(target.role)) {
              entry = {
                userId: target.id, userName: target.fullName || target.email, userRole: target.role,
                action: "auth.login_failed", method: req.method, path, entityType: "user", entityId: String(target.id),
                entityName: target.email, details: { reason: captured?.message ?? null }, status: res.statusCode, ip: clientIp(req),
              };
            }
          }
        } else if (isStaff) {
          entry = base(user, action, res.statusCode);
        }
        if (!entry) return;

        if (!isLogin || entry.action === "auth.login") {
          const s = summarize(entry.action, req.method, path, req.body, captured);
          entry.entityType = entity;
          entry.entityId = s.entityId;
          entry.entityName = s.entityName;
          entry.details = s.details;
        }
        await writeEntry(entry);
      } catch (err) {
        console.error("[audit] failed to record entry:", err);
      }
    })();

    function base(user: any, action: string, status: number): AuditEntry {
      return {
        userId: user.id, userName: user.fullName || user.email || "?", userRole: user.role,
        action, method: req.method, path, entityType: null, entityId: null, entityName: null, details: null,
        status, ip: clientIp(req),
      };
    }
  });

  next();
}

function clientIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  const raw = (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim() || req.ip || null;
  return raw ? raw.replace(/^::ffff:/, "") : null;
}

/* ── Admin API ───────────────────────────────────────────────────────── */
export function registerAuditRoutes(app: Express) {
  // Returns entries newest-first. Query: from, to (ISO dates), userId, action
  // (prefix match, e.g. "pos."), q (text search), limit (≤ 5000).
  app.get("/api/admin/audit", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    try {
      const limit = Math.min(5000, Math.max(1, parseInt(String(req.query.limit || "2000")) || 2000));
      const from = req.query.from ? new Date(String(req.query.from)) : null;
      const to = req.query.to ? new Date(String(req.query.to)) : null;
      const userId = req.query.userId ? parseInt(String(req.query.userId)) : null;
      const action = req.query.action ? String(req.query.action) : null;
      const q = req.query.q ? `%${String(req.query.q).toLowerCase()}%` : null;

      const conds = [sql`1=1`];
      if (from && !isNaN(+from)) conds.push(sql`created_at >= ${from.toISOString()}`);
      if (to && !isNaN(+to)) conds.push(sql`created_at <= ${to.toISOString()}`);
      if (userId) conds.push(sql`user_id = ${userId}`);
      if (action) conds.push(sql`action LIKE ${action + "%"}`);
      if (q) conds.push(sql`(lower(user_name) LIKE ${q} OR lower(coalesce(entity_name,'')) LIKE ${q} OR lower(path) LIKE ${q} OR lower(coalesce(details::text,'')) LIKE ${q})`);

      const rows = await db.execute(sql`
        SELECT id, created_at, user_id, user_name, user_role, action, method, path, entity_type, entity_id, entity_name, details, status, ip
        FROM audit_logs
        WHERE ${sql.join(conds, sql` AND `)}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `);
      res.json((rows as any).rows ?? rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
