import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { buildZip } from "./watermark";
import sharp from "sharp";

type PhotoMode = "main" | "all" | "ai";
type PhotoEntry = { productId: number; productName: string; color: string; url: string; index: number; aiGenerated: boolean };

let indexPromise: Promise<void> | null = null;
export function ensureAiPhotoIndex(): Promise<void> {
  if (!indexPromise) {
    indexPromise = db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_generated_product_media (
        url text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `).then(() => undefined).catch((error) => {
      indexPromise = null;
      throw error;
    });
  }
  return indexPromise;
}

export async function trackAiProductPhoto(url: string): Promise<void> {
  await ensureAiPhotoIndex();
  await db.execute(sql`
    INSERT INTO ai_generated_product_media (url)
    VALUES (${url}) ON CONFLICT (url) DO NOTHING
  `);
}

function safeName(value: unknown): string {
  return String(value || "product")
    .replace(/[^\p{L}\p{N} _-]+/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48) || "product";
}

function photosForProduct(product: any, mode: PhotoMode): PhotoEntry[] {
  const entries: PhotoEntry[] = [];
  const seen = new Set<string>();
  const add = (url: unknown, color: string, aiGenerated = false) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    entries.push({ productId: product.id, productName: product.name, color, url, index: entries.length + 1, aiGenerated });
  };
  const variants = Array.isArray(product.colorVariants) ? product.colorVariants : [];
  if (!variants.length) {
    add(product.mainImage, "main");
    if (mode !== "main") {
      for (const url of (Array.isArray(product.images) ? product.images : [])) add(url, "main");
    }
    return entries;
  }
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const color = variant.name || "color-" + (i + 1);
    const media = Array.isArray(variant.media) ? variant.media.filter((m: any) => m && m.type === "image") : [];
    const primary = media.find((m: any) => m.isPrimary && typeof m.url === "string");
    const first = media.find((m: any) => typeof m.url === "string");
    add(variant.mainImage || primary?.url || first?.url || variant.images?.[0], color,
      !!media.find((m: any) => m.url === (variant.mainImage || primary?.url) && m.aiGenerated));
    if (mode !== "main") {
      for (const m of media) add(m.url, color, !!m.aiGenerated);
      for (const url of (Array.isArray(variant.images) ? variant.images : [])) {
        add(url, color, !!media.find((m: any) => m.url === url && m.aiGenerated));
      }
    }
  }
  return entries;
}

export function registerProductPhotoExportRoutes(app: Express) {
  app.post("/api/admin/products/photo-export", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const mode: PhotoMode = req.body?.mode;
    if (!["main", "all", "ai"].includes(mode)) {
      return res.status(400).json({ message: "Invalid photo export mode" });
    }
    const rawIds: unknown[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids: number[] = [...new Set(rawIds
      .map(Number).filter((id: number) => Number.isInteger(id) && id > 0))];
    if (!ids.length || ids.length > 1000) {
      return res.status(400).json({ message: "Select between 1 and 1000 products" });
    }
    const offset = Number(req.body?.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      return res.status(400).json({ message: "Invalid photo offset" });
    }
    try {
      const entries: PhotoEntry[] = [];
      // One query per export part, rather than querying hundreds of products
      // separately every time the admin downloads another ZIP.
      const selectedIds = new Set(ids);
      const matchingProducts = (await storage.getProducts()).filter((p) => selectedIds.has(p.id));
      const productsById = new Map(matchingProducts.map((p) => [p.id, p]));
      for (const id of ids) {
        const product = productsById.get(id);
        if (product) entries.push(...photosForProduct(product, mode));
      }
      let selected = entries;
      if (mode === "ai") {
        await ensureAiPhotoIndex();
        const urls = [...new Set(entries.map((p) => p.url))];
        const rows = urls.length
          ? await db.execute(sql`SELECT url FROM ai_generated_product_media WHERE url = ANY(${urls}::text[])`)
          : { rows: [] };
        const indexed = new Set(((rows as any).rows || []).map((r: any) => r.url));
        selected = entries.filter((entry) => entry.aiGenerated || indexed.has(entry.url));
      }
      const total = selected.length;
      if (!total) return res.status(404).json({
        message: mode === "ai"
          ? "No tracked AI-generated photos found for these products. Older AI photos without metadata cannot be identified automatically."
          : "No product photos found for this selection",
      });
      if (offset >= total) return res.status(400).json({ message: "Photo offset is out of range" });

      // Each part is a bounded ZIP, so large selections never silently stop
      // after the first few hundred photos or exhaust server memory.
      const partSize = 75;
      const chosen = selected.slice(offset, offset + partSize);
      const files: { name: string; data: Buffer }[] = [];
      const usedNames = new Set<string>();
      let failed = 0;
      for (const photo of chosen) {
        try {
          let jpeg: Buffer | undefined;
          for (let attempt = 0; attempt < 2 && !jpeg; attempt++) {
            try {
              const response = await fetch(photo.url, { signal: AbortSignal.timeout(25000) });
              if (!response.ok) throw new Error("Image fetch failed: " + response.status);
              const buffer = Buffer.from(await response.arrayBuffer());
              jpeg = await sharp(buffer, { failOn: "none" }).rotate()
                .jpeg({ quality: 93, mozjpeg: true }).toBuffer();
            } catch (error) {
              if (attempt === 1) throw error;
            }
          }
          if (!jpeg) throw new Error("Image conversion failed");
          const base = photo.productId + "-" + safeName(photo.productName) + "-" + safeName(photo.color);
          let name = base + "-" + photo.index + ".jpg";
          let suffix = 2;
          while (usedNames.has(name)) name = base + "-" + photo.index + "-" + suffix++ + ".jpg";
          usedNames.add(name);
          files.push({ name, data: jpeg });
        } catch (error) {
          failed++;
          console.error("[photo-export] image failed", photo.productId, photo.url, error);
        }
      }
      if (!files.length) return res.status(502).json({ message: "All photos in this part failed to download" });

      const nextOffset = offset + chosen.length < total ? offset + chosen.length : 0;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="lucerne-' + mode + '-photos-part-' + (Math.floor(offset / partSize) + 1) + '.zip"');
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Photos-Total", String(total));
      res.setHeader("X-Photos-Included", String(files.length));
      res.setHeader("X-Photos-Failed", String(failed));
      res.setHeader("X-Photos-Next-Offset", String(nextOffset));
      return res.send(buildZip(files));
    } catch (error: any) {
      console.error("[photo-export] failed", error);
      return res.status(500).json({ message: error?.message || "Photo export failed" });
    }
  });
}
