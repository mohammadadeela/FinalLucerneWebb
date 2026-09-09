import "dotenv/config";
import fs from "fs";
import path from "path";
import { pool } from "../server/db";

type ColumnInfo = {
  table_name: string;
  column_name: string;
  data_type: string;
};

type Change = {
  table: string;
  column: string;
  dataType: string;
  pk: Record<string, any>;
  originalValue: any;
  newValue: any;
};

type Snapshot = {
  version: 1;
  createdAt: string;
  urlMapPath: string;
  changes: Change[];
};

const WORK_DIR = process.env.R2_FINAL_WORK_DIR || "/root/lucerne-r2-final/current";
const DEFAULT_MAP = path.join(WORK_DIR, "DB-cloudinary-url-to-final-R2-url.json");
const mode = process.argv[2] || "--dry-run";
const modeArg = process.argv[3];

function qIdent(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function loadUrlMap(filePath: string): Map<string, string> {
  if (!fs.existsSync(filePath)) throw new Error(`URL map not found: ${filePath}`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("URL map must be a JSON object");
  const map = new Map<string, string>();
  for (const [oldUrl, newUrl] of Object.entries(raw)) {
    if (typeof newUrl !== "string" || !newUrl.trim()) continue;
    map.set(String(oldUrl), newUrl.trim());
  }
  return map;
}

function extractCloudinaryUrlsFromString(value: string): string[] {
  const matches = value.match(/https:\/\/res\.cloudinary\.com\/[^"'\s\\<>]+/gi) || [];
  return Array.from(new Set(matches.map((url) => url.replace(/[),.;]+$/g, ""))));
}

function collectCloudinaryUrls(value: any, result = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    extractCloudinaryUrlsFromString(value).forEach((url) => result.add(url));
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectCloudinaryUrls(item, result));
    return result;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectCloudinaryUrls(item, result));
  }
  return result;
}

function replaceString(value: string, map: Map<string, string>, ordered: Array<[string, string]>): string {
  const exact = map.get(value);
  if (exact) return exact;
  if (!value.includes("res.cloudinary.com")) return value;
  let output = value;
  for (const [oldUrl, newUrl] of ordered) {
    if (output.includes(oldUrl)) output = output.split(oldUrl).join(newUrl);
  }
  return output;
}

function replaceValue(value: any, map: Map<string, string>, ordered: Array<[string, string]>): any {
  if (typeof value === "string") return replaceString(value, map, ordered);
  if (Array.isArray(value)) return value.map((item) => replaceValue(item, map, ordered));
  if (value && typeof value === "object") {
    const output: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) output[key] = replaceValue(item, map, ordered);
    return output;
  }
  return value;
}

function valuesEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

async function getColumns(client: any): Promise<ColumnInfo[]> {
  const result = await client.query<ColumnInfo>(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying', 'json', 'jsonb')
    ORDER BY table_name, ordinal_position
  `);
  return result.rows;
}

async function getPrimaryKeys(client: any): Promise<Map<string, string[]>> {
  const result = await client.query(`
    SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);

  const map = new Map<string, string[]>();
  for (const row of result.rows) {
    const list = map.get(row.table_name) || [];
    list.push(row.column_name);
    map.set(row.table_name, list);
  }
  return map;
}

async function verifyR2Urls(map: Map<string, string>): Promise<void> {
  const unique = Array.from(new Set(map.values()));
  console.log(`[verify] Checking ${unique.length} unique R2 delivery URLs...`);
  let index = 0;
  for (const url of unique) {
    index++;
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (response.status !== 200) throw new Error(`R2 verification failed HTTP ${response.status}: ${url}`);
    if (url.endsWith("/video.mp4")) {
      const poster = url.replace(/\/video\.mp4$/i, "/video.jpg");
      const posterResponse = await fetch(poster, { method: "HEAD", redirect: "follow" });
      if (posterResponse.status !== 200) throw new Error(`R2 video poster verification failed HTTP ${posterResponse.status}: ${poster}`);
    }
    if (index % 100 === 0 || index === unique.length) console.log(`[verify] ${index}/${unique.length}`);
  }
}

function snapshotPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(WORK_DIR, `db-media-rollback-${stamp}.json`);
}

function sqlValue(dataType: string, parameter: string): string {
  if (dataType === "jsonb") return `${parameter}::jsonb`;
  if (dataType === "json") return `${parameter}::json`;
  return parameter;
}

function dbValue(dataType: string, value: any): any {
  if (dataType === "json" || dataType === "jsonb") return JSON.stringify(value);
  return value;
}

