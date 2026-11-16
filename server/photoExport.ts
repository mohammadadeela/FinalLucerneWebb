import type { Express } from "express";
import { sql, inArray } from "drizzle-orm";
import { db } from "./db";
import { products as productsTable } from "@shared/schema";
import { buildZip } from "./watermark";
import sharp from "sharp";
import { buildAiPhotoHistoryQuery } from "./photoExportQuery";
import { aiPhotoSeeds, selectAiPhotoHistory, type AiPhotoRecord, photosForProduct, type PhotoMode, type PhotoEntry } from "./productPhotoSelection";

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

export function registerProductPhotoExportRoutes(app: Express) {
  // Count exactly the photos selected by each export mode, including recorded
  // generations that are no longer present in a product's current gallery.
  app.post("/api/admin/products/photo-export/counts", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const rawIds: unknown[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids: number[] = [...new Set(rawIds
      .map(Number).filter((id: number) => Number.isInteger(id) && id > 0))];
    if (!ids.length || ids.length > 1000) {
      return res.status(400).json({ message: "Select between 1 and 1000 products" });
    }
    try {
      const matchingProducts = await db.select().from(productsTable).where(inArray(productsTable.id, ids));
      const productsById = new Map(matchingProducts.map((p) => [p.id, p]));
      const orderedProducts = ids.map((id) => productsById.get(id)).filter(Boolean);
      const counts = { main: 0, all: 0, ai: 0 };
      for (const product of orderedProducts) {
        counts.main += photosForProduct(product, "main").length;
        counts.all += photosForProduct(product, "all").length;
      }

      await ensureAiPhotoIndex();
      const urls = [...new Set(orderedProducts.flatMap((p) => aiPhotoSeeds(p).map((photo) => photo.url)))];
      const records = new Map<string, AiPhotoRecord>();
      for (let index = 0; index < urls.length; index += 250) {
        const rows = await db.execute(buildAiPhotoHistoryQuery(urls.slice(index, index + 250)));
        for (const item of (rows as any).rows || []) {
          if (typeof item.url === "string") records.set(item.url, item);
        }
      }
      counts.ai = selectAiPhotoHistory(orderedProducts, [...records.values()]).length;
      res.setHeader("Cache-Control", "no-store");
      return res.json(counts);
    } catch (error) {
      console.error("[photo-export] counts failed", error);
      return res.status(500).json({ message: "Could not count selected product photos" });
    }
  });

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
      // Export the persisted galleries directly. Storefront normalization can
      // discard legacy variant.images when a partial media array also exists.
      const matchingProducts = await db.select().from(productsTable).where(inArray(productsTable.id, ids));
      const productsById = new Map(matchingProducts.map((p) => [p.id, p]));
      for (const id of ids) {
        const product = productsById.get(id);
        if (product) entries.push(...photosForProduct(product, mode));
      }
      let selected = entries;
      if (mode === "ai") {
        await ensureAiPhotoIndex();
        const orderedProducts = ids.map((id) => productsById.get(id)).filter(Boolean);
        const urls = [...new Set(orderedProducts.flatMap((p) => aiPhotoSeeds(p).map((photo) => photo.url)))];
        const records = new Map<string, AiPhotoRecord>();
        for (let index = 0; index < urls.length; index += 250) {
          const rows = await db.execute(buildAiPhotoHistoryQuery(urls.slice(index, index + 250)));
          for (const item of (rows as any).rows || []) {
            if (typeof item.url === "string") records.set(item.url, item);
          }
        }
        // A failed history lookup must fail the export, not silently fall back
        // to the handful of newer photos that still have explicit media flags.
        selected = selectAiPhotoHistory(orderedProducts, [...records.values()]);
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
      const partSize = 4;
      const chosen = selected.slice(offset, offset + partSize);
      const files: { name: string; data: Buffer }[] = [];
      const usedNames = new Set<string>();
      let failed = 0;
      const convertPhoto = async (photo: PhotoEntry): Promise<{ photo: PhotoEntry; data: Buffer } | null> => {
        try {
          let jpeg: Buffer | undefined;
          for (let attempt = 0; attempt < 2 && !jpeg; attempt++) {
            try {
              const response = await fetch(photo.url, { signal: AbortSignal.timeout(10000) });
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
      if (failed || !files.length) return res.status(502).json({
        message: "Some product photos could not be retrieved. No incomplete ZIP was downloaded. Please retry or check the stored image URLs.",
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
