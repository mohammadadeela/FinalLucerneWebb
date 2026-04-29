import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { WebhookHandlers } from "./webhookHandlers";
import { verifyEmailConnection, sendMonthlyBackupEmail } from "./email";
import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: true, credentials: true }));

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
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Ensure session table exists (required by connect-pg-simple)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL,
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
    `);
  } catch (e) {
    console.error("[startup] session table migration failed:", e);
  }

  // Ensure product_events table exists (auto-migration for production)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS product_events (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        session_id TEXT,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_product_events_product_id ON product_events (product_id)
    `);
  } catch (e) {
    console.error("[startup] product_events migration failed:", e);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
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
