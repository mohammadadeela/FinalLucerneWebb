export type PhotoMode = "main" | "all" | "ai";
export type PhotoEntry = { productId: number; productName: string; color: string; url: string; index: number; aiGenerated: boolean };

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

export type AiPhotoRecord = { url: string; source_url?: string | null };

export function aiPhotoSeeds(product: any): PhotoEntry[] {
  const seeds = photosForProduct(product, "all");
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
