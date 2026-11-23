// ── AI Studio routes: product videos, Instagram content, downloads ───────────
// Generation takes a minute or more per clip, so every request becomes a job: the admin page
// starts jobs, then asks for their state. A small queue runs a few at a time so a batch of
// fifty products never hits the AI API all at once.
//
// Nothing is put on the storefront by itself unless the admin asked for it: a generated video is
// kept in the studio library as a draft, the admin looks at it, and publishing attaches it to the
// product's colour.

import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { resolveOriginalAiSource } from "./photoExport";
import { buildWatermarkSvg, watermarkImage } from "./watermark";
import type { OptimizeVideoOptions } from "./mediaOptimizer";
import sharp from "sharp";
import {
  buildInstagramImagePrompt,
  buildProductVideoPrompt,
  buildColourLineupPrompt,
  buildStyleFramePrompt,
  buildStyleVideoPrompt,
  describeProduct,
  detectProductKind,
  judgeFidelity,
  REEL_SETS,
  videoFrameStrip,
  buildSiteFirstFrame,
  composeStill,
  finishVideo,
  fitToCanvas,
  formatSize,
  generateStudioImage,
  generateStudioVideo,
  hasText,
  loadMedia,
  renderTextOverlay,
  watermarkVideo,
  type StudioFormat,
  type StudioMode,
  type StudioQuality,
  type StudioScene,
  type StudioText,
  type VideoMotion,
  type VideoStyle,
} from "./aiStudio";

export interface AiStudioDeps {
  uploadImage: (buffer: Buffer, name: string) => Promise<string>;
  uploadVideo: (source: Buffer | string, name: string, options?: OptimizeVideoOptions) => Promise<string>;
  normalizeProductPayload: (input: any, options?: { partial?: boolean }) => Promise<any>;
  derivePoster: (url: string | null | undefined) => string | undefined;
}

// The storefront's shoes category; footwear gets the footwear rules of the master prompt.
const SHOES_CATEGORY_ID = 4;
const MAX_REFERENCES = 6;

type MediaKind = "product_video" | "ig_image" | "ig_video";

interface MediaRow {
  id: number;
  kind: MediaKind;
  url: string;
  poster: string | null;
  product_id: number | null;
  variant_index: number | null;
  label: string | null;
  meta: any;
  status: "draft" | "published";
  created_at: string;
}

/* ───────────────────────────── Library table ───────────────────────────── */

