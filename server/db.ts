import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "POSTGRES_URL (or DATABASE_URL) must be set. Did you forget to provision a database?",
  );
}

// Enable SSL only for external hosted databases — NOT for Render internal URLs
// (internal Render connections use plain TCP within the private network)
const needsSsl =
  url.includes("neon.tech") ||
  url.includes("supabase.co") ||
  url.includes("railway.app") ||
  url.includes(".render.com") ||
  url.includes("sslmode=require");

export const pool = new Pool({
  connectionString: url,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
