// Keeps the actual reference photo separate from the current storefront main image.
// A generated image can become the main image without becoming the next AI input.
export type AiSourceMedia = {
  type: "image" | "video";
  url: string;
  aiGenerated?: boolean;
};

export type AiSourceVariant = {
  originalImage?: string | null;
  mainImage?: string | null;
  images?: string[] | null;
  media?: AiSourceMedia[] | null;
};

const validUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  return url || undefined;
};

export function getOriginalProductPhoto(
  variant: AiSourceVariant | null | undefined,
  requestedUrl?: string,
  fallbackMainImage?: string,
): string | undefined {
  const gallery = Array.isArray(variant?.media)
    ? variant.media.filter((item) => item?.type === "image" && validUrl(item.url))
    : [];
  const knownUrls = new Set([
    ...gallery.map((item) => item.url),
    ...(Array.isArray(variant?.images) ? variant.images : []),
    variant?.mainImage || "",
  ].filter(Boolean));

  // Once an original has been recorded, NEVER change it just because
  // an AI result was made primary or another thumbnail was clicked.
  const pinned = validUrl(variant?.originalImage);
  if (pinned && (knownUrls.size === 0 || knownUrls.has(pinned))) return pinned;

  const clicked = validUrl(requestedUrl);
  const original = gallery.find((item) => item.aiGenerated !== true);
  const hasGeneratedPhotos = gallery.some((item) => item.aiGenerated === true);
  // Legacy galleries predating the AI marker normally keep the uploaded
  // source first and promote the later AI result to main. Avoid reusing the
  // promoted main photo even if its historical marker is missing.
  const legacyPromotedMain = gallery.length > 1
    && !!validUrl(variant?.mainImage)
    && gallery[0].url !== variant?.mainImage;

  if (clicked && !hasGeneratedPhotos && !legacyPromotedMain) {
    const media = gallery.find((item) => item.url === clicked);
    // Before the first AI generation, a click on a genuine gallery photo
    // selects which original is pinned for subsequent generations.
    if (media && media.aiGenerated !== true) return clicked;
  }

  // The uploaded original precedes the generated outputs in gallery order,
  // including for legacy products without an explicit aiGenerated marker.
  if (original) return original.url;

  // Legacy product without per-image metadata: fall back to its existing
  // image rather than preventing generation entirely.
  return (
    validUrl(variant?.mainImage) ||
    validUrl(variant?.images?.[0]) ||
    validUrl(fallbackMainImage) ||
    gallery[0]?.url
  );
}
