import "dotenv/config";
import fs from "fs";
import path from "path";
import os from "os";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { pool } from "../server/db";
import { uploadImageToR2, uploadVideoToR2 } from "../server/r2";

type ColumnInfo = {
  table_name: string;
  column_name: string;
  data_type: string;
};

type MediaRole = "image" | "video" | "poster";

type OldRef = {
  url: string;
  role: MediaRole;
};

type SourceSpec = {
  id: string;
  type: "image" | "video";
  sourceUrl: string;
  originalName: string;
  refs: OldRef[];
};

type ParsedCloudinary = {
  type: "image" | "video";
  role: MediaRole;
  assetId: string;
  canonicalSourceUrl: string;
  originalName: string;
};

type CheckpointEntry = {
  status: "ok" | "failed";
  type: "image" | "video";
  newUrl?: string;
  error?: string;
  updatedAt: string;
};

type Checkpoint = {
  version: 1;
  sources: Record<string, CheckpointEntry>;
};

const PUBLIC_BASE = String(process.env.R2_PUBLIC_BASE_URL || "https://media.lucerne-boutique.com").replace(/\/+$/, "");
const WORK_DIR = process.env.R2_FINAL_WORK_DIR || "/root/lucerne-r2-final/current";
const CHECKPOINT_PATH = path.join(WORK_DIR, "checkpoint.json");
const AUDIT_PATH = path.join(WORK_DIR, "fresh-db-cloudinary-audit.json");
const URL_MAP_PATH = path.join(WORK_DIR, "DB-cloudinary-url-to-final-R2-url.json");
const FAILURE_PATH = path.join(WORK_DIR, "failures.json");

