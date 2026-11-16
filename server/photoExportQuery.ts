import { sql } from "drizzle-orm";

// Explicit bind parameters keep PostgreSQL from interpreting a JS array as a
// composite/record when comparing generated media URLs. Never interpolate
// an array directly into `ANY(...::text[])`.
export function buildTrackedPhotoLookupQuery(urls: string[]) {
  if (urls.length === 0 || urls.length > 250) {
    throw new Error("AI photo lookup requires between 1 and 250 URLs");
  }
  return sql`SELECT url FROM ai_generated_product_media WHERE url IN (${sql.join(
    urls.map((url) => sql`${url}`),
    sql`, `,
  )})`;
}

// Recover every recorded generation rooted in any selected color's source or
// saved gallery, including outputs omitted by older gallery normalization.
// UNION (not UNION ALL) terminates even if historical lineage contains a cycle.
export function buildAiPhotoHistoryQuery(urls: string[]) {
  if (!urls.length || urls.length > 250) throw new Error("AI photo lookup requires between 1 and 250 URLs");
  return sql`WITH RECURSIVE seeds(url) AS (
    VALUES ${sql.join(urls.map((url) => sql`(${url}::text)`), sql`, `)}
  ), history(url, source_url) AS (
    SELECT m.url, m.source_url FROM ai_generated_product_media m
    WHERE m.url IN (SELECT url FROM seeds) OR m.source_url IN (SELECT url FROM seeds)
    UNION
    SELECT m.url, m.source_url FROM ai_generated_product_media m
    JOIN history h ON m.source_url = h.url
  ) SELECT url, source_url FROM history ORDER BY url`;
}
