import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { WebhookHandlers } from "./webhookHandlers";
import { verifyEmailConnection, sendMonthlyBackupEmail } from "./email";
import { db, withRetry } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

// Safety net: by default Node.js kills the ENTIRE process the instant any
// single error escapes without a .catch()/try-catch — even one triggered by
// a third-party library (Stripe/Cloudinary/Sharp/ffmpeg/Ollama/WhatsApp
// calls, timers, etc.), and totally outside of any Express route. That is
// what was silently taking the whole site down with no explanation: Node
// exits immediately, before anything gets a chance to log why, so Hostinger
// never sees an "error" — it just sees the process is gone.
// These two handlers make sure we always get a clear log line with the real
// cause, and keep the server serving customers instead of dying outright.
process.on("unhandledRejection", (reason: any) => {
  console.error("[fatal] Unhandled promise rejection (server kept running):", {
    message: reason?.message || reason,
    stack: reason?.stack,
  });
});

process.on("uncaughtException", (err: any) => {
  console.error("[fatal] Uncaught exception (server kept running):", {
    message: err?.message || err,
    stack: err?.stack,
  });
});

const app = express();
const httpServer = createServer(app);

// Lightweight deployment health endpoint. The deploy script waits for this
// before testing Nginx, preventing false 502 errors while PM2 is still
// starting the Node process. It intentionally exposes no configuration.
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Trust proxy so secure cookies / IPs work behind Replit's / Hostinger's edge proxy
app.set("trust proxy", true);

// Security headers (XSS, clickjacking, MIME-sniff, referrer policy, etc.).
// CSP is disabled because the frontend uses Vite/React with inline styles and
// loads from Cloudinary, Firebase, Stripe — enabling a strict CSP would break
// the live UI and we're explicitly avoiding visible changes.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Firebase signInWithPopup requires window.opener communication between
    // the popup and the parent page. The default "same-origin" COOP policy
    // severs that link and causes the "missing initial state" error on
    // production deployments (e.g. Hostinger) where headers are not stripped.
    crossOriginOpenerPolicy: false,
  }),
);

// Gzip/Brotli-style compression for all responses (JSON, HTML, JS, CSS).
// Skip already-compressed media (images/videos) to save CPU.
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      const type = String(res.getHeader("Content-Type") || "");
      if (/^(image|video|audio)\//i.test(type)) return false;
      return compression.filter(req, res);
    },
  }),
);

// Restrict CORS to known origins only. `origin: true` (reflect-any) combined
// with `credentials: true` lets any site make authenticated cross-origin
// requests — a real CSRF risk. We explicitly allow only the production domain
// and local dev origins.
const ALLOWED_ORIGINS = new Set([
  "https://lucerne-boutique.com",
  "https://www.lucerne-boutique.com",
]);
app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header = same-origin, server-to-server, or curl — allow
      if (!origin) return callback(null, true);
      // Dev origins (localhost / Replit preview)
      if (
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1") ||
        origin.includes(".replit.dev") ||
        origin.includes(".repl.co")
      ) {
        return callback(null, true);
      }
      if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
      console.warn(`[cors] Blocked origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// Global rate limiter — protects every /api endpoint against scraper / bot
// abuse that previously could hammer the server unchecked and drive CPU to
// 100% on the Hostinger VPS. 300 requests / minute / IP is generous for real
// shoppers but blocks runaway clients.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip Stripe webhook — Stripe IPs send bursts and have their own signature
  // auth. `req.path` inside a mounted middleware is relative to the mount
  // point ("/api"), so the literal path here is "/stripe/webhook".
  skip: (req) => req.path === "/stripe/webhook" || req.originalUrl === "/api/stripe/webhook",
});
app.use("/api", apiLimiter);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing signature" });
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err) {
      console.error("Webhook error:", err);
      res.status(400).json({ error: "Webhook processing failed" });
    }
  }
);

app.use(
  express.json({
    limit: "25mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "25mb" }));

// Serve locally-uploaded product images from the /uploads directory
const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir, {
  maxAge: "365d",
  immutable: true,
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Lightweight request logger. In production we ONLY log method/path/status/duration
// — JSON.stringify on every response body was a real CPU and I/O hog under load
// (large analytics/products payloads). In development the full body is still
// captured for debugging.
const isProdLogger = process.env.NODE_ENV === "production";
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  if (!isProdLogger) {
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (!isProdLogger && capturedJsonResponse) {
        const s = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${s.length > 300 ? s.slice(0, 300) + "…" : s}`;
      }
      log(logLine);
    }
  });

  next();
});