async function buildChanges(client: any, urlMap: Map<string, string>): Promise<{ changes: Change[]; unmapped: string[] }> {
  const columns = await getColumns(client);
  const pks = await getPrimaryKeys(client);
  const ordered = Array.from(urlMap.entries()).sort((a, b) => b[0].length - a[0].length);
  const changes: Change[] = [];
  const unmapped = new Set<string>();

  for (const column of columns) {
    const pkColumns = pks.get(column.table_name);
    const table = qIdent(column.table_name);
    const col = qIdent(column.column_name);

    const countResult = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${col}::text LIKE '%res.cloudinary.com%'`);
    if (!Number(countResult.rows[0]?.count || 0)) continue;

    if (!pkColumns || pkColumns.length === 0) {
      throw new Error(`Cannot safely cut over ${column.table_name}.${column.column_name}: table has no primary key`);
    }

    const pkSelect = pkColumns.map(qIdent).join(", ");
    const rows = await client.query(`SELECT ${pkSelect}, ${col} AS media_value FROM ${table} WHERE ${col}::text LIKE '%res.cloudinary.com%'`);

    for (const row of rows.rows) {
      const originalValue = row.media_value;
      const urls = collectCloudinaryUrls(originalValue);
      for (const url of urls) if (!urlMap.has(url)) unmapped.add(url);

      const newValue = replaceValue(originalValue, urlMap, ordered);
      if (valuesEqual(originalValue, newValue)) continue;

      const pk: Record<string, any> = {};
      for (const pkColumn of pkColumns) pk[pkColumn] = row[pkColumn];
      changes.push({
        table: column.table_name,
        column: column.column_name,
        dataType: column.data_type,
        pk,
        originalValue,
        newValue,
      });
    }
  }

  return { changes, unmapped: Array.from(unmapped).sort() };
}

async function applyChanges(client: any, changes: Change[], useOriginal: boolean): Promise<number> {
  let updated = 0;
  for (const change of changes) {
    const pkEntries = Object.entries(change.pk);
    const value = useOriginal ? change.originalValue : change.newValue;
    const params = [dbValue(change.dataType, value), ...pkEntries.map(([, pkValue]) => pkValue)];
    const where = pkEntries.map(([key], index) => `${qIdent(key)} = $${index + 2}`).join(" AND ");
    const query = `UPDATE ${qIdent(change.table)} SET ${qIdent(change.column)} = ${sqlValue(change.dataType, "$1")} WHERE ${where}`;
    const result = await client.query(query, params);
    updated += result.rowCount || 0;
  }
  return updated;
}

async function rollback(snapshotFile: string) {
  if (!snapshotFile || !fs.existsSync(snapshotFile)) throw new Error(`Rollback snapshot not found: ${snapshotFile || "(missing)"}`);
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8")) as Snapshot;
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.changes)) throw new Error("Invalid rollback snapshot");

  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const restored = await applyChanges(client, snapshot.changes, true);
    await client.query("COMMIT");
    console.log(`ROLLBACK COMPLETE: restored ${restored} media field updates.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function cutover(apply: boolean) {
  const mapPath = process.env.R2_FINAL_URL_MAP || DEFAULT_MAP;
  const urlMap = loadUrlMap(mapPath);
  if (urlMap.size === 0) throw new Error("URL map is empty");

  console.log("============================================================");
  console.log(apply ? " LUCERNE R2 DATABASE CUTOVER" : " LUCERNE R2 DATABASE CUTOVER — DRY RUN");
  console.log("============================================================");
  console.log(`URL mappings: ${urlMap.size}`);
  console.log(`Map: ${mapPath}`);

  if (process.env.R2_CUTOVER_SKIP_VERIFY !== "1") await verifyR2Urls(urlMap);

  const client = await pool.connect();
  let snapshotFile = "";
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const { changes, unmapped } = await buildChanges(client, urlMap);

    console.log(`Planned media field updates: ${changes.length}`);
    console.log(`Unmapped live Cloudinary URLs: ${unmapped.length}`);
    if (unmapped.length > 0) {
      const report = path.join(WORK_DIR, "cutover-unmapped-urls.json");
      fs.mkdirSync(WORK_DIR, { recursive: true });
      fs.writeFileSync(report, JSON.stringify(unmapped, null, 2));
      throw new Error(`Cutover blocked: ${unmapped.length} live Cloudinary URL(s) are not mapped. Report: ${report}`);
    }

    snapshotFile = snapshotPath();
    const snapshot: Snapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      urlMapPath: mapPath,
      changes,
    };
    fs.mkdirSync(WORK_DIR, { recursive: true });
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
    console.log(`Media-only rollback snapshot: ${snapshotFile}`);

    if (!apply) {
      await client.query("ROLLBACK");
      console.log("DRY RUN COMPLETE — DATABASE UNTOUCHED.");
      return;
    }

    if (process.env.R2_CUTOVER_CONFIRM !== "YES") {
      throw new Error("Apply blocked. Set R2_CUTOVER_CONFIRM=YES only after the fresh pg_dump backup succeeds.");
    }

    const updated = await applyChanges(client, changes, false);
    await client.query("COMMIT");
    console.log("============================================================");
    console.log(" DATABASE MEDIA CUTOVER COMPLETE");
    console.log("============================================================");
    console.log(`Updated media fields: ${updated}`);
    console.log(`Rollback snapshot:    ${snapshotFile}`);
    console.log("Other database data:  untouched");
    console.log("============================================================");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  if (mode === "--rollback") {
    await rollback(modeArg || "");
    return;
  }
  if (mode === "--apply") {
    await cutover(true);
    return;
  }
  if (mode !== "--dry-run") throw new Error(`Unknown mode: ${mode}. Use --dry-run, --apply, or --rollback <snapshot>.`);
  await cutover(false);
}

main().catch(async (error) => {
  console.error(error?.stack || error);
  await pool.end().catch(() => {});
  process.exit(1);
});
