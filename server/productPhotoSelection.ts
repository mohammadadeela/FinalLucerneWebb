export type PhotoMode = "main" | "all" | "ai";
export type PhotoEntry = { productId: number; productName: string; color: string; url: string; index: number; aiGenerated: boolean };

// Before AI provenance was introduced, generation appended outputs after the
// original reference and promoted a generated output to main. Recover that
// legacy layout without changing the stored product or its storefront gallery.
// This is a compatibility inference; explicit non-AI markers take precedence.
export function legacyGeneratedPhotoUrls(variant: any): Set<string> {
  const media = Array.isArray(variant?.media)
    ? variant.media.filter((m: any) => m?.type === "image" && typeof m.url === "string") : [];
  const source = variant?.originalImage || media[0]?.url;
  const primary = variant?.mainImage || media.find((m: any) => m.isPrimary)?.url;
  if (!source || source !== media[0]?.url || !primary || primary === source ||
      !media.some((m: any) => m.url === primary)) return new Set();
  return new Set(media.slice(1).filter((m: any) => m.url !== source && m.aiGenerated !== false)
    .map((m: any) => m.url));
}

export function photosForProduct(product: any, mode: PhotoMode): PhotoEntry[] {
  const entries: PhotoEntry[] = [];
  const seen = new Map<string, PhotoEntry>();
  const add = (url: unknown, color: string, aiGenerated = false) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
    const existing = seen.get(url);
    if (existing) {
      existing.aiGenerated ||= aiGenerated;
      return;
    }
    const entry = { productId: product.id, productName: product.name, color, url, index: entries.length + 1, aiGenerated };
    seen.set(url, entry);
    entries.push(entry);
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
    const legacyAiUrls = mode === "ai" ? legacyGeneratedPhotoUrls(variant) : new Set<string>();
    add(variant.mainImage || primary?.url || first?.url || variant.images?.[0], color,
      legacyAiUrls.has(variant.mainImage || primary?.url || first?.url || variant.images?.[0]) ||
      !!media.find((m: any) => m.url === (variant.mainImage || primary?.url) && m.aiGenerated));
    if (mode !== "main") {
      for (const m of media) add(m.url, color, !!m.aiGenerated || legacyAiUrls.has(m.url));
      for (const url of (Array.isArray(variant.images) ? variant.images : [])) {
        add(url, color, legacyAiUrls.has(url) || !!media.find((m: any) => m.url === url && m.aiGenerated));
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

export type AiPhotoRecord = { url: string; source_url?: string | null };

export function aiPhotoSeeds(product: any): PhotoEntry[] {
  const seeds = photosForProduct(product, "ai");
  for (const [i, variant] of (Array.isArray(product.colorVariants) ? product.colorVariants : []).entries()) {
    if (typeof variant?.originalImage === "string" && /^https?:\/\//i.test(variant.originalImage)) {
      seeds.push({ productId: product.id, productName: product.name, color: variant.name || `color-${i + 1}`,
        url: variant.originalImage, index: seeds.length + 1, aiGenerated: false });
    }
  }
  return seeds;
}

export function selectAiPhotoHistory(products: any[], records: AiPhotoRecord[]): PhotoEntry[] {
  const indexed = new Set(records.map((record) => record.url));
  const children = new Map<string, string[]>();
  for (const record of records) {
    if (!record.source_url || !/^https?:\/\//i.test(record.url)) continue;
    const urls = children.get(record.source_url) || [];
    urls.push(record.url);
    children.set(record.source_url, urls);
  }
  const result: PhotoEntry[] = [];
  for (const product of products) {
    const seeds = aiPhotoSeeds(product);
    const found = new Map<string, PhotoEntry>();
    const visited = new Set<string>();
    const queue = [...seeds];
    for (let i = 0; i < queue.length; i++) {
      const photo = queue[i];
      if (photo.aiGenerated || indexed.has(photo.url)) {
        if (!found.has(photo.url)) found.set(photo.url, { ...photo, aiGenerated: true });
      }
      if (visited.has(photo.url)) continue;
      visited.add(photo.url);
      for (const url of children.get(photo.url) || []) queue.push({ ...photo, url, aiGenerated: true });
    }
    // Stable order is essential because each batch is a separate request.
    result.push(...[...found.values()].sort((a, b) => a.url.localeCompare(b.url))
      .map((photo, i) => ({ ...photo, index: i + 1 })));
  }
  return result;
}