// Never expose SQL, stack traces, database details, provider configuration, or
// HTML error pages through an API JSON response. Routes can continue logging
// the real error server-side; customers receive a stable code that the client
// translates to Arabic or English.
const technicalApiErrorPattern = /(?:failed\s+query|\bselect\b[\s\S]*\bfrom\b|\binsert\s+into\b|\bupdate\s+.+\s+set\b|\bdelete\s+from\b|params?:|postgres|database\s+(?:error|query)|column\s+.+\s+does\s+not\s+exist|relation\s+.+\s+does\s+not\s+exist|constraint|syntax\s+error|econn\w+|stack|node_modules|<html|<!doctype)/i;

app.use("/api", (_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const message = typeof body.message === "string" ? body.message : "";
      if (technicalApiErrorPattern.test(message)) {
        const safeBody = { ...body, message: "internal_server_error", success: false };
        delete safeBody.error;
        delete safeBody.detail;
        delete safeBody.stack;
        return originalJson(safeBody);
      }
    }
    return originalJson(body);
  }) as typeof res.json;
  next();
});

function logUnhandledError(err: any, req: Request) {
  console.error("[global-error]", {
    method: req.method,
    path: req.originalUrl,
    userId: (req as any).user?.id,
    message: err?.message,
    detail: err?.detail,
    code: err?.code,
    constraint: err?.constraint,
    stack: err?.stack,
    payload: req.method !== "GET" ? req.body : undefined,
  });
}


async function ensureProductDeleteCompatibility() {
  // Keep product deletion reliable across legacy production databases. Older
  // schemas used NO ACTION foreign keys for order_items/exchange_requests,
  // which blocked admin product deletion. These DO blocks are idempotent and
  // only run when the referenced tables/constraints exist.
  await withRetry(() => db.execute(sql`
    DO $$
    DECLARE constraint_name text;
    BEGIN
      IF to_regclass('public.order_items') IS NOT NULL THEN
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid = 'public.order_items'::regclass
          AND confrelid = 'public.products'::regclass
          AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.order_items'::regclass AND attname = 'product_id')]::smallint[]
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE public.order_items DROP CONSTRAINT %I', constraint_name);
        END IF;

        ALTER TABLE public.order_items
          ADD CONSTRAINT order_items_product_id_products_id_fk
          FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `));

  await withRetry(() => db.execute(sql`
    DO $$
    DECLARE constraint_name text;
    BEGIN
      IF to_regclass('public.exchange_requests') IS NOT NULL THEN
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid = 'public.exchange_requests'::regclass
          AND confrelid = 'public.products'::regclass
          AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.exchange_requests'::regclass AND attname = 'product_id')]::smallint[]
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE public.exchange_requests DROP CONSTRAINT %I', constraint_name);
        END IF;

        ALTER TABLE public.exchange_requests
          ADD CONSTRAINT exchange_requests_product_id_products_id_fk
          FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `));

  await withRetry(() => db.execute(sql`
    DO $$
    DECLARE constraint_name text;
    BEGIN
      IF to_regclass('public.exchange_requests') IS NOT NULL AND to_regclass('public.order_items') IS NOT NULL THEN
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid = 'public.exchange_requests'::regclass
          AND confrelid = 'public.order_items'::regclass
          AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.exchange_requests'::regclass AND attname = 'order_item_id')]::smallint[]
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE public.exchange_requests DROP CONSTRAINT %I', constraint_name);
        END IF;

        ALTER TABLE public.exchange_requests
          ADD CONSTRAINT exchange_requests_order_item_id_order_items_id_fk
          FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `));
}