let tablePromise: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tablePromise) {
    tablePromise = db
      .execute(sql`
        CREATE TABLE IF NOT EXISTS ai_studio_media (
          id serial PRIMARY KEY,
          kind text NOT NULL,
          url text NOT NULL,
          poster text,
          product_id integer,
          variant_index integer,
          label text,
          meta jsonb NOT NULL DEFAULT '{}'::jsonb,
          status text NOT NULL DEFAULT 'draft',
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        tablePromise = null;
        throw error;
      });
  }
  return tablePromise;
}

async function insertMedia(row: Omit<MediaRow, "id" | "created_at" | "status">): Promise<MediaRow> {
  await ensureTable();
  const result = await db.execute(sql`
    INSERT INTO ai_studio_media (kind, url, poster, product_id, variant_index, label, meta)
    VALUES (${row.kind}, ${row.url}, ${row.poster}, ${row.product_id}, ${row.variant_index}, ${row.label}, ${JSON.stringify(row.meta || {})}::jsonb)
    RETURNING *
  `);
  return (result as any).rows[0] as MediaRow;
}

async function getMedia(id: number): Promise<MediaRow | undefined> {
  await ensureTable();
  const result = await db.execute(sql`SELECT * FROM ai_studio_media WHERE id = ${id} LIMIT 1`);
  return (result as any).rows?.[0] as MediaRow | undefined;
}

/* ───────────────────────────── Products and their photos ───────────────────────────── */

function variantsOf(product: any): any[] {
  return Array.isArray(product?.colorVariants) ? product.colorVariants : [];
}

function validUrl(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function variantImages(variant: any): any[] {
  return Array.isArray(variant?.media) ? variant.media.filter((m: any) => m?.type === "image" && validUrl(m.url)) : [];
}

/** The photo the storefront shows for this colour. */
function mainPhoto(product: any, variantIndex: number): string | undefined {
  const variant = variantsOf(product)[variantIndex];
  const images = variantImages(variant);
  return (
    validUrl(variant?.mainImage) ||
    images.find((m: any) => m.isPrimary)?.url ||
    images[0]?.url ||
    validUrl(variant?.images?.[0]) ||
    (variantIndex === 0 ? validUrl(product?.mainImage) : undefined)
  );
}

/** The real photo of the item: the reference every AI photo of this colour was made from. */
async function originalPhoto(product: any, variantIndex: number): Promise<string | undefined> {
  const variant = variantsOf(product)[variantIndex];
  const images = variantImages(variant);
  const candidate =
    validUrl(variant?.originalImage) ||
    images.find((m: any) => m.aiGenerated !== true)?.url ||
    mainPhoto(product, variantIndex);
  if (!candidate) return undefined;
  try {
    return await resolveOriginalAiSource(candidate);
  } catch {
    return candidate;
  }
}

function colourName(product: any, variantIndex: number): string {
  return String(variantsOf(product)[variantIndex]?.name || "").trim();
}

function variantVideos(variant: any): any[] {
  return Array.isArray(variant?.media) ? variant.media.filter((m: any) => m?.type === "video" && validUrl(m.url)) : [];
}

/** Every photo of one colour (main first), so the image model can see the product from all its sides. */
function colourPhotos(product: any, variantIndex: number): string[] {
  const variant = variantsOf(product)[variantIndex];
  const urls: string[] = [];
  const add = (u: unknown) => {
    const ok = validUrl(u);
    if (ok && !urls.includes(ok)) urls.push(ok);
  };
  if (variant) {
    add(variant.mainImage);
    for (const m of Array.isArray(variant.media) ? variant.media : []) if (m?.type === "image") add(m.url);
    for (const u of Array.isArray(variant.images) ? variant.images : []) add(u);
  } else {
    add(product.mainImage);
    for (const u of Array.isArray(product.images) ? product.images : []) add(u);
  }
  return urls;
}

/* ───────────────────────────── Publishing a video on a product ───────────────────────────── */

async function publishVideo(
  deps: AiStudioDeps,
  row: MediaRow,
  replace: boolean,
): Promise<{ published: boolean; reason?: "has_video" }> {
  if (row.kind !== "product_video" || !row.product_id) throw new Error("Only product videos can be published on a product.");
  const product: any = await storage.getProduct(row.product_id);
  if (!product) throw new Error("The product no longer exists.");
  const variants = JSON.parse(JSON.stringify(variantsOf(product)));
  let payload: any;

  if (!variants.length) {
    const current = validUrl(product.videoUrl);
    if (current && current !== row.url && !replace) return { published: false, reason: "has_video" };
    payload = { videoUrl: row.url };
  } else {
    // A video that shows several colours goes on every one of those colours.
    const listed: number[] = Array.isArray(row.meta?.variantIndexes) ? row.meta.variantIndexes.map(Number).filter((i: number) => Number.isInteger(i) && i >= 0) : [];
    const indexes = listed.length ? listed : [Number(row.variant_index) || 0];
    const present = indexes.filter((i) => variants[i]);
    if (!present.length) throw new Error("This colour no longer exists on the product.");
    const mediaOf = (variant: any): any[] =>
      Array.isArray(variant.media) && variant.media.length
        ? variant.media
        : [
            ...(validUrl(variant.mainImage) ? [{ type: "image", url: variant.mainImage, isPrimary: true }] : []),
            ...((Array.isArray(variant.images) ? variant.images : []) as string[])
              .filter((url) => validUrl(url) && url !== variant.mainImage)
              .map((url) => ({ type: "image", url })),
          ];
    if (!replace && present.some((i) => mediaOf(variants[i]).some((m) => m?.type === "video" && m.url !== row.url))) {
      return { published: false, reason: "has_video" };
    }
    for (const i of present) {
      // The gallery plays one video per colour, so the new clip takes the place of the old one.
      variants[i].media = [
        ...mediaOf(variants[i]).filter((m) => m?.type !== "video"),
        { type: "video", url: row.url, poster: row.poster || deps.derivePoster(row.url), aiGenerated: true },
      ];
    }
    payload = { colorVariants: variants, ...(present.includes(0) ? { videoUrl: row.url } : {}) };
  }

  const clean = await deps.normalizeProductPayload(payload, { partial: true });
  const input: any = api.products.update.input.parse(clean);
  const updated = await storage.updateProduct(row.product_id, input);
  if (!updated) throw new Error("The product no longer exists.");
  await db.execute(sql`
    UPDATE ai_studio_media SET status = 'draft'
    WHERE kind = 'product_video' AND product_id = ${row.product_id}
      AND COALESCE(variant_index, 0) = ${Number(row.variant_index) || 0} AND id <> ${row.id}
  `);
  await db.execute(sql`UPDATE ai_studio_media SET status = 'published' WHERE id = ${row.id}`);
  return { published: true };
}

/** Takes a generated video off its product (every colour that shows it), so deleting it really removes it from the site. */
async function unpublishVideo(deps: AiStudioDeps, row: MediaRow): Promise<void> {
  if (row.kind !== "product_video" || !row.product_id) return;
  const product: any = await storage.getProduct(row.product_id);
  if (!product) return;
  const variants = JSON.parse(JSON.stringify(variantsOf(product)));
  const payload: any = {};
  let changed = false;
  for (const variant of variants) {
    if (!Array.isArray(variant?.media)) continue;
    const kept = variant.media.filter((m: any) => !(m?.type === "video" && m.url === row.url));
    if (kept.length !== variant.media.length) {
      variant.media = kept;
      changed = true;
    }
  }
  if (changed) payload.colorVariants = variants;
  if (product.videoUrl === row.url) {
    payload.videoUrl = null;
    changed = true;
  }
  if (!changed) return;
  const clean = await deps.normalizeProductPayload(payload, { partial: true });
  const input: any = api.products.update.input.parse(clean);
  await storage.updateProduct(row.product_id, input);
}

/* ───────────────────────────── Job queue ───────────────────────────── */

interface Job {
  id: string;
  status: "queued" | "running" | "done" | "error";
  label: string;
  at: number;
  run: () => Promise<any>;
  result?: any;
  message?: string;
  noKey?: boolean;
  noCredit?: boolean;
  stopped?: boolean;
}

const jobs = new Map<string, Job>();
const waiting: string[] = [];
let active = 0;
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.AI_STUDIO_CONCURRENCY) || 2));
let keyMissing = false;
// Circuit breaker. An empty Gemini balance, or two failures in a row, stops everything that is
// still waiting, so a large batch can never keep sending paid requests into a problem.
let stopReason: "" | "noCredit" | "errors" = "";
let failuresInARow = 0;
const MAX_FAILURES_IN_A_ROW = 2;

function pump() {
  while (active < CONCURRENCY && waiting.length) {
    const job = jobs.get(waiting.shift() as string);
    if (!job) continue;
    if (stopReason) {
      job.status = "error";
      job.stopped = true;
      job.noCredit = stopReason === "noCredit";
      job.message =
        stopReason === "noCredit"
          ? "Not started: the Gemini API balance is empty."
          : "Not started: the batch was stopped after repeated errors, so nothing more is charged. Check the error above, then try again.";
      job.at = Date.now();
      continue;
    }
    if (keyMissing) {
      // Nothing else can work without the key: fail the rest of the batch at once.
      job.status = "error";
      job.noKey = true;
      job.message = "GEMINI_API_KEY is not configured.";
      continue;
    }
    active++;
    job.status = "running";
    job
      .run()
      .then((result) => {
        job.status = "done";
        job.result = result;
        failuresInARow = 0;
      })
      .catch((err: any) => {
        console.error("[ai-studio] job failed:", job.label, err?.message || err);
        job.status = "error";
        job.message = String(err?.message || "Generation failed").slice(0, 400);
        job.noKey = !!err?.noKey;
        if (err?.noKey) keyMissing = true;
        job.noCredit = !!err?.noCredit;
        failuresInARow++;
        if (err?.noCredit) stopReason = "noCredit";
        else if (failuresInARow >= MAX_FAILURES_IN_A_ROW && !stopReason) stopReason = "errors";
      })
      .finally(() => {
        job.at = Date.now();
        active--;
        pump();
      });
  }
}

function addJob(label: string, run: () => Promise<any>): string {
  for (const [id, job] of jobs) {
    if ((job.status === "done" || job.status === "error") && Date.now() - job.at > 3 * 60 * 60 * 1000) jobs.delete(id);
  }
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  jobs.set(id, { id, status: "queued", label, at: Date.now(), run });
  waiting.push(id);
  keyMissing = false;
  // A new batch is the owner's decision to try again. If the balance is still empty the first
  // request is refused for free and the breaker stops the rest again.
  if (!active && waiting.length === 1) {
    stopReason = "";
    failuresInARow = 0;
  }
  pump();
  return id;
}

/* ───────────────────────────── Request helpers ───────────────────────────── */

function isAdmin(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  return true;
}

function parseItems(raw: unknown, max: number): { productId: number; variantIndex: number }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: { productId: number; variantIndex: number }[] = [];
  for (const entry of raw) {
    const productId = Number((entry as any)?.productId);
    const variantIndex = Number((entry as any)?.variantIndex ?? 0);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(variantIndex) || variantIndex < 0) continue;
    const key = `${productId}:${variantIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ productId, variantIndex });
    if (items.length >= max) break;
  }
  return items;
}

