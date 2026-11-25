// ── Photos ready for Instagram / Facebook ───────────────────────────────────
// Product photos are stored as WebP in their own shape. Instagram only takes
// JPEG, and only in a few shapes (feed 4:5, square, story 9:16). This route
// turns one of our own stored photos into that JPEG on the fly:
//
//   GET /api/social-image/<photo id>.jpg?shape=feed|square|story&wm=0|1
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

  const upright = await sharp(input, { failOn: "none" }).rotate().toBuffer();

  const background = await sharp(upright)
    .resize({ width, height, fit: "cover" })
    .blur(40)
    .modulate({ brightness: 1.06, saturation: 0.85 })
    .toBuffer();

  const photo = await sharp(upright)
    .resize({ width, height, fit: "inside", withoutEnlargement: false })
    .toBuffer();

  const layers: sharp.OverlayOptions[] = [{ input: photo, gravity: "center" }];

  if (watermark) {
    // Small mark in the lower corner: visible, but not on top of the product.
    const wmWidth = Math.round(width * 0.2);
    const wmHeight = Math.round((360 / 393) * wmWidth);
    const margin = Math.round(width * 0.04);
    const wm = await sharp(buildWatermarkSvg(wmWidth)).png().toBuffer();
    layers.push({
      input: wm,
      left: width - wmWidth - margin,
      top: height - wmHeight - margin,
    });
  }

  return sharp(background)
    .composite(layers)
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

// Tiny in-memory cache: Instagram and Facebook each fetch the file once or
// twice when a post is published, so a handful of entries is plenty.
const cache = new Map<string, { data: Buffer; at: number }>();
const CACHE_MAX = 40;
const CACHE_MS = 60 * 60 * 1000;
let running = 0;
const MAX_RUNNING = 3;

export function registerSocialImageRoutes(app: Express) {
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

    if (running >= MAX_RUNNING) {
      res.setHeader("Retry-After", "5");
      return res.status(503).end();
    }
    running++;
    try {
      const base = String(process.env.R2_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE).replace(/\/+$/, "");
      const source = await fetch(`${base}/media/images/${id.toLowerCase()}/main.webp`);
      if (!source.ok) return res.status(404).end();
      const input = Buffer.from(await source.arrayBuffer());
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