async function ensureProductSchemaAndLegacyData() {
  await withRetry(() => db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url text`));
  await withRetry(() => db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamp`));
  await withRetry(() => db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_ids integer[] DEFAULT '{}'::integer[]`));
  await withRetry(() => db.execute(sql`ALTER TABLE products ALTER COLUMN images SET DEFAULT '[]'::jsonb`));
  await withRetry(() => db.execute(sql`ALTER TABLE products ALTER COLUMN sizes SET DEFAULT '[]'::jsonb`));
  await withRetry(() => db.execute(sql`ALTER TABLE products ALTER COLUMN colors SET DEFAULT '[]'::jsonb`));
  await withRetry(() => db.execute(sql`ALTER TABLE products ALTER COLUMN size_inventory SET DEFAULT '{}'::jsonb`));
  await withRetry(() => db.execute(sql`ALTER TABLE products ALTER COLUMN color_variants SET DEFAULT '[]'::jsonb`));
  await withRetry(() => db.execute(sql`
    UPDATE products
    SET
      images = COALESCE(images, '[]'::jsonb),
      sizes = COALESCE(sizes, '[]'::jsonb),
      colors = COALESCE(colors, '[]'::jsonb),
      size_inventory = COALESCE(size_inventory, '{}'::jsonb),
      color_variants = COALESCE(color_variants, '[]'::jsonb),
      subcategory_ids = COALESCE(subcategory_ids, CASE WHEN subcategory_id IS NULL THEN '{}'::integer[] ELSE ARRAY[subcategory_id] END)
  `));
  await withRetry(() => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_products_subcategory_ids_gin ON products USING GIN (subcategory_ids)`));
  await withRetry(() => db.execute(sql`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode) WHERE barcode IS NOT NULL`));

  // POS exchange tracking: keeps a private per-invoice history of exactly
  // which original items were already exchanged. This is intentionally kept
  // on pos_orders instead of public site settings so invoice history never
  // leaks through /api/site-settings.
  await withRetry(() => db.execute(sql`ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS exchange_history jsonb DEFAULT '[]'::jsonb`));
  await withRetry(() => db.execute(sql`UPDATE pos_orders SET exchange_history = '[]'::jsonb WHERE exchange_history IS NULL`));
}