const clampSeconds = (value: unknown, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(4, Math.min(10, n)) : fallback;
};
const asMotion = (value: unknown): VideoMotion => (value === "drift" || value === "light" ? value : "pushIn");
const asStyle = (value: unknown): VideoStyle => (value === "tryOn" || value === "hands" || value === "unbox" || value === "model" ? value : "photo");
const asQuality = (value: unknown): StudioQuality => (value === "standard" ? "standard" : "high");

function cleanText(raw: any): StudioText | null {
  if (!raw || typeof raw !== "object") return null;
  const text: StudioText = {
    headline: String(raw.headline || "").trim().slice(0, 80),
    subline: String(raw.subline || "").trim().slice(0, 120),
    position: raw.position === "bottom" ? "bottom" : "top",
    tone: raw.tone === "light" || raw.tone === "dark" ? raw.tone : "auto",
  };
  return hasText(text) ? text : null;
}

function safeFileName(value: unknown): string {
  return (
    String(value || "lucerne")
      .replace(/[^\p{L}\p{N} _-]+/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "lucerne"
  );
}

/** The untouched file kept beside a stored photo or video, when there is one. */
function originalCandidates(url: string, type: "image" | "video"): string[] {
  const image = url.match(/^(.*\/media\/images\/[^/]+)\/main\.webp(?:[?#].*)?$/i);
  if (type === "image" && image) return [`${image[1]}/original.jpg`, `${image[1]}/original.png`, `${image[1]}/original.jpeg`, url];
  return [url];
}

async function loadBest(url: string, type: "image" | "video"): Promise<Buffer> {
  let lastError: any;
  for (const candidate of originalCandidates(url, type)) {
    try {
      return await loadMedia(candidate, type === "video" ? 120000 : 45000);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Could not read the stored file");
}

/* ───────────────────────────── Routes ───────────────────────────── */

export function registerAiStudioRoutes(app: Express, deps: AiStudioDeps) {
  // ── Product videos: one clip per chosen colour, made from that colour's own photo ──
  app.post("/api/admin/ai-studio/product-videos", async (req, res) => {
    if (!isAdmin(req, res)) return;
    const items = parseItems(req.body?.items, 60);
    if (!items.length) return res.status(400).json({ message: "Choose at least one product colour." });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ message: "GEMINI_API_KEY is not configured.", noKey: true });

    const source = req.body?.source === "original" ? "original" : "main";
    const motion = asMotion(req.body?.motion);
    const style = asStyle(req.body?.style);
    const seconds = clampSeconds(req.body?.seconds, 6);
    const quality = asQuality(req.body?.quality);
    const autoPublish = req.body?.autoPublish === true;
    const replace = req.body?.replace === true;
    const combineColours = req.body?.combineColours === true;

    try {
      await ensureTable();
      const started: any[] = [];
      // One video per colour, or (combineColours) one video per product showing all its chosen colours.
      const MAX_COLOURS = 6;
      const units: { productId: number; variantIndex: number; all: number[] }[] = [];
      if (combineColours) {
        const byProduct = new Map<number, number[]>();
        for (const it of items) byProduct.set(it.productId, [...(byProduct.get(it.productId) || []), it.variantIndex]);
        for (const [productId, indexes] of byProduct) {
          const sorted = [...indexes].sort((a, b) => a - b);
          // More colours than fit clearly in one frame are split into several videos.
          for (let i = 0; i < sorted.length; i += MAX_COLOURS) {
            const chunk = sorted.slice(i, i + MAX_COLOURS);
            units.push({ productId, variantIndex: chunk[0], all: chunk });
          }
        }
      } else {
        for (const it of items) units.push({ productId: it.productId, variantIndex: it.variantIndex, all: [it.variantIndex] });
      }
      for (const item of units) {
        const product: any = await storage.getProduct(item.productId);
        if (!product) continue;
        const multi = item.all.length > 1;
        const colour = colourName(product, item.variantIndex);
        const colourNames = item.all.map((i) => colourName(product, i) || `colour ${i + 1}`);
        const label = multi ? `${product.name} — ${colourNames.join(" + ")}` : colour ? `${product.name} — ${colour}` : String(product.name);
        const jobId = addJob(label, async () => {
          const fresh: any = (await storage.getProduct(item.productId)) || product;
          const photoUrl =
            (source === "original" ? await originalPhoto(fresh, item.variantIndex) : mainPhoto(fresh, item.variantIndex)) ||
            mainPhoto(fresh, item.variantIndex) ||
            validUrl(fresh.mainImage);
          if (!photoUrl) throw new Error("This colour has no photo to make a video from.");
          const isFootwear = Number(fresh.categoryId) === SHOES_CATEGORY_ID;
          // Dress, abaya, bag, belt...: each kind is worn, held and unboxed in its own way.
          const [allCategories, allSubcategories] = await Promise.all([storage.getCategories(), storage.getSubcategories()]);
          const category: any = (allCategories as any[]).find((c) => c.id === fresh.categoryId);
          const subIds: number[] = [...(Array.isArray(fresh.subcategoryIds) ? fresh.subcategoryIds : []), ...(fresh.subcategoryId ? [fresh.subcategoryId] : [])];
          const subs: any[] = (allSubcategories as any[]).filter((sub) => subIds.includes(sub.id));
          // The product's own name and subcategory say most; the main category is the fallback.
          const specific = detectProductKind([fresh.name, fresh.nameAr, ...subs.flatMap((sub) => [sub.name, sub.nameAr])]);
          const kind = specific !== "clothes" ? specific : detectProductKind([category?.name, category?.nameAr, category?.slug], isFootwear);
          const size = formatSize("site", quality);
          let firstFrame: Buffer;
          let prompt: string;
          // Every photo of this colour: what the quality controller compares against.
          const references: Buffer[] = [];
          const shownColours: string[] = [];
          const shownIndexes: number[] = [];
          if (multi) {
            // One photo per colour, in order; a colour without a usable photo is left out of the video.
            for (let k = 0; k < item.all.length; k++) {
              const idx = item.all[k];
              const u = (source === "original" ? await originalPhoto(fresh, idx) : mainPhoto(fresh, idx)) || mainPhoto(fresh, idx);
              if (!u) continue;
              try {
                references.push(await loadMedia(u));
                shownColours.push(colourNames[k]);
                shownIndexes.push(idx);
              } catch {
                /* this colour's photo could not be loaded */
              }
            }
            if (references.length < 2) throw new Error("Fewer than two colours of this product have a photo, so they cannot be shown together.");
          } else {
            const photoUrls = [photoUrl, ...colourPhotos(fresh, item.variantIndex).filter((u) => u !== photoUrl)].slice(0, 4);
            for (const u of photoUrls) {
              try {
                references.push(await loadMedia(u));
              } catch {
                /* a side photo that cannot be loaded is simply left out */
              }
            }
            if (!references.length) throw new Error("This colour's photo could not be loaded.");
            shownIndexes.push(item.variantIndex);
          }
          const together = shownColours.length > 1;
          let frameScore: number | null = null;

          if (style === "photo" && !together) {
            firstFrame = await buildSiteFirstFrame(references[0]);
            prompt = buildProductVideoPrompt({ isFootwear, motion, seconds, centralCrop: true });
          } else {
            // Step 1: write down what the product really looks like.
            const spec = await describeProduct(together ? references.slice(0, 1) : references, kind);
            const logo = style === "unbox"
              ? await sharp(buildWatermarkSvg(900)).flatten({ background: "#ffffff" }).extend({ top: 60, bottom: 60, left: 60, right: 60, background: "#ffffff" }).png().toBuffer()
              : null;
            // Step 2: shoot the opening frame, check it against the photos, and shoot again
            // with the controller's corrections until it matches (three tries at most).
            let best: { frame: Buffer; score: number } | null = null;
            let fixes: string[] = [];
            let bestRank = -1;
            // A different soft set for each video, the same one for all its attempts.
            const set = REEL_SETS[Math.floor(Math.random() * REEL_SETS.length)];
            for (let attempt = 1; attempt <= 3; attempt++) {
              const frame = await generateStudioImage(
                style === "photo"
                  ? buildColourLineupPrompt({ kind, colours: shownColours, set, spec, fixes })
                  : buildStyleFramePrompt({ style, kind, photoCount: references.length, hasLogo: !!logo, spec, fixes, set, colours: shownColours }),
                logo && style !== "photo" ? [...references, logo] : references,
                "9:16",
              );
              const verdict = await judgeFidelity(references, frame, "still", shownColours);
              if (!verdict) {
                // No controller available: use this frame as it is.
                if (!best) best = { frame, score: -1 };
                break;
              }
              // The product comes first; among equally exact frames the more real-looking one wins.
              const rank = verdict.score + (verdict.realism ?? 8) / 100;
              if (!best || rank > bestRank) {
                best = { frame, score: verdict.score };
                bestRank = rank;
              }
              if (verdict.score >= 9 && (verdict.realism ?? 10) >= 8) break;
              fixes = verdict.issues;
            }
            if (!best) throw new Error("The opening frame could not be generated.");
            frameScore = best.score >= 0 ? best.score : null;
            if (frameScore !== null && frameScore < 7) {
              throw new Error("The AI could not reproduce this product accurately enough, so no video was made. Add clearer photos of it from more sides and try again.");
            }
            firstFrame = await sharp(best.frame, { failOn: "none" }).resize(1080, 1920, { fit: "cover" }).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
            // Step 3: the video model animates that frame.
            prompt =
              style === "photo"
                ? buildProductVideoPrompt({ isFootwear, motion: "drift", seconds, centralCrop: true, productCount: shownColours.length })
                : buildStyleVideoPrompt({ style, kind, seconds, spec, colourCount: shownColours.length });
          }

          // The clip is checked too: if the product changes while moving, it is made once more.
          let raw = await generateStudioVideo({ firstFrame, prompt, seconds, quality });
          let videoScore: number | null = null;
          for (let attempt = 1; attempt <= 2; attempt++) {
            const strip = await videoFrameStrip(raw, seconds);
            const verdict = strip ? await judgeFidelity(references, strip, "video frames", shownColours) : null;
            if (!verdict) break;
            if (videoScore === null || verdict.score > videoScore) videoScore = verdict.score;
            if (verdict.score >= 8 || attempt === 2) break;
            const second = await generateStudioVideo({ firstFrame, prompt, seconds, quality });
            const secondStrip = await videoFrameStrip(second, seconds);
            const secondVerdict = secondStrip ? await judgeFidelity(references, secondStrip, "video frames", shownColours) : null;
            if (secondVerdict && secondVerdict.score > verdict.score) {
              raw = second;
              videoScore = secondVerdict.score;
            }
            break;
          }
          // A clip the controller is not happy with is kept as a draft instead of going on the site.
          const lowFidelity = videoScore !== null && videoScore < 8;
          const finished = await finishVideo(raw, { width: size.width, height: size.height, seconds });
          const url = await deps.uploadVideo(finished, "ai-product-video.mp4", { passthrough: true });
          const row = await insertMedia({
            kind: "product_video",
            url,
            poster: deps.derivePoster(url) || null,
            product_id: item.productId,
            variant_index: item.variantIndex,
            label,
            meta: { source, sourceUrl: photoUrl, motion, style, kind, variantIndexes: shownIndexes, colours: shownColours, seconds, quality, width: size.width, height: size.height, frameScore, videoScore },
          });
          if (lowFidelity) return { media: row, publishSkipped: "low_fidelity" };
          if (autoPublish) {
            const outcome = await publishVideo(deps, row, replace);
            return { media: { ...row, status: outcome.published ? "published" : "draft" }, publishSkipped: outcome.reason };
          }
          return { media: row };
        });
        started.push({ jobId, productId: item.productId, variantIndex: item.variantIndex, label });
      }
      if (!started.length) return res.status(404).json({ message: "None of the chosen products were found." });
      res.json({ jobs: started });
    } catch (err: any) {
      console.error("[ai-studio] product-videos", err?.message || err);
      res.status(500).json({ message: err?.message || "Could not start the video generation." });
    }
  });

  // ── Instagram: a still or a clip of one product, several products, or every colour of one ──
  app.post("/api/admin/ai-studio/instagram", async (req, res) => {
    if (!isAdmin(req, res)) return;
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ message: "GEMINI_API_KEY is not configured.", noKey: true });

    const output: "image" | "video" = req.body?.output === "video" ? "video" : "image";
    const mode: StudioMode = req.body?.mode === "multi" || req.body?.mode === "colors" ? req.body.mode : "single";
    const format: StudioFormat = req.body?.format === "reel" || req.body?.format === "square" ? req.body.format : "post";
    const requestedScene = req.body?.scene;
    const quality = asQuality(req.body?.quality);
    const motion = asMotion(req.body?.motion);
    const seconds = clampSeconds(req.body?.seconds, 7);
    const text = cleanText(req.body?.text);
    const copies = Math.max(1, Math.min(4, Math.round(Number(req.body?.copies)) || 1));
    const items = parseItems(req.body?.items, mode === "single" ? 1 : MAX_REFERENCES);

    if (!items.length) return res.status(400).json({ message: "Choose at least one product." });
    if (mode !== "single" && items.length < 2) {
      return res.status(400).json({ message: mode === "colors" ? "Choose at least two colours of the product." : "Choose at least two products." });
    }
    if (mode === "colors" && new Set(items.map((i) => i.productId)).size !== 1) {
      return res.status(400).json({ message: "All the colours must belong to the same product." });
    }
    // The product photo exactly as it is can only show the one product it shows.
    const scene: "asIs" | StudioScene = mode === "single" && requestedScene === "asIs" ? "asIs" : requestedScene === "boutique" ? "boutique" : "studio";

    try {
      await ensureTable();
      const products = new Map<number, any>();
      for (const item of items) {
        if (!products.has(item.productId)) products.set(item.productId, await storage.getProduct(item.productId));
      }
      const first: any = products.get(items[0].productId);
      if (!first || items.some((item) => !products.get(item.productId))) {
        return res.status(404).json({ message: "A chosen product was not found." });
      }
      const label =
        mode === "colors"
          ? `${first.name} — ${items.length} colours`
          : mode === "multi"
            ? `${items.length} products`
            : [first.name, colourName(first, items[0].variantIndex)].filter(Boolean).join(" — ");

      const started: any[] = [];
      for (let copy = 0; copy < copies; copy++) {
        const jobId = addJob(label, async () => {
          const size = formatSize(format, quality === "standard" && output === "video" ? "standard" : "high");
          const isFootwear = items.every((item) => Number(products.get(item.productId)?.categoryId) === SHOES_CATEGORY_ID);

          // 1. The still, without any text.
          let still: Buffer;
          const sourceUrls: string[] = [];
          if (scene === "asIs") {
            const photoUrl = mainPhoto(first, items[0].variantIndex) || validUrl(first.mainImage);
            if (!photoUrl) throw new Error("This product has no photo.");
            sourceUrls.push(photoUrl);
            still = await fitToCanvas(await loadMedia(photoUrl), size.width, size.height);
          } else {
            const references: Buffer[] = [];
            const refs: { productName: string; colorName?: string }[] = [];
            for (const item of items) {
              const product = products.get(item.productId);
              const photoUrl = (await originalPhoto(product, item.variantIndex)) || mainPhoto(product, item.variantIndex) || validUrl(product.mainImage);
              if (!photoUrl) throw new Error(`"${product.name}" has no photo for this colour.`);
              sourceUrls.push(photoUrl);
              references.push(await loadMedia(photoUrl));
              refs.push({ productName: String(product.name), colorName: colourName(product, item.variantIndex) || undefined });
            }
            const generated = await generateStudioImage(
              buildInstagramImagePrompt({ mode, refs, isFootwear, scene, aspect: size.aspect, textZone: text ? text.position || "top" : null }),
              references,
              size.aspect,
            );
            still = await fitToCanvas(generated, size.width, size.height);
          }

          // 2. The exact text, drawn by the server.
          const overlay = text ? await renderTextOverlay(text, size.width, size.height, still) : null;
          const meta = { mode, format, scene, quality, text, sourceUrls, width: size.width, height: size.height, items };

          if (output === "image") {
            const jpeg = await composeStill(still, overlay);
            const url = await deps.uploadImage(jpeg, "instagram.jpg");
            return { media: await insertMedia({ kind: "ig_image", url, poster: null, product_id: first.id, variant_index: items[0].variantIndex, label, meta }) };
          }

          // 3. The clip: the still is the first frame; the text is laid over the finished clip so
          //    it stays perfectly sharp and still while the picture moves.
          const firstFrame = format === "reel" ? still : await buildSiteFirstFrameFor(still);
          const raw = await generateStudioVideo({
            firstFrame,
            prompt: buildProductVideoPrompt({ isFootwear, motion, seconds, centralCrop: format !== "reel", productCount: items.length }),
            seconds,
            quality,
          });
          const finished = await finishVideo(raw, { width: size.width, height: size.height, seconds, overlayPng: overlay });
          const url = await deps.uploadVideo(finished, "instagram.mp4", { passthrough: true });
          return {
            media: await insertMedia({
              kind: "ig_video",
              url,
              poster: deps.derivePoster(url) || null,
              product_id: first.id,
              variant_index: items[0].variantIndex,
              label,
              meta: { ...meta, motion, seconds },
            }),
          };
        });
        started.push({ jobId, label });
      }
      res.json({ jobs: started });
    } catch (err: any) {
      console.error("[ai-studio] instagram", err?.message || err);
      res.status(500).json({ message: err?.message || "Could not start the generation." });
    }
  });

  // ── Job states ──
  app.get("/api/admin/ai-studio/jobs", (req, res) => {
    if (!isAdmin(req, res)) return;
    const ids = String(req.query.ids || "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 200);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      jobs: ids.map((id) => {
        const job = jobs.get(id);
        if (!job) return { id, status: "error", message: "The job was lost (the server restarted). Start it again." };
        return { id, status: job.status, label: job.label, message: job.message, noKey: job.noKey, noCredit: job.noCredit, stopped: job.stopped, result: job.status === "done" ? job.result : undefined };
      }),
    });
  });

  // ── Library ──
  app.get("/api/admin/ai-studio/media", async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
      await ensureTable();
      const group = String(req.query.group || "");
      const rows =
        group === "instagram"
          ? await db.execute(sql`SELECT * FROM ai_studio_media WHERE kind IN ('ig_image', 'ig_video') ORDER BY id DESC LIMIT 200`)
          : group === "product"
            ? await db.execute(sql`SELECT * FROM ai_studio_media WHERE kind = 'product_video' ORDER BY id DESC LIMIT 300`)
            : await db.execute(sql`SELECT * FROM ai_studio_media ORDER BY id DESC LIMIT 300`);
      res.setHeader("Cache-Control", "no-store");
      res.json({ media: (rows as any).rows || [] });
    } catch (err: any) {
      console.error("[ai-studio] media list", err?.message || err);
      res.status(500).json({ message: "Could not load the studio library." });
    }
  });

  app.post("/api/admin/ai-studio/media/:id/publish", async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
      const row = await getMedia(Number(req.params.id));
      if (!row) return res.status(404).json({ message: "Not found" });
      const outcome = await publishVideo(deps, row, req.body?.replace === true);
      if (!outcome.published) {
        return res.status(409).json({ message: "This colour already has a video.", reason: outcome.reason });
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[ai-studio] publish", err?.message || err);
      res.status(500).json({ message: err?.message || "Could not publish the video." });
    }
  });

  // Removes the entry from the library only. A video that is already on a product stays there
  // until it is removed in the product editor.
  app.delete("/api/admin/ai-studio/media/:id", async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
      await ensureTable();
      const id = Number(req.params.id) || 0;
      const row = await getMedia(id);
      // Deleting a video also takes it off the product page.
      if (row) await unpublishVideo(deps, row);
      await db.execute(sql`DELETE FROM ai_studio_media WHERE id = ${id}`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: "Could not remove it from the library." });
    }
  });

  // ── Download one photo or video, with or without the watermark ──
  // The file is named either by a library entry, or by a product and one of that product's own
  // videos — never by a free address.
  app.post("/api/admin/ai-studio/download", async (req, res) => {
    if (!isAdmin(req, res)) return;
    const watermark = req.body?.watermark === true;
    try {
      let url: string | undefined;
      let type: "image" | "video" = "video";
      let name = "lucerne";

      if (req.body?.mediaId !== undefined) {
        const row = await getMedia(Number(req.body.mediaId));
        if (!row) return res.status(404).json({ message: "Not found" });
        url = row.url;
        type = row.kind === "ig_image" ? "image" : "video";
        name = `${safeFileName(row.label)}-${row.id}`;
      } else {
        const product: any = await storage.getProduct(Number(req.body?.productId));
        if (!product) return res.status(404).json({ message: "Product not found" });
        const wanted = String(req.body?.url || "");
        const variants = variantsOf(product);
        let colour = "";
        const known = new Set<string>();
        if (validUrl(product.videoUrl)) known.add(product.videoUrl.trim());
        variants.forEach((variant: any) => {
          for (const video of variantVideos(variant)) {
            known.add(video.url.trim());
            if (video.url.trim() === wanted) colour = String(variant.name || "");
          }
        });
        if (!known.has(wanted)) return res.status(400).json({ message: "This video does not belong to the product." });
        url = wanted;
        name = [product.id, safeFileName(product.name), safeFileName(colour || "video")].join("-");
      }

      const buffer = await loadBest(url as string, type);
      let out: Buffer;
      let contentType: string;
      let ext: string;
      if (type === "image") {
        out = watermark
          ? await watermarkImage(buffer)
          : await sharp(buffer, { failOn: "none" }).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
        contentType = "image/jpeg";
        ext = "jpg";
      } else {
        out = watermark ? await watermarkVideo(buffer) : buffer;
        contentType = "video/mp4";
        ext = "mp4";
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-File-Name", encodeURIComponent(`${name}${watermark ? "-wm" : ""}.${ext}`));
      res.setHeader("Content-Disposition", `attachment; filename="lucerne-download.${ext}"; filename*=UTF-8''${encodeURIComponent(`${name}${watermark ? "-wm" : ""}.${ext}`)}`);
      res.send(out);
    } catch (err: any) {
      console.error("[ai-studio] download", err?.message || err);
      res.status(500).json({ message: err?.message || "Could not prepare the download." });
    }
  });
}

/**
 * First frame for a clip whose final shape is not 9:16: the finished still sits whole in the
 * centre of a 9:16 frame over a blurred continuation, and the clip is cut back to it afterwards.
 */
async function buildSiteFirstFrameFor(still: Buffer): Promise<Buffer> {
  const meta = await sharp(still).metadata();
  const width = 1080;
  const height = 1920;
  const innerHeight = Math.min(height, Math.round((width * (meta.height || 1350)) / (meta.width || 1080) / 2) * 2);
  const centre = await sharp(still).resize(width, innerHeight, { fit: "fill", kernel: "lanczos3" }).toBuffer();
  const backdrop = await sharp(centre).resize(width, height, { fit: "cover" }).blur(40).toBuffer();
  return sharp(backdrop)
    .composite([{ input: centre, left: 0, top: Math.round((height - innerHeight) / 2) }])
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
