import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!url) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

// Parse the URL so pg always uses TCP (never a Unix socket)
let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  throw new Error(`DATABASE_URL is not a valid URL: ${url}`);
}

const host     = parsed.hostname;
const port     = parsed.port ? parseInt(parsed.port, 10) : 5432;
const user     = parsed.username ? decodeURIComponent(parsed.username) : undefined;
const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
const database = parsed.pathname.replace(/^\//, "") || undefined;

const isExternal =
  url.includes("neon.tech")    ||
  url.includes("supabase.co")  ||
  url.includes("railway.app")  ||
  url.includes(".render.com")  ||
  url.includes("sslmode=require");

console.log(`[db] Connecting to PostgreSQL — host: ${host}:${port}`);

export const pool = new Pool({
  host,
  port,
  user,
  password,
  database,
  ssl: isExternal ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis:           30_000,
  connectionTimeoutMillis:     10_000,
  keepAlive:                   true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[db] Pool error (will reconnect):", err.message);
});

export const db = drizzle(pool, { schema });

/** Run a DB call with automatic retry on connection failure */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 2000,
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const isConnErr =
        err?.message?.includes("Connection terminated") ||
        err?.message?.includes("ECONNRESET")           ||
        err?.message?.includes("ECONNREFUSED")         ||
        err?.cause?.message?.includes("Connection terminated");
      if (isConnErr && i < retries - 1) {
        console.warn(`[db] Connection error, retrying in ${delayMs}ms... (${i + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Max retries exceeded");
}
