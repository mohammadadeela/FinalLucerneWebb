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

