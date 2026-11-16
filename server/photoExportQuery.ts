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
