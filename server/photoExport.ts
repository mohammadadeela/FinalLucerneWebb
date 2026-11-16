import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { buildZip } from "./watermark";
import sharp from "sharp";
import { buildTrackedPhotoLookupQuery } from "./photoExportQuery";

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
    `).then(async () => {
      // Existing installations already have the URL index table.
      await db.execute(sql`ALTER TABLE ai_generated_product_media ADD COLUMN IF NOT EXISTS source_url text`);
    }).catch((error) => {
      indexPromise = null;
      throw error;
    });
  }
  return indexPromise;
}

export async function trackAiProductPhoto(url: string, originalSourceUrl?: string): Promise<void> {
  await ensureAiPhotoIndex();
  await db.execute(sql`
    INSERT INTO ai_generated_product_media (url, source_url)
    VALUES (${url}, ${originalSourceUrl || null})
    ON CONFLICT (url) DO UPDATE
      SET source_url = COALESCE(ai_generated_product_media.source_url, EXCLUDED.source_url)
  `);
}

// Generated photos retain their original reference URL even if used as the
// storefront main photo or regenerated later. Follow the lineage, never
// recursively treat a generated result as ground-truth product photography.
export async function resolveOriginalAiSource(url: string): Promise<string> {
  await ensureAiPhotoIndex();
  let current = url;
  const visited = new Set<string>();
  for (let i = 0; i < 12 && !visited.has(current); i++) {
    visited.add(current);
    const result = await db.execute(sql`
      SELECT source_url FROM ai_generated_product_media WHERE url = ${current} LIMIT 1
    `);
    const source = (result as any).rows?.[0]?.source_url;
    if (typeof source !== "string" || !source.trim() || source === current) break;
    current = source.trim();
  }
  return current;
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
  // Legacy products can also have top-level gallery images alongside their
  // color variants. Include those when exporting all/AI images; the seen
  // set prevents duplicate files when they mirror a variant's gallery.
  if (mode !== "main") {
    add(product.mainImage, "product");
    for (const url of (Array.isArray(product.images) ? product.images : [])) {
      add(url, "product");
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
        // Product-media AI flags are sufficient on newer products. The URL
        // index also captures generated photos saved before those flags
        // existed, including when an AI photo became the main image.
        const indexed = new Set<string>();
        const urls = [...new Set(entries.map((photo) => photo.url))];
        try {
          await ensureAiPhotoIndex();
          // Explicit SQL bind parameters avoid the old PostgreSQL array-cast
          // failure. Bound the lookup so even large selections stay safe.
          for (let index = 0; index < urls.length; index += 250) {
            const chunk = urls.slice(index, index + 250);
            const rows = await db.execute(buildTrackedPhotoLookupQuery(chunk));
            for (const item of (rows as any).rows || []) {
              if (typeof item.url === "string") indexed.add(item.url);
            }
          }
        } catch (error) {
          // An old or inaccessible metadata index must not prevent exporting
          // photos already marked aiGenerated on the product itself.
          console.error("[photo-export] AI metadata lookup unavailable, using product media flags", error);
        }
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
      const partSize = 40;
      const chosen = selected.slice(offset, offset + partSize);
      const files: { name: string; data: Buffer }[] = [];
      const usedNames = new Set<string>();
      let failed = 0;
      const convertPhoto = async (photo: PhotoEntry): Promise<{ photo: PhotoEntry; data: Buffer } | null> => {
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
          return { photo, data: jpeg };
        } catch (error) {
          failed++;
          console.error("[photo-export] image failed", photo.productId, photo.url, error);
          return null;
        }
      };

      // Fetch and convert a few images at a time. A slow image must not hold
      // every other image in the ZIP hostage or cause a reverse-proxy timeout.
      for (let index = 0; index < chosen.length; index += 4) {
        const batch = await Promise.all(chosen.slice(index, index + 4).map(convertPhoto));
        for (const converted of batch) {
          if (!converted) continue;
          const { photo, data } = converted;
          const base = photo.productId + "-" + safeName(photo.productName) + "-" + safeName(photo.color);
          let name = base + "-" + photo.index + ".jpg";
          let suffix = 2;
          while (usedNames.has(name)) name = base + "-" + photo.index + "-" + suffix++ + ".jpg";
          usedNames.add(name);
          files.push({ name, data });
        }
      }
      if (!files.length) return res.status(502).json({
        message: "None of the photos in this ZIP part could be retrieved. Please retry or check the stored image URLs.",
      });

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
      return res.status(500).json({
        message: "Could not prepare the photo ZIP. Please retry the download.",
      });
    }
  });
}