(async () => {
  // Ensure session table exists (required by connect-pg-simple)
  try {
    await withRetry(() => db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL,
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
      )
    `));
    await withRetry(() => db.execute(sql`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
    `));
  } catch (e) {
    console.error("[startup] session table migration failed:", e);
  }

  try {
    await ensureProductSchemaAndLegacyData();
  } catch (e) {
    console.error("[startup] product schema/media migration failed:", e);
  }

  try {
    await ensureProductDeleteCompatibility();
  } catch (e) {
    console.error("[startup] product delete compatibility migration failed:", e);
  }

  // Ensure discount_codes has all columns the app inserts (auto-migration for
  // production DBs created before these columns were added to the schema).
  try {
    await withRetry(() => db.execute(sql`
      ALTER TABLE discount_codes
        ADD COLUMN IF NOT EXISTS max_uses_per_user integer,
        ADD COLUMN IF NOT EXISTS category_ids integer[],
        ADD COLUMN IF NOT EXISTS subcategory_ids integer[]
    `));
  } catch (e) {
    console.error("[startup] discount_codes schema migration failed:", e);
  }

  // POS orders: persist cart-level discount separately from the final total.
  try {
    await withRetry(() => db.execute(sql`
      ALTER TABLE pos_orders
        ADD COLUMN IF NOT EXISTS subtotal_amount numeric,
        ADD COLUMN IF NOT EXISTS discount_amount numeric
    `));
  } catch (e) {
    console.error("[startup] pos_orders discount schema migration failed:", e);
  }

  // Ensure product_events table exists (auto-migration for production)
  try {
    await withRetry(() => db.execute(sql`
      CREATE TABLE IF NOT EXISTS product_events (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        session_id TEXT,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `));
    await withRetry(() => db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_product_events_product_id ON product_events (product_id)
    `));
  } catch (e) {
    console.error("[startup] product_events migration failed:", e);
  }

  // Performance indexes for hot-path queries (storefront listings, order lookups).
  // Built CONCURRENTLY one-at-a-time in the background so they NEVER take a strong
  // lock or block the server's startup / request handling. IF NOT EXISTS makes
  // subsequent restarts a no-op.
  (async () => {
    const indexStatements = [
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category_id ON products (category_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_subcategory_id ON products (subcategory_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_is_featured ON products (is_featured) WHERE is_featured = true`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_is_best_seller ON products (is_best_seller) WHERE is_best_seller = true`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_created_at ON products (created_at DESC)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_order_id ON order_items (order_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_product_id ON order_items (product_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_id ON orders (user_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subcategories_category_id ON subcategories (category_id)`,
      // Added: these tables had no indexes at all on their foreign keys, so
      // every wishlist/cart/review/exchange lookup was a full table scan.
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wishlist_user_id ON wishlist (user_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wishlist_product_id ON wishlist (product_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cart_items_user_id ON cart_items (user_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cart_items_product_id ON cart_items (product_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_product_id ON reviews (product_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_user_id ON reviews (user_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exchange_requests_order_id ON exchange_requests (order_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exchange_requests_user_id ON exchange_requests (user_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exchange_requests_order_item_id ON exchange_requests (order_item_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exchange_requests_product_id ON exchange_requests (product_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_id ON notifications (user_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_events_user_id ON product_events (user_id)`,
      sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_events_created_at ON product_events (created_at)`,
    ];
    for (const stmt of indexStatements) {
      try {
        await db.execute(stmt);
      } catch (e: any) {
        // Don't crash the server — just log. An already-running CREATE CONCURRENTLY
        // from a previous boot will throw; that's harmless.
        console.warn("[startup] index create skipped:", e?.message || e);
      }
    }
  })();

  await registerRoutes(httpServer, app);

  // Keep API failures machine-readable. Without this, unknown /api routes can
  // fall through to the frontend catch-all and return index.html.
  app.use("/api", (req: Request, res: Response) => {
    return res.status(404).json({
      success: false,
      message: "API route not found",
      error: { path: req.originalUrl, method: req.method },
    });
  });

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = status >= 500 ? "internal_server_error" : (err.message || "request_failed");

    logUnhandledError(err, req);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({
      success: false,
      message,
      ...(status < 500 && err?.code ? { error: { code: err.code } } : {}),
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  // __dirname is only available in CJS (compiled dist/index.cjs), not in ESM dev mode (tsx)
  // Use it to detect if we're running from the built dist/ folder even without NODE_ENV=production
  let isRunningFromDist = false;
  try {
    if (typeof __dirname !== "undefined") {
      isRunningFromDist = fs.existsSync(path.resolve(__dirname, "public"));
    }
  } catch {}
  const isProduction = process.env.NODE_ENV === "production" || isRunningFromDist;
  if (isProduction) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Bind to the PORT env var (set automatically by Render and most platforms).
  // Falls back to 3000 locally. Binds to 0.0.0.0 so it's reachable from outside the container.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`[server] listening on port ${port} (${process.env.NODE_ENV || "development"})`);
    log(`serving on port ${port}`);
    verifyEmailConnection().catch(() => {});

    // Monthly backup email — check once per day; send on 1st of every month
    let lastBackupMonth = -1;
    const checkAndSendBackup = () => {
      const now = new Date();
      const month = now.getMonth() + now.getFullYear() * 12;
      if (now.getDate() === 1 && month !== lastBackupMonth) {
        lastBackupMonth = month;
        sendMonthlyBackupEmail().catch(() => {});
      }
    };
    checkAndSendBackup(); // run once at startup in case the server restarted on the 1st
    setInterval(checkAndSendBackup, 24 * 60 * 60 * 1000); // check every 24 hours
  });
})();
