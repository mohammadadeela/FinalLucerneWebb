// Extra product photos, made for free from the shop's own photos.
//
// For each product (and each of its colours) the main photo is studied once and up to three
// extra views are cut from it:
//   1. the whole product, framed closer (when the original leaves a lot of empty space),
//   2-3. close-ups of the parts with the most detail (a heel, a buckle, stitching, a handle).
// Nothing is drawn or invented — every view is a piece of the real photo — and a view is only
// kept when it is mostly product, so a close-up of empty background is never produced.
// The views are saved as normal image files and listed in products.auto_views by source photo.
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { uploadToCloudinary, deleteFromCloudinary } from "./cloudinary";
import { kindOf, type Kind } from "../client/src/lib/outfitMatch";

export const AUTO_VIEWS_VERSION = 3; // 2: views keep the photo's shape and size; 3: views follow the kind of product
type Box = { left: number; top: number; width: number; height: number };
export type AutoViews = { v: number; bySource: Record<string, string[]> };

const MIN_SOURCE_WIDTH = 700; // smaller photos would only give blurry close-ups
const MIN_CROP_WIDTH = 420; // a view is never cut smaller than this (in source pixels)

/**
 * Finds the views worth cutting from one photo. Works on a small copy: the product is
 * whatever differs from the background (when the edges of the photo share one colour) or,
 * for photos taken in a room or on a model, wherever the picture has the most detail.
 */
