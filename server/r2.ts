import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import sharp from "sharp";
import { optimizeVideo } from "./mediaOptimizer";

const DEFAULT_PUBLIC_BASE = "https://media.lucerne-boutique.com";
const REGION = "auto";
const SERVICE = "s3";

function env(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required R2 environment variable: ${name}`);
  return value;
}

function config() {
  return {
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    bucket: env("R2_BUCKET"),
    endpoint: env("R2_ENDPOINT").replace(/\/+$/, ""),
    publicBase: String(process.env.R2_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE).replace(/\/+$/, ""),
  };
}

export function isR2Enabled(): boolean {
  return String(process.env.MEDIA_STORAGE || "cloudinary").toLowerCase() === "r2";
}

export function isR2Url(url: string | null | undefined): boolean {
  if (!url) return false;
  const publicBase = String(process.env.R2_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE).replace(/\/+$/, "");
  return url.startsWith(`${publicBase}/`);
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalPath(bucket: string, key: string): string {
  return `/${awsEncode(bucket)}/${key.split("/").map(awsEncode).join("/")}`;
}

function sha256Hex(value: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key: crypto.BinaryLike, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function amzDate(date = new Date()): { amz: string; short: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso, short: iso.slice(0, 8) };
}

function signingKey(secret: string, shortDate: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, shortDate);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

function canonicalQuery(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [awsEncode(key), awsEncode(String(value))] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function signedHeadersForRequest(
  method: string,
  key: string,
  payloadHash: string,
  extraHeaders: Record<string, string> = {},
  query?: Record<string, string | undefined>,
) {
  const cfg = config();
  const endpoint = new URL(cfg.endpoint);
  const { amz, short } = amzDate();
  const headers: Record<string, string> = {
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])),
  };

  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const signedHeaders = sortedHeaderNames.join(";");
  const queryString = canonicalQuery(query);
  const requestPath = canonicalPath(cfg.bucket, key);

  const canonicalRequest = [
    method,
    requestPath,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${short}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = crypto.createHmac("sha256", signingKey(cfg.secretAccessKey, short)).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `${cfg.endpoint}${requestPath}${queryString ? `?${queryString}` : ""}`;
  return { url, headers: { ...headers, authorization } };
}

type NodeFetchBody = Buffer | Uint8Array | Readable | string | null | undefined;

async function signedFetch(
  method: string,
  key: string,
  payloadHash: string,
  extraHeaders: Record<string, string> = {},
  query?: Record<string, string | undefined>,
  body?: NodeFetchBody,
): Promise<Response> {
  const { url, headers } = signedHeadersForRequest(method, key, payloadHash, extraHeaders, query);
  return await fetch(url, {
    method,
    headers,
    body: body as any,
    ...(body instanceof Readable ? ({ duplex: "half" } as any) : {}),
  } as any);
}

async function putBuffer(key: string, buffer: Buffer, contentType: string): Promise<void> {
  const payloadHash = sha256Hex(buffer);
  const response = await signedFetch(
    "PUT",
    key,
    payloadHash,
    {
      "content-type": contentType,
      "content-length": String(buffer.length),
      "cache-control": "public, max-age=31536000, immutable",
    },
    undefined,
    buffer,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`R2 PUT failed (${response.status}) for ${key}: ${text.slice(0, 300)}`);
  }
}

async function hashFile(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function putFile(key: string, filePath: string, contentType: string): Promise<void> {
  const stat = await fs.promises.stat(filePath);
  const payloadHash = await hashFile(filePath);
  const body = fs.createReadStream(filePath);
  const response = await signedFetch(
    "PUT",
    key,
    payloadHash,
    {
      "content-type": contentType,
      "content-length": String(stat.size),
      "cache-control": "public, max-age=31536000, immutable",
    },
    undefined,
    body,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`R2 PUT failed (${response.status}) for ${key}: ${text.slice(0, 300)}`);
  }
}

async function deleteKey(key: string): Promise<void> {
  const response = await signedFetch("DELETE", key, sha256Hex(""));
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => "");
    throw new Error(`R2 DELETE failed (${response.status}) for ${key}: ${text.slice(0, 300)}`);
  }
}

type R2Object = {
  key: string;
  lastModified: string;
  size: number;
};

function xmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function xmlValue(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? xmlDecode(match[1]) : "";
}

async function listR2Objects(prefix: string): Promise<R2Object[]> {
  const all: R2Object[] = [];
  let token: string | undefined;

  do {
    const response = await signedFetch(
      "GET",
      "",
      sha256Hex(""),
      {},
      {
        "list-type": "2",
        prefix,
        "max-keys": "1000",
        "continuation-token": token,
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`R2 LIST failed (${response.status}) for ${prefix}: ${text.slice(0, 300)}`);
    }

    const xml = await response.text();
    const blocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
    for (const block of blocks) {
      const key = xmlValue(block, "Key");
      if (!key) continue;
      all.push({
        key,
        lastModified: xmlValue(block, "LastModified"),
        size: Number(xmlValue(block, "Size")) || 0,
      });
    }

    const isTruncated = xmlValue(xml, "IsTruncated").toLowerCase() === "true";
    token = isTruncated ? xmlValue(xml, "NextContinuationToken") || undefined : undefined;
  } while (token);

  return all;
}

async function deleteR2Prefix(prefix: string): Promise<void> {
  const objects = await listR2Objects(prefix).catch(() => [] as R2Object[]);
  await Promise.all(objects.map((object) => deleteKey(object.key).catch(() => {})));
}

function safeExtension(originalName: string, fallback: string): string {
  const ext = path.extname(originalName || "").toLowerCase().replace(/[^.a-z0-9]/g, "");
  return ext || fallback;
}

function mimeFromExtension(ext: string, fallback: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
  };
  return map[ext] || fallback;
}

function publicUrl(key: string): string {
  return `${config().publicBase}/${key.split("/").map(awsEncode).join("/")}`;
}

async function imageVariant(buffer: Buffer, width: number, quality: number, blur = false): Promise<Buffer> {
  let pipeline = sharp(buffer, { animated: !blur })
    .rotate()
    .resize({ width, height: Math.round(width * 1.45), fit: "inside", withoutEnlargement: true });
  if (blur) pipeline = pipeline.blur(3);
  return await pipeline.webp({ quality, effort: 4, smartSubsample: true }).toBuffer();
}

export async function uploadImageToR2(buffer: Buffer, originalName: string): Promise<string> {
  const id = crypto.randomUUID();
  const prefix = `media/images/${id}`;
  const ext = safeExtension(originalName, ".jpg");
  const originalType = mimeFromExtension(ext, "application/octet-stream");

  try {
    const [main, v1200, v800, v400, blur] = await Promise.all([
      imageVariant(buffer, 1600, 82),
      imageVariant(buffer, 1200, 82),
      imageVariant(buffer, 800, 80),
      imageVariant(buffer, 400, 78),
      imageVariant(buffer, 40, 30, true),
    ]);

    await Promise.all([
      putBuffer(`${prefix}/original${ext}`, buffer, originalType),
      putBuffer(`${prefix}/main.webp`, main, "image/webp"),
      putBuffer(`${prefix}/1200.webp`, v1200, "image/webp"),
      putBuffer(`${prefix}/800.webp`, v800, "image/webp"),
      putBuffer(`${prefix}/400.webp`, v400, "image/webp"),
      putBuffer(`${prefix}/blur.webp`, blur, "image/webp"),
    ]);

    return publicUrl(`${prefix}/main.webp`);
  } catch (error) {
    await deleteR2Prefix(`${prefix}/`).catch(() => {});
    throw error;
  }
}

export async function uploadVideoToR2(source: Buffer | string, originalName: string): Promise<string> {
  const id = crypto.randomUUID();
  const prefix = `media/videos/${id}`;
  const ext = safeExtension(originalName, ".mp4");
  const originalType = mimeFromExtension(ext, "application/octet-stream");
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lucerne-r2-video-"));
  const sourcePath = path.join(tempRoot, `source${ext}`);
  const workPath = path.join(tempRoot, `work${ext}`);

  try {
    if (typeof source === "string") {
      await putFile(`${prefix}/original${ext}`, source, originalType);
      await fs.promises.copyFile(source, workPath);
    } else {
      await putBuffer(`${prefix}/original${ext}`, source, originalType);
      await fs.promises.writeFile(sourcePath, source);
      await fs.promises.copyFile(sourcePath, workPath);
    }

    const optimized = await optimizeVideo(workPath);
    const posterWebp = await fs.promises.readFile(optimized.posterPath);
    const posterJpeg = await sharp(posterWebp).jpeg({ quality: 82 }).toBuffer();

    await Promise.all([
      putFile(`${prefix}/video.mp4`, optimized.videoPath, "video/mp4"),
      putBuffer(`${prefix}/poster.webp`, posterWebp, "image/webp"),
      putBuffer(`${prefix}/video.jpg`, posterJpeg, "image/jpeg"),
    ]);

    return publicUrl(`${prefix}/video.mp4`);
  } catch (error) {
    await deleteR2Prefix(`${prefix}/`).catch(() => {});
    throw error;
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

function keyFromR2Url(url: string): string | null {
  try {
    const publicBase = new URL(String(process.env.R2_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE));
    const parsed = new URL(url);
    if (parsed.host !== publicBase.host) return null;
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

export async function deleteFromR2(url: string): Promise<void> {
  const key = keyFromR2Url(url);
  if (!key) return;

  const imageMatch = key.match(/^media\/images\/([^/]+)\//);
  if (imageMatch) {
    await deleteR2Prefix(`media/images/${imageMatch[1]}/`);
    return;
  }

  const videoMatch = key.match(/^media\/videos\/([^/]+)\//);
  if (videoMatch) {
    await deleteR2Prefix(`media/videos/${videoMatch[1]}/`);
    return;
  }

  await deleteKey(key);
}

export async function listR2Resources(
  resourceType: "image" | "video",
  maxResults = 30,
  nextCursor?: string,
): Promise<any> {
  const prefix = resourceType === "image" ? "media/images/" : "media/videos/";
  const canonicalSuffix = resourceType === "image" ? "/main.webp" : "/video.mp4";
  const objects = (await listR2Objects(prefix))
    .filter((object) => object.key.endsWith(canonicalSuffix))
    .sort((a, b) => {
      const byDate = String(b.lastModified || "").localeCompare(String(a.lastModified || ""));
      return byDate || b.key.localeCompare(a.key);
    });

  const parsedOffset = /^r2:(\d+)$/.exec(String(nextCursor || ""));
  const offset = parsedOffset ? Math.max(0, Number(parsedOffset[1]) || 0) : 0;
  const limit = Math.max(1, Math.min(Number(maxResults) || 30, 100));
  const page = objects.slice(offset, offset + limit);

  return {
    resources: page.map((object) => ({
      public_id: object.key.replace(/\/(main\.webp|video\.mp4)$/i, ""),
      secure_url: publicUrl(object.key),
      width: null,
      height: null,
      duration: null,
      created_at: object.lastModified || null,
      format: resourceType === "image" ? "webp" : "mp4",
      bytes: object.size,
      resource_type: resourceType,
    })),
    next_cursor: offset + page.length < objects.length ? `r2:${offset + page.length}` : null,
    total_count: objects.length,
  };
}

export function r2ImageVariantUrl(url: string, requestedWidth?: number): string {
  if (!isR2Url(url) || !/\/media\/images\/[^/]+\/main\.webp(?:[?#].*)?$/i.test(url) || !requestedWidth) return url;
  const width = requestedWidth <= 400 ? 400 : requestedWidth <= 800 ? 800 : 1200;
  return url.replace(/\/main\.webp(?:[?#].*)?$/i, `/${width}.webp`);
}

export function r2BlurUrl(url: string): string | undefined {
  if (!isR2Url(url) || !/\/media\/images\/[^/]+\/main\.webp(?:[?#].*)?$/i.test(url)) return undefined;
  return url.replace(/\/main\.webp(?:[?#].*)?$/i, "/blur.webp");
}

export function r2VideoPosterUrl(url: string): string | undefined {
  if (!isR2Url(url) || !/\/media\/videos\/[^/]+\/video\.mp4(?:[?#].*)?$/i.test(url)) return undefined;
  return url.replace(/\/video\.mp4(?:[?#].*)?$/i, "/video.jpg");
}
