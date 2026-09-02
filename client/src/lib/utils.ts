import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Phone-only signups get an internal placeholder address like
 * `phone_9705xxxxxxx_whatsapp@phone.lucerne` stored in the `email` column
 * (there's no separate "has no email" flag in the schema). This is never
 * something the customer typed or would recognize, so it must never be
 * shown to them — anywhere the UI would display "their email", check this
 * first and show their registered phone number instead.
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return /^phone_\d+_(whatsapp|firebase|twilio)@phone\.lucerne$/i.test(String(email || "").trim());
}

/**
 * Optimizes a Cloudinary image URL.
 * - Applies f_auto (best format: WebP/AVIF) + q_auto (smart compression)
 * - Optionally constrains the width so browsers never download a
 *   4000px image just to display a 300px thumbnail.
 * Pass `width` in CSS pixels — Cloudinary multiplies by 2 (dpr_2.0)
 * for retina screens automatically when using w_ + dpr_auto.
 */
export function optimizeCloudinaryUrl(url: string | null | undefined, width?: number): string | undefined {
  if (!url) return undefined;
  if (!url.includes("res.cloudinary.com")) return url;

  // Stored URLs already contain "/f_auto,q_auto/" (injected at upload time).
  // The old code bailed out here and returned the FULL-resolution image,
  // which made POS/thumbnail cards download multi-MB photos and sit on a
  // permanent blur until they slowly loaded. Instead, inject the requested
  // width into the existing transform block so a small, fast image is served.
  if (url.includes("/f_auto") || url.includes("/q_auto")) {
    if (!width) return url;
    // If a width is already present, leave the URL as-is.
    if (/\/upload\/[^/]*w_\d+/.test(url)) return url;
    // Add width to the first transform segment right after /upload/.
    return url.replace(
      /\/upload\/([^/]+)\//,
      (_m, transforms) => `/upload/${transforms},w_${width},dpr_auto,c_limit/`,
    );
  }

  const transforms = width
    ? `f_auto,q_auto,w_${width},dpr_auto,c_limit`
    : "f_auto,q_auto";
  return url.replace("/upload/", `/upload/${transforms}/`);
}

/**
 * Generates a tiny (40px) blurred Cloudinary URL to use as an instant
 * placeholder while the full-resolution image loads.
 * Shows a luxury "blur-up" preview instead of empty shimmer boxes.
 * Returns undefined for non-Cloudinary URLs (fall back to shimmer).
 */
export function blurCloudinaryUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!url.includes("res.cloudinary.com")) return undefined;
  if (url.includes("/f_auto") || url.includes("/q_auto")) {
    return url.replace(/\/upload\/[^/]+\//, "/upload/f_auto,q_1,w_40,e_blur:1000/");
  }
  return url.replace("/upload/", "/upload/f_auto,q_1,w_40,e_blur:1000/");
}

/**
 * Optimizes a Cloudinary video URL for fast streaming delivery.
 * - q_auto:good + bitrate cap + vc_auto (best codec: H.265/VP9/H.264)
 * - Optional width cap to shrink portrait 1080×1920 videos to screen size.
 * Handles URLs that already have Cloudinary transforms applied (e.g. from
 * server-side upload processing) by injecting the width into the existing
 * transform block rather than silently ignoring it.
 * Non-Cloudinary URLs are returned unchanged.
 */
export function optimizeCloudinaryVideoUrl(url: string | null | undefined, width?: number): string | undefined {
  if (!url) return undefined;
  if (!url.includes("res.cloudinary.com")) return url;
  const wPart = width ? `,w_${width}` : "";
  if (url.includes("q_auto") || url.includes("br_")) {
    // URL already has quality/bitrate transforms — inject width if not present
    if (width && !url.match(/w_\d+/)) {
      return url.replace(/\/upload\/([^/]+)\//, `/upload/$1${wPart}/`);
    }
    return url;
  }
  return url.replace("/upload/", `/upload/q_auto:good,br_2m,vc_auto${wPart}/`);
}

/**
 * Canonical display order for letter-based sizes. Anything not in this list
 * (e.g. a typo or unusual size) falls back to alphabetical order and is
 * placed after all recognized letter sizes.
 */
const LETTER_SIZE_ORDER = [
  "XXS", "XS", "S", "M", "L", "XL",
  "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL",
];

/**
 * Sorts a list of product sizes into a consistent, logical display order —
 * regardless of what order the admin entered them in.
 *   - Numeric sizes (shoes, jeans, etc., including half sizes like "38.5")
 *     are sorted ascending numerically.
 *   - Letter sizes (XS, S, M, L, XL, XXL, ...) are sorted by garment size
 *     progression, not alphabetically (so "L" doesn't sort before "S").
 *   - Unrecognized values are sorted alphabetically and placed last.
 * Safe to call anywhere sizes are rendered — does not mutate the input,
 * and works retroactively on existing/old product data since it only
 * affects display order, not stored data.
 */
export function sortSizes(sizes: (string | null | undefined)[] | null | undefined): string[] {
  if (!sizes || sizes.length === 0) return [];
  const clean = sizes.filter((s): s is string => !!s && s.trim() !== "");

  return [...clean].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    const aIsNum = a.trim() !== "" && !isNaN(na);
    const bIsNum = b.trim() !== "" && !isNaN(nb);

    if (aIsNum && bIsNum) return na - nb;
    if (aIsNum && !bIsNum) return -1; // numeric sizes before letter sizes if ever mixed
    if (!aIsNum && bIsNum) return 1;

    const upperA = a.trim().toUpperCase();
    const upperB = b.trim().toUpperCase();
    const idxA = LETTER_SIZE_ORDER.indexOf(upperA);
    const idxB = LETTER_SIZE_ORDER.indexOf(upperB);

    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1 && idxB === -1) return -1;
    if (idxA === -1 && idxB !== -1) return 1;
    return upperA.localeCompare(upperB);
  });
}

/**
 * Derives a poster (first-frame JPEG thumbnail) from a Cloudinary video URL.
 * Shows instantly as a placeholder while the video buffers — the same image
 * Cloudinary generates for video thumbnails. Returns undefined for non-Cloudinary URLs.
 */
export function getVideoPosterUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!url.includes("res.cloudinary.com")) return undefined;
  return url
    .replace(/\/upload\/[^/]+\//, "/upload/so_0,f_jpg,q_auto,w_720/")
    .replace(/\.[^./?]+(\?.*)?$/, ".jpg");
}

/**
 * Resolves the correct thumbnail for an order/cart line item: if the item
 * has a color and the product has a matching color variant with its own
 * image, that image is used — never the product's generic main image,
 * which may show an entirely different color than what was actually
 * ordered. Falls back to the product's main image only when there's no
 * color on the item or no matching/imaged variant (e.g. older orders
 * placed before color variants existed).
 */
export function getOrderItemImage(
  product: { mainImage?: string | null; colorVariants?: { name: string; mainImage?: string; images?: string[] }[] | null } | null | undefined,
  color?: string | null,
): string | undefined {
  if (!product) return undefined;
  if (color && product.colorVariants && product.colorVariants.length > 0) {
    const variant = product.colorVariants.find((v) => v.name === color);
    const variantImage = variant?.mainImage || variant?.images?.[0];
    if (variantImage) return variantImage;
  }
  return product.mainImage || undefined;
}

