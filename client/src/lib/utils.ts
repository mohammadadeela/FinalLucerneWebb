import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

const R2_MEDIA_HOST = "media.lucerne-boutique.com";

function isR2MediaUrl(url: string): boolean {
  try {
    return new URL(url).host === R2_MEDIA_HOST;
  } catch {
    return false;
  }
}

function r2ImageVariant(url: string, width?: number): string {
  if (!width || !isR2MediaUrl(url)) return url;
  if (!/\/media\/images\/[^/]+\/main\.webp(?:[?#].*)?$/i.test(url)) return url;
  const target = width <= 400 ? 400 : width <= 800 ? 800 : 1200;
  return url.replace(/\/main\.webp(?:[?#].*)?$/i, `/${target}.webp`);
}

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
 * Optimizes product image URLs.
 * - Cloudinary URLs keep their existing dynamic f_auto/q_auto behavior.
 * - R2 URLs produced by the new media pipeline use pre-generated WebP sizes
 *   (400/800/1200) so no paid image transformation service is required.
 */
export function optimizeCloudinaryUrl(url: string | null | undefined, width?: number): string | undefined {
  if (!url) return undefined;

  if (isR2MediaUrl(url)) {
    return r2ImageVariant(url, width);
  }

  if (!url.includes("res.cloudinary.com")) return url;

  if (url.includes("/f_auto") || url.includes("/q_auto")) {
    if (!width) return url;
    if (/\/upload\/[^/]*w_\d+/.test(url)) return url;
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
 * Returns the tiny blur-up placeholder for both Cloudinary and R2 media.
 * New R2 uploads have a 40px pre-generated WebP blur beside the main image.
 */
export function blurCloudinaryUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  if (isR2MediaUrl(url)) {
    if (!/\/media\/images\/[^/]+\/main\.webp(?:[?#].*)?$/i.test(url)) return undefined;
    return url.replace(/\/main\.webp(?:[?#].*)?$/i, "/blur.webp");
  }

  if (!url.includes("res.cloudinary.com")) return undefined;
  if (url.includes("/f_auto") || url.includes("/q_auto")) {
    return url.replace(/\/upload\/[^/]+\//, "/upload/f_auto,q_1,w_40,e_blur:1000/");
  }
  return url.replace("/upload/", "/upload/f_auto,q_1,w_40,e_blur:1000/");
}

/**
 * Optimizes product video URLs.
 * New R2 videos are already transcoded to H.264, resized, silent and fast-start,
 * so they can be returned directly. Legacy Cloudinary URLs keep the old dynamic
 * transformation behavior while the migration is in progress.
 */
export function optimizeCloudinaryVideoUrl(url: string | null | undefined, width?: number): string | undefined {
  if (!url) return undefined;
  if (isR2MediaUrl(url)) return url;
  if (!url.includes("res.cloudinary.com")) return url;
  const wPart = width ? `,w_${width}` : "";
  if (url.includes("q_auto") || url.includes("br_")) {
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
    if (aIsNum && !bIsNum) return -1;
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
 * Derives the poster image for both legacy Cloudinary videos and new R2 videos.
 * R2 uploads store an actual JPEG beside the optimized MP4 at /video.jpg.
 */
export function getVideoPosterUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  if (isR2MediaUrl(url)) {
    if (!/\/media\/videos\/[^/]+\/video\.mp4(?:[?#].*)?$/i.test(url)) return undefined;
    return url.replace(/\/video\.mp4(?:[?#].*)?$/i, "/video.jpg");
  }

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

