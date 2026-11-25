// ── Photos ready for Instagram / Facebook ───────────────────────────────────
// Product photos are stored as WebP in their own shape. Instagram only takes
// JPEG, and only in a few shapes (feed 4:5, square, story 9:16). This route
// turns one of our own stored photos into that JPEG on the fly:
//
//   GET /api/social-image/<photo id>.jpg?shape=feed|square|story&wm=0|1
//   GET /api/social-collage/<id>_<id>_....jpg   (2 to 10 photos in one picture,
//       for places that take a single photo per post, such as a Facebook Page)
//
// The whole product stays visible: the photo is fitted inside the frame and
// the empty sides are filled with a soft blurred copy of the same photo, so
// nothing is cropped off and no blank bars appear. The Lucerne watermark is
// burned in by default (wm=0 turns it off).
//
// Only photos from our own media store can be asked for (the id is the folder
// name of the stored photo), so the route cannot be used to fetch other sites.

import type { Express } from "express";
import sharp from "sharp";
import { buildWatermarkSvg } from "./watermark";

const DEFAULT_PUBLIC_BASE = "https://media.lucerne-boutique.com";

const SHAPES: Record<string, { width: number; height: number }> = {
  feed: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fits the photo inside the frame over a blurred copy of itself → JPEG. */
export async function buildSocialImage(
  input: Buffer,
  shape: keyof typeof SHAPES | string = "feed",
  watermark = true,
): Promise<Buffer> {
  const { width, height } = SHAPES[shape] || SHAPES.feed;
  const layers: sharp.OverlayOptions[] = [];
  if (watermark) layers.push(await watermarkLayer(width, height));
  return sharp(await fitTile(input, width, height))
    .composite(layers)
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/** The whole photo inside a width x height frame, over a soft blurred copy of itself. */
async function fitTile(input: Buffer, width: number, height: number): Promise<Buffer> {
  const upright = await sharp(input, { failOn: "none" }).rotate().toBuffer();
  const background = await sharp(upright)
    .resize({ width, height, fit: "cover" })
    .blur(40)
    .modulate({ brightness: 1.06, saturation: 0.85 })
    .toBuffer();
  const photo = await sharp(upright)
    .resize({ width, height, fit: "inside", withoutEnlargement: false })
    .toBuffer();
  return sharp(background).composite([{ input: photo, gravity: "center" }]).png().toBuffer();
}

/** Small mark in the lower corner: visible, but not on top of the product. */
async function watermarkLayer(width: number, height: number, share = 0.2): Promise<sharp.OverlayOptions> {
  const wmWidth = Math.round(width * share);
  const wmHeight = Math.round((360 / 393) * wmWidth);
  const margin = Math.round(width * share * 0.2);
  const wm = await sharp(buildWatermarkSvg(wmWidth)).png().toBuffer();
  return { input: wm, left: width - wmWidth - margin, top: height - wmHeight - margin };
}

// How many photos sit in each row, by number of photos.
const COLLAGE_ROWS: Record<number, number[]> = {
  1: [1], 2: [2], 3: [1, 2], 4: [2, 2], 5: [2, 3], 6: [3, 3],
  7: [2, 3, 2], 8: [3, 2, 3], 9: [3, 3, 3], 10: [3, 4, 3],
};

/** Several photos in one 4:5 picture: equal rows, every photo shown whole, thin white lines between. */
export async function buildCollage(inputs: Buffer[], watermark = true): Promise<Buffer> {
  const photos = inputs.slice(0, 10);
  const rows = COLLAGE_ROWS[photos.length] || [1];
  const width = 1080;
  const height = photos.length === 2 ? 675 : 1350;
  const gap = 6;
  const rowHeight = Math.floor((height - gap * (rows.length - 1)) / rows.length);

  const layers: sharp.OverlayOptions[] = [];
  let index = 0;
  for (let r = 0; r < rows.length; r++) {
    const count = rows[r];
    const tileWidth = Math.floor((width - gap * (count - 1)) / count);
    for (let c = 0; c < count; c++) {
      // The last tile of a row and the last row take up the leftover pixels.
      const w = c === count - 1 ? width - (tileWidth + gap) * (count - 1) : tileWidth;
      const h = r === rows.length - 1 ? height - (rowHeight + gap) * (rows.length - 1) : rowHeight;
      layers.push({
        input: await fitTile(photos[index++], w, h),
        left: c * (tileWidth + gap),
        top: r * (rowHeight + gap),
      });
    }
  }
  // Smaller than on a single photo, so it stays in the corner of the last tile.
  if (watermark) layers.push(await watermarkLayer(width, height, 0.1));

  return sharp({ create: { width, height, channels: 3, background: "#FFFFFF" } })
    .composite(layers)
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

// Tiny in-memory cache: Instagram and Facebook each fetch the file once or
// twice when a post is published, so a handful of entries is plenty.
const cache = new Map<string, { data: Buffer; at: number }>();
const CACHE_MAX = 80;
const CACHE_MS = 60 * 60 * 1000;
let running = 0;
const MAX_RUNNING = 3;

async function fetchStored(id: string, variant = "main"): Promise<Buffer | null> {
  const base = String(process.env.R2_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE).replace(/\/+$/, "");
  const source = await fetch(`${base}/media/images/${id.toLowerCase()}/${variant}.webp`);
  if (!source.ok) return null;
  return Buffer.from(await source.arrayBuffer());
}

export function registerSocialImageRoutes(app: Express) {
  app.get("/api/social-collage/:file", async (req, res) => {
    const match = /^(.+)\.jpe?g$/i.exec(String(req.params.file || ""));
    const ids = (match?.[1] || "").split("_").filter(Boolean);
    if (ids.length < 2 || ids.length > 10 || !ids.every((id) => ID_PATTERN.test(id))) {
      return res.status(404).end();
    }
    const watermark = String(req.query.wm ?? "1") !== "0";
    const key = `collage|${ids.join("_").toLowerCase()}|${watermark ? 1 : 0}`;
    const send = (data: Buffer) => {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Length", String(data.length));
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(data);
    };
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return send(hit.data);

    const waitUntil = Date.now() + 45_000;
    while (running >= MAX_RUNNING) {
      if (Date.now() > waitUntil) {
        res.setHeader("Retry-After", "5");
        return res.status(503).end();
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    running++;
    try {
      const inputs: Buffer[] = [];
      for (const id of ids) {
        const input = await fetchStored(id, "800");
        if (!input) return res.status(404).end();
        inputs.push(input);
      }
      const data = await buildCollage(inputs, watermark);
      if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(key, { data, at: Date.now() });
      send(data);
    } catch (err) {
      console.error("[social-collage] failed:", err);
      if (!res.headersSent) res.status(500).end();
    } finally {
      running--;
    }
  });

  app.get("/api/social-image/:file", async (req, res) => {
    const match = /^(.+)\.jpe?g$/i.exec(String(req.params.file || ""));
    const id = match?.[1] || "";
    if (!ID_PATTERN.test(id)) return res.status(404).end();

    const shape = String(req.query.shape || "feed").toLowerCase();
    if (!SHAPES[shape]) return res.status(400).json({ message: "Unknown shape" });
    const watermark = String(req.query.wm ?? "1") !== "0";

    const key = `${id}|${shape}|${watermark ? 1 : 0}`;
    const send = (data: Buffer) => {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Length", String(data.length));
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(data);
    };

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return send(hit.data);

    // Instagram asks for all photos of a multi-photo post at once: wait for a
    // free slot instead of turning the extra requests away.
    const waitUntil = Date.now() + 45_000;
    while (running >= MAX_RUNNING) {
      if (Date.now() > waitUntil) {
        res.setHeader("Retry-After", "5");
        return res.status(503).end();
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const ready = cache.get(key);
    if (ready && Date.now() - ready.at < CACHE_MS) return send(ready.data);
    running++;
    try {
      const input = await fetchStored(id);
      if (!input) return res.status(404).end();
      const data = await buildSocialImage(input, shape, watermark);

      if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(key, { data, at: Date.now() });
      send(data);
    } catch (err) {
      console.error("[social-image] failed:", id, err);
      if (!res.headersSent) res.status(500).end();
    } finally {
      running--;
    }
  });
}