export async function findViews(input: Buffer, kind: Kind = "other"): Promise<{ width: number; height: number; boxes: Box[] }> {
  const meta = await sharp(input).rotate().metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  if (W < MIN_SOURCE_WIDTH || H < MIN_SOURCE_WIDTH) return { width: W, height: H, boxes: [] };

  const w = 180;
  const h = Math.max(60, Math.round((H / W) * w));
  const { data } = await sharp(input).rotate().resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => {
    const i = (y * w + x) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };

  // Background colour = the middle value of the pixels around the edge.
  const ring = Math.max(2, Math.round(w * 0.04));
  const border: number[][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < ring || y < ring || x >= w - ring || y >= h - ring) border.push(px(x, y));
  const mid = (c: number) => border.map((p) => p[c]).sort((a, b) => a - b)[border.length >> 1];
  const bg = [mid(0), mid(1), mid(2)];
  const far = (p: number[]) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]);
  const plainBackground = border.filter((p) => far(p) < 26).length / border.length >= 0.7;

  // Detail = how much each pixel differs from its neighbours.
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = px(x, y); gray[y * w + x] = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]; }
  const detail = new Float32Array(w * h);
  let detailSum = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const d = Math.abs(gray[y * w + x + 1] - gray[y * w + x - 1]) + Math.abs(gray[(y + 1) * w + x] - gray[(y - 1) * w + x]);
    detail[y * w + x] = d;
    detailSum += d;
  }
  const detailMean = detailSum / (w * h) || 1;

  // Which pixels are product.
  const fg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    fg[y * w + x] = plainBackground ? (far(px(x, y)) > 30 ? 1 : 0) : detail[y * w + x] > detailMean * 1.6 ? 1 : 0;
  }

  // Fast sums over any rectangle.
  const table = (src: ArrayLike<number>) => {
    const t = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += src[y * w + x]; t[(y + 1) * (w + 1) + x + 1] = t[y * (w + 1) + x + 1] + row; }
    }
    return (x0: number, y0: number, x1: number, y1: number) => t[y1 * (w + 1) + x1] - t[y0 * (w + 1) + x1] - t[y1 * (w + 1) + x0] + t[y0 * (w + 1) + x0];
  };
  const fgSum = table(fg);
  const detailIn = table(detail);
  const fgTotal = fgSum(0, 0, w, h);
  if (fgTotal < w * h * 0.008) return { width: W, height: H, boxes: [] }; // nothing recognisable

  // The product's frame: trim away rows and columns that hold almost none of it.
  let x0 = 0, x1 = w, y0 = 0, y1 = h;
  const colHas = (x: number) => fgSum(x, 0, x + 1, h) > h * (plainBackground ? 0.02 : 0.05);
  const rowHas = (y: number) => fgSum(0, y, w, y + 1) > w * (plainBackground ? 0.02 : 0.05);
  while (x0 < w - 1 && !colHas(x0)) x0++;
  while (x1 > x0 + 1 && !colHas(x1 - 1)) x1--;
  while (y0 < h - 1 && !rowHas(y0)) y0++;
  while (y1 > y0 + 1 && !rowHas(y1 - 1)) y1--;
  // Where the PRODUCT is, not just "something": a photo of boots usually also shows legs, a
  // wall and a floor; a blouse is worn with trousers. The kind of product says which part of
  // the picture is the product, so a view is never a close-up of a knee or a painting.
  //   shoes  → the bottom of the picture        trousers / skirts → the lower part
  //   tops   → the upper part                   dresses / abayas  → the whole figure
  // Bags, belts and accessories can be anywhere, so they only get views on a plain background.
  const personInFrame = (y1 - y0) > (x1 - x0) * 1.2; // taller than wide: worn, not laid out
  let band: [number, number] | null = null;
  if (!plainBackground) {
    if (kind === "shoes") band = [h * 0.52, h];
    else if (kind === "bottom") band = [h * 0.38, h];
    else if (kind === "top") band = [h * 0.1, h * 0.68];
    else if (kind === "dress" || kind === "abaya") band = [h * 0.06, h * 0.96];
    else return { width: W, height: H, boxes: [] };
  } else if (personInFrame) {
    const tall = y1 - y0;
    if (kind === "shoes") band = [y0 + tall * 0.55, y1];
    else if (kind === "bottom") band = [y0 + tall * 0.38, y1];
    else if (kind === "top") band = [y0, y0 + tall * 0.66];
  }
  if (band) {
    y0 = Math.max(0, Math.round(band[0]));
    y1 = Math.min(h, Math.round(band[1]));
    // Left and right edges of what is inside the band.
    const bandCol = (x: number) => fgSum(x, y0, x + 1, y1) > (y1 - y0) * (plainBackground ? 0.03 : 0.08);
    let bx0 = 0, bx1 = w;
    while (bx0 < w - 1 && !bandCol(bx0)) bx0++;
    while (bx1 > bx0 + 1 && !bandCol(bx1 - 1)) bx1--;
    if (bx1 - bx0 >= w * 0.08) { x0 = bx0; x1 = bx1; }
  }
  const bw = x1 - x0, bh = y1 - y0;
  if (bw < w * 0.08 || bh < h * 0.06) return { width: W, height: H, boxes: [] };

  const minW = Math.ceil((MIN_CROP_WIDTH / W) * w);
  const out: { x: number; y: number; ww: number; wh: number }[] = [];
  const fit = (cx: number, cy: number, ww: number) => {
    // A window of the given width, centred where asked, kept inside the photo.
    ww = Math.min(w, Math.max(minW, Math.round(ww)));
    // Every view has the same shape as the photo it is cut from, so in the gallery it sits
    // exactly like the original (the small copy keeps the photo's proportions).
    let wh = Math.round((ww * h) / w);
    if (wh > h) { wh = h; ww = w; }
    const x = Math.round(Math.min(w - ww, Math.max(0, cx - ww / 2)));
    const y = Math.round(Math.min(h - wh, Math.max(0, cy - wh / 2)));
    return { x, y, ww, wh };
  };
  const coverage = (b: { x: number; y: number; ww: number; wh: number }) => fgSum(b.x, b.y, b.x + b.ww, b.y + b.wh) / (b.ww * b.wh);
  const overlap = (a: typeof out[number], b: typeof out[number]) => {
    const ix = Math.max(0, Math.min(a.x + a.ww, b.x + b.ww) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.wh, b.y + b.wh) - Math.max(a.y, b.y));
    return (ix * iy) / Math.min(a.ww * a.wh, b.ww * b.wh);
  };
  // "Mostly product": on a plain background at least 30% of the view is the product itself
  // (a wide shoe in a tall frame cannot fill more); in a busy photo the view must hold more
  // detail than the photo does on average.
  const good = (b: typeof out[number]) =>
    plainBackground ? coverage(b) >= 0.3 : detailIn(b.x, b.y, b.x + b.ww, b.y + b.wh) / (b.ww * b.wh) >= detailMean * 1.05;

  const finish = () => {
    const sx = W / w, sy = H / h;
    const boxes = out.map((b) => {
      const left = Math.max(0, Math.round(b.x * sx));
      const top = Math.max(0, Math.round(b.y * sy));
      return { left, top, width: Math.min(W - left, Math.round(b.ww * sx)), height: Math.min(H - top, Math.round(b.wh * sy)) };
    });
    return { width: W, height: H, boxes: boxes.filter((b) => b.width >= MIN_CROP_WIDTH * 0.95 && b.height > 0) };
  };

  // A photo taken in a room or on a model: ONE closer view of the part where the product is,
  // and nothing more — picking "interesting details" there would pick the room.
  if (!plainBackground) {
    const zoomW = Math.max(minW, Math.min(w * 0.64, ((bh * w) / h) * 1.15));
    const probe = fit(0, 0, zoomW);
    if (probe.ww * probe.wh > w * h * 0.72) return finish(); // would barely be a zoom
    let best: (typeof out)[number] | null = null;
    let bestScore = -1;
    const stepX = Math.max(2, Math.round(probe.ww / 8));
    // Shoes sit on the floor: the view is pushed to the bottom of the picture.
    const yTop = kind === "shoes" ? h - probe.wh : Math.max(0, Math.min(h - probe.wh, Math.round(y0 + bh / 2 - probe.wh / 2)));
    for (let x = 0; x + probe.ww <= w; x += stepX) {
      const b = { x, y: yTop, ww: probe.ww, wh: probe.wh };
      // Detail inside the product's band only, and a little preference for the middle.
      const inBand = detailIn(b.x, Math.max(b.y, y0), b.x + b.ww, Math.min(b.y + b.wh, y1));
      const centred = 1 - Math.abs(x + probe.ww / 2 - w / 2) / w;
      const score = inBand * (0.7 + 0.6 * centred);
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (best && detailIn(best.x, best.y, best.x + best.ww, best.y + best.wh) / (best.ww * best.wh) >= detailMean * 0.9) out.push(best);
    return finish();
  }

  // 1. The whole product, closer — only when the original leaves real empty space around it.
  const needW = Math.max(bw * 1.16, ((bh * w) / h) * 1.16);
  const whole = fit(x0 + bw / 2, y0 + bh / 2, needW);
  if (plainBackground && whole.ww * whole.wh <= w * h * 0.62 && coverage(whole) >= 0.12) out.push(whole);

  // 2-3. Close-ups: slide a window over the product and keep the spots with the most detail.
  const closeW = Math.max(minW, Math.min(Math.max(bw, (bh * w) / h) * 0.52, w * 0.5));
  const probe = fit(0, 0, closeW);
  const candidates: (typeof out[number] & { score: number })[] = [];
  const step = Math.max(2, Math.round(probe.ww / 6));
  for (let y = Math.max(0, y0 - probe.wh * 0.1); y + probe.wh <= Math.min(h, y1 + probe.wh * 0.1); y += step) {
    for (let x = Math.max(0, x0 - probe.ww * 0.1); x + probe.ww <= Math.min(w, x1 + probe.ww * 0.1); x += step) {
      const b = { x: Math.round(x), y: Math.round(y), ww: probe.ww, wh: probe.wh };
      if (!good(b)) continue;
      candidates.push({ ...b, score: detailIn(b.x, b.y, b.x + b.ww, b.y + b.wh) * (0.6 + coverage(b)) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const wanted = out.length ? 3 : 3;
  for (const c of candidates) {
    if (out.length >= wanted) break;
    // A close-up must show something the views already picked do not.
    if (out.some((o) => (o === whole ? c.ww > whole.ww * 0.75 : overlap(o, c) > 0.3))) continue;
    if (probe.ww * probe.wh > w * h * 0.7) break; // barely a zoom at all
    out.push(c);
  }

  return finish();
}

async function download(url: string): Promise<Buffer | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

const failures = new Map<string, number>();

/** Cuts and saves the views of one photo. Returns their addresses ([] when the photo gives none). */
export async function makeViews(sourceUrl: string, kind: Kind = "other"): Promise<string[] | null> {
  if (!/^https?:\/\//i.test(sourceUrl)) return []; // not a hosted photo: nothing to cut
  // A photo that keeps failing (deleted, unreachable) is left alone until the next restart.
  if ((failures.get(sourceUrl) || 0) >= 3) return null;
  const input = await download(sourceUrl);
  if (!input) {
    failures.set(sourceUrl, (failures.get(sourceUrl) || 0) + 1);
    return null; // could not be read now: try again another time
  }
  const { boxes, width, height } = await findViews(input, kind);
  // Saved at the original photo's own width and height (up to 1600px wide).
  const outW = Math.min(width, 1600);
  const outH = Math.round((outW * height) / width);
  const urls: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const out = await sharp(input).rotate().extract(boxes[i]).resize(outW, outH, { fit: "cover", kernel: "lanczos3" }).sharpen({ sigma: 0.6 }).webp({ quality: 90 }).toBuffer();
    urls.push(await uploadToCloudinary(out, `auto-view-${i + 1}.webp`));
  }
  return urls;
}

/** The photos a product's views are made from: its main photo and each colour's main photo. */
function sourcesOf(product: any): string[] {
  const list: string[] = [];
  const add = (u: unknown) => { const s = String(u || "").trim(); if (s && !list.includes(s)) list.push(s); };
  const variants = (product.colorVariants as any[]) || [];
  for (const v of variants) {
    const media = Array.isArray(v?.media) ? v.media.filter((m: any) => m?.type === "image" && m.url) : [];
    add((media.find((m: any) => m.isPrimary) || media[0])?.url || v?.mainImage);
  }
  if (!variants.length) add(product.mainImage);
  return list.slice(0, 6);
}

let running = false;
let pausedUntil = 0;

/** Makes the missing views, a few products at a time. Safe to call as often as you like. */
export async function sweepAutoViews(maxProducts = 40): Promise<{ done: number; left: number }> {
  if (running || Date.now() < pausedUntil) return { done: 0, left: -1 };
  running = true;
  let done = 0, left = 0;
  try {
    if ((await storage.getSiteSetting("auto_product_views")) === "off") return { done: 0, left: 0 };
    const products = (await storage.getProducts()) as any[];
    const categories = await storage.getCategories();
    for (const product of products) {
      const outdated = !!product.autoViews && product.autoViews.v !== AUTO_VIEWS_VERSION;
      const current: AutoViews = product.autoViews?.v === AUTO_VIEWS_VERSION ? product.autoViews : { v: AUTO_VIEWS_VERSION, bySource: {} };
      const sources = sourcesOf(product);
      const missing = sources.filter((s) => !(s in current.bySource) && (failures.get(s) || 0) < 3);
      const stale = Object.keys(current.bySource).filter((s) => !sources.includes(s));
      if (!missing.length && !stale.length) continue;
      if (done >= maxProducts) { left++; continue; }
      // Views made by an older version of this file are removed before the new ones are cut.
      if (outdated) {
        for (const urls of Object.values((product.autoViews as AutoViews).bySource || {})) {
          for (const url of urls || []) await deleteFromCloudinary(url).catch(() => {});
        }
      }
      const next: AutoViews = { v: AUTO_VIEWS_VERSION, bySource: { ...current.bySource } };
      // A photo that was replaced or removed takes its views with it.
      for (const s of stale) {
        for (const url of next.bySource[s] || []) await deleteFromCloudinary(url).catch(() => {});
        delete next.bySource[s];
      }
      let failed = false;
      for (const s of missing) {
        try {
          const urls = await makeViews(s, kindOf(product, categories as any[]));
          if (urls === null) { failed = true; continue; }
          next.bySource[s] = urls;
        } catch (err: any) {
          failed = true;
          console.error("[auto-views]", product.id, err?.message || err);
        }
      }
      await db.execute(sql`UPDATE products SET auto_views = ${JSON.stringify(next)}::jsonb WHERE id = ${product.id}`);
      done++;
      if (failed) left++;
    }
    return { done, left };
  } catch (err: any) {
    console.error("[auto-views] sweep failed:", err?.message || err);
    pausedUntil = Date.now() + 10 * 60_000;
    return { done, left: -1 };
  } finally {
    running = false;
  }
}

/** Runs in the background: soon after the server starts, then every few minutes. */
export function startAutoViews() {
  const tick = () => sweepAutoViews().then((r) => r.done && console.log(`[auto-views] made views for ${r.done} products, ${r.left} still waiting`)).catch(() => {});
  setTimeout(tick, 45_000).unref?.();
  setInterval(tick, 3 * 60_000).unref?.();
}
