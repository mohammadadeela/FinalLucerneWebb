import { storage } from "./storage";

export const SITE_URL = "https://lucerne-boutique.com";
export const SITE_NAME = "Lucerne Boutique";

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function escapeJsonForScriptTag(json: string): string {
  // Prevent a literal "</script>" inside JSON-LD content from closing the
  // script tag early.
  return json.replace(/</g, "\\u003c");
}

export interface PageMeta {
  title: string;
  description: string;
  image?: string;
  url: string;
  type?: "website" | "product" | "article";
  /** Arbitrary extra JSON-LD object (e.g. Product schema) to embed. */
  jsonLd?: Record<string, any>;
}

/**
 * Injects page-specific <title>, meta description, Open Graph, Twitter Card,
 * canonical link, and JSON-LD structured data into a server-rendered
 * index.html — BEFORE it's sent to the browser. This matters because
 * WhatsApp/Facebook/Twitter/Google's crawlers read the raw HTML response and
 * generally do not execute JavaScript, so meta tags set only via client-side
 * JS (e.g. document.title) are invisible to them. Injecting server-side is
 * what actually makes product links show a title/image/description when
 * shared, and what lets each product page rank on its own in search.
 */
export function injectMetaTags(html: string, meta: PageMeta): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const image = meta.image ? escapeHtml(meta.image) : `${SITE_URL}/android-chrome-512x512.png`;
  const url = escapeHtml(meta.url);
  const type = meta.type || "website";

  let out = html;

  // Replace the static <title>…</title> with the page-specific one.
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);

  // Replace the static meta description with the page-specific one.
  out = out.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${description}" />`,
  );

  const extraTags = [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ];

  if (meta.jsonLd) {
    const json = escapeJsonForScriptTag(JSON.stringify(meta.jsonLd));
    extraTags.push(`<script type="application/ld+json">${json}</script>`);
  }

  out = out.replace("</head>", `${extraTags.join("\n    ")}\n  </head>`);
  return out;
}

/**
 * Builds PageMeta for a single product detail page (/product/:id), or null
 * if the product doesn't exist / isn't a valid id (caller should fall back
 * to the default page in that case).
 */
export async function buildProductPageMeta(idParam: string): Promise<PageMeta | null> {
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) return null;

  const product = await storage.getProduct(id);
  if (!product) return null;

  const price = product.discountPrice || product.price;
  const description =
    (product.description || "").slice(0, 160) ||
    `${product.name} — ${SITE_NAME}`;

  return {
    title: `${product.name} | ${SITE_NAME}`,
    description,
    image: product.mainImage,
    url: `${SITE_URL}/product/${product.id}`,
    type: "product",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description,
      image: product.mainImage,
      sku: product.barcode || String(product.id),
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        price: String(price),
        availability:
          product.stockQuantity > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        url: `${SITE_URL}/product/${product.id}`,
      },
    },
  };
}