function qIdent(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function encodeKey(key: string): string {
  return key.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeJsonWrite(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, filePath);
}

function loadCheckpoint(): Checkpoint {
  try {
    const parsed = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf8"));
    if (parsed?.version === 1 && parsed?.sources && typeof parsed.sources === "object") {
      return parsed as Checkpoint;
    }
  } catch {}
  return { version: 1, sources: {} };
}

function findLatestLegacySourceMap(): string | null {
  const explicit = process.env.R2_LEGACY_SOURCE_MAP;
  if (explicit && fs.existsSync(explicit)) return explicit;

  const root = "/root/lucerne-r2-migration";
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const dir of dirs) {
    const candidate = path.join(root, dir, "DB-cloudinary-url-to-R2-key.json");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function normalizeMapValue(value: any): string | null {
  if (typeof value === "string" && value.trim()) return value.trim().replace(/^\/+/, "");
  if (!value || typeof value !== "object") return null;
  for (const key of ["r2Key", "r2_key", "key", "destinationKey", "destination_key", "objectKey", "object_key"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim().replace(/^\/+/, "");
  }
  return null;
}

function loadLegacySourceMap(): Map<string, string> {
  const result = new Map<string, string>();
  const file = findLatestLegacySourceMap();
  if (!file) {
    console.log("[source-map] No legacy R2 source map found; unmapped files will be read from Cloudinary.");
    return result;
  }

  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const oldUrl = String(item.oldUrl || item.old_url || item.cloudinaryUrl || item.cloudinary_url || item.url || "").trim();
      const key = normalizeMapValue(item);
      if (oldUrl && key) result.set(oldUrl, key);
    }
  } else if (raw && typeof raw === "object") {
    for (const [oldUrl, value] of Object.entries(raw)) {
      const key = normalizeMapValue(value);
      if (oldUrl && key) result.set(oldUrl, key);
    }
  }

  console.log(`[source-map] Loaded ${result.size} legacy URL → R2-original mappings from ${file}`);
  return result;
}

function extractCloudinaryUrls(text: string): string[] {
  const matches = text.match(/https:\/\/res\.cloudinary\.com\/[^"'\s\\<>]+/gi) || [];
  return Array.from(new Set(matches.map((url) => url.replace(/[),.;]+$/g, ""))));
}

async function scanDatabaseForCloudinaryUrls(): Promise<{ urls: string[]; locations: Record<string, number> }> {
  const columns = await pool.query<ColumnInfo>(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying', 'json', 'jsonb')
    ORDER BY table_name, ordinal_position
  `);

  const urls = new Set<string>();
  const locations: Record<string, number> = {};

  for (const column of columns.rows) {
    const table = qIdent(column.table_name);
    const col = qIdent(column.column_name);
    const query = `SELECT ${col}::text AS value FROM ${table} WHERE ${col}::text LIKE '%res.cloudinary.com%'`;
    let rows: any[];
    try {
      rows = (await pool.query(query)).rows;
    } catch (error: any) {
      console.warn(`[audit] Skipping ${column.table_name}.${column.column_name}: ${error?.message || error}`);
      continue;
    }

    let count = 0;
    for (const row of rows) {
      const found = extractCloudinaryUrls(String(row.value || ""));
      count += found.length;
      found.forEach((url) => urls.add(url));
    }
    if (count > 0) locations[`${column.table_name}.${column.column_name}`] = count;
  }

  return { urls: Array.from(urls).sort(), locations };
}

function looksLikeCloudinaryTransform(segment: string): boolean {
  if (!segment) return false;
  return segment.split(",").every((piece) => /^(?:a|ac|af|ar|b|bo|br|c|co|cs|d|dl|dn|dpr|du|e|eo|f|fl|fn|fps|g|h|ki|l|o|p|pg|q|r|so|sp|t|u|vc|vs|w|x|y|z)_.+/i.test(piece));
}

function parseCloudinary(url: string): ParsedCloudinary | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "res.cloudinary.com") return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 4) return null;
    const cloud = parts[0];
    const resourceType = parts[1];
    if (resourceType !== "image" && resourceType !== "video") return null;
    if (parts[2] !== "upload") return null;

    const afterUpload = parts.slice(3);
    const versionIndex = afterUpload.findIndex((segment) => /^v\d+$/.test(segment));
    const transformSegments: string[] = [];
    let assetSegments: string[];

    if (versionIndex >= 0) {
      transformSegments.push(...afterUpload.slice(0, versionIndex));
      assetSegments = afterUpload.slice(versionIndex);
    } else {
      assetSegments = [...afterUpload];
      while (assetSegments.length > 1 && looksLikeCloudinaryTransform(assetSegments[0])) {
        transformSegments.push(assetSegments.shift()!);
      }
    }

    if (assetSegments.length === 0) return null;
    const decodedLast = safeDecode(assetSegments[assetSegments.length - 1]);
    const extension = path.extname(decodedLast).toLowerCase();
    const transformText = transformSegments.join(",");
    const isPoster = resourceType === "video" && (
      /\.(jpg|jpeg|png|webp|avif)$/i.test(extension) ||
      /(?:^|,)so_|(?:^|,)f_(?:jpg|jpeg|png|webp|avif)(?:,|$)/i.test(transformText)
    );

    const role: MediaRole = resourceType === "image" ? "image" : (isPoster ? "poster" : "video");
    const noExtSegments = [...assetSegments];
    noExtSegments[noExtSegments.length - 1] = decodedLast.replace(/\.[^.]+$/, "");
    const assetId = `${cloud}|${resourceType}|${noExtSegments.map(safeDecode).join("/")}`;

    const encodedAssetPath = assetSegments.map((segment) => encodeURIComponent(safeDecode(segment))).join("/");
    const canonicalSourceUrl = role === "poster"
      ? ""
      : `${parsed.protocol}//${parsed.host}/${encodeURIComponent(cloud)}/${resourceType}/upload/${encodedAssetPath}`;
    const originalName = role === "poster"
      ? `${decodedLast.replace(/\.[^.]+$/, "")}.mp4`
      : decodedLast;

    return {
      type: resourceType,
      role,
      assetId,
      canonicalSourceUrl,
      originalName: originalName || (resourceType === "video" ? "video.mp4" : "image.jpg"),
    };
  } catch {
    return null;
  }
}

function sourceForUrl(oldUrl: string, legacy: Map<string, string>): SourceSpec | null {
  const parsed = parseCloudinary(oldUrl);
  if (!parsed) return null;

  const r2Key = legacy.get(oldUrl);
  if (r2Key) {
    return {
      id: `r2:${r2Key}`,
      type: parsed.type,
      sourceUrl: `${PUBLIC_BASE}/${encodeKey(r2Key)}`,
      originalName: path.basename(r2Key) || parsed.originalName,
      refs: [{ url: oldUrl, role: parsed.role }],
    };
  }

  return {
    id: `cloudinary:${parsed.assetId}`,
    type: parsed.type,
    sourceUrl: parsed.canonicalSourceUrl,
    originalName: parsed.originalName,
    refs: [{ url: oldUrl, role: parsed.role }],
  };
}

function mergeSource(existing: SourceSpec, incoming: SourceSpec): SourceSpec {
  if (!existing.sourceUrl && incoming.sourceUrl) {
    existing.sourceUrl = incoming.sourceUrl;
    existing.originalName = incoming.originalName;
  }
  for (const ref of incoming.refs) {
    if (!existing.refs.some((item) => item.url === ref.url)) existing.refs.push(ref);
  }
  return existing;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  if (!url) throw new Error("No readable source URL is available for this media asset");
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function downloadToFile(url: string, filePath: string): Promise<void> {
  if (!url) throw new Error("No playable source URL is available for this video asset");
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Source HTTP ${response.status}: ${url}`);
  await pipeline(Readable.fromWeb(response.body as any), fs.createWriteStream(filePath));
}

async function expectHttp200(url: string): Promise<void> {
  const response = await fetch(url, { method: "HEAD", redirect: "follow" });
  if (response.status !== 200) throw new Error(`Verification HTTP ${response.status}: ${url}`);
}

async function verifyImage(mainUrl: string): Promise<void> {
  const urls = [
    mainUrl,
    mainUrl.replace(/\/main\.webp$/i, "/1200.webp"),
    mainUrl.replace(/\/main\.webp$/i, "/800.webp"),
    mainUrl.replace(/\/main\.webp$/i, "/400.webp"),
    mainUrl.replace(/\/main\.webp$/i, "/blur.webp"),
  ];
  for (const url of urls) await expectHttp200(url);
}

async function verifyVideo(videoUrl: string): Promise<void> {
  await expectHttp200(videoUrl);
  await expectHttp200(videoUrl.replace(/\/video\.mp4$/i, "/poster.webp"));
  await expectHttp200(videoUrl.replace(/\/video\.mp4$/i, "/video.jpg"));

  const range = await fetch(videoUrl, {
    headers: { Range: "bytes=0-1023" },
    redirect: "follow",
  });
  if (range.status !== 206) throw new Error(`Video range verification returned HTTP ${range.status}: ${videoUrl}`);
  await range.arrayBuffer();
}

async function migrateOne(source: SourceSpec): Promise<string> {
  if (source.type === "image") {
    const buffer = await fetchBuffer(source.sourceUrl);
    const newUrl = await uploadImageToR2(buffer, source.originalName);
    await verifyImage(newUrl);
    return newUrl;
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lucerne-r2-existing-video-"));
  const ext = path.extname(source.originalName) || ".mp4";
  const input = path.join(tempDir, `source${ext}`);
  try {
    await downloadToFile(source.sourceUrl, input);
    const newUrl = await uploadVideoToR2(input, source.originalName);
    await verifyVideo(newUrl);
    return newUrl;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function targetForRef(newCanonicalUrl: string, ref: OldRef): string {
  if (ref.role === "poster") {
    return newCanonicalUrl.replace(/\/video\.mp4$/i, "/video.jpg");
  }
  return newCanonicalUrl;
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });

  console.log("============================================================");
  console.log(" LUCERNE R2 EXISTING-MEDIA PREPARATION");
  console.log(" DATABASE WILL NOT BE MODIFIED");
  console.log("============================================================");
  console.log(`Work directory: ${WORK_DIR}`);

  const audit = await scanDatabaseForCloudinaryUrls();
  safeJsonWrite(AUDIT_PATH, {
    generatedAt: new Date().toISOString(),
    uniqueCloudinaryUrls: audit.urls.length,
    locations: audit.locations,
    urls: audit.urls,
  });

  console.log(`[audit] Fresh DB unique Cloudinary URLs: ${audit.urls.length}`);
  console.log(`[audit] Report: ${AUDIT_PATH}`);

  const legacy = loadLegacySourceMap();
  const sources = new Map<string, SourceSpec>();
  const unparsed: string[] = [];

  for (const oldUrl of audit.urls) {
    const spec = sourceForUrl(oldUrl, legacy);
    if (!spec) {
      unparsed.push(oldUrl);
      continue;
    }
    const existing = sources.get(spec.id);
    if (existing) mergeSource(existing, spec);
    else sources.set(spec.id, spec);
  }

  console.log(`[audit] Unique underlying sources to prepare: ${sources.size}`);
  console.log(`[audit] Unparsed URLs: ${unparsed.length}`);

  const checkpoint = loadCheckpoint();
  let processed = 0;
  let ok = 0;
  let failed = 0;
  const total = sources.size;

  for (const source of sources.values()) {
    processed++;
    const previous = checkpoint.sources[source.id];

    if (previous?.status === "ok" && previous.newUrl) {
      try {
        if (source.type === "image") await verifyImage(previous.newUrl);
        else await verifyVideo(previous.newUrl);
        ok++;
        console.log(`[${processed}/${total}] resume OK ${source.type}: ${source.id}`);
        continue;
      } catch {
        console.log(`[${processed}/${total}] previous output no longer verifies; rebuilding ${source.id}`);
      }
    }

    try {
      console.log(`[${processed}/${total}] preparing ${source.type}: ${source.id}`);
      const newUrl = await migrateOne(source);
      checkpoint.sources[source.id] = {
        status: "ok",
        type: source.type,
        newUrl,
        updatedAt: new Date().toISOString(),
      };
      safeJsonWrite(CHECKPOINT_PATH, checkpoint);
      ok++;
      console.log(`[${processed}/${total}] OK → ${newUrl}`);
    } catch (error: any) {
      failed++;
      const message = String(error?.message || error);
      checkpoint.sources[source.id] = {
        status: "failed",
        type: source.type,
        error: message,
        updatedAt: new Date().toISOString(),
      };
      safeJsonWrite(CHECKPOINT_PATH, checkpoint);
      console.error(`[${processed}/${total}] FAILED ${source.id}: ${message}`);
    }
  }

  const urlMap: Record<string, string> = {};
  const failures: any[] = [];

  for (const source of sources.values()) {
    const state = checkpoint.sources[source.id];
    if (state?.status === "ok" && state.newUrl) {
      for (const ref of source.refs) urlMap[ref.url] = targetForRef(state.newUrl, ref);
    } else {
      failures.push({
        sourceId: source.id,
        type: source.type,
        sourceUrl: source.sourceUrl,
        refs: source.refs,
        error: state?.error || "not processed",
      });
    }
  }

  for (const url of unparsed) failures.push({ sourceId: null, refs: [{ url }], error: "Unable to parse Cloudinary URL" });

  safeJsonWrite(URL_MAP_PATH, urlMap);
  safeJsonWrite(FAILURE_PATH, failures);

  console.log("");
  console.log("============================================================");
  console.log(" R2 PREPARATION SUMMARY");
  console.log("============================================================");
  console.log(`Fresh Cloudinary URLs:    ${audit.urls.length}`);
  console.log(`Underlying sources:       ${sources.size}`);
  console.log(`Prepared/verified:        ${ok}`);
  console.log(`Failed sources:           ${failed}`);
  console.log(`Unparsed URLs:            ${unparsed.length}`);
  console.log(`Final URL mappings:       ${Object.keys(urlMap).length}`);
  console.log(`URL map:                  ${URL_MAP_PATH}`);
  console.log(`Failures:                 ${FAILURE_PATH}`);
  console.log("Database:                 UNTOUCHED");
  console.log("Cloudinary:               UNTOUCHED");
  console.log("============================================================");

  await pool.end();

  if (failures.length > 0 || Object.keys(urlMap).length !== audit.urls.length) {
    console.error("NOT READY FOR DATABASE CUTOVER: unresolved media remains.");
    process.exit(2);
  }

  console.log("ALL DATABASE-REFERENCED CLOUDINARY MEDIA IS READY ON R2.");
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
