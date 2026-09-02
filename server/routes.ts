import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { setupAuth, destroyUserSessions, comparePasswords } from "./auth";
import passport from "passport";
import { z } from "zod";
import multer from "multer";
import path from "path";
import { randomUUID, randomInt } from "crypto";
import { sql, inArray, and, eq, desc, isNotNull, gt } from "drizzle-orm";
import { subcategories } from "@shared/schema";
import { db, pool } from "./db";
import { uploadToCloudinary, deleteFromCloudinary, uploadVideoToCloudinary, warmCloudinaryCache } from "./cloudinary";
import { sendPasswordResetCode, sendSignupVerificationCode, sendOrderNotification, sendOrderConfirmationToCustomer, sendExchangeStatusEmail, sendExchangeAdminNotification, sendAbandonedCartEmail, sendSaleDiscountEmail, sendDiscountCodeEmail, isPlaceholderEmail } from "./email";
import { sendOrderConfirmationWA, sendDiscountCodeWA, sendTextMessage, sendOtpWhatsApp, isWhatsAppConfigured } from "./whatsapp";
import { sendTwilioSmsVerification, checkTwilioSmsVerification, isTwilioSmsConfigured, usesTwilioVerifyService } from "./twilioVerify";
import ExcelJS from "exceljs";
import rateLimit from "express-rate-limit";
import { spawn } from "child_process";
import fs from "fs";
import { optimizeImage, optimizeVideo } from "./mediaOptimizer";
import { detectIntent } from "./chatbot/intentDetector";
import { extractEntities } from "./chatbot/entityExtractor";
import { buildResponse, orderStatusReply } from "./chatbot/responses";
import { registerOllamaRoutes } from "./ollama";
import { SITE_URL } from "./seo";

// Rate limiters for auth endpoints
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  skipSuccessfulRequests: true,
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification attempts. Please try again in an hour." },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests. Please try again in an hour." },
});

// Chatbot: 30 messages/minute per IP — prevents DB flooding (each call runs 3 queries)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { reply: "Too many messages. Please wait a moment before sending again.", buttons: [] },
});

async function getShippingRates(): Promise<Record<string, number>> {
  try {
    const settings = await storage.getSiteSettings();
    const setting = settings.find((s) => s.key === "shipping_zones");
    if (setting?.value) {
      const zones = JSON.parse(setting.value) as { id: string; price: number }[];
      const rates: Record<string, number> = {};
      for (const z of zones) {
        if (z.id && typeof z.price === "number") rates[z.id] = z.price;
      }
      return rates;
    }
  } catch {}
  return { westBank: 20, jerusalem: 30, interior: 75 };
}
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { initializeLahzaTransaction, verifyLahzaTransaction } from "./lahza";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|avif|heic|heif)$/i;
    const allowedMime = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "image/avif", "image/heic", "image/heif",
    ];
    if (allowed.test(path.extname(file.originalname)) || allowedMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(xlsx|xls)$/i;
    const allowedMime = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ];
    if (allowed.test(path.extname(file.originalname)) || allowedMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files (.xlsx, .xls) are allowed"));
    }
  },
});

// Disk-storage multer — saves images directly to the /uploads folder on the server.
// Files get a unique timestamped name so two uploads of the same filename never collide.
const uploadsDiskDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDiskDir)) fs.mkdirSync(uploadsDiskDir, { recursive: true });

const uploadLocal = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDiskDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const base = path.basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9_\-]/g, "_")
        .substring(0, 60);
      cb(null, `${base}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|avif|heic|heif)$/i;
    const allowedMime = ["image/jpeg","image/png","image/gif","image/webp","image/avif","image/heic","image/heif"];
    if (allowed.test(path.extname(file.originalname)) || allowedMime.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

const uploadLocalVideo = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDiskDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
      const base = path.basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9_\-]/g, "_")
        .substring(0, 60);
      cb(null, `${base}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(mp4|webm|mov|avi|mkv)$/i;
    const allowedMime = ["video/mp4","video/webm","video/quicktime","video/x-msvideo","video/x-matroska"];
    if (allowed.test(path.extname(file.originalname)) || allowedMime.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only video files are allowed"));
  },
});

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(mp4|webm|mov|avi|mkv)$/i;
    const allowedMime = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
    if (allowed.test(path.extname(file.originalname)) || allowedMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only video files (mp4, webm, mov) are allowed"));
    }
  },
});

// Tracks Cloudinary main-image URLs already warmed this server session so the
// product-list route never re-warms the same image. Bounded to avoid unbounded
// growth on very large catalogs.
const warmedImageUrls = new Set<string>();

function collectProductMediaUrls(product: any): string[] {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string") {
      const url = value.trim();
      if (url) urls.add(url);
    }
  };

  add(product?.mainImage);
  add(product?.videoUrl);
  if (Array.isArray(product?.images)) product.images.forEach(add);

  if (Array.isArray(product?.colorVariants)) {
    for (const variant of product.colorVariants) {
      add(variant?.mainImage);
      if (Array.isArray(variant?.images)) variant.images.forEach(add);
      if (Array.isArray(variant?.media)) {
        for (const item of variant.media) {
          add(item?.url);
          add(item?.poster);
        }
      }
    }
  }

  return Array.from(urls);
}

async function removeStoredMediaUrl(url: string): Promise<void> {
  if (!url) return;
  try {
    if (url.includes("cloudinary.com")) {
      await deleteFromCloudinary(url);
      return;
    }
    if (url.startsWith("/uploads/")) {
      const filePath = path.join(uploadsDiskDir, path.basename(url));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      const base = path.basename(url).replace(/_opt\.mp4$/i, "").replace(/\.[^.]+$/i, "");
      for (const candidate of [
        path.join(uploadsDiskDir, `${base}_poster.webp`),
        path.join(uploadsDiskDir, `${base}_poster.jpg`),
      ]) {
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
      }
    }
  } catch (err) {
    console.warn("Failed to remove product media:", err);
  }
}

class ProductRequestError extends Error {
  status: number;
  issues: any[];
  constructor(message: string, issues: any[] = [], status = 400) {
    super(message);
    this.name = "ProductRequestError";
    this.status = status;
    this.issues = issues;
  }
}

function successResponse(res: any, data: any, status = 200, extra: Record<string, any> = {}) {
  return res.status(status).json({ success: true, data, ...extra });
}

function serializeError(err: any) {
  if (!err) return undefined;
  return {
    message: err?.message,
    detail: err?.detail,
    code: err?.code,
    constraint: err?.constraint,
    issues: err?.issues,
  };
}

function failureResponse(res: any, status: number, message: string, err?: any, extra: Record<string, any> = {}) {
  return res.status(status).json({
    success: false,
    message,
    error: serializeError(err),
    ...extra,
  });
}

function logProductError(scope: string, err: any, context: Record<string, any> = {}) {
  console.error(`[${scope}] failed:`, {
    ...context,
    message: err?.message,
    detail: err?.detail,
    code: err?.code,
    constraint: err?.constraint,
    issues: err?.issues,
    stack: err?.stack,
  });
}

function cleanOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function normalizePositiveId(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new ProductRequestError(`${field} must be a positive integer or null`, [{ field, message: "Invalid ID", value }]);
  }
  return num;
}

function normalizeStringArrayPayload(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ProductRequestError(`${field} must be an array`, [{ field, message: "Expected array" }]);
  }
  return Array.from(new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean)));
}

function normalizeInventoryPayload(value: unknown, field = "sizeInventory"): Record<string, number> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ProductRequestError(`${field} must be an object`, [{ field, message: "Expected object" }]);
  }
  const result: Record<string, number> = {};
  for (const [rawSize, rawQty] of Object.entries(value as Record<string, unknown>)) {
    const size = String(rawSize || "").trim();
    if (!size) continue;
    const qty = Number(rawQty);
    if (!Number.isFinite(qty) || qty < 0) {
      throw new ProductRequestError(`${field}.${size} must be a non-negative number`, [{ field: `${field}.${size}`, message: "Invalid quantity", value: rawQty }]);
    }
    result[size] = Math.floor(qty);
  }
  return result;
}

function derivePosterFromVideoUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.includes("res.cloudinary.com")) {
    return url
      .replace(/\/upload\/[^/]+\//, "/upload/so_0,f_jpg,q_auto,w_720/")
      .replace(/\.[^./?]+(\?.*)?$/, ".jpg");
  }
  if (url.startsWith("/uploads/")) {
    const base = url.replace(/_opt\.mp4$/i, "").replace(/\.[^/.?#]+(?:[?#].*)?$/i, "");
    return `${base}_poster.webp`;
  }
  return undefined;
}

function normalizeMediaArray(value: unknown, field: string): any[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ProductRequestError(`${field} must be an array`, [{ field, message: "Expected array" }]);
  }
  const seen = new Set<string>();
  const media: any[] = [];
  for (let idx = 0; idx < value.length; idx++) {
    const raw: any = value[idx];
    if (!raw || (raw.type !== "image" && raw.type !== "video")) {
      throw new ProductRequestError(`${field}[${idx}].type must be image or video`, [{ field: `${field}[${idx}].type`, message: "Invalid media type" }]);
    }
    const url = String(raw.url || "").trim();
    if (!url) {
      throw new ProductRequestError(`${field}[${idx}].url is required`, [{ field: `${field}[${idx}].url`, message: "URL required" }]);
    }
    const key = `${raw.type}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    media.push({
      type: raw.type,
      url,
      poster: cleanOptionalString(raw.poster) || (raw.type === "video" ? derivePosterFromVideoUrl(url) : undefined),
      isPrimary: raw.isPrimary === true || undefined,
    });
  }
  let primaryIndex = media.findIndex((item) => item.type === "image" && item.isPrimary);
  if (primaryIndex < 0) primaryIndex = media.findIndex((item) => item.type === "image");
  if (primaryIndex < 0) primaryIndex = media.findIndex((item) => item.type === "video" && item.isPrimary);
  if (primaryIndex < 0 && media.length > 0) primaryIndex = 0;
  return media.map((item, idx) => ({ ...item, isPrimary: idx === primaryIndex ? true : undefined }));
}

function normalizeColorVariantsPayload(value: unknown): any[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ProductRequestError("colorVariants must be an array", [{ field: "colorVariants", message: "Expected array" }]);
  }
  return value.map((variant: any, idx: number) => {
    const media = normalizeMediaArray(variant?.media || [], `colorVariants[${idx}].media`);
    const images = normalizeStringArrayPayload(variant?.images || [], `colorVariants[${idx}].images`);
    const legacyMain = String(variant?.mainImage || "").trim();
    const legacyMedia = [
      ...(legacyMain ? [{ type: "image", url: legacyMain, isPrimary: true }] : []),
      ...images.map((url) => ({ type: "image", url })),
    ];
    const mergedMedia = media.length > 0 ? normalizeMediaArray([...media, ...legacyMedia], `colorVariants[${idx}].media`) : normalizeMediaArray(legacyMedia, `colorVariants[${idx}].media`);
    const imagePrimary = mergedMedia.find((item) => item.type === "image" && item.isPrimary) || mergedMedia.find((item) => item.type === "image");
    const videoPoster = mergedMedia.find((item) => item.type === "video" && item.poster)?.poster;
    const mainImage = imagePrimary?.url || videoPoster || legacyMain || "";
    const sizeInventory = normalizeInventoryPayload(variant?.sizeInventory || {}, `colorVariants[${idx}].sizeInventory`);
    const sizes = normalizeStringArrayPayload(variant?.sizes || Object.keys(sizeInventory), `colorVariants[${idx}].sizes`);
    return {
      name: String(variant?.name || "").trim(),
      colorCode: String(variant?.colorCode || "#000000").trim() || "#000000",
      mainImage,
      images: Array.from(new Set(mergedMedia.filter((item) => item.type === "image" && item.url !== mainImage).map((item) => item.url))),
      sizes: sizes.length > 0 ? sizes : Object.keys(sizeInventory),
      sizeInventory,
      colorTags: Array.isArray(variant?.colorTags) ? normalizeStringArrayPayload(variant.colorTags, `colorVariants[${idx}].colorTags`) : [],
      barcode: typeof variant?.barcode === "string" && variant.barcode.trim() ? variant.barcode.trim() : undefined,
      media: mergedMedia,
    };
  });
}

async function normalizeSubcategoryIds(input: any): Promise<void> {
  if (!input) return;

  const issues: any[] = [];
  const categoryId = normalizePositiveId(input.categoryId, "categoryId");
  if (categoryId !== undefined) input.categoryId = categoryId;

  const subcategoryId = normalizePositiveId(input.subcategoryId, "subcategoryId");
  if (subcategoryId !== undefined) input.subcategoryId = subcategoryId;

  let subcategoryIds: number[] | undefined;
  if (input.subcategoryIds !== undefined) {
    if (input.subcategoryIds === null) {
      subcategoryIds = [];
    } else if (!Array.isArray(input.subcategoryIds)) {
      throw new ProductRequestError("subcategoryIds must be an array", [{ field: "subcategoryIds", message: "Expected array" }]);
    } else {
      subcategoryIds = Array.from(new Set(input.subcategoryIds.map((value: any) => {
        const id = normalizePositiveId(value, "subcategoryIds");
        return id;
      }).filter((id: any): id is number => typeof id === "number")));
    }
  }

  if (input.categoryId === null) {
    input.subcategoryId = null;
    input.subcategoryIds = [];
    return;
  }

  const needsCategoryCheck = input.categoryId !== undefined && input.categoryId !== null;
  const needsSubcategoryCheck =
    input.subcategoryId !== undefined && input.subcategoryId !== null ||
    subcategoryIds !== undefined && subcategoryIds.length > 0;

  const [categories, allSubcategories] = await Promise.all([
    needsCategoryCheck ? storage.getCategories() : Promise.resolve([] as any[]),
    needsSubcategoryCheck || needsCategoryCheck ? storage.getSubcategories() : Promise.resolve([] as any[]),
  ]);

  if (needsCategoryCheck && !categories.some((category: any) => Number(category.id) === Number(input.categoryId))) {
    issues.push({ field: "categoryId", message: `Category ${input.categoryId} does not exist` });
  }

  const subById = new Map((allSubcategories as any[]).map((subcategory: any) => [Number(subcategory.id), subcategory]));

  if (input.subcategoryId !== undefined && input.subcategoryId !== null) {
    const sub = subById.get(Number(input.subcategoryId));
    if (!sub) {
      issues.push({ field: "subcategoryId", message: `Subcategory ${input.subcategoryId} does not exist` });
    } else if (input.categoryId != null && Number(sub.categoryId) !== Number(input.categoryId)) {
      issues.push({ field: "subcategoryId", message: `Subcategory ${input.subcategoryId} does not belong to category ${input.categoryId}` });
    }
  }

  if (subcategoryIds !== undefined) {
    for (const id of subcategoryIds) {
      const sub = subById.get(id);
      if (!sub) {
        issues.push({ field: "subcategoryIds", message: `Subcategory ${id} does not exist` });
      } else if (input.categoryId != null && Number(sub.categoryId) !== Number(input.categoryId)) {
        issues.push({ field: "subcategoryIds", message: `Subcategory ${id} does not belong to category ${input.categoryId}` });
      }
    }
  }

  if (issues.length > 0) throw new ProductRequestError("Invalid product category/subcategory data", issues);

  if (subcategoryIds !== undefined) {
    input.subcategoryIds = subcategoryIds;
    input.subcategoryId = subcategoryIds.length > 0 ? subcategoryIds[0] : null;
  } else if (input.subcategoryId !== undefined) {
    input.subcategoryIds = input.subcategoryId ? [Number(input.subcategoryId)] : [];
  }
}

async function normalizeProductPayload(input: any, options: { partial?: boolean } = {}): Promise<any> {
  const clean = { ...input };
  for (const f of ["price", "costPrice", "discountPrice"]) {
    if (clean[f] !== undefined && clean[f] !== null && typeof clean[f] !== "string") clean[f] = String(clean[f]);
    if (clean[f] === "") clean[f] = null;
  }
  for (const f of ["name", "description", "brand", "barcode", "mainImage", "videoUrl"]) {
    if (clean[f] !== undefined) clean[f] = cleanOptionalString(clean[f]);
  }
  if (!options.partial) {
    if (!clean.name) throw new ProductRequestError("Product name is required", [{ field: "name", message: "Required" }]);
    if (!clean.description) clean.description = clean.name;
    if (!clean.price || Number(clean.price) <= 0) throw new ProductRequestError("Product price must be greater than 0", [{ field: "price", message: "Invalid price" }]);
  }
  if (clean.price !== undefined && clean.price !== null && Number(clean.price) <= 0) {
    throw new ProductRequestError("Product price must be greater than 0", [{ field: "price", message: "Invalid price" }]);
  }
  if (clean.discountPrice !== undefined && clean.discountPrice !== null && clean.price !== undefined && clean.price !== null) {
    if (Number(clean.discountPrice) >= Number(clean.price)) {
      throw new ProductRequestError("Discount price must be lower than price", [{ field: "discountPrice", message: "Must be lower than price" }]);
    }
  }
  if (clean.images !== undefined) clean.images = normalizeStringArrayPayload(clean.images, "images");
  if (clean.sizes !== undefined) clean.sizes = normalizeStringArrayPayload(clean.sizes, "sizes");
  if (clean.colors !== undefined) clean.colors = normalizeStringArrayPayload(clean.colors, "colors");
  if (clean.sizeInventory !== undefined) clean.sizeInventory = normalizeInventoryPayload(clean.sizeInventory);
  if (clean.colorVariants !== undefined) clean.colorVariants = normalizeColorVariantsPayload(clean.colorVariants);
  if (clean.stockQuantity !== undefined) {
    const qty = Number(clean.stockQuantity);
    if (!Number.isFinite(qty) || qty < 0) throw new ProductRequestError("stockQuantity must be a non-negative number", [{ field: "stockQuantity", message: "Invalid quantity" }]);
    clean.stockQuantity = Math.floor(qty);
  }

  if (!clean.videoUrl && Array.isArray(clean.colorVariants) && clean.colorVariants.length > 0) {
    // The legacy top-level videoUrl mirrors ONLY color variant #0's video.
    // Previously this searched every variant's media (flatMap), so a video
    // belonging to a secondary color could get pulled up and then grafted
    // onto the main color below — and a deliberately-deleted main-color
    // video would keep reappearing, sourced from whichever other color
    // still had one. Only variant #0 may ever populate this field.
    const firstVariantMedia = Array.isArray(clean.colorVariants[0]?.media) ? clean.colorVariants[0].media : [];
    const firstVideo = firstVariantMedia.find((item: any) => item?.type === "video" && item?.url);
    if (firstVideo?.url) clean.videoUrl = firstVideo.url;
  }

  if (clean.videoUrl && Array.isArray(clean.colorVariants) && clean.colorVariants.length > 0) {
    const first = clean.colorVariants[0];
    if (!first.media.some((item: any) => item.type === "video" && item.url === clean.videoUrl)) {
      first.media = normalizeMediaArray([...first.media, { type: "video", url: clean.videoUrl, poster: derivePosterFromVideoUrl(clean.videoUrl) }], "colorVariants[0].media");
      const videoPoster = first.media.find((item: any) => item.type === "video" && item.url === clean.videoUrl)?.poster;
      if (!first.mainImage && videoPoster) first.mainImage = videoPoster;
    }
  }
  if ((!clean.mainImage || clean.mainImage === null) && Array.isArray(clean.colorVariants) && clean.colorVariants[0]?.mainImage) {
    clean.mainImage = clean.colorVariants[0].mainImage;
  }
  if ((!clean.mainImage || clean.mainImage === null) && clean.videoUrl) {
    clean.mainImage = derivePosterFromVideoUrl(clean.videoUrl) || clean.mainImage;
  }
  if (!options.partial && !clean.mainImage) {
    throw new ProductRequestError("Product image or video poster is required", [{ field: "mainImage", message: "Required" }]);
  }

  await normalizeSubcategoryIds(clean);
  return clean;
}


export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const { hashPassword } = setupAuth(app);

  // ── SEO: sitemap.xml + robots.txt ────────────────────────────────────────
  // Dynamically generated so new products/categories are picked up
  // automatically without a manual re-deploy or a static file to maintain.
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const [products, categories] = await Promise.all([
        storage.getProducts(),
        storage.getCategories(),
      ]);
      const staticUrls = [
        "",
        "/shop",
        "/faq",
        "/contact",
        "/shipping-returns",
        "/our-location",
      ];
      const urls: string[] = [
        ...staticUrls.map((p) => `${SITE_URL}${p}`),
        ...categories.map((c) => `${SITE_URL}/category/${c.slug}`),
        ...products.map((p) => `${SITE_URL}/product/${p.id}`),
      ];
      const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;
      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(body);
    } catch (err) {
      console.error("[sitemap] Failed to generate sitemap:", err);
      res.status(500).send("");
    }
  });

  app.get("/robots.txt", (_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /profile
Disallow: /cart
Disallow: /checkout

Sitemap: ${SITE_URL}/sitemap.xml
`);
  });

  // ── Cloudinary image upload ──────────────────────────────────────────────
  app.post("/api/upload", (req, res, next) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return failureResponse(res, 401, "Unauthorized");
    }
    next();
  }, (req, res, next) => {
    upload.array("images", 20)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") return failureResponse(res, 413, "File too large. Max 25MB per image.", err);
        return failureResponse(res, 400, err.message, err);
      }
      if (err) return failureResponse(res, 400, err.message || "Upload failed", err);
      next();
    });
  }, async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return failureResponse(res, 400, "No files uploaded");
    try {
      const urls = await Promise.all(
        files.map((f) => uploadToCloudinary(f.buffer, f.originalname))
      );
      return successResponse(res, { urls }, 200, { urls });
    } catch (err: any) {
      logProductError("upload.image", err, { userId: (req.user as any)?.id, files: files.map((f) => f.originalname) });
      return failureResponse(res, 500, "Image upload failed. Please try again.", err);
    }
  });

  app.delete("/api/upload", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return failureResponse(res, 401, "Unauthorized");
    }
    const { url } = req.body;
    if (!url || typeof url !== "string") return failureResponse(res, 400, "url is required");
    try {
      if (url.includes("cloudinary.com")) {
        // Do NOT delete from Cloudinary. These photos are shared across several
        // projects; removing them here would break the other sites and leave
        // permanent blur placeholders. Removing the image reference from the
        // product (handled by the product save) is enough for this site.
      } else if (url.startsWith("/uploads/")) {
        const filePath = path.join(uploadsDiskDir, path.basename(url));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        // If this is a locally optimized video, remove its generated poster too.
        const base = path.basename(url).replace(/_opt\.mp4$/i, "").replace(/\.[^.]+$/i, "");
        for (const candidate of [
          path.join(uploadsDiskDir, `${base}_poster.webp`),
          path.join(uploadsDiskDir, `${base}_poster.jpg`),
        ]) {
          if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
        }
      }
    } catch (err: any) {
      logProductError("upload.delete", err, { userId: (req.user as any)?.id, url });
    }
    return successResponse(res, { url });
  });

  // ── Cloudinary video upload (disk-buffered → stream to Cloudinary) ────────
  app.post("/api/upload-video", (req, res, next) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return failureResponse(res, 401, "Unauthorized");
    }
    next();
  }, (req, res, next) => {
    // Use disk storage so the file is written incrementally — no RAM spike that
    // causes "Unexpected end of form" when buffering large videos in memory.
    uploadLocalVideo.single("video")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return failureResponse(res, 413, "File too large. Max 500MB per video.", err);
        }
        return failureResponse(res, 400, err.message, err);
      }
      if (err) {
        return failureResponse(res, 400, err.message || "Upload failed", err);
      }
      next();
    });
  }, async (req, res) => {
    const file = req.file;
    if (!file) return failureResponse(res, 400, "No video uploaded");

    let removeTempFile = true;
    const toPublicUploadUrl = (filePath: string) => `/uploads/${path.basename(filePath)}`;

    try {
      // Upload directly from the saved disk path — Cloudinary reads the file,
      // no second copy in RAM.
      const videoUrl = await uploadVideoToCloudinary(file.path, file.originalname);
      // Derive a poster from the Cloudinary video URL (first frame, JPEG)
      const poster = videoUrl
        .replace("/upload/", "/upload/so_0,f_jpg,q_auto/")
        .replace(/\.[^.?#]+(?:[?#].*)?$/, ".jpg");
      return successResponse(res, { url: videoUrl, poster, storage: "cloudinary" }, 200, { url: videoUrl, poster, storage: "cloudinary" });
    } catch (err: any) {
      // Some deployments fail Cloudinary video uploads because of plan limits,
      // timeout, or MOV transcoding. Do not fail the admin workflow: keep a
      // local MP4 fallback under /uploads and return that URL.
      console.warn("Cloudinary video upload failed, using local fallback:", err?.message || err);
      try {
        const optimized = await optimizeVideo(file.path);
        removeTempFile = false; // optimizeVideo removed the original and created files we must keep
        const data = {
          url: toPublicUploadUrl(optimized.videoPath),
          poster: toPublicUploadUrl(optimized.posterPath),
          storage: "local",
        };
        return successResponse(res, data, 200, data);
      } catch (fallbackErr: any) {
        // Last fallback: keep the original upload. This still lets admins attach
        // a video instead of seeing a hard failure if ffmpeg is unavailable.
        console.warn("Local video optimization failed, keeping original file:", fallbackErr?.message || fallbackErr);
        removeTempFile = false;
        const data = {
          url: toPublicUploadUrl(file.path),
          poster: undefined,
          storage: "local",
          warning: "Stored original video because optimization failed",
        };
        return successResponse(res, data, 200, data);
      }
    } finally {
      if (removeTempFile && file?.path) {
        fs.unlink(file.path, () => {});
      }
    }
  });

  // Arabic names for each category slug
  const CATEGORY_AR: Record<string, string> = {
    "dresses": "فساتين",
    "tops": "بلوزات وقمصان",
    "pants-skirts": "بناطيل وتنانير",
    "shoes": "شوزات",
    "bags": "حقائب",
    "accessories": "إكسسوارات",
  };

  // Seed DB with mock data if needed
  async function seed() {
    const categories = await storage.getCategories();
    if (categories.length === 0) {
      await storage.createCategory({ name: "Dresses", nameAr: "فساتين", slug: "dresses" });
      await storage.createCategory({ name: "Tops & Blouses", nameAr: "بلوزات وقمصان", slug: "tops" });
      await storage.createCategory({ name: "Pants & Skirts", nameAr: "بناطيل وتنانير", slug: "pants-skirts" });
      await storage.createCategory({ name: "Shoes", nameAr: "شوزات", slug: "shoes" });
      await storage.createCategory({ name: "Bags", nameAr: "حقائب", slug: "bags" });
      await storage.createCategory({ name: "Accessories", nameAr: "إكسسوارات", slug: "accessories" });
    } else {
      // Patch any existing categories that are missing their Arabic name
      for (const cat of categories) {
        if (!cat.nameAr && CATEGORY_AR[cat.slug]) {
          await storage.updateCategory(cat.id, { nameAr: CATEGORY_AR[cat.slug] });
        }
      }
    }

    // Admin bootstrap from env vars. No credentials are hardcoded.
    // Set ADMIN_EMAIL and ADMIN_PASSWORD (min 10 chars) as environment
    // variables to create the account on first boot. Unlike a pure
    // create-once seed, this also keeps the account in sync on every
    // restart/redeploy: if you change ADMIN_PASSWORD (or ADMIN_NAME) and
    // redeploy, the existing account is updated to match — you don't have
    // to delete the user first. If they are not set, no admin is auto-created
    // or touched.
    const bootstrapEmail = process.env.ADMIN_EMAIL?.trim();
    const bootstrapPassword = process.env.ADMIN_PASSWORD;
    if (bootstrapEmail && bootstrapPassword) {
      if (bootstrapPassword.length < 10) {
        console.warn(
          "[seed] ADMIN_PASSWORD is too short (min 10 chars) — skipping admin bootstrap.",
        );
      } else {
        const existingAdmin = await storage.getUserByEmail(bootstrapEmail);
        if (!existingAdmin) {
          await storage.createUser({
            email: bootstrapEmail,
            password: await hashPassword(bootstrapPassword),
            role: "admin",
            fullName: process.env.ADMIN_NAME?.trim() || "Store Admin",
            isVerified: true,
          });
          console.log(`[seed] Bootstrap admin created for ${bootstrapEmail}.`);
        } else {
          const passwordMatches = await comparePasswords(bootstrapPassword, existingAdmin.password);
          const envName = process.env.ADMIN_NAME?.trim();
          const nameChanged = !!envName && envName !== existingAdmin.fullName;
          if (!passwordMatches || nameChanged) {
            const update: any = {};
            if (!passwordMatches) update.password = await hashPassword(bootstrapPassword);
            if (nameChanged) update.fullName = envName;
            await storage.updateUser(existingAdmin.id, update);
            // Password changed under them — force re-login everywhere so the
            // old cookie can't keep using the old credential's session.
            if (!passwordMatches) await destroyUserSessions(existingAdmin.id);
            console.log(`[seed] Bootstrap admin ${bootstrapEmail} synced from env (${!passwordMatches ? "password" : ""}${!passwordMatches && nameChanged ? " + " : ""}${nameChanged ? "name" : ""} updated).`);
          }
        }
      }
    }

    // Employee bootstrap from env vars, same create-and-keep-in-sync pattern
    // as the admin one above. Set EMPLOYEE_EMAIL and EMPLOYEE_PASSWORD
    // (min 10 chars) to create/update the account on boot; EMPLOYEE_NAME is
    // optional. Employees can use the POS, but don't get the "cannot
    // block/delete your own account" admin-only guards.
    const bootstrapEmployeeEmail = process.env.EMPLOYEE_EMAIL?.trim();
    const bootstrapEmployeePassword = process.env.EMPLOYEE_PASSWORD;
    if (bootstrapEmployeeEmail && bootstrapEmployeePassword) {
      if (bootstrapEmployeePassword.length < 10) {
        console.warn(
          "[seed] EMPLOYEE_PASSWORD is too short (min 10 chars) — skipping employee bootstrap.",
        );
      } else {
        const existingEmployee = await storage.getUserByEmail(bootstrapEmployeeEmail);
        if (!existingEmployee) {
          await storage.createUser({
            email: bootstrapEmployeeEmail,
            password: await hashPassword(bootstrapEmployeePassword),
            role: "employee",
            fullName: process.env.EMPLOYEE_NAME?.trim() || "Store Employee",
            isVerified: true,
          });
          console.log(`[seed] Bootstrap employee created for ${bootstrapEmployeeEmail}.`);
        } else {
          const passwordMatches = await comparePasswords(bootstrapEmployeePassword, existingEmployee.password);
          const envName = process.env.EMPLOYEE_NAME?.trim();
          const nameChanged = !!envName && envName !== existingEmployee.fullName;
          if (!passwordMatches || nameChanged) {
            const update: any = {};
            if (!passwordMatches) update.password = await hashPassword(bootstrapEmployeePassword);
            if (nameChanged) update.fullName = envName;
            await storage.updateUser(existingEmployee.id, update);
            if (!passwordMatches) await destroyUserSessions(existingEmployee.id);
            console.log(`[seed] Bootstrap employee ${bootstrapEmployeeEmail} synced from env (${!passwordMatches ? "password" : ""}${!passwordMatches && nameChanged ? " + " : ""}${nameChanged ? "name" : ""} updated).`);
          }
        }
      }
    }
  }
  
  // Call seed on start (fire and forget)
  seed().catch(console.error);

  // Signup email verification — codes stored in memory (15-min TTL)
  const signupCodes = new Map<string, { code: string; expiresAt: number }>();

  // --- Auth Routes ---
  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const existingUser = await storage.getUserByEmail(input.email);
      if (existingUser) {
        if (existingUser.isBlocked) return res.status(403).json({ message: "account_blocked" });
        return res.status(400).json({ message: "Email already exists" });
      }

      // A valid, unexpired signup code is REQUIRED to register. This proves the
      // user actually owns the email. Missing / wrong / expired code = rejected.
      const signupCode = req.body.signupCode as string | undefined;
      const entry = signupCodes.get(input.email);
      if (
        !signupCode ||
        !entry ||
        entry.code !== signupCode ||
        Date.now() > entry.expiresAt
      ) {
        return res.status(400).json({ message: "invalid_code" });
      }
      signupCodes.delete(input.email);

      const hashedPassword = await hashPassword(input.password);
      const newUser = await storage.createUser({
        ...input,
        password: hashedPassword,
        role: "customer",
        isVerified: true,
      });

      req.login(newUser, (loginErr) => {
        if (loginErr) return res.status(500).json({ message: "Login failed" });
        const { password, verificationCode: _vc, ...safe } = newUser;
        res.json(safe);
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.auth.login.path, loginLimiter, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return res.status(500).json({ message: "Internal server error" });
      if (!user) {
        const code = info?.message;
        if (code === "account_blocked") return res.status(403).json({ message: "account_blocked" });
        if (code === "email_not_found") return res.status(401).json({ message: "email_not_found" });
        if (code === "google_account") return res.status(401).json({ message: "google_account" });
        if (code === "invalid_password") return res.status(401).json({ message: "invalid_password" });
        return res.status(401).json({ message: "invalid_credentials" });
      }

      req.login(user, (loginErr) => {
        if (loginErr) return res.status(500).json({ message: "Login failed" });
        // Record last sign-in time (non-blocking — never fail login over this).
        storage.updateLastLogin(user.id).catch((e) =>
          console.error("[auth] updateLastLogin failed:", e),
        );
        const { password, verificationCode: _vc, ...userWithoutSensitive } = user;
        res.json(userWithoutSensitive);
      });
    })(req, res, next);
  });

  app.get(api.auth.me.path, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const sessionUser = req.user as any;
    const freshUser = await storage.getUser(sessionUser.id);
    if (!freshUser || freshUser.isBlocked) {
      req.logout((err) => {
        if (err) console.error("Logout error on blocked user:", err);
      });
      return res.status(403).json({ message: "account_blocked" });
    }
    const { password, verificationCode: _vc, ...userWithoutSensitive } = freshUser;
    res.json(userWithoutSensitive);
  });

  app.post(api.auth.logout.path, (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });


  // Firebase social login (Google / Facebook)
  app.post("/api/auth/firebase-login", async (req, res) => {
    console.log("[firebase-login] request received");
    try {
      const { idToken, provider, displayName } = req.body;
      if (!idToken) {
        console.log("[firebase-login] missing idToken");
        return res.status(400).json({ message: "Missing idToken" });
      }

      const parts = idToken.split(".");
      if (parts.length !== 3) {
        console.log("[firebase-login] token malformed — expected 3 parts, got:", parts.length);
        return res.status(401).json({ message: "Invalid Firebase token" });
      }
      let payload: any;
      try {
        payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      } catch {
        console.log("[firebase-login] failed to parse token payload");
        return res.status(401).json({ message: "Invalid Firebase token" });
      }
      console.log("[firebase-login] token payload parsed");

      const nowSec = Math.floor(Date.now() / 1000);
      if (!payload.exp || payload.exp < nowSec) {
        console.log("[firebase-login] token expired — exp:", payload.exp, "now:", nowSec);
        return res.status(401).json({ message: "Firebase token expired" });
      }
      if (!payload.iat || payload.iat > nowSec + 60) {
        console.log("[firebase-login] invalid iat:", payload.iat, "now:", nowSec);
        return res.status(401).json({ message: "Invalid Firebase token" });
      }
      const projectId = process.env.FIREBASE_PROJECT_ID || "xxx";
      if (payload.aud !== projectId) {
        console.log("[firebase-login] token audience mismatch");
        return res.status(401).json({ message: "Invalid Firebase token audience" });
      }
      if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
        console.log("[firebase-login] token issuer mismatch");
        return res.status(401).json({ message: "Invalid Firebase token issuer" });
      }
      if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length === 0) {
        console.log("[firebase-login] missing or invalid sub");
        return res.status(401).json({ message: "Invalid Firebase token subject" });
      }
      if (payload.auth_time && payload.auth_time > nowSec + 60) {
        console.log("[firebase-login] invalid auth_time:", payload.auth_time, "now:", nowSec);
        return res.status(401).json({ message: "Invalid Firebase token auth time" });
      }

      const email: string = payload.email || "";
      if (!email) {
        console.log("[firebase-login] no email in token payload");
        return res.status(400).json({ message: "No email in Firebase token" });
      }
      console.log("[firebase-login] looking up user");

      let user = await storage.getUserByEmail(email);
      if (!user) {
        console.log("[firebase-login] user not found, creating account");
        user = await storage.createUser({
          email,
          password: randomUUID(),
          fullName: displayName || payload.name || email.split("@")[0],
          role: "customer",
          isVerified: true,
        });
        console.log("[firebase-login] new user created, id:", user.id);
      } else if (!user.isVerified) {
        console.log("[firebase-login] existing user not verified, marking verified, id:", user.id);
        await storage.updateUser(user.id, { isVerified: true });
        user = (await storage.getUser(user.id))!;
      } else {
        console.log("[firebase-login] existing user found, id:", user.id);
      }

      if (user.isBlocked) {
        console.log("[firebase-login] user is blocked, id:", user.id);
        return res.status(403).json({ message: "account_blocked" });
      }

      const isNewUser = !user || user.createdAt
        ? new Date(user!.createdAt!).getTime() > Date.now() - 10_000
        : false;
      req.login(user, (loginErr) => {
        console.log("[firebase-login] req.login result:", loginErr || "success");
        if (loginErr) return res.status(500).json({ message: "Login failed" });
        // Record last sign-in time (non-blocking).
        storage.updateLastLogin(user!.id).catch((e: any) =>
          console.error("[auth] updateLastLogin failed:", e),
        );
        const { password, verificationCode: _vc, ...safe } = user!;
        res.json({ ...safe, isNewUser });
      });
    } catch (err: any) {
      console.error("Firebase login error:", err);
      res.status(500).json({ message: err.message || "Login failed" });
    }
  });

  app.post("/api/auth/send-signup-code", otpLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email required" });
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        if (existing.isBlocked) return res.status(403).json({ message: "account_blocked" });
        return res.status(400).json({ message: "email_taken" });
      }

      const code = String(randomInt(100000, 999999));
      signupCodes.set(email, { code, expiresAt: Date.now() + 15 * 60 * 1000 });
      sendSignupVerificationCode(email, code).catch(console.error);
      res.json({ sent: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  app.post("/api/auth/verify-signup-code", otpLimiter, async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ message: "Missing fields" });
      const entry = signupCodes.get(email);
      if (!entry || entry.code !== code || Date.now() > entry.expiresAt) {
        return res.status(400).json({ message: "invalid_code" });
      }
      res.json({ valid: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // ── Phone OTP auth via Firebase SMS (see endpoints below) ──────────────────

  // ── Phone OTP via Twilio WhatsApp ───────────────────────────────────────────
  // Cost-conscious flow: each phone may receive at most two OTP messages in a
  // 10-minute window, with a 30-second cooldown. Successful
  // verification yields a short-lived single-use `verifyToken` that the client
  // hands to /phone-signup, /phone-mark-verified, or /phone-reset-password.
  const PHONE_OTP_TTL_MS = 10 * 60 * 1000;
  const PHONE_OTP_COOLDOWN_MS = 30 * 1000;
  const PHONE_OTP_MAX_SENDS = 2;
  const VERIFY_NONCE_TTL_MS = 15 * 60 * 1000;
  type PhoneAuthChannel = "whatsapp" | "firebase" | "twilio";
  const phoneOtpCodes = new Map<string, { code: string; expiresAt: number; attempts: number }>();
  const verifiedPhoneNonces = new Map<string, { phone: string; channel: PhoneAuthChannel; expiresAt: number }>();
  type PhoneSendState = { count: number; lastSentAt: number; windowExpiresAt: number; reservationId: string };
  const phoneOtpSendLimits = new Map<string, PhoneSendState>();
  const phoneOtpReservations = new Map<string, { phone: string; previous?: PhoneSendState }>();

  function consumeVerifyToken(token: string): { phone: string; channel: PhoneAuthChannel } {
    const entry = verifiedPhoneNonces.get(token);
    if (!entry) throw new Error("verify_token_invalid");
    verifiedPhoneNonces.delete(token);
    if (Date.now() > entry.expiresAt) throw new Error("verify_token_expired");
    return { phone: entry.phone, channel: entry.channel };
  }

  function normalizePhoneAuthChannel(value: unknown): PhoneAuthChannel {
    return value === "firebase" || value === "twilio" || value === "whatsapp" ? value : "whatsapp";
  }

  // Keep the chosen delivery method inside the existing internal placeholder
  // email used only by phone accounts. This avoids adding or querying any new
  // database column. Older phone accounts keep the original WhatsApp default.
  function phoneAuthChannelForUser(user: any): PhoneAuthChannel {
    const match = String(user?.email || "").match(/^phone_\d+_(whatsapp|firebase|twilio)@phone\.lucerne$/i);
    return normalizePhoneAuthChannel(match?.[1]?.toLowerCase());
  }

  function phonePlaceholderEmail(phone: string, channel: PhoneAuthChannel): string {
    return `phone_${phone.replace(/\D/g, "")}_${channel}@phone.lucerne`;
  }

  function isPhoneAuthAccount(user: any): boolean {
    return isPlaceholderEmail(user?.email);
  }

  function reservePhoneOtpSend(phone: string):
    | { ok: true; reservationId: string }
    | { ok: false; message: "otp_cooldown" | "otp_limit_reached"; secondsLeft: number } {
    const now = Date.now();
    const current = phoneOtpSendLimits.get(phone);
    const active = current && current.windowExpiresAt > now ? current : undefined;
    if (active && active.count >= PHONE_OTP_MAX_SENDS) {
      return { ok: false, message: "otp_limit_reached", secondsLeft: Math.ceil((active.windowExpiresAt - now) / 1000) };
    }
    if (active && now - active.lastSentAt < PHONE_OTP_COOLDOWN_MS) {
      return { ok: false, message: "otp_cooldown", secondsLeft: Math.ceil((PHONE_OTP_COOLDOWN_MS - (now - active.lastSentAt)) / 1000) };
    }
    const reservationId = randomUUID();
    const next: PhoneSendState = {
      count: (active?.count || 0) + 1,
      lastSentAt: now,
      windowExpiresAt: active?.windowExpiresAt || now + PHONE_OTP_TTL_MS,
      reservationId,
    };
    phoneOtpReservations.set(reservationId, { phone, previous: active ? { ...active } : undefined });
    phoneOtpSendLimits.set(phone, next);
    return { ok: true, reservationId };
  }

  function rollbackPhoneOtpSend(reservationId: string): void {
    const reservation = phoneOtpReservations.get(reservationId);
    if (!reservation) return;
    phoneOtpReservations.delete(reservationId);
    const current = phoneOtpSendLimits.get(reservation.phone);
    if (current?.reservationId !== reservationId) return;
    if (reservation.previous) phoneOtpSendLimits.set(reservation.phone, reservation.previous);
    else phoneOtpSendLimits.delete(reservation.phone);
  }

  function commitPhoneOtpSend(reservationId: string): void {
    phoneOtpReservations.delete(reservationId);
  }

  // Helper: log a user in via passport req.login and respond with safe user.
  function loginAndRespond(req: any, res: any, user: any, extra: any = {}) {
    return new Promise<void>((resolve) => {
      req.login(user, (loginErr: any) => {
        if (loginErr) { res.status(500).json({ message: "Login failed" }); resolve(); return; }
        // Record last sign-in time (non-blocking).
        storage.updateLastLogin(user.id).catch((e: any) =>
          console.error("[auth] updateLastLogin failed:", e),
        );
        const { password, verificationCode: _vc, ...safe } = user;
        res.json({ status: "logged_in", user: safe, ...extra });
        resolve();
      });
    });
  }

  function requirePhoneSignupEnabled(req: any, res: any): boolean {
    // Site setting `phone_signup_enabled` defaults to true. When set to "false"
    // by admin, all phone-based auth endpoints are disabled.
    // (Setting fetched lazily via storage.)
    return true; // checked below per-call
  }

  // General availability: true if ANY phone-auth channel (WhatsApp,
  // Firebase SMS, or Twilio SMS) is enabled. Used by the channel-agnostic endpoints that
  // just consume an already-verified phone (signup completion, mark-verified,
  // reset-password, login) — the verifyToken could have come from either.
  async function isPhoneAuthEnabled(): Promise<boolean> {
    try {
      const setting = await (storage as any).getSiteSetting?.("phone_signup_enabled");
      if (setting !== "false") return true;
      const fb = await (storage as any).getSiteSetting?.("firebase_sms_enabled");
      if (fb === "true") return true;
      const twilioSms = await (storage as any).getSiteSetting?.("twilio_sms_enabled");
      return twilioSms === "true";
    } catch { return true; }
  }

  // WhatsApp-specific gate — only true when the "Phone Sign-up / Login"
  // (Twilio WhatsApp) toggle is on. Independent of the Firebase SMS toggle,
  // so admins can run either channel, both, or neither.
  async function isWhatsAppPhoneEnabled(): Promise<boolean> {
    try {
      return (await (storage as any).getSiteSetting?.("phone_signup_enabled")) !== "false";
    } catch { return true; }
  }

  // Firebase-SMS-specific gate — only true when the "SMS (Firebase)" toggle is on.
  async function isFirebaseSmsEnabled(): Promise<boolean> {
    try {
      return (await (storage as any).getSiteSetting?.("firebase_sms_enabled")) === "true";
    } catch { return false; }
  }

  // Twilio SMS is a third, independent option. It deliberately does
  // not share the Firebase setting or the WhatsApp setting.
  async function isTwilioSmsEnabled(): Promise<boolean> {
    try {
      return (await (storage as any).getSiteSetting?.("twilio_sms_enabled")) === "true";
    } catch { return false; }
  }

  // Sign in with phone + password. Requires user to be verified.
  app.post("/api/auth/phone-login", otpLimiter, async (req, res) => {
    try {
      if (!(await isPhoneAuthEnabled())) return res.status(403).json({ message: "phone_auth_disabled" });
      const { phone, password } = req.body || {};
      if (!phone || !password) return res.status(400).json({ message: "Missing fields" });
      const user = await storage.getUserByPhone(String(phone));
      if (!user) return res.status(404).json({ message: "phone_not_found" });
      if (!isPhoneAuthAccount(user)) return res.status(404).json({ message: "phone_not_registered" });
      if (user.isBlocked) return res.status(403).json({ message: "account_blocked" });
      const { comparePasswords } = await import("./auth");
      const ok = await comparePasswords(String(password), user.password);
      if (!ok) return res.status(401).json({ message: "invalid_password" });
      if (!user.isVerified) {
        return res.status(403).json({
          message: "needs_verification",
          phone: user.phone,
          channel: phoneAuthChannelForUser(user),
        });
      }
      await loginAndRespond(req, res, user, { isNewUser: false });
    } catch (err: any) {
      console.error("[phone-login] error:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Check account status before spending an SMS/WhatsApp message on signup.
  // A number used only at checkout or on an email/social account is still
  // allowed to create a dedicated phone-auth account. Only an existing real
  // phone-auth account blocks another signup with the same number.
  app.post("/api/auth/phone-signup-status", otpLimiter, async (req, res) => {
    try {
      const rawPhone = String((req.body || {}).phone || "").trim();
      const digits = rawPhone.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) return res.status(400).json({ message: "invalid_phone" });
      const existing = await storage.getUserByPhone(`+${digits}`);
      if (!existing || !isPhoneAuthAccount(existing)) {
        return res.json({ available: true, previouslyUsedAtCheckout: !!existing });
      }
      return res.status(400).json({ message: "phone_taken" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Send a 6-digit OTP via Twilio WhatsApp for the given phone. Refuses to
  // re-send while an existing code is still alive (cost protection).
  app.post("/api/auth/wa-send-otp", otpLimiter, async (req, res) => {
    try {
      if (!(await isWhatsAppPhoneEnabled())) return res.status(403).json({ message: "phone_auth_disabled" });
      if (!isWhatsAppConfigured()) return res.status(503).json({ message: "whatsapp_not_configured" });
      const rawPhone = String((req.body || {}).phone || "").trim();
      const digits = rawPhone.replace(/\D/g, "");
      if (digits.length < 8) return res.status(400).json({ message: "invalid_phone" });
      const phone = "+" + digits;

      const reservation = reservePhoneOtpSend(phone);
      if (!reservation.ok) return res.status(429).json(reservation);

      const code = String(randomInt(100000, 999999));
      phoneOtpCodes.set(phone, { code, expiresAt: Date.now() + PHONE_OTP_TTL_MS, attempts: 0 });
      try {
        await sendOtpWhatsApp(phone, code);
        commitPhoneOtpSend(reservation.reservationId);
      } catch (e: any) {
        phoneOtpCodes.delete(phone);
        rollbackPhoneOtpSend(reservation.reservationId);
        console.error("[wa-send-otp] send failed:", e?.message || e);
        return res.status(502).json({ message: "send_failed" });
      }
      res.json({ sent: true, ttl: Math.floor(PHONE_OTP_TTL_MS / 1000) });
    } catch (err: any) {
      console.error("[wa-send-otp] error:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Verify a WhatsApp OTP. On success, returns a single-use `verifyToken`
  // that the client passes to phone-signup / phone-mark-verified / phone-reset-password.
  app.post("/api/auth/wa-verify-otp", otpLimiter, async (req, res) => {
    try {
      if (!(await isWhatsAppPhoneEnabled())) return res.status(403).json({ message: "phone_auth_disabled" });
      const rawPhone = String((req.body || {}).phone || "").trim();
      const code = String((req.body || {}).code || "").trim();
      const digits = rawPhone.replace(/\D/g, "");
      if (digits.length < 8 || !/^\d{6}$/.test(code)) return res.status(400).json({ message: "invalid_input" });
      const phone = "+" + digits;

      const entry = phoneOtpCodes.get(phone);
      if (!entry) return res.status(400).json({ message: "no_code" });
      if (entry.expiresAt < Date.now()) {
        phoneOtpCodes.delete(phone);
        return res.status(400).json({ message: "code_expired" });
      }
      entry.attempts += 1;
      if (entry.attempts > 5) {
        phoneOtpCodes.delete(phone);
        return res.status(429).json({ message: "too_many_attempts" });
      }
      if (entry.code !== code) {
        return res.status(400).json({ message: "invalid_code", attemptsLeft: 5 - entry.attempts });
      }
      phoneOtpCodes.delete(phone);
      const verifyToken = randomUUID();
      verifiedPhoneNonces.set(verifyToken, { phone, channel: "whatsapp", expiresAt: Date.now() + VERIFY_NONCE_TTL_MS });
      res.json({ verified: true, verifyToken });
    } catch (err: any) {
      console.error("[wa-verify-otp] error:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // ── Phone OTP via Firebase SMS ──────────────────────────────────────────────
  // Alternative to WhatsApp OTP: the client sends the SMS code through Firebase
  // (signInWithPhoneNumber + invisible reCAPTCHA), confirms it client-side, and
  // then posts the resulting Firebase ID token here. We validate the token the
  // same way as /firebase-login, extract the verified `phone_number` claim, and
  // hand back the same single-use `verifyToken` used by the WhatsApp flow — so
  // /phone-signup, /phone-mark-verified and /phone-reset-password work unchanged.
  // Controlled by the admin site-setting `firebase_sms_enabled` (default off).
  app.post("/api/auth/phone-otp-send-permission", otpLimiter, async (req, res) => {
    try {
      if (!(await isFirebaseSmsEnabled())) return res.status(503).json({ message: "firebase_sms_disabled" });
      const digits = String((req.body || {}).phone || "").replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) return res.status(400).json({ message: "invalid_phone" });
      const reservation = reservePhoneOtpSend(`+${digits}`);
      if (!reservation.ok) return res.status(429).json(reservation);
      res.json({ allowed: true, reservationId: reservation.reservationId });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  app.post("/api/auth/phone-otp-send-failed", async (req, res) => {
    rollbackPhoneOtpSend(String((req.body || {}).reservationId || ""));
    res.json({ released: true });
  });

  app.post("/api/auth/phone-otp-send-complete", async (req, res) => {
    commitPhoneOtpSend(String((req.body || {}).reservationId || ""));
    res.json({ committed: true });
  });

  app.post("/api/auth/firebase-phone-verify", otpLimiter, async (req, res) => {
    try {
      if (!(await isFirebaseSmsEnabled())) return res.status(503).json({ message: "firebase_sms_disabled" });

      const { idToken } = req.body || {};
      if (!idToken || typeof idToken !== "string") {
        return res.status(400).json({ message: "idToken required" });
      }
      const parts = idToken.split(".");
      if (parts.length !== 3) {
        return res.status(401).json({ message: "Invalid Firebase token" });
      }
      let payload: any;
      try {
        payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      } catch {
        return res.status(401).json({ message: "Invalid Firebase token" });
      }

      const nowSec = Math.floor(Date.now() / 1000);
      if (!payload.exp || payload.exp < nowSec) {
        return res.status(401).json({ message: "Firebase token expired" });
      }
      if (!payload.iat || payload.iat > nowSec + 60) {
        return res.status(401).json({ message: "Invalid Firebase token" });
      }
      const projectId = process.env.FIREBASE_PROJECT_ID || "xxx";
      if (payload.aud !== projectId) {
        return res.status(401).json({ message: "Invalid Firebase token audience" });
      }
      if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
        return res.status(401).json({ message: "Invalid Firebase token issuer" });
      }
      if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length === 0) {
        return res.status(401).json({ message: "Invalid Firebase token subject" });
      }
      // Firebase must have verified this token recently (fresh SMS confirmation).
      if (!payload.auth_time || payload.auth_time < nowSec - 10 * 60 || payload.auth_time > nowSec + 60) {
        return res.status(401).json({ message: "Invalid Firebase token auth time" });
      }

      const rawPhone: string = payload.phone_number || "";
      const phoneDigits = rawPhone.replace(/\D/g, "");
      if (phoneDigits.length < 8) {
        return res.status(400).json({ message: "No phone number in Firebase token" });
      }
      const phoneNumber = "+" + phoneDigits;

      const verifyToken = randomUUID();
      verifiedPhoneNonces.set(verifyToken, { phone: phoneNumber, channel: "firebase", expiresAt: Date.now() + VERIFY_NONCE_TTL_MS });
      console.log("[firebase-phone-verify] ✓ verified phone via Firebase SMS:", phoneNumber);
      res.json({ verified: true, verifyToken });
    } catch (err: any) {
      console.error("[firebase-phone-verify] error:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // ── Phone OTP via Twilio SMS ───────────────────────────────────────────────
  // Prefer the existing TWILIO_SMS_FROM Messaging Service (MG...). A legacy
  // Twilio Verify Service (VA...) remains supported when no SMS sender exists.
  app.post("/api/auth/twilio-sms-send-otp", otpLimiter, async (req, res) => {
    try {
      if (!(await isTwilioSmsEnabled())) return res.status(403).json({ message: "twilio_sms_disabled" });
      if (!isTwilioSmsConfigured()) return res.status(503).json({ message: "twilio_sms_not_configured" });
      const rawPhone = String((req.body || {}).phone || "").trim();
      const digits = rawPhone.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) return res.status(400).json({ message: "invalid_phone" });
      const phone = `+${digits}`;
      const reservation = reservePhoneOtpSend(phone);
      if (!reservation.ok) return res.status(429).json(reservation);
      const usesVerify = usesTwilioVerifyService();
      const code = usesVerify ? undefined : String(randomInt(100000, 999999));
      if (code) phoneOtpCodes.set(phone, { code, expiresAt: Date.now() + PHONE_OTP_TTL_MS, attempts: 0 });
      try {
        await sendTwilioSmsVerification(phone, code);
        commitPhoneOtpSend(reservation.reservationId);
      } catch (err) {
        if (code) phoneOtpCodes.delete(phone);
        rollbackPhoneOtpSend(reservation.reservationId);
        throw err;
      }
      res.json({ sent: true });
    } catch (err: any) {
      console.error("[twilio-sms-send-otp] error:", err?.message || err);
      res.status(502).json({ message: "send_failed" });
    }
  });

  app.post("/api/auth/twilio-sms-verify-otp", otpLimiter, async (req, res) => {
    try {
      if (!(await isTwilioSmsEnabled())) return res.status(403).json({ message: "twilio_sms_disabled" });
      if (!isTwilioSmsConfigured()) return res.status(503).json({ message: "twilio_sms_not_configured" });
      const rawPhone = String((req.body || {}).phone || "").trim();
      const code = String((req.body || {}).code || "").trim();
      const digits = rawPhone.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15 || !/^\d{4,10}$/.test(code)) {
        return res.status(400).json({ message: "invalid_input" });
      }
      const phone = `+${digits}`;
      if (usesTwilioVerifyService()) {
        const approved = await checkTwilioSmsVerification(phone, code);
        if (!approved) return res.status(400).json({ message: "invalid_code" });
      } else {
        const entry = phoneOtpCodes.get(phone);
        if (!entry) return res.status(400).json({ message: "no_code" });
        if (entry.expiresAt < Date.now()) {
          phoneOtpCodes.delete(phone);
          return res.status(400).json({ message: "code_expired" });
        }
        entry.attempts += 1;
        if (entry.attempts > 5) {
          phoneOtpCodes.delete(phone);
          return res.status(429).json({ message: "too_many_attempts" });
        }
        if (entry.code !== code) {
          return res.status(400).json({ message: "invalid_code", attemptsLeft: 5 - entry.attempts });
        }
        phoneOtpCodes.delete(phone);
      }
      const verifyToken = randomUUID();
      verifiedPhoneNonces.set(verifyToken, { phone, channel: "twilio", expiresAt: Date.now() + VERIFY_NONCE_TTL_MS });
      res.json({ verified: true, verifyToken });
    } catch (err: any) {
      console.error("[twilio-sms-verify-otp] error:", err?.message || err);
      if (err?.status === 400 || err?.status === 404 || err?.code === 20404) {
        return res.status(400).json({ message: "invalid_code" });
      }
      res.status(502).json({ message: "verification_failed" });
    }
  });

  // Mark an existing (unverified) user as verified after WhatsApp OTP, then log in.
  app.post("/api/auth/phone-mark-verified", async (req, res) => {
    try {
      if (!(await isPhoneAuthEnabled())) return res.status(403).json({ message: "phone_auth_disabled" });
      const { verifyToken } = req.body || {};
      let verifiedPhone: { phone: string; channel: PhoneAuthChannel };
      try { verifiedPhone = consumeVerifyToken(String(verifyToken || "")); }
      catch (e: any) { return res.status(401).json({ message: e.message }); }
      const { phone: phoneNumber } = verifiedPhone;
      const user = await storage.getUserByPhone(phoneNumber);
      if (!user) return res.status(404).json({ message: "phone_not_found" });
      if (user.isBlocked) return res.status(403).json({ message: "account_blocked" });
      if (!user.isVerified) await storage.updateUser(user.id, { isVerified: true });
      const fresh = (await storage.getUser(user.id))!;
      // This account existed (e.g. created unverified) but this is the
      // customer's first successful sign-in with it, so greet them as new.
      await loginAndRespond(req, res, fresh, { isNewUser: true });
    } catch (err: any) {
      console.error("[phone-mark-verified] error:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Create a new account with phone+password after WhatsApp OTP confirms phone.
  app.post("/api/auth/phone-signup", async (req, res) => {
    try {
      if (!(await isPhoneAuthEnabled())) return res.status(403).json({ message: "phone_auth_disabled" });
      const { verifyToken, fullName, password } = req.body || {};
      if (!fullName || !String(fullName).trim()) return res.status(400).json({ message: "missing_name" });
      if (!password || String(password).length < 6) return res.status(400).json({ message: "password_too_short" });
      let verifiedPhone: { phone: string; channel: PhoneAuthChannel };
      try { verifiedPhone = consumeVerifyToken(String(verifyToken || "")); }
      catch (e: any) { return res.status(401).json({ message: e.message }); }
      const { phone: phoneNumber, channel } = verifiedPhone;
      const existing = await storage.getUserByPhone(phoneNumber);
      if (existing && isPhoneAuthAccount(existing)) return res.status(400).json({ message: "phone_taken" });
      const placeholderEmail = phonePlaceholderEmail(phoneNumber, channel);
      const hashed = await hashPassword(String(password));
      const newUser = await storage.createUser({
        email: placeholderEmail,
        password: hashed,
        fullName: String(fullName).trim(),
        phone: phoneNumber,
        role: "customer",
        isVerified: true,
      });
      await loginAndRespond(req, res, newUser, { isNewUser: true });
    } catch (err: any) {
      console.error("[phone-signup] error:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  app.post("/api/auth/phone-reset-channel", otpLimiter, async (req, res) => {
    try {
      if (!(await isPhoneAuthEnabled())) return res.status(403).json({ message: "phone_auth_disabled" });
      const digits = String((req.body || {}).phone || "").replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) return res.status(400).json({ message: "invalid_phone" });
      const user = await storage.getUserByPhone(`+${digits}`);
      if (!user) return res.status(404).json({ message: "phone_not_found" });
      if (!isPhoneAuthAccount(user)) return res.status(404).json({ message: "phone_not_registered" });
      if (user.isBlocked) return res.status(403).json({ message: "account_blocked" });
      res.json({ channel: phoneAuthChannelForUser(user) });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Reset password by phone after WhatsApp OTP confirms ownership.
  app.post("/api/auth/phone-reset-password", async (req, res) => {
    try {
      if (!(await isPhoneAuthEnabled())) return res.status(403).json({ message: "phone_auth_disabled" });
      const { verifyToken, newPassword } = req.body || {};
      if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ message: "password_too_short" });
      let verifiedPhone: { phone: string; channel: PhoneAuthChannel };
      try { verifiedPhone = consumeVerifyToken(String(verifyToken || "")); }
      catch (e: any) { return res.status(401).json({ message: e.message }); }
      const { phone: phoneNumber } = verifiedPhone;
      const user = await storage.getUserByPhone(phoneNumber);
      if (!user) return res.status(404).json({ message: "phone_not_found" });
      if (user.isBlocked) return res.status(403).json({ message: "account_blocked" });
      const hashed = await hashPassword(String(newPassword));
      await storage.updateUser(user.id, { password: hashed, isVerified: true });
      const fresh = (await storage.getUser(user.id))!;
      await loginAndRespond(req, res, fresh, { isNewUser: false });
    } catch (err: any) {
      console.error("[phone-reset-password] error:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Returns whether the admin has enabled phone-based auth.
  app.get("/api/auth/phone-enabled", async (_req, res) => {
    res.json({ enabled: await isPhoneAuthEnabled() });
  });

  // Forgot password — reset codes stored in memory (15-min TTL)
  const resetCodes = new Map<string, { code: string; expiresAt: number }>();

  app.post("/api/auth/forgot-password", passwordResetLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email required" });
      const user = await storage.getUserByEmail(email);
      if (!user) return res.json({ sent: false, reason: "email_not_found" });

      const code = String(randomInt(100000, 999999));
      resetCodes.set(email, { code, expiresAt: Date.now() + 15 * 60 * 1000 });
      sendPasswordResetCode(email, code).catch(console.error);
      res.json({ sent: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Verify reset code only (no password change yet)
  app.post("/api/auth/verify-reset-code", otpLimiter, async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ message: "Missing fields" });
      const entry = resetCodes.get(email);
      if (!entry || entry.code !== code || Date.now() > entry.expiresAt) {
        return res.status(400).json({ message: "invalid_code" });
      }
      res.json({ valid: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  app.post("/api/auth/reset-password", passwordResetLimiter, async (req, res) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) return res.status(400).json({ message: "Missing fields" });
      if (newPassword.length < 6) return res.status(400).json({ message: "Password too short" });

      const entry = resetCodes.get(email);
      if (!entry || entry.code !== code || Date.now() > entry.expiresAt) {
        return res.status(400).json({ message: "invalid_code" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "User not found" });

      const hashed = await hashPassword(newPassword);
      await storage.updateUser(user.id, { password: hashed });
      resetCodes.delete(email);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // --- Account Settings: profile + password ---
  app.patch("/api/auth/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const userId = (req.user as any).id;
      const body = z.object({
        fullName: z.string().min(1).max(120).optional(),
        phone: z.string().max(40).optional().nullable(),
        address: z.string().max(500).optional().nullable(),
        shippingRegion: z.string().max(50).optional().nullable(),
      }).parse(req.body);

      // Phone-auth accounts sign in WITH this number, so it's their
      // identity — not just a contact field. The account-settings UI hides
      // the input for these accounts, but Checkout also fire-and-forgets a
      // PATCH here with whatever phone the customer typed for that order
      // (which may deliberately differ from their sign-up number, e.g.
      // ordering for someone else). For a phone-auth account, silently keep
      // the sign-up number as-is instead of letting either path repoint it —
      // other fields (name/address/etc.) still save normally.
      const currentUser = await storage.getUser(userId);
      if (!currentUser) return res.status(404).json({ message: "Not found" });
      if (isPlaceholderEmail(currentUser.email) && typeof body.phone === "string") {
        body.phone = currentUser.phone || undefined;
      }

      const updated = await storage.updateUser(userId, body as any);
      if (!updated) return res.status(404).json({ message: "Not found" });
      const { password: _p, ...safe } = updated as any;
      res.json(safe);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Validation error" });
    }
  });

  app.post("/api/auth/change-password", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { currentPassword, newPassword } = z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6),
      }).parse(req.body);
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Not found" });
      const { comparePasswords } = await import("./auth");
      const ok = await comparePasswords(currentPassword, user.password);
      if (!ok) return res.status(400).json({ message: "current_password_incorrect" });
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(userId, { password: hashed } as any);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Validation error" });
    }
  });

  // --- Exchange Requests ---
  // Exchange window is admin-configurable (site setting "exchange_window_days",
  // default 3) instead of hardcoded, so the store can change it any time.
  const DEFAULT_EXCHANGE_WINDOW_DAYS = 3;
  async function getExchangeWindowMs(): Promise<number> {
    const raw = await storage.getSiteSetting("exchange_window_days");
    const days = raw ? parseFloat(raw) : NaN;
    const safeDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_EXCHANGE_WINDOW_DAYS;
    return safeDays * 24 * 60 * 60 * 1000;
  }

  app.post("/api/exchange-requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const reqUser = req.user as any;
      const userId = reqUser.id;
      const isAdmin = reqUser.role === 'admin';

      const enabled = (await storage.getSiteSetting("exchanges_enabled")) !== "false";
      if (!enabled) return res.status(403).json({ message: "exchanges_disabled" });

      const body = z.object({
        orderId: z.number().int(),
        orderItemId: z.number().int(),
        productId: z.number().int(),
        reason: z.string().min(3).max(1000),
        preferredSize: z.string().max(40).optional().nullable(),
        preferredColor: z.string().max(80).optional().nullable(),
      }).parse(req.body);

      const orderData = await storage.getOrder(body.orderId);
      if (!orderData) return res.status(404).json({ message: "order_not_found" });
      if (!isAdmin && Number(orderData.order.userId) !== Number(userId)) return res.status(403).json({ message: "Forbidden" });

      // When admin submits on behalf of a customer, attribute the request to the order's owner
      const effectiveUserId = (isAdmin && orderData.order.userId) ? orderData.order.userId : userId;
      if (orderData.order.status !== "Delivered") return res.status(400).json({ message: "order_not_delivered" });

      // Window is measured from the delivery date (تم التسليم), not the order date.
      // Fall back to createdAt only for legacy orders delivered before deliveredAt existed.
      const deliveryReference = orderData.order.deliveredAt ?? orderData.order.createdAt;
      const deliveredAtMs = deliveryReference ? new Date(deliveryReference as any).getTime() : null;
      const exchangeWindowMs = await getExchangeWindowMs();
      if (!deliveredAtMs || (Date.now() - deliveredAtMs) > exchangeWindowMs) {
        return res.status(400).json({ message: "exchange_window_expired" });
      }

      const item = orderData.items.find(i => i.id === body.orderItemId);
      if (!item || item.productId !== body.productId) return res.status(400).json({ message: "invalid_item" });

      // Block duplicate exchange for the same order item
      const existing = await storage.getUserExchangeRequests(effectiveUserId);
      const alreadyRequested = existing.some(r => r.orderItemId === body.orderItemId);
      if (alreadyRequested) return res.status(400).json({ message: "exchange_already_requested" });

      const product = await storage.getProduct(body.productId);
      if (!product) return res.status(404).json({ message: "product_not_found" });

      // Admin-configurable exclusion lists (JSON arrays of numeric IDs)
      const allSettings = await storage.getSiteSettings();
      const settingsMap: Record<string, string> = {};
      allSettings.forEach((s) => { settingsMap[s.key] = s.value; });
      const parseIdList = (raw: string | undefined): Set<number> => {
        if (!raw) return new Set();
        try {
          const arr = JSON.parse(raw);
          if (!Array.isArray(arr)) return new Set();
          return new Set(arr.map((x: any) => Number(x)).filter((n) => Number.isFinite(n)));
        } catch { return new Set(); }
      };
      const excludedCategoryIds = parseIdList(settingsMap.exchange_excluded_category_ids);
      const excludedSubcategoryIds = parseIdList(settingsMap.exchange_excluded_subcategory_ids);
      const productSubIds: number[] = Array.isArray((product as any).subcategoryIds) ? (product as any).subcategoryIds : [];
      const allProductSubIds = product.subcategoryId != null
        ? Array.from(new Set([...productSubIds, Number(product.subcategoryId)]))
        : productSubIds;
      const isExcluded =
        (product.categoryId != null && excludedCategoryIds.has(Number(product.categoryId))) ||
        allProductSubIds.some((id) => excludedSubcategoryIds.has(Number(id)));
      if (isExcluded) return res.status(400).json({ message: "category_not_exchangeable" });

      // Validate the requested size/color is actually available in stock
      const variants = ((product as any).colorVariants ?? []) as Array<{
        name: string;
        sizes?: string[];
        sizeInventory?: Record<string, number>;
      }>;
      const reqColor = (body.preferredColor || "").trim();
      const reqSize = (body.preferredSize || "").trim();
      if (!reqSize) return res.status(400).json({ message: "size_not_available" });

      let sizeOk = false;
      if (variants.length > 0) {
        if (!reqColor) return res.status(400).json({ message: "color_not_available" });
        const v = variants.find((x) => x.name === reqColor);
        if (!v) return res.status(400).json({ message: "color_not_available" });
        sizeOk = (v.sizes ?? []).includes(reqSize) && (v.sizeInventory?.[reqSize] ?? 0) > 0;
      } else {
        const sizes = ((product as any).sizes ?? []) as string[];
        const inv = ((product as any).sizeInventory ?? {}) as Record<string, number>;
        sizeOk = sizes.includes(reqSize) && (inv[reqSize] ?? 0) > 0;
      }
      if (!sizeOk) return res.status(400).json({ message: "size_not_available" });

      const created = await storage.createExchangeRequest(effectiveUserId, {
        orderId: body.orderId,
        orderItemId: body.orderItemId,
        productId: body.productId,
        reason: body.reason,
        preferredSize: reqSize,
        preferredColor: reqColor || null,
      } as any);

      // Notify admin via email
      const exchangeUser = await storage.getUser(effectiveUserId);
      sendExchangeAdminNotification({
        customerName: exchangeUser?.fullName || exchangeUser?.email || `User #${effectiveUserId}`,
        customerEmail: exchangeUser?.email || "",
        orderId: body.orderId,
        productName: product.name,
        preferredSize: reqSize || null,
        preferredColor: reqColor || null,
        reason: body.reason,
      }).catch(console.error);

      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Validation error" });
    }
  });

  app.get("/api/exchange-requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).id;
    const list = await storage.getUserExchangeRequests(userId);
    res.json(list);
  });

  app.get("/api/admin/exchange-requests", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    const list = await storage.getAllExchangeRequests();
    res.json(list);
  });

  app.patch("/api/admin/exchange-requests/:id", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    try {
      const { status, adminNote } = z.object({
        status: z.enum(["pending", "approved", "denied"]),
        adminNote: z.string().max(1000).optional().nullable(),
      }).parse(req.body);

      const exchangeReq = await storage.getExchangeRequestById(Number(req.params.id));
      if (!exchangeReq) return res.status(404).json({ message: "Not found" });

      // Auto-create a new order when approving
      if (status === "approved" && exchangeReq.status !== "approved") {
        const origOrder = exchangeReq.order;
        const product = exchangeReq.product;
        if (origOrder && product) {
          // Use the price the customer actually paid on the original order
          // item, not today's live product price — the product's price may
          // have changed (or been discounted differently) since purchase.
          const origOrderData = await storage.getOrder(origOrder.id);
          const origItem = origOrderData?.items.find((i) => i.id === exchangeReq.orderItemId);
          const originalPrice = String(origItem?.price ?? product.price ?? "0");
          const shippingCost = String(origOrder.shippingCost ?? "0");
          const totalAmount = String(parseFloat(shippingCost) || 0);
          const exchangeNote = `استبدال لطلب رقم #${String(origOrder.id).padStart(6, "0")} · السعر الأصلي: ₪${parseFloat(originalPrice).toFixed(2)}`;

          await storage.createOrder(
            {
              userId: exchangeReq.userId,
              totalAmount,
              shippingCost,
              shippingRegion: origOrder.shippingRegion ?? null,
              status: "Pending",
              paymentMethod: "Exchange",
              fullName: origOrder.fullName,
              phone: origOrder.phone,
              phone2: origOrder.phone2 ?? null,
              address: origOrder.address,
              city: origOrder.city,
              notes: exchangeNote,
              discountCode: "EXCHANGE",
              discountAmount: originalPrice,
              creditUsed: null,
            },
            [
              {
                productId: exchangeReq.productId,
                quantity: 1,
                price: originalPrice,
                size: exchangeReq.preferredSize ?? null,
                color: exchangeReq.preferredColor ?? null,
              },
            ],
            true // skipStockCheck: exchange orders must never fail approval due to low stock
          );

          // Reconcile inventory: the customer is returning the size/color
          // they originally received (goes back into stock) and receiving
          // the preferred size/color instead (comes out of stock). Neither
          // side ever blocks approval — stock is clamped at 0 if it runs out.
          if (origItem) {
            await storage.adjustProductSizeStock(
              exchangeReq.productId,
              origItem.color ?? null,
              origItem.size ?? null,
              1,
            );
          }
          await storage.adjustProductSizeStock(
            exchangeReq.productId,
            exchangeReq.preferredColor ?? null,
            exchangeReq.preferredSize ?? null,
            -1,
          );
        }
      }

      const updated = await storage.updateExchangeRequest(Number(req.params.id), status, adminNote ?? undefined);
      if (!updated) return res.status(404).json({ message: "Not found" });

      // Notify the customer when their exchange is approved or denied
      if (status === "approved" || status === "denied") {
        const exchReq = await storage.getExchangeRequestById(Number(req.params.id));
        if (exchReq) {
          const orderRef = `#${String(exchReq.orderId).padStart(6, "0")}`;
          const productName = exchReq.product?.name ?? "المنتج";

          // In-app notification
          await storage.createNotification({
            userId: exchReq.userId,
            type: `exchange_${status}`,
            message: status === "approved"
              ? `Your exchange request for order ${orderRef} (${productName}) has been approved.`
              : `Your exchange request for order ${orderRef} (${productName}) has been denied.`,
            messageAr: status === "approved"
              ? `تمت الموافقة على طلب الاستبدال للطلب ${orderRef} (${productName}).`
              : `تم رفض طلب الاستبدال للطلب ${orderRef} (${productName}).`,
            link: "/profile?tab=exchanges&subtab=submitted",
          });

          // Email + WhatsApp notification so the customer doesn't miss the update
          if (exchReq.userId) {
            const customerUser = await storage.getUser(exchReq.userId);
            if (customerUser?.email && !isPlaceholderEmail(customerUser.email)) {
              sendExchangeStatusEmail(customerUser.email, {
                status: status as "approved" | "denied",
                orderRef,
                productName,
                adminNote: adminNote ?? null,
                preferredSize: exchReq.preferredSize ?? null,
                preferredColor: exchReq.preferredColor ?? null,
              }).catch(console.error);
            }
            if ((customerUser as any)?.phone) {
              const statusAr = status === "approved" ? "تمت الموافقة ✅" : "تم الرفض ❌";
              const waMsg =
                `مرحباً ${customerUser!.fullName || ""} 👋\n\n` +
                `طلب الاستبدال للطلب ${orderRef} (${productName}):\n` +
                `الحالة: ${statusAr}\n` +
                (adminNote ? `ملاحظة: ${adminNote}\n` : "") +
                `\nشكراً — Lucerne Boutique 🌿`;
              sendTextMessage((customerUser as any).phone, waMsg).catch(console.error);
            }
          }
        }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Validation error" });
    }
  });

  // --- Product Routes ---
  app.get("/api/products/best-sellers", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || "8")), 20);
      const items = await storage.getBestSellers(limit);
      return successResponse(res, items);
    } catch (err: any) {
      logProductError("products.best-sellers", err);
      return failureResponse(res, 500, err?.message || "Failed to fetch best sellers", err);
    }
  });

  // Targeted small fetches for the Home page. Use storage.getProducts() so
  // legacy media/video fields are normalized consistently before returning.
  app.get("/api/products/featured", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || "8")), 24);
      const items = (await storage.getProducts())
        .filter((item: any) => item.isFeatured)
        .sort((a: any, b: any) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0))
        .slice(0, limit);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return successResponse(res, items);
    } catch (err: any) {
      logProductError("products.featured", err);
      return failureResponse(res, 500, err?.message || "Failed to fetch featured products", err);
    }
  });

  app.get("/api/products/new-arrivals", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || "8")), 24);
      const items = (await storage.getProducts())
        .filter((item: any) => item.isNewArrival)
        .sort((a: any, b: any) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0))
        .slice(0, limit);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return successResponse(res, items);
    } catch (err: any) {
      logProductError("products.new-arrivals", err);
      return failureResponse(res, 500, err?.message || "Failed to fetch new arrivals", err);
    }
  });

  app.get("/api/products/on-sale", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || "8")), 24);
      const items = (await storage.getProducts())
        .filter((item: any) => item.discountPrice !== null && item.discountPrice !== undefined && Number(item.discountPrice) > 0)
        .sort((a: any, b: any) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0))
        .slice(0, limit);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return successResponse(res, items);
    } catch (err: any) {
      logProductError("products.on-sale", err);
      return failureResponse(res, 500, err?.message || "Failed to fetch on-sale products", err);
    }
  });

  app.get("/api/products/by-category/:categoryId", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      if (!categoryId) return failureResponse(res, 400, "Invalid category ID");
      const limit = Math.min(parseInt(String(req.query.limit || "8")), 24);
      const excludeParam = String(req.query.exclude || "");
      const excludeIds = excludeParam ? excludeParam.split(",").map(Number).filter(Boolean) : [];
      const items = (await storage.getProducts([categoryId]))
        .filter((item: any) => !excludeIds.includes(Number(item.id)))
        .sort((a: any, b: any) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0))
        .slice(0, limit);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return successResponse(res, items);
    } catch (err: any) {
      logProductError("products.by-category", err, { params: req.params, query: req.query });
      return failureResponse(res, 500, err?.message || "Failed to fetch category products", err);
    }
  });

  // Track product events (fire-and-forget, always 200)
  app.post("/api/events/product", async (req, res) => {
    try {
      const { productId, eventType, sessionId, userId } = req.body;
      if (!productId || !eventType) return res.json({ ok: true });
      if (!["view", "cart_add"].includes(eventType)) return res.json({ ok: true });
      await storage.recordProductEvent({
        productId: Number(productId),
        eventType,
        sessionId: sessionId || null,
        userId: userId ? Number(userId) : null,
      });
    } catch {}
    res.json({ ok: true });
  });

  // Get smart recommendations for a product
  app.get("/api/products/:id/recommendations", async (req, res) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) return failureResponse(res, 400, "Invalid product ID");
      const ids = await storage.getProductRecommendations(productId);
      return successResponse(res, ids);
    } catch (err: any) {
      logProductError("products.recommendations", err, { id: req.params.id });
      return failureResponse(res, 500, err?.message || "Failed to fetch recommendations", err);
    }
  });

  app.get(api.products.list.path, async (req, res) => {
    const catParam = req.query.categoryIds as string | undefined;
    const categoryIds = catParam
      ? catParam.split(",").map(Number).filter((n) => !isNaN(n) && n > 0)
      : undefined;
    const products = await storage.getProducts(categoryIds);
    // Short cache (was max-age=30 + SWR 120) so POS stock changes reach
    // browsers within ~10 seconds instead of minutes.
    res.setHeader("Cache-Control", "public, max-age=10");

    // Fire-and-forget: warm Cloudinary's 400/800/1200 transforms for any main
    // image not yet warmed this server session. This removes the first-view
    // delay where Cloudinary had to generate a resized image on demand (the
    // reason some POS photos appeared only after a long wait). Never blocks the
    // response and never repeats work for an already-warmed URL.
    try {
      for (const p of products as any[]) {
        const main = p?.mainImage || p?.colorVariants?.[0]?.mainImage;
        if (main && typeof main === "string" && !warmedImageUrls.has(main)) {
          warmedImageUrls.add(main);
          warmCloudinaryCache(main).catch(() => {});
        }
      }
    } catch {
      // warming is best-effort only
    }

    return successResponse(res, products);
  });

  app.get(api.products.get.path, async (req, res) => {
    const product = await storage.getProduct(Number(req.params.id));
    if (!product) return failureResponse(res, 404, "Product not found");
    // Short cache (was max-age=30 + SWR 120) — product page stock must be fresh.
    res.setHeader("Cache-Control", "public, max-age=10");
    return successResponse(res, product);
  });

  app.post(api.products.create.path, async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return failureResponse(res, 401, "Unauthorized");
    }
    try {
      const cleanInput = await normalizeProductPayload(req.body, { partial: false });
      const input: any = api.products.create.input.parse(cleanInput);
      const product = await storage.createProduct(input);
      return successResponse(res, product, 201, product as any);
    } catch (err: any) {
      const isValidation = err?.name === "ZodError" || err?.name === "ProductRequestError" || Array.isArray(err?.issues);
      logProductError("products.create", err, {
        payload: req.body,
        userId: (req.user as any)?.id,
      });
      return failureResponse(
        res,
        isValidation ? 400 : 500,
        err?.message || (isValidation ? "Validation error" : "Failed to create product"),
        err,
        { issues: err?.issues },
      );
    }
  });

  app.put(api.products.update.path, async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return failureResponse(res, 401, "Unauthorized");
    }
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return failureResponse(res, 400, "Invalid product ID");
      }
      const cleanInput = await normalizeProductPayload(req.body, { partial: true });
      const input: any = api.products.update.input.parse(cleanInput);
      const product = await storage.updateProduct(productId, input);
      if (!product) return failureResponse(res, 404, "Not found");
      return successResponse(res, product, 200, product as any);
    } catch (err: any) {
      const isValidation = err?.name === "ZodError" || err?.name === "ProductRequestError" || Array.isArray(err?.issues);
      logProductError("products.update", err, {
        id: req.params.id,
        payload: req.body,
        userId: (req.user as any)?.id,
      });
      return failureResponse(
        res,
        isValidation ? 400 : 500,
        err?.message || (isValidation ? "Validation error" : "Failed to update product"),
        err,
        { issues: err?.issues },
      );
    }
  });

  app.delete(api.products.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return failureResponse(res, 401, "Unauthorized");
    }
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return failureResponse(res, 400, "Invalid product ID");
      }
      const success = await storage.deleteProduct(productId);
      if (!success) return failureResponse(res, 404, "Not found");

      // NOTE: We intentionally do NOT delete media from Cloudinary here.
      // The same photos are reused across several projects, so removing a
      // product from this site must never destroy the shared image (doing so
      // previously broke images in other projects and left permanent blur
      // placeholders). Skipping remote media deletion also makes product
      // deletion instant instead of waiting ~30s on Cloudinary network calls.
      return successResponse(res, {
        id: productId,
        removedMediaCount: 0,
        cleanupFailed: 0,
      });
    } catch (err: any) {
      logProductError("products.delete", err, {
        id: req.params.id,
        userId: (req.user as any)?.id,
      });
      return failureResponse(res, 500, err?.message || "Failed to delete product", err);
    }
  });

  app.patch("/api/products/bulk-edit", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return failureResponse(res, 401, "Unauthorized");
    }
    try {
      const { ids, updates, regenerateBarcode } = req.body as {
        ids: number[];
        updates: {
          name?: string;
          price?: string;
          discountPrice?: string | null;
          categoryId?: string;
          subcategoryId?: string;
          subcategoryIds?: (number | string)[];
        };
        regenerateBarcode?: boolean;
      };
      if (!Array.isArray(ids) || ids.length === 0 || typeof updates !== "object") {
        return failureResponse(res, 400, "Invalid payload");
      }
      const productIds = Array.from(new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
      if (productIds.length === 0) return failureResponse(res, 400, "No valid product IDs");

      const cleanUpdates: Record<string, any> = {};
      if (updates.name && updates.name.trim()) cleanUpdates.name = updates.name.trim();
      if (updates.price !== undefined && updates.price !== "") {
        const p = parseFloat(updates.price);
        if (!Number.isFinite(p) || p <= 0) return failureResponse(res, 400, "Invalid price");
        cleanUpdates.price = p.toFixed(2);
      }
      if (updates.categoryId !== undefined && updates.categoryId !== "") {
        cleanUpdates.categoryId = updates.categoryId === "none" ? null : Number(updates.categoryId);
        if (updates.subcategoryId === undefined && updates.subcategoryIds === undefined) {
          cleanUpdates.subcategoryId = null;
          cleanUpdates.subcategoryIds = [];
        }
      }
      // Multi-select subcategories (new) takes precedence over the legacy
      // single subcategoryId field when both are present.
      if (updates.subcategoryIds !== undefined) {
        if (!Array.isArray(updates.subcategoryIds) || updates.subcategoryIds.length === 0) {
          cleanUpdates.subcategoryId = null;
          cleanUpdates.subcategoryIds = [];
        } else {
          const sids = updates.subcategoryIds.map((x) => Number(x));
          if (sids.some((sid) => !Number.isInteger(sid) || sid <= 0)) {
            return failureResponse(res, 400, "Invalid subcategory ID");
          }
          cleanUpdates.subcategoryIds = Array.from(new Set(sids));
          cleanUpdates.subcategoryId = cleanUpdates.subcategoryIds[0];
        }
      } else if (updates.subcategoryId !== undefined) {
        if (updates.subcategoryId === "" || updates.subcategoryId === "none") {
          cleanUpdates.subcategoryId = null;
          cleanUpdates.subcategoryIds = [];
        } else {
          const sid = Number(updates.subcategoryId);
          if (!Number.isInteger(sid) || sid <= 0) return failureResponse(res, 400, "Invalid subcategory ID");
          cleanUpdates.subcategoryId = sid;
          cleanUpdates.subcategoryIds = [sid];
        }
      }
      if (updates.discountPrice !== undefined) {
        if (updates.discountPrice === "" || updates.discountPrice === null) {
          cleanUpdates.discountPrice = null;
        } else {
          const dp = parseFloat(updates.discountPrice as string);
          if (!Number.isFinite(dp) || dp < 0) return failureResponse(res, 400, "Invalid discount price");
          cleanUpdates.discountPrice = dp > 0 ? dp.toFixed(2) : null;
        }
      }
      if (Object.keys(cleanUpdates).length === 0 && !regenerateBarcode) {
        return failureResponse(res, 400, "No valid fields to update");
      }
      const normalizedUpdates = Object.keys(cleanUpdates).length > 0
        ? await normalizeProductPayload(cleanUpdates, { partial: true })
        : {};
      // Numeric-only barcode (no letter prefix) so it prints/scans cleanly
      // on any standard barcode scanner or label. Format: 8-digit timestamp
      // tail + 4-digit random suffix = 12 digits total.
      const genBarcode = () => {
        const ts = Date.now().toString().slice(-8);
        const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
        return `${ts}${rnd}`;
      };
      await Promise.all(productIds.map((id) => {
        const rowUpdates = { ...normalizedUpdates };
        if (regenerateBarcode) rowUpdates.barcode = genBarcode();
        return storage.updateProduct(id, rowUpdates as any);
      }));
      return successResponse(res, { updated: productIds.length }, 200, { updated: productIds.length });
    } catch (err: any) {
      logProductError("products.bulk-edit", err, { payload: req.body, userId: (req.user as any)?.id });
      const status = err?.name === "ProductRequestError" || Array.isArray(err?.issues) ? 400 : 500;
      return failureResponse(res, status, err?.message || "Bulk edit failed", err, { issues: err?.issues });
    }
  });

  app.patch("/api/products/:id/variant-stock", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return failureResponse(res, 401, "Unauthorized");
    }
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) return failureResponse(res, 400, "Invalid product ID");
      const { variantName, sizeInventory } = req.body as {
        variantName?: string;
        sizeInventory: Record<string, number>;
      };
      const cleanInventory = normalizeInventoryPayload(sizeInventory);
      const product = await storage.getProduct(productId);
      if (!product) return failureResponse(res, 404, "Not found");
      const colorVariants = ((product as any).colorVariants || []) as Array<{ name: string; sizeInventory: Record<string, number>; [key: string]: any }>;
      if (colorVariants.length > 0 && variantName) {
        let matched = false;
        const updated = colorVariants.map((cv) => {
          if (cv.name !== variantName) return cv;
          matched = true;
          return {
            ...cv,
            sizeInventory: cleanInventory,
            sizes: Object.keys(cleanInventory),
          };
        });
        if (!matched) return failureResponse(res, 404, "Variant not found");
        const mergedSizeInv: Record<string, number> = {};
        updated.forEach((cv) => {
          Object.entries(cv.sizeInventory || {}).forEach(([size, qty]) => {
            mergedSizeInv[size] = (mergedSizeInv[size] || 0) + Number(qty || 0);
          });
        });
        const totalStock = Object.values(mergedSizeInv).reduce((sum, qty) => sum + Number(qty || 0), 0);
        await storage.updateProduct(productId, { colorVariants: updated, sizeInventory: mergedSizeInv, stockQuantity: totalStock } as any);
        return successResponse(res, { productId, variantName, sizeInventory: cleanInventory, stockQuantity: totalStock });
      }
      const totalStock = Object.values(cleanInventory).reduce((s: number, q: any) => s + Number(q || 0), 0);
      await storage.updateProduct(productId, { sizeInventory: cleanInventory, stockQuantity: totalStock } as any);
      return successResponse(res, { productId, sizeInventory: cleanInventory, stockQuantity: totalStock });
    } catch (err: any) {
      logProductError("products.variant-stock", err, { id: req.params.id, payload: req.body, userId: (req.user as any)?.id });
      const status = err?.name === "ProductRequestError" || Array.isArray(err?.issues) ? 400 : 500;
      return failureResponse(res, status, err?.message || "Failed to update inventory", err, { issues: err?.issues });
    }
  });

  app.patch("/api/products/bulk-flags", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return failureResponse(res, 401, "Unauthorized");
    }
    try {
      const { ids, updates } = req.body as {
        ids: number[];
        updates: { isBestSeller?: boolean; isNewArrival?: boolean; isFeatured?: boolean };
      };
      if (!Array.isArray(ids) || ids.length === 0 || typeof updates !== "object") {
        return failureResponse(res, 400, "Invalid payload");
      }
      const allowed = ["isBestSeller", "isNewArrival", "isFeatured"];
      const cleanUpdates: Record<string, boolean> = {};
      for (const key of allowed) {
        if ((updates as any)[key] !== undefined) cleanUpdates[key] = Boolean((updates as any)[key]);
      }
      if (Object.keys(cleanUpdates).length === 0) return failureResponse(res, 400, "No valid flags supplied");
      const productIds = Array.from(new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
      await Promise.all(productIds.map((id) => storage.updateProduct(id, cleanUpdates as any)));
      return successResponse(res, { updated: productIds.length }, 200, { updated: productIds.length });
    } catch (err: any) {
      logProductError("products.bulk-flags", err, { payload: req.body, userId: (req.user as any)?.id });
      return failureResponse(res, 500, err?.message || "Failed to update product flags", err);
    }
  });

  // Expire new arrivals older than N days & persist the period setting
  app.patch("/api/admin/products/expire-new-arrivals", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return failureResponse(res, 401, "Unauthorized");
    }
    try {
      const daysNum = Math.max(1, Math.min(365, Number(req.body.days ?? 14)));
      await storage.setSiteSetting("new_arrivals_days", String(daysNum));
      const result = await db.execute(sql`
        UPDATE products
        SET is_new_arrival = false
        WHERE is_new_arrival = true
          AND created_at < NOW() - (${daysNum} * INTERVAL '1 day')
      `);
      const data = { updated: result.rowCount ?? 0, days: daysNum };
      return successResponse(res, data, 200, data);
    } catch (err: any) {
      logProductError("products.expire-new-arrivals", err, { payload: req.body, userId: (req.user as any)?.id });
      return failureResponse(res, 500, err?.message || "Failed to expire new arrivals", err);
    }
  });

  // --- Bulk Product Import (Excel) ---
  app.get("/api/admin/products/bulk-template", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // Fetch live categories & subcategories so hints are always accurate
    const cats = await db.execute(sql`SELECT id, name FROM categories ORDER BY id`);
    const subs = await db.execute(sql`SELECT id, name, category_id FROM subcategories ORDER BY id`);
    const catHint = (cats.rows as any[]).map((c: any) => `${c.id}=${c.name}`).join(" / ") || "1=Dresses";
    const subHint = (subs.rows as any[]).map((s: any) => `${s.id}=${s.name}`).join(" / ") || "اختياري";

    const headers = [
      "name", "name_ar", "description", "price", "cost_price", "discount_price",
      "category_id", "subcategory_id", "barcode", "brand", "sizes", "stock_quantity",
      "colors", "color_codes",
      "is_featured", "is_new_arrival", "is_best_seller", "main_image_url",
    ];
    const hint = [
      "اسم المنتج بالإنجليزي (مطلوب)", "اسم المنتج بالعربي (اختياري)", "وصف المنتج", "السعر (مطلوب)", "سعر التكلفة", "سعر الخصم",
      `رقم الفئة: ${catHint}`, `رقم التصنيف الفرعي: ${subHint}`,
      "الباركود", "الماركة",
      "المقاسات مفصولة بفاصلة: S,M,L أو 36,37,38", "الكمية الإجمالية",
      "أسماء الألوان مفصولة بفاصلة: Black,White,Red", "كودات الألوان HEX مفصولة بفاصلة: #000000,#FFFFFF,#FF0000",
      "yes / no", "yes / no", "yes / no", "رابط صورة مباشر (مطلوب)",
    ];
    const firstCatId = (cats.rows[0] as any)?.id ?? 1;
    const firstSubId = (subs.rows[0] as any)?.id ?? "";
    const example = [
      "Summer Dress", "فستان صيفي", "وصف المنتج", 150, 80, 120,
      firstCatId, firstSubId, "LB12345678", "Lucerne", "S,M,L", 10,
      "Black,White", "#000000,#FFFFFF",
      "no", "yes", "no", "https://res.cloudinary.com/YOUR_URL_HERE",
    ];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Products");
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAD3" } };
    const hintRow = ws.addRow(hint);
    hintRow.font = { italic: true, color: { argb: "FF888888" } };
    ws.addRow(example);
    ws.columns = headers.map(() => ({ width: 30 }));
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="lucerne-products-template.xlsx"');
    res.send(buf);
  });

  // --- Export all products to Excel ---
  // The JSON columns preserve every nested product field exactly, including
  // per-color main photos, side photos, media order, sizes and inventory.
  app.get("/api/admin/products/export", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const [productRows, categoryRows, subcategoryRows] = await Promise.all([
        storage.getProducts(),
        storage.getCategories(),
        storage.getSubcategories(),
      ]);
      const categoryNames = new Map(categoryRows.map((category: any) => [category.id, category.name]));
      const subcategoryNames = new Map(subcategoryRows.map((subcategory: any) => [subcategory.id, subcategory.name]));
      const products = productRows
        .slice()
        .sort((left, right) => left.id - right.id)
        .map((product: any) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          cost_price: product.costPrice,
          discount_price: product.discountPrice,
          category_id: product.categoryId,
          category_name: product.categoryId ? categoryNames.get(product.categoryId) : null,
          subcategory_id: product.subcategoryId,
          subcategory_name: product.subcategoryId ? subcategoryNames.get(product.subcategoryId) : null,
          subcategory_ids: product.subcategoryIds,
          barcode: product.barcode,
          brand: product.brand,
          sizes: product.sizes,
          colors: product.colors,
          color_variants: product.colorVariants,
          size_inventory: product.sizeInventory,
          stock_quantity: product.stockQuantity,
          is_featured: product.isFeatured,
          is_new_arrival: product.isNewArrival,
          is_best_seller: product.isBestSeller,
          main_image: product.mainImage,
          images: product.images,
          video_url: product.videoUrl,
          created_at: product.createdAt,
        }));

      const wb = new ExcelJS.Workbook();
      wb.creator = "Lucerne Boutique";
      wb.created = new Date();
      const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
      const headerLabels = [
        "ID", "name", "description", "price", "cost_price", "discount_price",
        "category_id", "Category Name", "subcategory_id", "Subcategory Name",
        "subcategory_ids_json", "barcode", "brand",
        "sizes", "sizes_json", "colors", "colors_json", "color_codes",
        "stock_quantity", "size_inventory_json", "color_inventory",
        "is_featured", "is_new_arrival", "is_best_seller",
        "main_image_url", "images_json", "color_variants_json",
        "video_url", "created_at",
      ];
      const headerRow = ws.addRow(headerLabels);
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A2E" } };
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };

      for (const product of products) {
        const colorVariants: any[] = Array.isArray(product.color_variants) ? product.color_variants : [];
        const sizes: string[] = Array.isArray(product.sizes) ? product.sizes : [];
        const colors: string[] = Array.isArray(product.colors) ? product.colors : [];
        const sizeInventory = product.size_inventory && typeof product.size_inventory === "object"
          ? product.size_inventory
          : {};
        const images: string[] = Array.isArray(product.images) ? product.images : [];
        const subcategoryIds: number[] = Array.isArray(product.subcategory_ids)
          ? product.subcategory_ids
          : [];

        const displayColors = colorVariants.length > 0
          ? colorVariants.map((variant: any) => variant.name).filter(Boolean)
          : colors;
        const colorCodes = colorVariants.length > 0
          ? colorVariants.map((variant: any) => variant.colorCode || "")
          : [];
        const colorInventory = colorVariants.length > 0
          ? colorVariants.map((variant: any) => {
              const inventory = variant.sizeInventory || {};
              const parts = Object.entries(inventory)
                .map(([size, quantity]) => `${size}=${quantity}`)
                .join(",");
              return `${variant.name}:${parts || "0"}`;
            }).join("|")
          : Object.entries(sizeInventory)
              .map(([size, quantity]) => `${size}=${quantity}`)
              .join(",");

        ws.addRow([
          product.id,
          product.name,
          product.description,
          product.price,
          product.cost_price ?? "",
          product.discount_price ?? "",
          product.category_id ?? "",
          product.category_name ?? "",
          product.subcategory_id ?? "",
          product.subcategory_name ?? "",
          JSON.stringify(subcategoryIds),
          product.barcode ?? "",
          product.brand ?? "",
          sizes.join(","),
          JSON.stringify(sizes),
          displayColors.join(","),
          JSON.stringify(colors),
          colorCodes.join(","),
          product.stock_quantity ?? 0,
          JSON.stringify(sizeInventory),
          colorInventory,
          product.is_featured ? "yes" : "no",
          product.is_new_arrival ? "yes" : "no",
          product.is_best_seller ? "yes" : "no",
          product.main_image ?? "",
          JSON.stringify(images),
          JSON.stringify(colorVariants),
          product.video_url ?? "",
          product.created_at ? new Date(product.created_at).toISOString() : "",
        ]);
      }

      ws.autoFilter = { from: "A1", to: `${ws.getColumn(headerLabels.length).letter}1` };
      ws.columns = headerLabels.map((header) => ({
        width: ["images_json", "color_variants_json", "size_inventory_json"].includes(header)
          ? 60
          : header.includes("image") || header === "video_url"
            ? 45
            : 24,
      }));
      ws.eachRow((row, rowNumber) => {
        row.alignment = { vertical: "top", wrapText: rowNumber > 1 };
      });

      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="lucerne-products-export-${Date.now()}.xlsx"`);
      res.send(buffer);
    } catch (err: any) {
      console.error("[products.export] failed:", err);
      res.status(500).json({ message: err?.message || "Export failed" });
    }
  });

  // --- Export all products as SQL INSERT statements (for phpMyAdmin restore) ---
  app.get("/api/admin/products/export-sql", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const rows = await db.execute(sql`
      SELECT id, name, description, price, cost_price, discount_price,
             category_id, subcategory_id, barcode, brand,
             sizes, colors, color_variants, size_inventory, images,
             stock_quantity, is_featured, is_new_arrival, is_best_seller,
             main_image, video_url
      FROM products ORDER BY id
    `);
    const products = rows.rows as any[];

    const esc   = (s: any) => String(s ?? "").replace(/'/g, "''");
    const str   = (v: any) => (v == null || v === "") ? "NULL" : `'${esc(v)}'`;
    const num   = (v: any) => { const n = parseFloat(String(v ?? "")); return isNaN(n) ? "NULL" : n.toString(); };
    const int   = (v: any) => { const n = parseInt(String(v ?? "")); return isNaN(n) ? "NULL" : n.toString(); };
    const bool  = (v: any) => (v === true || v === "true" || v === 1) ? "true" : "false";
    const jsonb = (v: any) => {
      if (v == null) return "NULL";
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return `'${esc(s)}'::jsonb`;
    };

    const cols = [
      "id","name","description","price","cost_price","discount_price",
      "category_id","subcategory_id","barcode","brand",
      "sizes","colors","color_variants","size_inventory","images",
      "stock_quantity","is_featured","is_new_arrival","is_best_seller",
      "main_image","video_url",
    ].join(", ");

    const lines: string[] = [
      `-- ============================================================`,
      `-- Lucerne Boutique — Products SQL Backup`,
      `-- Generated : ${new Date().toISOString()}`,
      `-- Products  : ${products.length}`,
      `-- ============================================================`,
      `-- HOW TO USE:`,
      `--   1. Open phpMyAdmin → select your database → SQL tab`,
      `--   2. Paste this file and click GO`,
      `--   Uses UPSERT: existing IDs are updated, new ones inserted.`,
      `--`,
      `-- If you want a FULL restore on an empty DB, uncomment next line:`,
      `-- TRUNCATE products CASCADE;`,
      ``,
    ];

    for (const p of products) {
      const vals = [
        int(p.id),
        str(p.name),
        str(p.description),
        num(p.price),
        num(p.cost_price),
        num(p.discount_price),
        int(p.category_id),
        int(p.subcategory_id),
        str(p.barcode),
        str(p.brand),
        jsonb(p.sizes),
        jsonb(p.colors),
        jsonb(p.color_variants),
        jsonb(p.size_inventory),
        jsonb(p.images),
        int(p.stock_quantity),
        bool(p.is_featured),
        bool(p.is_new_arrival),
        bool(p.is_best_seller),
        str(p.main_image),
        str(p.video_url),
      ].join(", ");

      lines.push(
        `INSERT INTO products (${cols})`,
        `VALUES (${vals})`,
        `ON CONFLICT (id) DO UPDATE SET`,
        `  name=EXCLUDED.name, description=EXCLUDED.description, price=EXCLUDED.price,`,
        `  cost_price=EXCLUDED.cost_price, discount_price=EXCLUDED.discount_price,`,
        `  category_id=EXCLUDED.category_id, subcategory_id=EXCLUDED.subcategory_id,`,
        `  barcode=EXCLUDED.barcode, brand=EXCLUDED.brand,`,
        `  sizes=EXCLUDED.sizes, colors=EXCLUDED.colors, color_variants=EXCLUDED.color_variants,`,
        `  size_inventory=EXCLUDED.size_inventory, images=EXCLUDED.images,`,
        `  stock_quantity=EXCLUDED.stock_quantity, is_featured=EXCLUDED.is_featured,`,
        `  is_new_arrival=EXCLUDED.is_new_arrival, is_best_seller=EXCLUDED.is_best_seller,`,
        `  main_image=EXCLUDED.main_image, video_url=EXCLUDED.video_url;`,
        ``,
      );
    }

    lines.push(
      `-- Fix auto-increment so new products continue from the right ID:`,
      `SELECT setval('products_id_seq', COALESCE((SELECT MAX(id) FROM products), 1));`,
    );

    const filename = `lucerne-products-backup-${new Date().toISOString().slice(0, 10)}.sql`;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(lines.join("\n"));
  });

  app.post("/api/admin/products/bulk-import", uploadExcel.single("file"), async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return failureResponse(res, 401, "Unauthorized");
    }
    if (!req.file) return failureResponse(res, 400, "No file uploaded");

    const cellText = (value: any): string => {
      if (value === null || value === undefined) return "";
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "object") {
        if (typeof value.text === "string") return value.text;
        if (typeof value.result !== "undefined") return String(value.result ?? "");
        if (Array.isArray(value.richText)) return value.richText.map((part: any) => part.text || "").join("");
      }
      return String(value);
    };
    const parseJson = <T,>(value: any, fallback: T): T => {
      const text = cellText(value).trim();
      if (!text) return fallback;
      try { return JSON.parse(text) as T; } catch { return fallback; }
    };
    const parseDecimal = (value: any): string | null => {
      const text = cellText(value).trim();
      if (!text || text === "-") return null;
      const number = parseFloat(text.replace(/[^\d.-]/g, ""));
      return Number.isFinite(number) ? number.toFixed(2) : null;
    };
    const yesNo = (value: any) =>
      ["yes", "true", "1", "نعم"].includes(cellText(value).toLowerCase().trim());
    const csv = (value: any): string[] =>
      cellText(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    const uniqueStrings = (values: any[], excluded: string[] = []) => {
      const excludedSet = new Set(excluded.filter(Boolean));
      return Array.from(new Set(values.map((value) => cellText(value).trim()).filter((value) => value && !excludedSet.has(value))));
    };

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) return res.status(400).json({ message: "The Excel file has no worksheet" });

      const headers = (worksheet.getRow(1).values as any[])
        .slice(1)
        .map((value) => cellText(value).trim());
      const rows: Record<string, any>[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = (row.values as any[]).slice(1);
        const record: Record<string, any> = {};
        headers.forEach((header, index) => {
          if (header) record[header] = values[index] ?? "";
        });
        if (Object.values(record).some((value) => cellText(value).trim() !== "")) rows.push(record);
      });

      const results: { created: number; updated: number; errors: string[] } = {
        created: 0,
        updated: 0,
        errors: [],
      };

      const [categoryRows, subcategoryRows] = await Promise.all([
        db.execute(sql`SELECT id FROM categories`),
        db.execute(sql`SELECT id FROM subcategories`),
      ]);
      const validCategoryIds = new Set((categoryRows.rows as any[]).map((row: any) => Number(row.id)));
      const validSubcategoryIds = new Set((subcategoryRows.rows as any[]).map((row: any) => Number(row.id)));
      const defaultCategoryId = validCategoryIds.size > 0 ? [...validCategoryIds][0] : null;

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const rowNumber = index + 2;
        try {
          const name = cellText(row.name).trim();
          if (!name || name.startsWith("اسم المنتج")) continue;

          const exportedId = parseInt(cellText(row.ID ?? row.id ?? row.Id), 10) || null;
          const priceNumber = parseFloat(cellText(row.price).replace(/[^\d.-]/g, ""));
          if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
            results.errors.push(`صف ${rowNumber}: السعر غير صحيح`);
            continue;
          }

          const rawCategoryId = parseInt(cellText(row.category_id), 10) || null;
          const categoryId = rawCategoryId && validCategoryIds.has(rawCategoryId)
            ? rawCategoryId
            : defaultCategoryId;
          const rawSubcategoryId = parseInt(cellText(row.subcategory_id), 10) || null;
          const subcategoryId = rawSubcategoryId && validSubcategoryIds.has(rawSubcategoryId)
            ? rawSubcategoryId
            : null;
          const subcategoryIds = parseJson<any[]>(row.subcategory_ids_json, [])
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && validSubcategoryIds.has(value));
          if (subcategoryId && !subcategoryIds.includes(subcategoryId)) subcategoryIds.unshift(subcategoryId);

          const sizesJson = parseJson<any[]>(row.sizes_json, []);
          let sizes = uniqueStrings(sizesJson.length > 0 ? sizesJson : csv(row.sizes));
          const colorsJson = parseJson<any[]>(row.colors_json, []);
          let colors = uniqueStrings(colorsJson.length > 0 ? colorsJson : csv(row.colors));
          let sizeInventory = parseJson<Record<string, number>>(row.size_inventory_json, {});
          if (!sizeInventory || typeof sizeInventory !== "object" || Array.isArray(sizeInventory)) sizeInventory = {};
          sizeInventory = Object.fromEntries(
            Object.entries(sizeInventory).map(([size, quantity]) => [size, Math.max(0, Number(quantity) || 0)]),
          );

          let mainImage = cellText(row.main_image_url ?? row.main_image).trim();
          let images = uniqueStrings(parseJson<any[]>(row.images_json ?? row.images, []), mainImage ? [mainImage] : []);
          let colorVariants = parseJson<any[]>(row.color_variants_json, []);

          if (!Array.isArray(colorVariants) || colorVariants.length === 0) {
            const colorCodes = csv(row.color_codes);
            const colorInventoryText = cellText(row.color_inventory).trim();
            const parsedColorInventory: Record<string, Record<string, number>> = {};
            if (colorInventoryText && colors.length > 0) {
              for (const part of colorInventoryText.split("|")) {
                const separatorIndex = part.indexOf(":");
                if (separatorIndex < 0) continue;
                const colorName = part.slice(0, separatorIndex).trim();
                const inventory: Record<string, number> = {};
                for (const pair of part.slice(separatorIndex + 1).split(",")) {
                  const equalIndex = pair.indexOf("=");
                  if (equalIndex < 0) continue;
                  const size = pair.slice(0, equalIndex).trim();
                  const quantity = Math.max(0, parseInt(pair.slice(equalIndex + 1), 10) || 0);
                  if (size) inventory[size] = quantity;
                }
                if (colorName) parsedColorInventory[colorName] = inventory;
              }
            }

            const stockQuantity = Math.max(0, parseInt(cellText(row.stock_quantity), 10) || 0);
            if (colors.length > 0) {
              colorVariants = colors.map((colorName, colorIndex) => {
                let inventory = parsedColorInventory[colorName] || {};
                if (Object.keys(inventory).length === 0 && sizes.length > 0) {
                  const perColor = Math.floor(stockQuantity / colors.length);
                  const perSize = Math.floor(perColor / sizes.length);
                  inventory = Object.fromEntries(sizes.map((size) => [size, perSize]));
                }
                return {
                  name: colorName,
                  colorCode: colorCodes[colorIndex] || "#000000",
                  mainImage,
                  images: colorIndex === 0 ? images : [],
                  sizes,
                  sizeInventory: inventory,
                  media: [
                    ...(mainImage ? [{ type: "image", url: mainImage, isPrimary: true }] : []),
                    ...(colorIndex === 0 ? images.map((url) => ({ type: "image", url })) : []),
                  ],
                };
              });
            }
          }

          if (Array.isArray(colorVariants) && colorVariants.length > 0) {
            if (!mainImage) mainImage = cellText(colorVariants[0]?.mainImage).trim();
            if (sizes.length === 0) {
              sizes = uniqueStrings(colorVariants.flatMap((variant: any) => Array.isArray(variant?.sizes) ? variant.sizes : []));
            }
            if (colors.length === 0) {
              colors = uniqueStrings(colorVariants.map((variant: any) => variant?.name));
            }
            if (Object.keys(sizeInventory).length === 0) {
              for (const variant of colorVariants) {
                for (const [size, quantity] of Object.entries(variant?.sizeInventory || {})) {
                  sizeInventory[size] = (sizeInventory[size] || 0) + Math.max(0, Number(quantity) || 0);
                }
              }
            }
          }

          const existingProduct = exportedId ? await storage.getProduct(exportedId) : undefined;
          if (!mainImage && existingProduct) mainImage = existingProduct.mainImage;
          const rowVideoUrl = cellText(row.video_url).trim();
          if ((!mainImage || mainImage.startsWith("رابط") || mainImage.includes("YOUR_URL")) && !rowVideoUrl) {
            results.errors.push(`صف ${rowNumber}: رابط الصورة أو الفيديو مطلوب`);
            continue;
          }

          const parsedStock = parseInt(cellText(row.stock_quantity), 10);
          const calculatedStock = Object.values(sizeInventory).reduce((sum, quantity) => sum + Math.max(0, Number(quantity) || 0), 0);
          const stockQuantity = Number.isFinite(parsedStock) && parsedStock >= 0 ? parsedStock : calculatedStock;

          const productData: any = {
            name,
            description: cellText(row.description).trim() || name,
            price: priceNumber.toFixed(2),
            costPrice: parseDecimal(row.cost_price),
            discountPrice: parseDecimal(row.discount_price),
            categoryId,
            subcategoryId,
            subcategoryIds,
            barcode: cellText(row.barcode).trim() || null,
            brand: cellText(row.brand).trim() || null,
            sizes,
            colors,
            sizeInventory,
            colorVariants: Array.isArray(colorVariants) ? colorVariants : [],
            stockQuantity,
            isFeatured: yesNo(row.is_featured),
            isNewArrival: yesNo(row.is_new_arrival),
            isBestSeller: yesNo(row.is_best_seller),
            mainImage,
            images,
            videoUrl: rowVideoUrl || null,
          };

          const cleanProductData = await normalizeProductPayload(productData, { partial: false });
          if (existingProduct) {
            await storage.updateProduct(existingProduct.id, cleanProductData);
            results.updated++;
          } else {
            await storage.createProduct(cleanProductData);
            results.created++;
          }

          // Warm main image
          warmCloudinaryCache(cleanProductData.mainImage).catch(() => {});
          // Warm product-level side photos
          for (const url of cleanProductData.images || []) {
            const u = typeof url === "string" ? url.trim() : "";
            if (u && u !== cleanProductData.mainImage) warmCloudinaryCache(u).catch(() => {});
          }
          // Warm all variant images (main + side photos) and video poster frames
          for (const variant of cleanProductData.colorVariants || []) {
            const variantMain = cellText(variant?.mainImage).trim();
            if (variantMain && variantMain !== cleanProductData.mainImage) warmCloudinaryCache(variantMain).catch(() => {});
            // Side photos stored in variant.images[]
            for (const url of (Array.isArray(variant?.images) ? variant.images : [])) {
              const u = typeof url === "string" ? url.trim() : "";
              if (u && u !== cleanProductData.mainImage && u !== variantMain) warmCloudinaryCache(u).catch(() => {});
            }
            // Media items (images + video poster URLs) stored in variant.media[]
            for (const item of (Array.isArray(variant?.media) ? variant.media : [])) {
              const u = typeof item?.url === "string" ? item.url.trim() : "";
              if (u && item?.type === "image" && u !== cleanProductData.mainImage && u !== variantMain) warmCloudinaryCache(u).catch(() => {});
            }
          }
        } catch (err: any) {
          results.errors.push(`صف ${rowNumber}: ${err?.message || "Unknown error"}`);
        }
      }

      return successResponse(res, results, 200, results);
    } catch (err: any) {
      logProductError("products.bulk-import", err, { userId: (req.user as any)?.id });
      return failureResponse(res, 400, "فشل قراءة الملف: " + (err?.message || "Unknown error"), err);
    }
  });

  // --- Categories ---
  app.get(api.categories.list.path, async (req, res) => {
    try {
      const cats = await storage.getCategories();
      res.json(cats);
    } catch {
      try {
        const { sql } = await import("drizzle-orm");
        const { db } = await import("./db");
        const rows = await (db as any).execute(
          sql`SELECT id, name, name_ar AS "nameAr", slug, image, show_on_home AS "showOnHome" FROM categories ORDER BY id`
        );
        res.json(rows.rows ?? rows);
      } catch (err2: any) {
        res.status(500).json({ message: "Failed to fetch categories", detail: err2?.message });
      }
    }
  });

  app.post("/api/categories", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { name, nameAr, slug, image, showOnHome } = req.body;
      if (!name || !slug) return res.status(400).json({ message: "name and slug are required" });
      const created = await storage.createCategory({ name, nameAr: nameAr || null, slug, image: image || null, showOnHome: showOnHome ?? false });
      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Create failed" });
    }
  });

  app.patch("/api/categories/:id", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const updated = await storage.updateCategory(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.delete("/api/categories/:id", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const success = await storage.deleteCategory(Number(req.params.id));
      if (!success) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Delete failed" });
    }
  });

  // --- Subcategories ---
  app.get("/api/subcategories", async (req, res) => {
    const subs = await storage.getSubcategories();
    res.json(subs);
  });

  app.get("/api/subcategories/category/:categoryId", async (req, res) => {
    const subs = await storage.getSubcategoriesByCategory(Number(req.params.categoryId));
    res.json(subs);
  });

  app.post("/api/subcategories", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const sub = await storage.createSubcategory(req.body);
      res.status(201).json(sub);
    } catch (err) {
      res.status(400).json({ message: "Create failed" });
    }
  });

  app.patch("/api/subcategories/:id", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const updated = await storage.updateSubcategory(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.delete("/api/subcategories/:id", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const success = await storage.deleteSubcategory(Number(req.params.id));
    if (!success) return res.status(404).json({ message: "Not found" });
    res.status(204).send();
  });

  // --- Orders ---
  app.get(api.orders.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    
    // ?own=true forces own-orders-only even for admins (used by Profile page)
    if (user.role === 'admin' && req.query.own !== 'true') {
      const orders = await storage.getOrders();
      res.json(orders);
    } else {
      const orders = await storage.getUserOrders(user.id);
      res.json(orders);
    }
  });

  app.get(api.orders.get.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const orderData = await storage.getOrder(Number(req.params.id));
    
    if (!orderData) return res.status(404).json({ message: "Not found" });
    
    const user = req.user as any;
    if (user.role !== 'admin' && orderData.order.userId !== user.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let payload: typeof orderData & {
      customerEmail?: string | null;
      linkedUserId?: number | null;
    } = orderData;
    if (user.role === "admin") {
      let customer = orderData.order.userId
        ? await storage.getUser(orderData.order.userId)
        : undefined;
      if (!customer && orderData.order.phone) {
        const phone = orderData.order.phone.trim();
        customer =
          (await storage.getUserByPhone(phone)) ||
          (await storage.getUserByPhone(
            phone.startsWith("+") ? phone.slice(1) : `+${phone}`,
          ));
      }
      if (customer) {
        payload = {
          ...orderData,
          customerEmail: customer.email,
          linkedUserId: customer.id,
        };
      }
    }

    res.json(payload);
  });

  function checkStockForItems(items: Array<{productId: number; quantity: number; size?: string | null; color?: string | null}>, products: Map<number, any>): { productId: number; name: string; color?: string | null; size?: string | null; reason: string; available?: number; requested?: number }[] {
    const outOfStock: { productId: number; name: string; color?: string | null; size?: string | null; reason: string; available?: number; requested?: number }[] = [];
    for (const item of items) {
      const product = products.get(item.productId);
      if (!product) {
        outOfStock.push({ productId: item.productId, name: `Product #${item.productId}`, color: item.color, size: item.size, reason: "not_found" });
        continue;
      }
      const colorVariants = ((product as any).colorVariants || []) as Array<{name: string; sizes: string[]; sizeInventory: Record<string, number>}>;
      const itemColor = item.color;
      const itemSize = item.size;

      if (colorVariants.length > 0) {
        if (!itemColor) {
          outOfStock.push({ productId: item.productId, name: product.name, color: itemColor, size: itemSize, reason: "color_required" });
          continue;
        }
        const variant = colorVariants.find(v => v.name === itemColor);
        if (!variant) {
          outOfStock.push({ productId: item.productId, name: product.name, color: itemColor, size: itemSize, reason: "color_unavailable" });
          continue;
        }
        const vInv = variant.sizeInventory || {};
        const hasSizes = Object.keys(vInv).length > 0;
        if (hasSizes) {
          if (!itemSize) {
            outOfStock.push({ productId: item.productId, name: product.name, color: itemColor, size: itemSize, reason: "size_required" });
            continue;
          }
          if (vInv[itemSize] === undefined) {
            outOfStock.push({ productId: item.productId, name: product.name, color: itemColor, size: itemSize, reason: "size_unavailable" });
            continue;
          }
          const avail = vInv[itemSize];
          if (avail < item.quantity) {
            outOfStock.push({
              productId: item.productId, name: product.name, color: itemColor, size: itemSize,
              reason: avail === 0 ? "sold_out" : "insufficient_stock",
              available: avail, requested: item.quantity
            });
            continue;
          }
        } else {
          const variantTotal = Object.values(vInv).reduce((s, q) => s + q, 0);
          if (variantTotal < item.quantity) {
            outOfStock.push({
              productId: item.productId, name: product.name, color: itemColor, size: itemSize,
              reason: variantTotal === 0 ? "sold_out" : "insufficient_stock",
              available: variantTotal, requested: item.quantity
            });
            continue;
          }
        }
      } else {
        const inv = (product.sizeInventory as Record<string, number>) || {};
        if (itemSize && Object.keys(inv).length > 0) {
          if (inv[itemSize] === undefined) {
            outOfStock.push({ productId: item.productId, name: product.name, color: itemColor, size: itemSize, reason: "size_unavailable" });
            continue;
          }
          const avail = inv[itemSize];
          if (avail < item.quantity) {
            outOfStock.push({
              productId: item.productId, name: product.name, color: itemColor, size: itemSize,
              reason: avail === 0 ? "sold_out" : "insufficient_stock",
              available: avail, requested: item.quantity
            });
            continue;
          }
        } else {
          const avail = product.stockQuantity;
          if (avail < item.quantity) {
            outOfStock.push({
              productId: item.productId, name: product.name, color: itemColor, size: itemSize,
              reason: avail === 0 ? "sold_out" : "insufficient_stock",
              available: avail, requested: item.quantity
            });
            continue;
          }
        }
      }
    }
    return outOfStock;
  }

  app.post("/api/cart/validate", async (req, res) => {
    try {
      const items = req.body.items as Array<{productId: number; quantity: number; size?: string | null; color?: string | null}>;
      if (!items || !Array.isArray(items)) return res.status(400).json({ message: "Invalid items" });

      const products = new Map<number, any>();
      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (product) products.set(item.productId, product);
      }

      const outOfStock = checkStockForItems(items, products);
      res.json({ valid: outOfStock.length === 0, outOfStock });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Validation error" });
    }
  });

  app.post(api.orders.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "يجب تسجيل الدخول لإتمام الطلب" });
    try {
      const input = api.orders.create.input.parse(req.body);
      const userId = (req.user as any).id;

      const products = new Map<number, any>();
      for (const item of input.items) {
        const product = await storage.getProduct(item.productId);
        if (product) products.set(item.productId, product);
      }

      const outOfStock = checkStockForItems(input.items, products);
      if (outOfStock.length > 0) {
        return res.status(400).json({
          message: "Some items are sold out",
          code: "OUT_OF_STOCK",
          outOfStock,
        });
      }
      
      const region = (input.order as any).shippingRegion as string | undefined;
      const shippingRates = await getShippingRates();
      if (!region || shippingRates[region] === undefined) {
        return res.status(400).json({ message: "Invalid or missing shipping region" });
      }
      const serverShippingCost = shippingRates[region];

      const verifiedItems: { productId: number; quantity: number; price: string; size?: string | null; color?: string | null }[] = [];
      let subtotal = 0;
      for (const item of input.items) {
        const product = await storage.getProduct(item.productId);
        if (!product) continue;
        const dbPrice = product.discountPrice ? Number(product.discountPrice) : Number(product.price);
        verifiedItems.push({ ...item, price: dbPrice.toString() });
        subtotal += dbPrice * item.quantity;
      }

      let discountAmount = 0;
      let appliedDiscountCode: string | null = null;
      const clientDiscountCode = (input.order as any).discountCode as string | undefined;
      if (clientDiscountCode) {
        const discount = await storage.validateDiscountCode(clientDiscountCode);
        if (discount && discount.maxUsesPerUser) {
          const userUses = await storage.getUserDiscountCodeUseCount(userId, discount.code);
          if (userUses >= discount.maxUsesPerUser) {
            return res.status(400).json({ message: "already_used_by_user" });
          }
        }
        if (discount) {
          let discountableSubtotal = subtotal;
          const hasCatFilter = discount.categoryIds && discount.categoryIds.length > 0;
          const hasSubCatFilter = discount.subcategoryIds && discount.subcategoryIds.length > 0;
          if (hasCatFilter || hasSubCatFilter) {
            discountableSubtotal = 0;
            for (const item of input.items) {
              const product = await storage.getProduct(item.productId);
              if (!product) continue;
              const catMatch = hasCatFilter && discount.categoryIds!.includes(product.categoryId);
              const productSubIds: number[] = Array.isArray((product as any).subcategoryIds) ? (product as any).subcategoryIds : [];
              const allSubIds = product.subcategoryId != null
                ? Array.from(new Set([...productSubIds, product.subcategoryId]))
                : productSubIds;
              const subCatMatch = hasSubCatFilter && allSubIds.some((id) => discount.subcategoryIds!.includes(id));
              if (catMatch || subCatMatch) {
                const price = product.discountPrice ? Number(product.discountPrice) : Number(product.price);
                discountableSubtotal += price * item.quantity;
              }
            }
          }
          discountAmount = Math.round(discountableSubtotal * (discount.discountPercent / 100) * 100) / 100;
          appliedDiscountCode = discount.code;
          await storage.useDiscountCode(discount.code);
        }
      }

      // Loyalty credit usage (optional)
      const requestedCredit = Math.max(0, Number((req.body as any)?.useCredit) || 0);
      let creditUsed = 0;
      if (requestedCredit > 0) {
        const userRecord = await storage.getUser(userId);
        const availableCredit = Number((userRecord as any)?.credit || 0);
        const maxApplicable = Math.max(0, subtotal - discountAmount);
        creditUsed = Math.min(requestedCredit, availableCredit, maxApplicable);
        creditUsed = Math.round(creditUsed * 100) / 100;
      }

      const totalAmount = subtotal - discountAmount - creditUsed + serverShippingCost;

      const order = await storage.createOrder({
        ...input.order,
        userId,
        totalAmount: totalAmount.toString(),
        shippingCost: serverShippingCost.toString(),
        shippingRegion: region,
        status: "Pending",
        discountCode: appliedDiscountCode,
        discountAmount: discountAmount > 0 ? discountAmount.toString() : null,
        creditUsed: creditUsed > 0 ? creditUsed.toString() : null,
      }, verifiedItems);

      if (creditUsed > 0) {
        await storage.deductUserCredit(userId, creditUsed);
      }

      // Sync checkout info back to user profile (fill empty fields only)
      if (userId) {
        try {
          const userRecord = await storage.getUser(userId);
          if (userRecord) {
            const updates: Record<string, string> = {};
            if (!userRecord.fullName && input.order.fullName) updates.fullName = input.order.fullName;
            if (!userRecord.phone && input.order.phone) updates.phone = input.order.phone;
            if (!userRecord.address && input.order.address) updates.address = input.order.address;
            if (Object.keys(updates).length > 0) await storage.updateUser(userId, updates as any);
          }
        } catch (e) { /* non-critical — don't fail the order */ }
      }

      const itemDetails = verifiedItems.map((item) => {
        return {
          name: `Product #${item.productId}`,
          quantity: item.quantity,
          price: item.price,
          size: item.size,
          color: item.color,
        };
      });
      
      const productNames = await Promise.all(verifiedItems.map(async (item) => {
        const product = await storage.getProduct(item.productId);
        return product?.name || `Product #${item.productId}`;
      }));
      itemDetails.forEach((d, i) => { d.name = productNames[i]; });

      sendOrderNotification({
        orderId: order.id,
        customerName: input.order.fullName,
        phone: input.order.phone,
        address: input.order.address,
        city: input.order.city,
        totalAmount: totalAmount.toFixed(2),
        paymentMethod: input.order.paymentMethod || "Cash on delivery",
        items: itemDetails,
      }).catch(console.error);

      const customerUser = await storage.getUser(userId);
      if (customerUser?.email && !isPlaceholderEmail(customerUser.email)) {
        sendOrderConfirmationToCustomer(customerUser.email, {
          orderId: order.id,
          customerName: input.order.fullName,
          phone: input.order.phone,
          address: input.order.address,
          city: input.order.city,
          totalAmount: totalAmount.toFixed(2),
          shippingCost: serverShippingCost.toString(),
          shippingRegion: region || "",
          paymentMethod: input.order.paymentMethod || "Cash on delivery",
          items: itemDetails,
        }).catch(console.error);
      }
      let checkoutWhatsAppEnabled = true;
      try {
        checkoutWhatsAppEnabled = (await storage.getSiteSetting("checkout_whatsapp_enabled")) !== "false";
      } catch (e) {
        console.error("[order] failed to read checkout WhatsApp setting:", e);
      }
      if (input.order.phone && checkoutWhatsAppEnabled) {
        sendOrderConfirmationWA(input.order.phone, {
          customerName: input.order.fullName,
          orderId: order.id,
          totalAmount: totalAmount.toFixed(2),
          items: itemDetails.map(i => ({ name: i.name, quantity: i.quantity })),
        }).catch(console.error);
      }
      
      res.status(201).json(order);
    } catch (err: any) {
      console.error("[POST /api/orders] error:", err);
      const msg: string = err?.message || "";
      if (msg.startsWith("STOCK_ERROR:")) {
        return res.status(409).json({
          message: msg.replace("STOCK_ERROR:", "").trim(),
          code: "OUT_OF_STOCK",
        });
      }
      res.status(400).json({ message: msg || "Validation error" });
    }
  });

  // Helper: create order status notification for customer
  async function notifyOrderStatus(order: any, status: string) {
    if (!order?.userId) return;
    const notifyStatuses: Record<string, [string, string]> = {
      Processing: ["طلبك قيد المعالجة الآن", "Your order is now being processed"],
      Shipped:    ["طلبك في الطريق إليك 🚚", "Your order is on the way 🚚"],
      Delivered:  ["تم تسليم طلبك بنجاح ✓", "Your order has been delivered ✓"],
      Cancelled:  ["تم إلغاء طلبك", "Your order has been cancelled"],
    };
    const msgs = notifyStatuses[status];
    if (!msgs) return;
    const orderRef = `#${String(order.id).padStart(6, "0")}`;
    await storage.createNotification({
      userId: order.userId,
      type: `order_${status.toLowerCase()}`,
      message: `Order ${orderRef}: ${msgs[1]}`,
      messageAr: `الطلب ${orderRef}: ${msgs[0]}`,
      link: "/profile?tab=orders",
    });
  }

  app.patch(api.orders.updateStatus.path, async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.orders.updateStatus.input.parse(req.body);
      const order = await storage.updateOrderStatus(Number(req.params.id), input.status);
      if (!order) return res.status(404).json({ message: "Not found" });
      await notifyOrderStatus(order, input.status);
      res.json(order);
    } catch (err) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  // ── Admin order item editing — add, replace, or remove products/colors on
  // an already-placed order. Restricted to admins; keeps stock and the
  // order's totalAmount in sync with every change. ──────────────────────────
  app.post("/api/admin/orders/:id/items", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const body = z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1),
        size: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
      }).parse(req.body);
      const result = await storage.addOrderItem(Number(req.params.id), body);
      res.json(result);
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg === "ORDER_NOT_FOUND") return res.status(404).json({ message: "Order not found" });
      if (msg === "PRODUCT_NOT_FOUND") return res.status(404).json({ message: "Product not found" });
      console.error("[admin-order-items] add failed:", err);
      res.status(400).json({ message: msg || "Failed to add item" });
    }
  });

  app.patch("/api/admin/orders/:id/items/:itemId", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const body = z.object({
        productId: z.number().int().positive().optional(),
        quantity: z.number().int().min(1).optional(),
        size: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
      }).parse(req.body);
      const result = await storage.updateOrderItem(Number(req.params.id), Number(req.params.itemId), body);
      res.json(result);
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg === "ORDER_ITEM_NOT_FOUND") return res.status(404).json({ message: "Order item not found" });
      if (msg === "PRODUCT_NOT_FOUND") return res.status(404).json({ message: "Product not found" });
      console.error("[admin-order-items] update failed:", err);
      res.status(400).json({ message: msg || "Failed to update item" });
    }
  });

  app.delete("/api/admin/orders/:id/items/:itemId", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const result = await storage.removeOrderItem(Number(req.params.id), Number(req.params.itemId));
      res.json(result);
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg === "ORDER_ITEM_NOT_FOUND") return res.status(404).json({ message: "Order item not found" });
      if (msg === "CANNOT_REMOVE_LAST_ITEM") return res.status(400).json({ message: "cannot_remove_last_item" });
      console.error("[admin-order-items] remove failed:", err);
      res.status(400).json({ message: msg || "Failed to remove item" });
    }
  });

  app.patch("/api/orders/bulk-status", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { ids, status } = req.body as { ids: number[]; status: string };
      if (!ids || !Array.isArray(ids) || ids.length === 0 || !status) {
        return res.status(400).json({ message: "Invalid input" });
      }
      const results = await Promise.all(
        ids.map(id => storage.updateOrderStatus(id, status))
      );
      await Promise.all(results.filter(Boolean).map(order => notifyOrderStatus(order, status)));
      res.json({ updated: results.filter(Boolean).length });
    } catch (err) {
      res.status(400).json({ message: "Failed to update orders" });
    }
  });

  app.delete("/api/orders/bulk", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { ids } = req.body as { ids: number[] };
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Invalid input" });
      }
      const deleted = await storage.deleteOrders(ids);
      res.json({ deleted });
    } catch (err) {
      console.error("[orders] bulk delete failed:", err);
      res.status(400).json({ message: "Failed to delete orders" });
    }
  });

  app.get("/api/admin/users/:id/orders", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const userId = Number(req.params.id);
    const userOrders = await storage.getUserOrders(userId);
    res.json(userOrders);
  });

  // --- Admin Stats ---
  app.get(api.stats.admin.path, async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const stats = await storage.getStats();
    res.json(stats);
  });

  // Low-stock products list
  app.get("/api/admin/low-stock", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const allProducts = await storage.getProducts();
    const lowStock = allProducts
      .filter(p => p.stockQuantity <= 2)
      .sort((a, b) => a.stockQuantity - b.stockQuantity)
      .map(p => ({
        id: p.id,
        name: p.name,
        stockQuantity: p.stockQuantity,
        mainImage: p.mainImage,
        price: p.price,
        categoryId: p.categoryId,
      }));
    res.json(lowStock);
  });

  // Bulk discount on low-stock products
  app.patch("/api/admin/products/bulk-discount", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return failureResponse(res, 401, "Unauthorized");
    }
    try {
      const { ids, discountPercent } = req.body as { ids: number[]; discountPercent: number };
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return failureResponse(res, 400, "No product IDs provided");
      }
      if (typeof discountPercent !== "number" || discountPercent <= 0 || discountPercent >= 100) {
        return failureResponse(res, 400, "Discount percent must be between 1 and 99");
      }
      let updated = 0;
      let replacedExisting = 0;
      for (const id of ids.map(Number).filter((value) => Number.isInteger(value) && value > 0)) {
        const product = await storage.getProduct(id);
        if (!product) continue;

        // Always calculate from the ORIGINAL product price, never from a previous
        // discount price. Writing the single discountPrice field replaces any
        // existing sale/discount, so discounts can never stack on each other.
        const basePrice = parseFloat(product.price);
        if (!Number.isFinite(basePrice) || basePrice <= 0) continue;
        if (product.discountPrice !== null && product.discountPrice !== undefined) {
          replacedExisting++;
        }
        const discountPrice = (basePrice * (1 - discountPercent / 100)).toFixed(2);
        await storage.updateProduct(id, { discountPrice } as any);
        updated++;
      }
      return successResponse(res, { updated, replacedExisting }, 200, { updated, replacedExisting });
    } catch (err: any) {
      logProductError("products.bulk-discount", err, { payload: req.body, userId: (req.user as any)?.id });
      return failureResponse(res, 500, err?.message || "Failed to apply discount", err);
    }
  });

  // Remove discount from products
  app.patch("/api/admin/products/remove-discount", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return failureResponse(res, 401, "Unauthorized");
    }
    try {
      const { ids } = req.body as { ids: number[] };
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return failureResponse(res, 400, "No product IDs provided");
      }
      let updated = 0;
      for (const id of ids.map(Number).filter((value) => Number.isInteger(value) && value > 0)) {
        const product = await storage.getProduct(id);
        if (!product) continue;
        await storage.updateProduct(id, { discountPrice: null } as any);
        updated++;
      }
      return successResponse(res, { updated }, 200, { updated });
    } catch (err: any) {
      logProductError("products.remove-discount", err, { payload: req.body, userId: (req.user as any)?.id });
      return failureResponse(res, 500, err?.message || "Failed to remove discount", err);
    }
  });

  // --- Admin User Management ---
  app.get("/api/admin/users", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const allUsers = await storage.getAllUsers();
    const safeUsers = allUsers.map(({ password, verificationCode, ...u }) => u);
    res.json(safeUsers);
  });

  app.patch("/api/admin/users/:id", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const id = Number(req.params.id);
    const currentUser = req.user as any;
    if (currentUser.id === id && req.body.isBlocked === true) {
      return res.status(400).json({ message: "Cannot block your own account" });
    }
    const schema = z.object({
      isBlocked: z.boolean().optional(),
      role: z.enum(["admin", "customer", "employee"]).optional(),
    });
    const input = schema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ message: "Validation error" });
    const updated = await storage.updateUser(id, input.data as any);
    if (!updated) return res.status(404).json({ message: "User not found" });
    // Blocking must take effect immediately, not just on the user's next
    // login attempt — kill any session they're currently browsing with.
    if (input.data.isBlocked === true) {
      await destroyUserSessions(id);
    }
    const { password, verificationCode, ...safeUser } = updated;
    res.json(safeUser);
  });

  app.delete("/api/admin/users/:id", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const id = Number(req.params.id);
    const currentUser = req.user as any;
    if (currentUser.id === id) {
      return res.status(400).json({ message: "Cannot delete your own account" });
    }
    const deleted = await storage.deleteUser(id);
    if (!deleted) return res.status(404).json({ message: "User not found" });
    // Deleting must also kick the user off the site immediately.
    await destroyUserSessions(id);
    res.json({ success: true });
  });

  app.patch("/api/admin/users/bulk", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const currentUser = req.user as any;
    const schema = z.object({
      ids: z.array(z.number()),
      action: z.enum(["block", "unblock", "make-admin", "make-customer"]),
    });
    const input = schema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ message: "Validation error" });
    const { ids, action } = input.data;
    const safeIds = ids.filter(id => id !== currentUser.id);
    if (safeIds.length === 0) return res.status(400).json({ message: "Cannot modify your own account" });
    const update =
      action === "block" ? { isBlocked: true } :
      action === "unblock" ? { isBlocked: false } :
      action === "make-admin" ? { role: "admin" } :
      { role: "customer" };
    await Promise.all(safeIds.map(id => storage.updateUser(id, update as any)));
    if (action === "block") {
      await Promise.all(safeIds.map(id => destroyUserSessions(id)));
    }
    res.json({ updated: safeIds.length });
  });

  app.delete("/api/admin/users/bulk", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const currentUser = req.user as any;
    const schema = z.object({ ids: z.array(z.number()) });
    const input = schema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ message: "Validation error" });
    const safeIds = input.data.ids.filter(id => id !== currentUser.id);
    if (safeIds.length === 0) return res.status(400).json({ message: "Cannot delete your own account" });
    await Promise.all(safeIds.map(id => storage.deleteUser(id)));
    await Promise.all(safeIds.map(id => destroyUserSessions(id)));
    res.json({ deleted: safeIds.length });
  });

  // --- Reviews ---
  app.get(api.reviews.list.path, async (req, res) => {
    const productId = Number(req.params.productId);
    const reviews = await storage.getReviews(productId);
    res.json(reviews);
  });

  app.post(api.reviews.create.path, async (req, res) => {
    try {
      const input = api.reviews.create.input.parse(req.body);
      const review = await storage.createReview(input);
      res.status(201).json(review);
    } catch (err) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  // --- Wishlist ---
  app.get(api.wishlist.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const items = await storage.getWishlist((req.user as any).id);
    res.json(items);
  });

  app.get("/api/wishlist/products", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const items = await storage.getWishlistWithProducts((req.user as any).id);
    res.json(items);
  });

  app.post(api.wishlist.add.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const input = api.wishlist.add.input.parse(req.body);
      const item = await storage.addToWishlist((req.user as any).id, input.productId, input.color);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.delete(api.wishlist.remove.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const success = await storage.removeFromWishlist(Number(req.params.id));
    if (!success) return res.status(404).json({ message: "Not found" });
    res.status(204).send();
  });

  // --- Cart (server-persisted for logged-in users) ---
  const cartItemSchema = z.object({
    productId: z.number(),
    quantity: z.number().min(1).default(1),
    size: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
  });

  app.get("/api/cart", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const items = await storage.getCartItems((req.user as any).id);
    res.json(items);
  });

  app.post("/api/cart", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { productId, quantity, size, color } = cartItemSchema.parse(req.body);
      await storage.upsertCartItem((req.user as any).id, productId, quantity, size ?? null, color ?? null);
      const items = await storage.getCartItems((req.user as any).id);
      res.json(items);
    } catch (err) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.put("/api/cart/item", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { productId, quantity, size, color } = cartItemSchema.parse(req.body);
      await storage.updateCartItemQty((req.user as any).id, productId, quantity, size ?? null, color ?? null);
      const items = await storage.getCartItems((req.user as any).id);
      res.json(items);
    } catch (err) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.delete("/api/cart/item", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { productId, size, color } = z.object({
        productId: z.number(),
        size: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
      }).parse(req.body);
      await storage.removeCartItem((req.user as any).id, productId, size ?? null, color ?? null);
      const items = await storage.getCartItems((req.user as any).id);
      res.json(items);
    } catch (err) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.delete("/api/cart", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    await storage.clearUserCart((req.user as any).id);
    res.json([]);
  });

  app.post("/api/cart/merge", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
      const items = rawItems
        .map((item: any) => ({
          productId: Number(item?.productId),
          quantity: Math.max(1, Number(item?.quantity) || 1),
          size: typeof item?.size === "string" ? item.size : null,
          color: typeof item?.color === "string" ? item.color : null,
        }))
        .filter((item: any) => Number.isInteger(item.productId) && item.productId > 0);

      await storage.mergeGuestCart((req.user as any).id, items);
      const merged = await storage.getCartItems((req.user as any).id);
      res.json(merged);
    } catch (err: any) {
      console.error("[cart/merge] error:", err?.message ?? err);
      res.status(500).json({ message: "Failed to merge cart" });
    }
  });

  // --- Loyalty (points & credit) ---
  app.get("/api/loyalty", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const data = await storage.getUserLoyalty((req.user as any).id);
      res.json({
        points: data.points,
        credit: data.credit,
        pointsPerCredit: 450,
        creditPerConversion: 15,
        nextConversionIn: Math.max(0, 450 - (data.points % 450)),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch loyalty" });
    }
  });

  app.post("/api/loyalty/convert", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const requestedPoints = Number((req.body as any)?.points);
      const pts = Number.isFinite(requestedPoints) && requestedPoints > 0
        ? Math.floor(requestedPoints)
        : undefined;
      const result = await storage.convertUserPoints((req.user as any).id, pts);
      res.json(result);
    } catch (err: any) {
      if (err?.message === "NOT_ENOUGH_POINTS") {
        return res.status(400).json({ message: "NOT_ENOUGH_POINTS" });
      }
      res.status(500).json({ message: err.message || "Failed to convert" });
    }
  });

  // --- Discount Codes ---
  app.post(api.discounts.validate.path, async (req, res) => {
    try {
      const input = api.discounts.validate.input.parse(req.body);
      const discount = await storage.validateDiscountCode(input.code);
      if (!discount) return res.status(404).json({ message: "Invalid or expired code" });
      if (discount.maxUsesPerUser && req.isAuthenticated()) {
        const userId = (req.user as any).id;
        const userUses = await storage.getUserDiscountCodeUseCount(userId, discount.code);
        if (userUses >= discount.maxUsesPerUser) {
          return res.status(400).json({ message: "already_used_by_user" });
        }
      }
      res.json(discount);
    } catch (err) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.get("/api/admin/discount-codes", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    const codes = await storage.getAllDiscountCodes();
    res.json(codes);
  });

  app.post("/api/admin/discount-codes", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    try {
      const { code, discountPercent, maxUses, maxUsesPerUser, expiresAt, isActive, categoryIds, subcategoryIds } = req.body;
      if (!code || !discountPercent) return res.status(400).json({ message: "Code and discount percent are required" });
      if (Number(discountPercent) < 1 || Number(discountPercent) > 100) return res.status(400).json({ message: "Discount percent must be between 1 and 100" });
      if (maxUses && Number(maxUses) < 1) return res.status(400).json({ message: "Max uses must be at least 1" });
      if (maxUsesPerUser && Number(maxUsesPerUser) < 1) return res.status(400).json({ message: "Max uses per user must be at least 1" });
      const created = await storage.createDiscountCode({
        code: code.toUpperCase().trim(),
        discountPercent: Number(discountPercent),
        maxUses: maxUses ? Number(maxUses) : null,
        maxUsesPerUser: maxUsesPerUser ? Number(maxUsesPerUser) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: isActive !== false,
        categoryIds: Array.isArray(categoryIds) && categoryIds.length > 0 ? categoryIds.map(Number) : null,
        subcategoryIds: Array.isArray(subcategoryIds) && subcategoryIds.length > 0 ? subcategoryIds.map(Number) : null,
      });
      res.json(created);
    } catch (err: any) {
      if (err.code === "23505") return res.status(400).json({ message: "Code already exists" });
      res.status(400).json({ message: err.message || "Failed to create discount code" });
    }
  });

  app.patch("/api/admin/discount-codes/:id", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    try {
      const id = Number(req.params.id);
      const { code, discountPercent, maxUses, maxUsesPerUser, expiresAt, isActive, categoryIds, subcategoryIds } = req.body;
      if (discountPercent !== undefined && (Number(discountPercent) < 1 || Number(discountPercent) > 100)) return res.status(400).json({ message: "Discount percent must be between 1 and 100" });
      if (maxUses !== undefined && maxUses !== null && Number(maxUses) < 1) return res.status(400).json({ message: "Max uses must be at least 1" });
      if (maxUsesPerUser !== undefined && maxUsesPerUser !== null && Number(maxUsesPerUser) < 1) return res.status(400).json({ message: "Max uses per user must be at least 1" });
      const updates: any = {};
      if (code !== undefined) updates.code = code.toUpperCase().trim();
      if (discountPercent !== undefined) updates.discountPercent = Number(discountPercent);
      if (maxUses !== undefined) updates.maxUses = maxUses ? Number(maxUses) : null;
      if (maxUsesPerUser !== undefined) updates.maxUsesPerUser = maxUsesPerUser ? Number(maxUsesPerUser) : null;
      if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
      if (isActive !== undefined) updates.isActive = isActive;
      if (categoryIds !== undefined) updates.categoryIds = Array.isArray(categoryIds) && categoryIds.length > 0 ? categoryIds.map(Number) : null;
      if (subcategoryIds !== undefined) updates.subcategoryIds = Array.isArray(subcategoryIds) && subcategoryIds.length > 0 ? subcategoryIds.map(Number) : null;
      const updated = await storage.updateDiscountCode(id, updates);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      if (err.code === "23505") return res.status(400).json({ message: "Code already exists" });
      res.status(400).json({ message: err.message || "Failed to update" });
    }
  });

  app.delete("/api/admin/discount-codes/:id", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    const success = await storage.deleteDiscountCode(Number(req.params.id));
    if (!success) return res.status(404).json({ message: "Not found" });
    res.status(204).send();
  });

  // --- Stripe Routes ---
  app.get(api.stripe.publishableKey.path, async (_req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (err) {
      res.json({ publishableKey: null });
    }
  });

  app.post(api.stripe.createCheckout.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "يجب تسجيل الدخول لإتمام الطلب" });
    try {
      const input = api.stripe.createCheckout.input.parse(req.body);
      const userId = (req.user as any).id;

      const verifiedItems: any[] = [];
      const lineItems = await Promise.all(input.items.map(async (item) => {
        const product = await storage.getProduct(item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        const dbPrice = product.discountPrice ? Number(product.discountPrice) : Number(product.price);
        const unitAmount = Math.round(dbPrice * 100);
        const sizePart = item.size ? ` - ${item.size}` : "";
        const colorPart = item.color ? ` (${item.color})` : "";
        verifiedItems.push({ ...item, price: dbPrice.toString() });
        return {
          price_data: {
            currency: "ils",
            product_data: {
              name: `${product.name}${sizePart}${colorPart}`,
              images: product.mainImage ? [product.mainImage.startsWith("http") ? product.mainImage : `https://${req.headers.host}${product.mainImage}`] : [],
            },
            unit_amount: unitAmount,
          },
          quantity: item.quantity,
        };
      }));

      const stripeCheckoutRegion = input.order.shippingRegion;
      const stripeCheckoutRates = await getShippingRates();
      if (!stripeCheckoutRegion || stripeCheckoutRates[stripeCheckoutRegion] === undefined) {
        return res.status(400).json({ message: "Invalid or missing shipping region" });
      }
      const stripeCheckoutShipping = stripeCheckoutRates[stripeCheckoutRegion];

      let stripeDiscountAmount = 0;
      let stripeAppliedCode: string | null = null;
      const stripeClientCode = (input.order as any).discountCode as string | undefined;
      if (stripeClientCode) {
        const discount = await storage.validateDiscountCode(stripeClientCode);
        if (discount && discount.maxUsesPerUser) {
          const userUses = await storage.getUserDiscountCodeUseCount(userId, discount.code);
          if (userUses >= discount.maxUsesPerUser) {
            return res.status(400).json({ message: "already_used_by_user" });
          }
        }
        if (discount) {
          let discountableSubtotal = verifiedItems.reduce((acc: number, i: any) => acc + Number(i.price) * i.quantity, 0);
          const hasCatFilter2 = discount.categoryIds && discount.categoryIds.length > 0;
          const hasSubCatFilter2 = discount.subcategoryIds && discount.subcategoryIds.length > 0;
          if (hasCatFilter2 || hasSubCatFilter2) {
            discountableSubtotal = 0;
            for (const item of input.items) {
              const product = await storage.getProduct(item.productId);
              if (!product) continue;
              const catMatch = hasCatFilter2 && discount.categoryIds!.includes(product.categoryId);
              const productSubIds2: number[] = Array.isArray((product as any).subcategoryIds) ? (product as any).subcategoryIds : [];
              const allSubIds2 = product.subcategoryId != null
                ? Array.from(new Set([...productSubIds2, product.subcategoryId]))
                : productSubIds2;
              const subCatMatch = hasSubCatFilter2 && allSubIds2.some((id) => discount.subcategoryIds!.includes(id));
              if (catMatch || subCatMatch) {
                const price = product.discountPrice ? Number(product.discountPrice) : Number(product.price);
                discountableSubtotal += price * item.quantity;
              }
            }
          }
          stripeDiscountAmount = Math.round(discountableSubtotal * (discount.discountPercent / 100) * 100) / 100;
          stripeAppliedCode = discount.code;
        }
      }

      if (stripeCheckoutShipping > 0) {
        lineItems.push({
          price_data: {
            currency: "ils",
            product_data: {
              name: "Shipping / الشحن",
              images: [],
            },
            unit_amount: Math.round(stripeCheckoutShipping * 100),
          },
          quantity: 1,
        });
      }

      const stripe = await getUncachableStripeClient();
      const baseUrl = `https://${req.headers.host}`;

      const metadata: Record<string, string> = {
        orderData: JSON.stringify({
          ...input.order,
          userId,
          paymentMethod: "Card",
          discountCode: stripeAppliedCode,
          discountAmount: stripeDiscountAmount > 0 ? stripeDiscountAmount : null,
        }),
        itemsData: JSON.stringify(verifiedItems),
      };

      const sessionOptions: any = {
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/checkout`,
        metadata,
      };

      if (stripeDiscountAmount > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: Math.round(stripeDiscountAmount * 100),
          currency: "ils",
          duration: "once",
          name: `Discount ${stripeAppliedCode}`,
        });
        sessionOptions.discounts = [{ coupon: coupon.id }];
      }

      const session = await stripe.checkout.sessions.create(sessionOptions);

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Stripe checkout error:", err);
      res.status(400).json({ message: err.message || "Failed to create checkout session" });
    }
  });

  // --- Lahza Payment Routes ---
  const pendingLahzaOrders = new Map<string, any>();

  app.post("/api/lahza/create-checkout", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "يجب تسجيل الدخول لإتمام الطلب" });
    try {
      const { order, items } = req.body;
      if (!order || !items || !Array.isArray(items)) {
        return res.status(400).json({ message: "Invalid request" });
      }

      const userId = (req.user as any).id;
      const userObj = await storage.getUser(userId);

      const lahzaShippingRates = await getShippingRates();
      if (!order.shippingRegion || lahzaShippingRates[order.shippingRegion] === undefined) {
        return res.status(400).json({ message: "Invalid or missing shipping region" });
      }

      const products = new Map<number, any>();
      const verifiedItems: any[] = [];
      let subtotal = 0;
      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (!product) return res.status(400).json({ message: `Product ${item.productId} not found` });
        products.set(item.productId, product);
        const dbPrice = product.discountPrice ? Number(product.discountPrice) : Number(product.price);
        subtotal += dbPrice * item.quantity;
        verifiedItems.push({ ...item, price: dbPrice.toString() });
      }

      const outOfStock = checkStockForItems(items, products);
      if (outOfStock.length > 0) {
        return res.status(400).json({
          message: "Some items are sold out",
          code: "OUT_OF_STOCK",
          outOfStock,
        });
      }

      let lahzaDiscountAmount = 0;
      let lahzaAppliedCode: string | null = null;
      if (order.discountCode) {
        const dsc = await storage.validateDiscountCode(order.discountCode);
        if (dsc && dsc.maxUsesPerUser) {
          const userUses = await storage.getUserDiscountCodeUseCount(userId, dsc.code);
          if (userUses >= dsc.maxUsesPerUser) {
            return res.status(400).json({ message: "already_used_by_user" });
          }
        }
        if (dsc) {
          lahzaDiscountAmount = Math.round(subtotal * (dsc.discountPercent / 100) * 100) / 100;
          lahzaAppliedCode = dsc.code;
        }
      }

      // Loyalty credit usage (optional)
      const lahzaRequestedCredit = Math.max(0, Number((req.body as any)?.useCredit) || 0);
      let lahzaCreditUsed = 0;
      if (lahzaRequestedCredit > 0) {
        const availableCredit = Number((userObj as any)?.credit || 0);
        const maxApplicable = Math.max(0, subtotal - lahzaDiscountAmount);
        lahzaCreditUsed = Math.min(lahzaRequestedCredit, availableCredit, maxApplicable);
        lahzaCreditUsed = Math.round(lahzaCreditUsed * 100) / 100;
      }

      const shippingCost = lahzaShippingRates[order.shippingRegion];
      const totalAmount = subtotal - lahzaDiscountAmount - lahzaCreditUsed + shippingCost;
      const reference = `LUC-${Date.now()}-${userId}`;
      const baseUrl = `https://${req.headers.host}`;

      const lahzaResult = await initializeLahzaTransaction({
        email: userObj?.email || `user${userId}@lucerneboutique.com`,
        amount: totalAmount,
        reference,
        callback_url: `${baseUrl}/checkout/success?reference=${reference}`,
      });

      pendingLahzaOrders.set(reference, {
        orderData: { ...order, userId, paymentMethod: "Card (Lahza)", discountCode: lahzaAppliedCode, discountAmount: lahzaDiscountAmount > 0 ? lahzaDiscountAmount : null, creditUsed: lahzaCreditUsed > 0 ? lahzaCreditUsed : null },
        items: verifiedItems,
        shippingCost,
        totalAmount,
        userEmail: userObj?.email || "",
        creditUsed: lahzaCreditUsed,
      });

      res.json({ url: lahzaResult.authorization_url, reference });
    } catch (err: any) {
      console.error("Lahza create-checkout error:", err);
      res.status(400).json({ message: err.message || "Failed to create checkout" });
    }
  });

  app.get("/api/lahza/verify", async (req, res) => {
    try {
      const reference = req.query.reference as string;
      if (!reference) return res.status(400).json({ message: "Missing reference" });

      const pending = pendingLahzaOrders.get(reference);
      if (!pending) return res.status(404).json({ message: "Order not found or already processed" });

      const { orderData, items, shippingCost, totalAmount, userEmail, creditUsed } = pending;

      const verification = await verifyLahzaTransaction(reference);
      if (verification.status !== "success") {
        return res.status(400).json({ message: "Payment not completed" });
      }

      if (orderData.discountCode) {
        await storage.useDiscountCode(orderData.discountCode);
      }

      const order = await storage.createOrder({
        fullName: orderData.fullName,
        phone: orderData.phone,
        phone2: orderData.phone2 || null,
        address: orderData.address,
        city: orderData.city,
        notes: orderData.notes || null,
        userId: orderData.userId,
        totalAmount: totalAmount.toFixed(2),
        shippingCost: shippingCost.toString(),
        shippingRegion: orderData.shippingRegion || null,
        status: "Pending",
        paymentMethod: "Card (Lahza)",
        discountCode: orderData.discountCode || null,
        discountAmount: orderData.discountAmount ? orderData.discountAmount.toString() : null,
      }, items);

      pendingLahzaOrders.delete(reference);

      if (creditUsed && creditUsed > 0 && orderData.userId) {
        await storage.deductUserCredit(orderData.userId, creditUsed);
      }

      // Sync checkout info back to user profile (fill empty fields only)
      if (orderData.userId) {
        try {
          const userRecord = await storage.getUser(orderData.userId);
          if (userRecord) {
            const updates: Record<string, string> = {};
            if (!userRecord.fullName && orderData.fullName) updates.fullName = orderData.fullName;
            if (!userRecord.phone && orderData.phone) updates.phone = orderData.phone;
            if (!userRecord.address && orderData.address) updates.address = orderData.address;
            if (Object.keys(updates).length > 0) await storage.updateUser(orderData.userId, updates as any);
          }
        } catch (e) { /* non-critical — don't fail the order */ }
      }

      const itemDetails = await Promise.all(items.map(async (item: any) => {
        const product = await storage.getProduct(item.productId);
        return {
          name: product?.name || `Product #${item.productId}`,
          quantity: item.quantity,
          price: item.price,
          size: item.size,
          color: item.color,
        };
      }));

      sendOrderNotification({
        orderId: order.id,
        customerName: orderData.fullName,
        phone: orderData.phone,
        address: orderData.address,
        city: orderData.city,
        totalAmount: totalAmount.toFixed(2),
        paymentMethod: "Card (Lahza)",
        items: itemDetails,
      }).catch(console.error);

      if (userEmail && !isPlaceholderEmail(userEmail)) {
        sendOrderConfirmationToCustomer(userEmail, {
          orderId: order.id,
          customerName: orderData.fullName,
          phone: orderData.phone,
          address: orderData.address,
          city: orderData.city,
          totalAmount: totalAmount.toFixed(2),
          shippingCost: shippingCost.toString(),
          shippingRegion: orderData.shippingRegion || "",
          paymentMethod: "Card (Lahza)",
          items: itemDetails,
        }).catch(console.error);
      }

      res.json({ order });
    } catch (err: any) {
      console.error("Lahza verify error:", err);
      res.status(500).json({ message: err.message || "Failed to process payment confirmation" });
    }
  });

  const processedStripeSessions = new Set<string>();

  app.get("/api/stripe/checkout-success", async (req, res) => {
    try {
      const sessionId = req.query.session_id as string;
      if (!sessionId) return res.status(400).json({ message: "Missing session_id" });

      if (processedStripeSessions.has(sessionId)) {
        return res.status(409).json({ message: "Session already processed" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== "paid") {
        return res.status(400).json({ message: "Payment not completed" });
      }

      const existingOrders = await storage.getOrders();
      const alreadyCreated = existingOrders.find((o: any) => o.notes && o.notes.includes(`stripe:${sessionId}`));
      if (alreadyCreated) {
        processedStripeSessions.add(sessionId);
        return res.json({ order: alreadyCreated });
      }

      const orderData = JSON.parse(session.metadata?.orderData || "{}");
      const itemsData = JSON.parse(session.metadata?.itemsData || "[]");

      const subtotal = itemsData.reduce((acc: number, item: any) => acc + (Number(item.price) * item.quantity), 0);
      const stripeRegion = orderData.shippingRegion as string | undefined;
      const stripeSuccessRates = await getShippingRates();
      const stripeShippingCost = stripeRegion && stripeSuccessRates[stripeRegion] !== undefined ? stripeSuccessRates[stripeRegion] : 0;
      const stripeOrderDiscount = orderData.discountAmount ? Number(orderData.discountAmount) : 0;
      const totalAmount = subtotal - stripeOrderDiscount + stripeShippingCost;

      if (orderData.discountCode) {
        await storage.useDiscountCode(orderData.discountCode);
      }

      const stripeNotes = orderData.notes ? `${orderData.notes} | stripe:${sessionId}` : `stripe:${sessionId}`;
      const order = await storage.createOrder({
        fullName: orderData.fullName,
        phone: orderData.phone,
        address: orderData.address,
        city: orderData.city,
        notes: stripeNotes,
        userId: orderData.userId,
        totalAmount: totalAmount.toFixed(2),
        shippingCost: stripeShippingCost.toString(),
        shippingRegion: stripeRegion || null,
        status: "Pending",
        paymentMethod: "Card",
        discountCode: orderData.discountCode || null,
        discountAmount: stripeOrderDiscount > 0 ? stripeOrderDiscount.toString() : null,
      }, itemsData);

      processedStripeSessions.add(sessionId);

      const itemDetails = await Promise.all(itemsData.map(async (item: any) => {
        const product = await storage.getProduct(item.productId);
        return {
          name: product?.name || `Product #${item.productId}`,
          quantity: item.quantity,
          price: item.price,
          size: item.size,
          color: item.color,
        };
      }));

      sendOrderNotification({
        orderId: order.id,
        customerName: orderData.fullName,
        phone: orderData.phone,
        address: orderData.address,
        city: orderData.city,
        totalAmount: totalAmount.toFixed(2),
        paymentMethod: "Card (Stripe)",
        items: itemDetails,
      }).catch(console.error);

      if (orderData.userId) {
        const customerUser = await storage.getUser(orderData.userId);
        if (customerUser?.email && !isPlaceholderEmail(customerUser.email)) {
          sendOrderConfirmationToCustomer(customerUser.email, {
            orderId: order.id,
            customerName: orderData.fullName,
            phone: orderData.phone,
            address: orderData.address,
            city: orderData.city,
            totalAmount: totalAmount.toFixed(2),
            shippingCost: stripeShippingCost.toString(),
            shippingRegion: stripeRegion || "",
            paymentMethod: "Card (Stripe)",
            items: itemDetails,
          }).catch(console.error);
        }
      }

      res.json({ order });
    } catch (err: any) {
      console.error("Stripe success handler error:", err);
      res.status(500).json({ message: "Failed to process payment confirmation" });
    }
  });

  // Site Settings (public read, admin write)
  app.get("/api/site-settings", async (_req, res) => {
    try {
      const settings = await storage.getSiteSettings();
      const map: Record<string, string> = {};
      settings.forEach(s => { map[s.key] = s.value; });
      res.json(map);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to get site settings" });
    }
  });

  app.post("/api/site-settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) return res.status(400).json({ message: "key and value are required" });
      const setting = await storage.setSiteSetting(key, value);
      res.json(setting);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to save setting" });
    }
  });

  app.post("/api/site-settings/bulk", async (req, res) => {
    try {
      const updates: Record<string, string> = req.body;
      const results = await Promise.all(
        Object.entries(updates).map(([key, value]) => storage.setSiteSetting(key, value))
      );
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to save settings" });
    }
  });

  // POS routes
  app.get("/api/pos/search-barcode/:barcode", async (req, res) => {
    if (!req.isAuthenticated() || !["admin", "employee"].includes(req.user.role)) return res.status(401).json({ message: "Unauthorized" });
    try {
      const product = await storage.getProductByBarcode(req.params.barcode);
      if (!product) return res.status(404).json({ message: "product_not_found" });
      res.json(product);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Mark/unmark selected shoe invoices as transferred. The server validates
  // that every requested invoice contains a shoe item, so this status cannot
  // accidentally be applied from another report column or a crafted request.
  app.patch("/api/pos/orders/transfer-status", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
      const transferred = req.body?.transferred;
      const cleanIds: number[] = Array.from(
        new Set<number>(ids.map((id: unknown): number => Number(id))),
      ).filter((id: number) => Number.isInteger(id) && id > 0);
      if (cleanIds.length === 0 || typeof transferred !== "boolean") {
        return res.status(400).json({ message: "Valid ids and transferred are required" });
      }

      const [orders, products, categories] = await Promise.all([
        Promise.all(cleanIds.map((id) => storage.getPosOrderById(id))),
        storage.getProducts(),
        storage.getCategories(),
      ]);
      if (orders.some((order) => !order)) return res.status(404).json({ message: "Invoice not found" });

      const shoeCategoryIds = new Set<number>();
      categories.forEach((category: any) => {
        const en = String(category.name || "").toLowerCase();
        const ar = String(category.nameAr || "");
        if (en.includes("shoe") || ar.includes("حذاء") || ar.includes("أحذية") || ar.includes("شوز")) {
          shoeCategoryIds.add(category.id);
        }
      });
      if (shoeCategoryIds.size === 0) shoeCategoryIds.add(4);
      const categoryByProductId = new Map<number, number>();
      products.forEach((product: any) => categoryByProductId.set(product.id, product.categoryId));
      const allAreShoeInvoices = orders.every((order: any) =>
        (order.items || []).some((item: any) => {
          const productId = Number(item.productId ?? item.product_id);
          return shoeCategoryIds.has(categoryByProductId.get(productId) as number);
        }),
      );
      if (!allAreShoeInvoices) {
        return res.status(400).json({ message: "Transfer status is only available for shoe invoices" });
      }

      // Marking as transferred is only valid for invoices that include a
      // card payment: card-only invoices, or split invoices with cardAmount > 0.
      // Unmarking stays permissive so any legacy cash invoice that was marked
      // before this rule can still have the old status removed.
      if (transferred) {
        const allIncludeCardPayment = orders.every((order: any) => {
          const method = String(order.paymentMethod ?? order.payment_method ?? "cash").toLowerCase();
          if (method === "card") return true;
          if (method !== "split") return false;
          const cardAmount = Number(order.cardAmount ?? order.card_amount ?? 0) || 0;
          return cardAmount > 0;
        });
        if (!allIncludeCardPayment) {
          return res.status(400).json({
            message: "Only card or split invoices with a card payment can be marked transferred",
          });
        }
      }

      const updated = await storage.updatePosOrdersTransferred(cleanIds, transferred);
      res.json({ updated: updated.length, orders: updated });
    } catch (err: any) {
      console.error("[pos] update transfer status failed:", err);
      res.status(500).json({ message: err.message || "Failed to update transfer status" });
    }
  });

  app.get("/api/pos/orders/:id", async (req, res) => {
    if (!req.isAuthenticated() || !["admin", "employee"].includes(req.user.role)) return res.status(401).json({ message: "Unauthorized" });
    try {
      const order = await storage.getPosOrderById(parseInt(req.params.id));
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/pos/orders/:id", async (req, res) => {
    if (!req.isAuthenticated() || !["admin", "employee"].includes(req.user.role)) return res.status(401).json({ message: "Unauthorized" });
    try {
      const id = parseInt(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid invoice id" });
      }
      const { paymentMethod, cashAmount, cardAmount } = req.body || {};
      if (paymentMethod !== "cash" && paymentMethod !== "card" && paymentMethod !== "split") {
        return res.status(400).json({ message: "paymentMethod must be 'cash', 'card' or 'split'" });
      }
      const existing = await storage.getPosOrderById(id);
      if (!existing) return res.status(404).json({ message: "Order not found" });

      // Switching TO split (مختلط) needs the admin-supplied cash/card
      // breakdown, and it must add up to the invoice total the same way
      // the checkout split-payment entry is validated.
      let splitAmounts: { cashAmount: number; cardAmount: number } | undefined;
      if (paymentMethod === "split") {
        const cash = Number(cashAmount);
        const card = Number(cardAmount);
        if (!Number.isFinite(cash) || !Number.isFinite(card) || cash < 0 || card < 0) {
          return res.status(400).json({ message: "cashAmount and cardAmount must be valid non-negative numbers" });
        }
        const total = parseFloat(existing.totalAmount);
        if (Math.abs(cash + card - total) > 0.01) {
          return res.status(400).json({ message: "cashAmount and cardAmount must add up to the invoice total" });
        }
        splitAmounts = { cashAmount: cash, cardAmount: card };
      }
      // Split invoices can also be switched to a single cash/card method —
      // updatePosOrderPaymentMethod() moves the full total onto the chosen
      // method and zeroes the other one, so a split invoice converts
      // cleanly the same way a plain cash/card invoice does. The reverse
      // (plain -> split) works the same way using splitAmounts above.
      const updated = await storage.updatePosOrderPaymentMethod(id, paymentMethod, splitAmounts);
      // A cash-only invoice must never keep a previous "Transferred" flag.
      // This also cleans up an invoice if an admin changes it from card/split
      // to cash after it had already been marked transferred.
      if (paymentMethod === "cash") {
        await storage.updatePosOrdersTransferred([id], false);
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/pos/orders", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { ids } = (req.body || {}) as { ids?: unknown };
      if (Array.isArray(ids) && ids.length > 0) {
        const cleanIds = ids
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0);
        if (cleanIds.length === 0) {
          return res.status(400).json({ message: "Invalid invoice IDs" });
        }
        const deleted = await storage.deletePosOrdersByIds(cleanIds);
        return res.json({ deleted });
      }
      const deleted = await storage.deleteAllPosOrders();
      res.json({ deleted });
    } catch (err: any) {
      console.error("[pos] delete orders failed:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/pos/return", async (req, res) => {
    if (!req.isAuthenticated() || !["admin", "employee"].includes(req.user.role)) return res.status(401).json({ message: "Unauthorized" });
    try {
      const {
        orderId,
        items: returnItems,
        mode,
        replacementItems = [],
        override = false,
      } = req.body || {};
      if (!orderId || !returnItems || !Array.isArray(returnItems) || returnItems.length === 0) {
        return res.status(400).json({ message: "Invalid return data" });
      }
      const order = await storage.getPosOrderById(parseInt(orderId));
      if (!order) return res.status(404).json({ message: "Order not found" });

      const isExchange = mode === "exchange";
      const adminOverride = isExchange && override === true && req.user.role === "admin";
      const exchangeHistory = Array.isArray((order as any).exchangeHistory)
        ? [...(order as any).exchangeHistory]
        : [];

      // Exchange-specific protection lives on the server too, so an employee
      // cannot bypass the POS UI by crafting a request manually. Admins still
      // have a deliberate exception button, but the exception flag is accepted
      // only when the authenticated account is actually an admin.
      if (isExchange) {
        const note = String((order as any).note || "");
        const isExchangeInvoice = note.includes("فاتورة تبديل") || note.includes("EXCHANGE INVOICE");
        const createdAt = new Date((order as any).createdAt || (order as any).created_at || "");
        const isExpired = Number.isFinite(createdAt.getTime()) && Date.now() - createdAt.getTime() > 2 * 86400000;

        if (isExchangeInvoice && !adminOverride) {
          return res.status(409).json({
            message: "exchange_invoice_not_exchangeable",
            exchangeHistory,
          });
        }
        if (isExpired && !adminOverride) {
          return res.status(409).json({
            message: "exchange_window_expired",
            exchangeHistory,
          });
        }

        const makeKey = (productId: unknown, size: unknown, color: unknown) =>
          `${Number(productId)}|${String(size || "")}|${String(color || "")}`;

        const originalQtyByVariant = new Map<string, number>();
        for (const item of ((order as any).items || [])) {
          const key = makeKey(item.productId ?? item.product_id, item.size, item.color);
          originalQtyByVariant.set(key, (originalQtyByVariant.get(key) || 0) + Math.max(0, Number(item.quantity) || 0));
        }

        const previouslyExchangedByVariant = new Map<string, number>();
        for (const event of exchangeHistory) {
          for (const item of (Array.isArray(event?.returnedItems) ? event.returnedItems : [])) {
            const key = makeKey(item.productId ?? item.product_id, item.size, item.color);
            previouslyExchangedByVariant.set(
              key,
              (previouslyExchangedByVariant.get(key) || 0) + Math.max(0, Number(item.quantity) || 0),
            );
          }
        }

        const requestedByVariant = new Map<string, number>();
        for (const item of returnItems) {
          const quantity = Number(item.quantity);
          if (!Number.isInteger(quantity) || quantity <= 0) {
            return res.status(400).json({ message: "Invalid exchange quantity" });
          }
          const key = makeKey(item.productId, item.size, item.color);
          requestedByVariant.set(key, (requestedByVariant.get(key) || 0) + quantity);
        }

        for (const [key, requestedQty] of requestedByVariant) {
          const originalQty = originalQtyByVariant.get(key) || 0;
          if (originalQty <= 0 || requestedQty > originalQty) {
            return res.status(409).json({
              message: "exchange_quantity_exceeds_invoice",
              allowedQuantity: originalQty,
            });
          }
          const alreadyExchanged = previouslyExchangedByVariant.get(key) || 0;
          // Ownership/inventory integrity is not a policy exception: once a
          // quantity was returned in an earlier exchange, it is back in the
          // store and no longer with the customer. Even an admin override may
          // bypass date/category/exchange-invoice policy, but may never
          // re-exchange the same already-returned physical quantity.
          const allowedQty = Math.max(0, originalQty - alreadyExchanged);
          if (requestedQty > allowedQty) {
            return res.status(409).json({
              message: "item_already_exchanged",
              allowedQuantity: allowedQty,
              alreadyExchanged,
              exchangeHistory,
            });
          }
        }

        // Category restrictions are also protected server-side. Category 1 is
        // the same formal-dress category guarded by the POS UI. An admin's
        // explicit exception bypasses it; employees cannot.
        if (!adminOverride) {
          for (const ri of returnItems) {
            const product = await storage.getProduct(Number(ri.productId));
            if (product?.categoryId === 1) {
              return res.status(409).json({ message: "category_not_exchangeable" });
            }
          }
        }
      }

      for (const ri of returnItems) {
        const product = await storage.getProduct(ri.productId);
        if (!product) continue;
        const colorVariants = (product.colorVariants as any[]) || [];
        if (colorVariants.length > 0 && ri.color) {
          const updatedVariants = colorVariants.map((cv: any) => {
            if (cv.name !== ri.color) return cv;
            const inv = { ...(cv.sizeInventory || {}) };
            if (ri.size && inv[ri.size] !== undefined) inv[ri.size] = (inv[ri.size] || 0) + ri.quantity;
            return { ...cv, sizeInventory: inv };
          });
          const mergedSizeInv: Record<string, number> = {};
          updatedVariants.forEach((cv: any) => {
            Object.entries(cv.sizeInventory || {}).forEach(([size, qty]) => {
              mergedSizeInv[size] = (mergedSizeInv[size] || 0) + (qty as number);
            });
          });
          const totalStock = updatedVariants.reduce((sum: number, cv: any) =>
            sum + Object.values(cv.sizeInventory || {}).reduce((s: number, q: any) => s + (q as number), 0), 0);
          await storage.updateProduct(product.id, { colorVariants: updatedVariants, sizeInventory: mergedSizeInv, stockQuantity: totalStock } as any);
        } else {
          const inv = { ...(product.sizeInventory as Record<string, number> || {}) };
          if (ri.size && inv[ri.size] !== undefined) inv[ri.size] = (inv[ri.size] || 0) + ri.quantity;
          const newStock = product.stockQuantity + ri.quantity;
          await storage.updateProduct(product.id, { sizeInventory: inv, stockQuantity: newStock } as any);
        }
      }

      if (isExchange) {
        const originalItems = ((order as any).items || []) as any[];
        const returnedForHistory = returnItems.map((ri: any) => {
          const original = originalItems.find((item: any) =>
            Number(item.productId ?? item.product_id) === Number(ri.productId) &&
            String(item.size || "") === String(ri.size || "") &&
            String(item.color || "") === String(ri.color || ""),
          );
          return {
            productId: Number(ri.productId),
            name: original?.name || undefined,
            quantity: Number(ri.quantity),
            size: ri.size || undefined,
            color: ri.color || undefined,
            price: original?.price != null ? String(original.price) : undefined,
          };
        });
        const replacementsForHistory = Array.isArray(replacementItems)
          ? replacementItems
              .map((item: any) => ({
                productId: Number(item.productId),
                name: item.name ? String(item.name) : undefined,
                quantity: Math.max(0, Number(item.quantity) || 0),
                size: item.size || undefined,
                color: item.color || undefined,
                price: item.price != null ? String(item.price) : undefined,
              }))
              .filter((item: any) => Number.isInteger(item.productId) && item.productId > 0 && item.quantity > 0)
          : [];
        const nextHistory = [
          ...exchangeHistory,
          {
            exchangedAt: new Date().toISOString(),
            returnedItems: returnedForHistory,
            replacementItems: replacementsForHistory,
            override: adminOverride,
            byRole: req.user.role,
          },
        ];
        await storage.updatePosOrderExchangeHistory((order as any).id, nextHistory);
        return res.json({ success: true, message: "Exchange return processed", exchangeHistory: nextHistory });
      }

      res.json({ success: true, message: "Return processed" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/pos/orders", async (req, res) => {
    if (!req.isAuthenticated() || !["admin", "employee"].includes(req.user.role)) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { paymentMethod, items, note, cashAmount, cardAmount, totalAmount, subtotalAmount, discountAmount } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "No items provided" });
      }
      let computedSubtotal = 0;
      const validatedItems: any[] = [];
      for (const item of items) {
        if (!item.productId || !item.quantity || item.quantity < 1) {
          return res.status(400).json({ message: "Invalid item data" });
        }
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(400).json({ message: `Product ${item.productId} not found` });
        }
        const clientPrice = item.price != null ? parseFloat(item.price) : NaN;
        const dbPrice = product.discountPrice ? parseFloat(product.discountPrice) : parseFloat(product.price);
        const price = Number.isFinite(clientPrice) ? clientPrice : dbPrice;
        computedSubtotal += price * item.quantity;
        validatedItems.push({ ...item, price: price.toFixed(2), name: product.name, barcode: product.barcode || null });
      }
      const discount = Math.max(0, Math.min(parseFloat(discountAmount || 0) || 0, computedSubtotal));
      const expectedTotal = Math.max(0, computedSubtotal - discount);
      const clientTotal = parseFloat(totalAmount);
      if (!Number.isFinite(clientTotal) || Math.abs(clientTotal - expectedTotal) > 0.02) {
        return res.status(400).json({ message: "Total amount mismatch" });
      }
      const clientSubtotal = parseFloat(subtotalAmount);
      if (Number.isFinite(clientSubtotal) && Math.abs(clientSubtotal - computedSubtotal) > 0.02) {
        return res.status(400).json({ message: "Subtotal amount mismatch" });
      }
      const stockItems = validatedItems.map((item: any) => ({
        productId: item.productId,
        color: item.color || undefined,
        size: item.size || undefined,
        quantity: item.quantity,
        newSize: !!item.newSize,
      }));
      const order = await storage.createPosOrderAtomic(
        {
          totalAmount: expectedTotal.toFixed(2),
          subtotalAmount: computedSubtotal.toFixed(2),
          discountAmount: discount > 0 ? discount.toFixed(2) : null,
          paymentMethod: paymentMethod || "cash",
          items: validatedItems,
          note: note || null,
          cashAmount: cashAmount != null && cashAmount !== "" ? String(cashAmount) : null,
          cardAmount: cardAmount != null && cardAmount !== "" ? String(cardAmount) : null,
        },
        stockItems
      );
      res.json(order);
    } catch (err: any) {
      const msg: string = err.message || "";
      if (msg.startsWith("STOCK_ERROR:")) {
        return res.status(409).json({ message: msg.replace("STOCK_ERROR:", "").trim() });
      }
      res.status(500).json({ message: msg });
    }
  });

  app.get("/api/pos/orders", async (req, res) => {
    if (!req.isAuthenticated() || !["admin", "employee"].includes(req.user.role)) return res.status(401).json({ message: "Unauthorized" });
    try {
      const orders = await storage.getPosOrders();
      res.json(orders);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/analytics", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    try {
      // Optional month filter e.g. "2026-04". Empty = all time (last 12 months for chart)
      const monthParam = (req.query.month as string) || "";
      const hasMonth = /^\d{4}-\d{2}$/.test(monthParam);

      const websiteMonthlyResult = await db.execute(sql`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          COALESCE(SUM(total_amount::numeric - COALESCE(shipping_cost::numeric, 0)), 0) AS revenue,
          COUNT(*)::int AS order_count
        FROM orders
        WHERE status = 'Delivered'
          AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at)
      `);

      const posMonthlyResult = await db.execute(sql`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          COALESCE(SUM(total_amount::numeric), 0) AS revenue,
          COUNT(*)::int AS order_count
        FROM pos_orders
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at)
      `);

      const websiteCategoryResult = await db.execute(
        hasMonth
          ? sql`
              SELECT c.name AS category, COALESCE(c.name_ar, c.name) AS category_ar,
                COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS revenue
              FROM order_items oi
              JOIN products p ON p.id = oi.product_id
              JOIN categories c ON c.id = p.category_id
              JOIN orders o ON o.id = oi.order_id
              WHERE o.status = 'Delivered'
                AND TO_CHAR(o.created_at, 'YYYY-MM') = ${monthParam}
              GROUP BY c.id, c.name, c.name_ar ORDER BY revenue DESC`
          : sql`
              SELECT c.name AS category, COALESCE(c.name_ar, c.name) AS category_ar,
                COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS revenue
              FROM order_items oi
              JOIN products p ON p.id = oi.product_id
              JOIN categories c ON c.id = p.category_id
              JOIN orders o ON o.id = oi.order_id
              WHERE o.status = 'Delivered'
              GROUP BY c.id, c.name, c.name_ar ORDER BY revenue DESC`
      );

      const posCategoryResult = await db.execute(
        hasMonth
          ? sql`
              SELECT c.name AS category, COALESCE(c.name_ar, c.name) AS category_ar,
                COALESCE(SUM((CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END)), 0) AS revenue
              FROM pos_orders po
              CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
              JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
              JOIN categories c ON c.id = p.category_id
              WHERE TO_CHAR(po.created_at, 'YYYY-MM') = ${monthParam}
              GROUP BY c.id, c.name, c.name_ar ORDER BY revenue DESC`
          : sql`
              SELECT c.name AS category, COALESCE(c.name_ar, c.name) AS category_ar,
                COALESCE(SUM((CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END)), 0) AS revenue
              FROM pos_orders po
              CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
              JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
              JOIN categories c ON c.id = p.category_id
              GROUP BY c.id, c.name, c.name_ar ORDER BY revenue DESC`
      );

      const websiteTotalResult = await db.execute(
        hasMonth
          ? sql`SELECT COALESCE(SUM(total_amount::numeric - COALESCE(shipping_cost::numeric, 0)), 0) AS total FROM orders WHERE status = 'Delivered' AND TO_CHAR(created_at, 'YYYY-MM') = ${monthParam}`
          : sql`SELECT COALESCE(SUM(total_amount::numeric - COALESCE(shipping_cost::numeric, 0)), 0) AS total FROM orders WHERE status = 'Delivered'`
      );
      const posTotalResult = await db.execute(
        hasMonth
          ? sql`SELECT COALESCE(SUM(total_amount::numeric), 0) AS total FROM pos_orders WHERE TO_CHAR(created_at, 'YYYY-MM') = ${monthParam}`
          : sql`SELECT COALESCE(SUM(total_amount::numeric), 0) AS total FROM pos_orders`
      );

      // Payment method breakdown for website orders (cash vs card)
      const websitePaymentResult = await db.execute(
        hasMonth
          ? sql`
              SELECT
                CASE WHEN payment_method = 'Cash on delivery' THEN 'cash' ELSE 'card' END AS payment_type,
                COALESCE(SUM(total_amount::numeric - COALESCE(shipping_cost::numeric, 0)), 0) AS revenue
              FROM orders
              WHERE status = 'Delivered' AND TO_CHAR(created_at, 'YYYY-MM') = ${monthParam}
              GROUP BY payment_type`
          : sql`
              SELECT
                CASE WHEN payment_method = 'Cash on delivery' THEN 'cash' ELSE 'card' END AS payment_type,
                COALESCE(SUM(total_amount::numeric - COALESCE(shipping_cost::numeric, 0)), 0) AS revenue
              FROM orders
              WHERE status = 'Delivered'
              GROUP BY payment_type`
      );

      // Payment method breakdown for POS (cash_amount vs card_amount)
      const posPaymentResult = await db.execute(
        hasMonth
          ? sql`SELECT COALESCE(SUM(cash_amount::numeric), 0) AS cash_total, COALESCE(SUM(card_amount::numeric), 0) AS card_total FROM pos_orders WHERE TO_CHAR(created_at, 'YYYY-MM') = ${monthParam}`
          : sql`SELECT COALESCE(SUM(cash_amount::numeric), 0) AS cash_total, COALESCE(SUM(card_amount::numeric), 0) AS card_total FROM pos_orders`
      );

      // Per-category payment breakdown for website orders
      const websiteCategoryPaymentResult = await db.execute(
        hasMonth
          ? sql`
              SELECT c.name AS category, COALESCE(c.name_ar, c.name) AS category_ar,
                CASE WHEN o.payment_method = 'Cash on delivery' THEN 'cash' ELSE 'card' END AS payment_type,
                COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS revenue
              FROM order_items oi
              JOIN products p ON p.id = oi.product_id
              JOIN categories c ON c.id = p.category_id
              JOIN orders o ON o.id = oi.order_id
              WHERE o.status = 'Delivered' AND TO_CHAR(o.created_at, 'YYYY-MM') = ${monthParam}
              GROUP BY c.id, c.name, c.name_ar, payment_type ORDER BY c.name`
          : sql`
              SELECT c.name AS category, COALESCE(c.name_ar, c.name) AS category_ar,
                CASE WHEN o.payment_method = 'Cash on delivery' THEN 'cash' ELSE 'card' END AS payment_type,
                COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS revenue
              FROM order_items oi
              JOIN products p ON p.id = oi.product_id
              JOIN categories c ON c.id = p.category_id
              JOIN orders o ON o.id = oi.order_id
              WHERE o.status = 'Delivered'
              GROUP BY c.id, c.name, c.name_ar, payment_type ORDER BY c.name`
      );

      // Build payment by category map
      const paymentCategoryMap: Record<string, { category: string; category_ar: string; cash: number; card: number }> = {};
      for (const row of websiteCategoryPaymentResult.rows as any[]) {
        if (!paymentCategoryMap[row.category]) {
          paymentCategoryMap[row.category] = { category: row.category, category_ar: row.category_ar, cash: 0, card: 0 };
        }
        paymentCategoryMap[row.category][row.payment_type as "cash" | "card"] += Number(row.revenue);
      }

      // Per-category payment breakdown for POS orders (proportional allocation)
      const posCategoryPaymentResult = await db.execute(
        hasMonth
          ? sql`
              SELECT c.name AS category, COALESCE(c.name_ar, c.name) AS category_ar,
                COALESCE(SUM(
                  (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END) *
                  CASE WHEN po.total_amount::numeric > 0
                    THEN COALESCE(po.cash_amount::numeric, 0) / po.total_amount::numeric
                    ELSE 0 END
                ), 0) AS cash,
                COALESCE(SUM(
                  (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END) *
                  CASE WHEN po.total_amount::numeric > 0
                    THEN COALESCE(po.card_amount::numeric, 0) / po.total_amount::numeric
                    ELSE 0 END
                ), 0) AS card
              FROM pos_orders po
              CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
              JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
              JOIN categories c ON c.id = p.category_id
              WHERE TO_CHAR(po.created_at, 'YYYY-MM') = ${monthParam}
              GROUP BY c.id, c.name, c.name_ar ORDER BY c.name`
          : sql`
              SELECT c.name AS category, COALESCE(c.name_ar, c.name) AS category_ar,
                COALESCE(SUM(
                  (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END) *
                  CASE WHEN po.total_amount::numeric > 0
                    THEN COALESCE(po.cash_amount::numeric, 0) / po.total_amount::numeric
                    ELSE 0 END
                ), 0) AS cash,
                COALESCE(SUM(
                  (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END) *
                  CASE WHEN po.total_amount::numeric > 0
                    THEN COALESCE(po.card_amount::numeric, 0) / po.total_amount::numeric
                    ELSE 0 END
                ), 0) AS card
              FROM pos_orders po
              CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
              JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
              JOIN categories c ON c.id = p.category_id
              GROUP BY c.id, c.name, c.name_ar ORDER BY c.name`
      );

      // Build POS payment-by-category map
      const posCategoryPaymentMap: Record<string, { category: string; category_ar: string; cash: number; card: number }> = {};
      for (const row of posCategoryPaymentResult.rows as any[]) {
        posCategoryPaymentMap[row.category] = {
          category: row.category,
          category_ar: row.category_ar,
          cash: Number(row.cash),
          card: Number(row.card),
        };
      }

      // Orders by shipping region
      const regionResult = await db.execute(
        hasMonth
          ? sql`SELECT shipping_region AS region, COUNT(*)::int AS order_count FROM orders WHERE shipping_region IS NOT NULL AND TO_CHAR(created_at, 'YYYY-MM') = ${monthParam} GROUP BY shipping_region ORDER BY order_count DESC`
          : sql`SELECT shipping_region AS region, COUNT(*)::int AS order_count FROM orders WHERE shipping_region IS NOT NULL GROUP BY shipping_region ORDER BY order_count DESC`
      );

      // Orders by city (top 15)
      const cityResult = await db.execute(
        hasMonth
          ? sql`SELECT city, COUNT(*)::int AS order_count FROM orders WHERE city IS NOT NULL AND city <> '' AND TO_CHAR(created_at, 'YYYY-MM') = ${monthParam} GROUP BY city ORDER BY order_count DESC LIMIT 15`
          : sql`SELECT city, COUNT(*)::int AS order_count FROM orders WHERE city IS NOT NULL AND city <> '' GROUP BY city ORDER BY order_count DESC LIMIT 15`
      );

      res.json({
        websiteMonthly: websiteMonthlyResult.rows,
        posMonthly: posMonthlyResult.rows,
        websiteCategoryRevenue: websiteCategoryResult.rows,
        posCategoryRevenue: posCategoryResult.rows,
        websiteTotal: Number((websiteTotalResult.rows[0] as any)?.total ?? 0),
        posTotal: Number((posTotalResult.rows[0] as any)?.total ?? 0),
        websitePaymentBreakdown: websitePaymentResult.rows,
        posPaymentBreakdown: {
          cash: Number((posPaymentResult.rows[0] as any)?.cash_total ?? 0),
          card: Number((posPaymentResult.rows[0] as any)?.card_total ?? 0),
        },
        paymentByCategory: Object.values(paymentCategoryMap),
        posCategoryPayment: Object.values(posCategoryPaymentMap),
        ordersByRegion: regionResult.rows,
        ordersByCity: cityResult.rows,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Category inventory snapshot ──────────────────────────────────────────
  app.get("/api/admin/category-inventory", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    try {
      const result = await db.execute(sql`
        SELECT
          c.id                                                          AS category_id,
          c.name                                                        AS category,
          COALESCE(c.name_ar, c.name)                                  AS category_ar,
          COUNT(p.id)::int                                             AS product_count,
          COUNT(CASE WHEN p.stock_quantity > 0 THEN 1 END)::int       AS in_stock_count,
          COUNT(CASE WHEN p.stock_quantity = 0 THEN 1 END)::int       AS out_of_stock_count,
          COALESCE(SUM(p.stock_quantity), 0)::int                     AS total_units,
          COALESCE(SUM(p.price::numeric * p.stock_quantity), 0)       AS total_selling_value,
          COALESCE(SUM(p.price::numeric * p.stock_quantity), 0) * 0.5 AS paid_up_capital,
          COALESCE(AVG(NULLIF(p.price::numeric, 0)), 0)               AS avg_price
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id, c.name, c.name_ar
        ORDER BY product_count DESC
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Category money report (رأس المال + مبيعات كل فئة على حدة) ───────────
  // Full drill-down for a single category: capital, subcategories, website
  // vs POS sales, cash vs card for each channel, best sellers, and a
  // monthly + daily revenue timeline. Used by the "Category Manager"
  // report page so each category owner can see only their own numbers.
  app.get("/api/admin/category-report/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    try {
      const categoryId = parseInt(req.params.id);
      if (!categoryId || Number.isNaN(categoryId)) return res.status(400).json({ message: "Invalid category id" });

      const catResult = await db.execute(sql`
        SELECT id, name, COALESCE(name_ar, name) AS name_ar, image
        FROM categories WHERE id = ${categoryId}
      `);
      if (catResult.rows.length === 0) return res.status(404).json({ message: "Category not found" });
      const category = catResult.rows[0] as any;

      // ---- Inventory value & paid-up capital (رأس المال) for this category ----
      const invResult = await db.execute(sql`
        SELECT
          COUNT(p.id)::int                                       AS product_count,
          COUNT(CASE WHEN p.stock_quantity > 0 THEN 1 END)::int  AS in_stock_count,
          COUNT(CASE WHEN p.stock_quantity = 0 THEN 1 END)::int  AS out_of_stock_count,
          COALESCE(SUM(p.stock_quantity), 0)::int                AS total_units,
          COALESCE(SUM(p.price::numeric * p.stock_quantity), 0)  AS total_selling_value,
          COALESCE(AVG(NULLIF(p.price::numeric, 0)), 0)          AS avg_price
        FROM products p
        WHERE p.category_id = ${categoryId}
      `);

      // ---- Website totals (Delivered orders only) ----
      const webTotalResult = await db.execute(sql`
        SELECT COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS revenue,
               COALESCE(SUM(oi.quantity), 0)::int AS units,
               COUNT(DISTINCT o.id)::int AS order_count
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        WHERE p.category_id = ${categoryId} AND o.status = 'Delivered'
      `);

      // ---- Website cash vs card ----
      const webPaymentResult = await db.execute(sql`
        SELECT CASE WHEN o.payment_method = 'Cash on delivery' THEN 'cash' ELSE 'card' END AS payment_type,
               COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS revenue
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        WHERE p.category_id = ${categoryId} AND o.status = 'Delivered'
        GROUP BY payment_type
      `);

      // ---- POS totals ----
      const posTotalResult = await db.execute(sql`
        SELECT COALESCE(SUM((CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END)), 0) AS revenue,
               COALESCE(SUM((CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END)), 0)::int AS units,
               COUNT(DISTINCT po.id)::int AS order_count
        FROM pos_orders po
        CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
        JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
        WHERE p.category_id = ${categoryId}
      `);

      // ---- POS cash vs card (proportional allocation, same method as global analytics) ----
      const posPaymentResult = await db.execute(sql`
        SELECT
          COALESCE(SUM(
            (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END) *
            CASE WHEN po.total_amount::numeric > 0
              THEN COALESCE(po.cash_amount::numeric, 0) / po.total_amount::numeric
              ELSE 0 END
          ), 0) AS cash,
          COALESCE(SUM(
            (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END) *
            CASE WHEN po.total_amount::numeric > 0
              THEN COALESCE(po.card_amount::numeric, 0) / po.total_amount::numeric
              ELSE 0 END
          ), 0) AS card
        FROM pos_orders po
        CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
        JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
        WHERE p.category_id = ${categoryId}
      `);

      // ---- Subcategories under this category ----
      const subListResult = await db.execute(sql`
        SELECT id AS subcategory_id, name, COALESCE(name_ar, name) AS name_ar, is_active
        FROM subcategories WHERE category_id = ${categoryId} ORDER BY name
      `);
      const subProductCountResult = await db.execute(sql`
        SELECT subcategory_id, COUNT(*)::int AS product_count
        FROM products WHERE category_id = ${categoryId} AND subcategory_id IS NOT NULL
        GROUP BY subcategory_id
      `);
      const subWebResult = await db.execute(sql`
        SELECT p.subcategory_id,
               COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS revenue,
               COALESCE(SUM(oi.quantity), 0)::int AS units
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        WHERE p.category_id = ${categoryId} AND p.subcategory_id IS NOT NULL AND o.status = 'Delivered'
        GROUP BY p.subcategory_id
      `);
      const subPosResult = await db.execute(sql`
        SELECT p.subcategory_id,
               COALESCE(SUM((CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END)), 0) AS revenue,
               COALESCE(SUM((CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END)), 0)::int AS units
        FROM pos_orders po
        CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
        JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
        WHERE p.category_id = ${categoryId} AND p.subcategory_id IS NOT NULL
        GROUP BY p.subcategory_id
      `);

      const subProductCountMap = new Map((subProductCountResult.rows as any[]).map(r => [r.subcategory_id, r.product_count]));
      const subWebMap = new Map((subWebResult.rows as any[]).map(r => [r.subcategory_id, r]));
      const subPosMap = new Map((subPosResult.rows as any[]).map(r => [r.subcategory_id, r]));
      const subcategories = (subListResult.rows as any[]).map(s => {
        const web = subWebMap.get(s.subcategory_id);
        const pos = subPosMap.get(s.subcategory_id);
        const webRevenue = Number(web?.revenue ?? 0);
        const posRevenue = Number(pos?.revenue ?? 0);
        return {
          id: s.subcategory_id,
          name: s.name,
          nameAr: s.name_ar,
          isActive: s.is_active,
          productCount: subProductCountMap.get(s.subcategory_id) ?? 0,
          websiteRevenue: webRevenue,
          websiteUnits: Number(web?.units ?? 0),
          posRevenue: posRevenue,
          posUnits: Number(pos?.units ?? 0),
          totalRevenue: webRevenue + posRevenue,
        };
      }).sort((a, b) => b.totalRevenue - a.totalRevenue);

      // ---- Best sellers (top products by combined units sold) ----
      const bestWebResult = await db.execute(sql`
        SELECT p.id, p.name, p.main_image,
               COALESCE(SUM(oi.quantity), 0)::int AS web_units,
               COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS web_revenue
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        WHERE p.category_id = ${categoryId} AND o.status = 'Delivered'
        GROUP BY p.id, p.name, p.main_image
      `);
      const bestPosResult = await db.execute(sql`
        SELECT p.id,
               COALESCE(SUM((CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END)), 0)::int AS pos_units,
               COALESCE(SUM((CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END)), 0) AS pos_revenue
        FROM pos_orders po
        CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
        JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
        WHERE p.category_id = ${categoryId}
        GROUP BY p.id
      `);
      const bestMap = new Map<number, any>();
      for (const r of bestWebResult.rows as any[]) {
        bestMap.set(r.id, { id: r.id, name: r.name, image: r.main_image, webUnits: Number(r.web_units), webRevenue: Number(r.web_revenue), posUnits: 0, posRevenue: 0 });
      }
      for (const r of bestPosResult.rows as any[]) {
        const existing = bestMap.get(r.id);
        if (existing) {
          existing.posUnits = Number(r.pos_units);
          existing.posRevenue = Number(r.pos_revenue);
        } else {
          bestMap.set(r.id, { id: r.id, name: null, image: null, webUnits: 0, webRevenue: 0, posUnits: Number(r.pos_units), posRevenue: Number(r.pos_revenue) });
        }
      }
      // Backfill product name/image for POS-only entries
      const missingIds = [...bestMap.values()].filter(v => !v.name).map(v => v.id);
      if (missingIds.length > 0) {
        const namesResult = await db.execute(sql`SELECT id, name, main_image FROM products WHERE id = ANY(${`{${missingIds.join(",")}}`}::int[])`);
        for (const r of namesResult.rows as any[]) {
          const entry = bestMap.get(r.id);
          if (entry) { entry.name = r.name; entry.image = r.main_image; }
        }
      }
      const bestSellers = [...bestMap.values()]
        .map(v => ({ ...v, totalUnits: v.webUnits + v.posUnits, totalRevenue: v.webRevenue + v.posRevenue }))
        .sort((a, b) => b.totalUnits - a.totalUnits)
        .slice(0, 8);

      // ---- Monthly timeline (last 12 months, website + POS) ----
      const monthlyWebResult = await db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM') AS month,
               COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS revenue
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        WHERE p.category_id = ${categoryId} AND o.status = 'Delivered'
          AND o.created_at >= NOW() - INTERVAL '12 months'
        GROUP BY 1 ORDER BY 1
      `);
      const monthlyPosResult = await db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', po.created_at), 'YYYY-MM') AS month,
               COALESCE(SUM((CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END)), 0) AS revenue
        FROM pos_orders po
        CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
        JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
        WHERE p.category_id = ${categoryId}
          AND po.created_at >= NOW() - INTERVAL '12 months'
        GROUP BY 1 ORDER BY 1
      `);

      // ---- Monthly payment-type breakdown (website cash/card, POS cash/card) ----
      const monthlyWebPaymentResult = await db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM') AS month,
               CASE WHEN o.payment_method = 'Cash on delivery' THEN 'cash' ELSE 'card' END AS payment_type,
               COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS revenue
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        WHERE p.category_id = ${categoryId} AND o.status = 'Delivered'
          AND o.created_at >= NOW() - INTERVAL '12 months'
        GROUP BY 1, payment_type ORDER BY 1
      `);
      const monthlyPosPaymentResult = await db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', po.created_at), 'YYYY-MM') AS month,
               COALESCE(SUM(
                 (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END) *
                 CASE WHEN po.total_amount::numeric > 0 THEN COALESCE(po.cash_amount::numeric, 0) / po.total_amount::numeric ELSE 0 END
               ), 0) AS cash,
               COALESCE(SUM(
                 (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END) *
                 CASE WHEN po.total_amount::numeric > 0 THEN COALESCE(po.card_amount::numeric, 0) / po.total_amount::numeric ELSE 0 END
               ), 0) AS card
        FROM pos_orders po
        CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
        JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
        WHERE p.category_id = ${categoryId}
          AND po.created_at >= NOW() - INTERVAL '12 months'
        GROUP BY 1 ORDER BY 1
      `);

      // ---- Weekly payment-type breakdown (last 12 weeks) ----
      const weeklyWebPaymentResult = await db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('week', o.created_at), 'YYYY-MM-DD') AS week,
               CASE WHEN o.payment_method = 'Cash on delivery' THEN 'cash' ELSE 'card' END AS payment_type,
               COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS revenue
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        WHERE p.category_id = ${categoryId} AND o.status = 'Delivered'
          AND o.created_at >= NOW() - INTERVAL '12 weeks'
        GROUP BY 1, payment_type ORDER BY 1
      `);
      const weeklyPosPaymentResult = await db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('week', po.created_at), 'YYYY-MM-DD') AS week,
               COALESCE(SUM(
                 (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END) *
                 CASE WHEN po.total_amount::numeric > 0 THEN COALESCE(po.cash_amount::numeric, 0) / po.total_amount::numeric ELSE 0 END
               ), 0) AS cash,
               COALESCE(SUM(
                 (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END) *
                 CASE WHEN po.total_amount::numeric > 0 THEN COALESCE(po.card_amount::numeric, 0) / po.total_amount::numeric ELSE 0 END
               ), 0) AS card
        FROM pos_orders po
        CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
        JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
        WHERE p.category_id = ${categoryId}
          AND po.created_at >= NOW() - INTERVAL '12 weeks'
        GROUP BY 1 ORDER BY 1
      `);

      // Split website monthly/weekly rows (which mix cash+card in one result set) into two series each
      const splitByPaymentType = (rows: any[], periodKey: string) => {
        const cash: Record<string, number> = {};
        const card: Record<string, number> = {};
        for (const r of rows) {
          const bucket = r[periodKey];
          if (r.payment_type === "cash") cash[bucket] = (cash[bucket] ?? 0) + Number(r.revenue);
          else card[bucket] = (card[bucket] ?? 0) + Number(r.revenue);
        }
        return {
          cash: Object.entries(cash).map(([period, revenue]) => ({ period, revenue })).sort((a, b) => a.period.localeCompare(b.period)),
          card: Object.entries(card).map(([period, revenue]) => ({ period, revenue })).sort((a, b) => a.period.localeCompare(b.period)),
        };
      };
      const monthlyWebSplit = splitByPaymentType(monthlyWebPaymentResult.rows as any[], "month");
      const weeklyWebSplit = splitByPaymentType(weeklyWebPaymentResult.rows as any[], "week");
      const monthlyPosSplit = {
        cash: (monthlyPosPaymentResult.rows as any[]).map(r => ({ period: r.month, revenue: Number(r.cash) })),
        card: (monthlyPosPaymentResult.rows as any[]).map(r => ({ period: r.month, revenue: Number(r.card) })),
      };
      const weeklyPosSplit = {
        cash: (weeklyPosPaymentResult.rows as any[]).map(r => ({ period: r.week, revenue: Number(r.cash) })),
        card: (weeklyPosPaymentResult.rows as any[]).map(r => ({ period: r.week, revenue: Number(r.card) })),
      };

      // ---- Daily timeline (last 30 days, website + POS) ----
      const dailyWebResult = await db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('day', o.created_at), 'YYYY-MM-DD') AS day,
               COALESCE(SUM(oi.price::numeric * oi.quantity), 0) AS revenue
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders o ON o.id = oi.order_id
        WHERE p.category_id = ${categoryId} AND o.status = 'Delivered'
          AND o.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1 ORDER BY 1
      `);
      const dailyPosResult = await db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('day', po.created_at), 'YYYY-MM-DD') AS day,
               COALESCE(SUM((CASE WHEN jsonb_typeof(item) = 'object' AND item->>'price' ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END) * (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'quantity' ~ '^[0-9]+$' THEN (item->>'quantity')::integer ELSE 0 END)), 0) AS revenue
        FROM pos_orders po
        CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
        JOIN products p ON p.id = (CASE WHEN jsonb_typeof(item) = 'object' AND item->>'productId' ~ '^[0-9]+$' THEN (item->>'productId')::integer END)
        WHERE p.category_id = ${categoryId}
          AND po.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1 ORDER BY 1
      `);

      const inv = invResult.rows[0] as any;
      const webTotal = webTotalResult.rows[0] as any;
      const posTotal = posTotalResult.rows[0] as any;
      const posPayment = posPaymentResult.rows[0] as any;
      const webPaymentMap: Record<string, number> = { cash: 0, card: 0 };
      for (const r of webPaymentResult.rows as any[]) webPaymentMap[r.payment_type] = Number(r.revenue);

      const sellingValue = Number(inv?.total_selling_value ?? 0);

      res.json({
        category: {
          id: category.id,
          name: category.name,
          nameAr: category.name_ar,
          image: category.image,
        },
        capital: {
          productCount: Number(inv?.product_count ?? 0),
          inStockCount: Number(inv?.in_stock_count ?? 0),
          outOfStockCount: Number(inv?.out_of_stock_count ?? 0),
          totalUnits: Number(inv?.total_units ?? 0),
          avgPrice: Number(inv?.avg_price ?? 0),
          sellingValue,
          paidUpCapital: sellingValue * 0.5,
        },
        website: {
          revenue: Number(webTotal?.revenue ?? 0),
          units: Number(webTotal?.units ?? 0),
          orderCount: Number(webTotal?.order_count ?? 0),
          cash: webPaymentMap.cash,
          card: webPaymentMap.card,
        },
        pos: {
          revenue: Number(posTotal?.revenue ?? 0),
          units: Number(posTotal?.units ?? 0),
          orderCount: Number(posTotal?.order_count ?? 0),
          cash: Number(posPayment?.cash ?? 0),
          card: Number(posPayment?.card ?? 0),
        },
        subcategories,
        bestSellers,
        monthly: {
          website: monthlyWebResult.rows,
          pos: monthlyPosResult.rows,
        },
        daily: {
          website: dailyWebResult.rows,
          pos: dailyPosResult.rows,
        },
        monthlyPayment: {
          websiteCash: monthlyWebSplit.cash,
          websiteCard: monthlyWebSplit.card,
          posCash: monthlyPosSplit.cash,
          posCard: monthlyPosSplit.card,
        },
        weeklyPayment: {
          websiteCash: weeklyWebSplit.cash,
          websiteCard: weeklyWebSplit.card,
          posCash: weeklyPosSplit.cash,
          posCard: weeklyPosSplit.card,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* ═══════════════════════════════════════════════════════════════════
     ADMIN — DATABASE MANAGEMENT
  ═══════════════════════════════════════════════════════════════════ */

  const PG_DUMP_NIX = "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin/pg_dump";
  const PG_DUMP_BIN = (() => {
    try {
      if (require("fs").existsSync(PG_DUMP_NIX)) return PG_DUMP_NIX;
    } catch {}
    return process.env.PG_DUMP_PATH || "pg_dump";
  })();

  /* Pure-JS SQL dump used as a fallback when pg_dump is not available
     (e.g. minimal Render/Heroku images). Dumps schema for public tables
     plus row data as INSERT statements. Sufficient for app-level backup. */
  async function jsDumpSql(): Promise<string> {
    const out: string[] = [];
    const date = new Date().toISOString();
    out.push(`-- Lucerne Boutique JS backup`);
    out.push(`-- Generated: ${date}`);
    out.push(`-- WARNING: app-level dump (no functions/triggers/extensions)`);
    out.push(``);
    out.push(`SET statement_timeout = 0;`);
    out.push(`SET client_encoding = 'UTF8';`);
    out.push(`SET standard_conforming_strings = on;`);
    out.push(``);

    const tables = await getPublicTables();

    /* Schema */
    for (const t of tables) {
      const cols = await pool.query(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default,
                character_maximum_length, numeric_precision, numeric_scale
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1
         ORDER BY ordinal_position`,
        [t]
      );
      out.push(`DROP TABLE IF EXISTS "${t}" CASCADE;`);
      const defs = cols.rows.map((c: any) => {
        let type = c.data_type;
        if (type === "USER-DEFINED" || type === "ARRAY") type = c.udt_name;
        if (type === "character varying" && c.character_maximum_length)
          type = `varchar(${c.character_maximum_length})`;
        if (type === "numeric" && c.numeric_precision)
          type = `numeric(${c.numeric_precision}${c.numeric_scale ? "," + c.numeric_scale : ""})`;
        const nn = c.is_nullable === "NO" ? " NOT NULL" : "";
        const def = c.column_default ? ` DEFAULT ${c.column_default}` : "";
        return `  "${c.column_name}" ${type}${nn}${def}`;
      });
      out.push(`CREATE TABLE "${t}" (\n${defs.join(",\n")}\n);`);
      out.push(``);
    }

    /* Primary keys */
    const pks = await db.execute(sql`
      SELECT tc.table_name, kc.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kc
        ON kc.constraint_name = tc.constraint_name AND kc.table_schema = tc.table_schema
      WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY'
      ORDER BY tc.table_name, kc.ordinal_position
    `);
    const pkMap: Record<string, string[]> = {};
    for (const r of pks.rows as any[]) {
      (pkMap[r.table_name] ||= []).push(r.column_name);
    }
    for (const [tbl, cols] of Object.entries(pkMap)) {
      out.push(`ALTER TABLE "${tbl}" ADD PRIMARY KEY (${cols.map(c => `"${c}"`).join(", ")});`);
    }
    out.push(``);

    /* Data */
    const fmt = (v: any): string => {
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "number" || typeof v === "bigint") return String(v);
      if (typeof v === "boolean") return v ? "true" : "false";
      if (v instanceof Date) return `'${v.toISOString()}'`;
      if (Buffer.isBuffer(v)) return `'\\x${v.toString("hex")}'`;
      if (Array.isArray(v)) return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
      if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
      return `'${String(v).replace(/'/g, "''")}'`;
    };
    for (const t of tables) {
      const r = await db.execute(sql`SELECT * FROM ${sql.identifier(t)}`);
      if (r.rows.length === 0) continue;
      const cols = r.fields.map((f: any) => `"${f.name}"`).join(", ");
      out.push(`-- Data for ${t} (${r.rows.length} rows)`);
      for (const row of r.rows as any[]) {
        const vals = r.fields.map((f: any) => fmt(row[f.name])).join(", ");
        out.push(`INSERT INTO "${t}" (${cols}) VALUES (${vals});`);
      }
      out.push(``);
    }

    /* Reset sequences for serial PKs */
    for (const t of tables) {
      const seq = await pool.query(
        `SELECT pg_get_serial_sequence($1, 'id') AS seq`, [t]
      );
      const seqName = (seq.rows[0] as any)?.seq;
      if (seqName) {
        out.push(`SELECT setval('${seqName}', COALESCE((SELECT MAX(id) FROM "${t}"), 1));`);
      }
    }

    return out.join("\n");
  }

  async function getPublicTables(): Promise<string[]> {
    const r = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    return r.rows.map((row: any) => row.table_name);
  }

  /* List tables with row counts */
  app.get("/api/admin/db/tables", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin")
      return res.status(403).json({ message: "Forbidden" });
    try {
      const tables = await getPublicTables();
      const counts = await Promise.all(
        tables.map(async (t) => {
          const r = await db.execute(sql`SELECT COUNT(*) FROM ${sql.identifier(t)}`);
          return { name: t, count: parseInt((r.rows[0] as any).count) };
        })
      );
      res.json(counts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* Get table rows (paginated) + column metadata */
  app.get("/api/admin/db/table/:name", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin")
      return res.status(403).json({ message: "Forbidden" });
    try {
      const { name } = req.params;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = 50;
      const offset = (page - 1) * limit;
      const search = (req.query.search as string) || "";

      const validTables = await getPublicTables();
      if (!validTables.includes(name))
        return res.status(400).json({ message: "Invalid table name" });

      /* Column metadata */
      const colResult = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [name]);

      /* Build optional search filter across text columns */
      const textCols = colResult.rows
        .filter((c: any) => ["text","varchar","character varying","character","uuid","json","jsonb"].includes(c.data_type))
        .map((c: any) => `"${c.column_name}"`)
        .slice(0, 8);

      let whereClause = "";
      const queryParams: any[] = [limit, offset];
      if (search && textCols.length > 0) {
        const conditions = textCols.map((col: string) => `${col}::text ILIKE $3`);
        whereClause = `WHERE ${conditions.join(" OR ")}`;
        queryParams.push(`%${search}%`);
      }

      const dataResult = await pool.query(
        `SELECT * FROM "${name}" ${whereClause} ORDER BY 1 LIMIT $1 OFFSET $2`,
        queryParams
      );

      const countQuery = search && textCols.length > 0
        ? `SELECT COUNT(*) FROM "${name}" ${whereClause}`
        : `SELECT COUNT(*) FROM "${name}"`;
      const countParams = search && textCols.length > 0 ? [`%${search}%`] : [];
      const countResult = await pool.query(countQuery, countParams);

      res.json({
        columns: colResult.rows,
        rows: dataResult.rows,
        total: parseInt((countResult.rows[0] as any).count),
        page,
        limit,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* Update a single row by id */
  app.post("/api/admin/db/table/:name/update", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin")
      return res.status(403).json({ message: "Forbidden" });
    try {
      const { name } = req.params;
      const { id, changes } = req.body as { id: any; changes: Record<string, any> };

      const validTables = await getPublicTables();
      if (!validTables.includes(name))
        return res.status(400).json({ message: "Invalid table name" });

      const colResult = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
      `, [name]);
      const validCols = colResult.rows.map((r: any) => r.column_name);

      const entries = Object.entries(changes).filter(
        ([col]) => validCols.includes(col) && col !== "id"
      );
      if (entries.length === 0)
        return res.status(400).json({ message: "No valid columns to update" });

      const setClauses = entries.map(([col], i) => `"${col}" = $${i + 2}`);
      const values = [id, ...entries.map(([, v]) => (v === "" ? null : v))];

      await pool.query(`UPDATE "${name}" SET ${setClauses.join(", ")} WHERE id = $1`, values);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* Delete a row by id */
  app.delete("/api/admin/db/table/:name/:id", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin")
      return res.status(403).json({ message: "Forbidden" });
    try {
      const { name, id } = req.params;
      const validTables = await getPublicTables();
      if (!validTables.includes(name))
        return res.status(400).json({ message: "Invalid table name" });

      await pool.query(`DELETE FROM "${name}" WHERE id = $1`, [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* Add a new row (insert with only provided columns) */
  app.post("/api/admin/db/table/:name/insert", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin")
      return res.status(403).json({ message: "Forbidden" });
    try {
      const { name } = req.params;
      const { values: rowValues } = req.body as { values: Record<string, any> };

      const validTables = await getPublicTables();
      if (!validTables.includes(name))
        return res.status(400).json({ message: "Invalid table name" });

      const colResult = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
      `, [name]);
      const validCols = colResult.rows.map((r: any) => r.column_name);

      const entries = Object.entries(rowValues).filter(
        ([col, v]) => validCols.includes(col) && col !== "id" && v !== "" && v !== null && v !== undefined
      );
      if (entries.length === 0)
        return res.status(400).json({ message: "No data to insert" });

      const cols = entries.map(([col]) => `"${col}"`).join(", ");
      const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
      const vals = entries.map(([, v]) => v);

      const result = await pool.query(
        `INSERT INTO "${name}" (${cols}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      res.json({ success: true, row: result.rows[0] });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* Run a raw SELECT query (read-only) */
  app.post("/api/admin/db/query", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin")
      return res.status(403).json({ message: "Forbidden" });
    try {
      const { query: rawQuery } = req.body as { query: string };
      const trimmed = rawQuery.trim().toUpperCase();
      if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH"))
        return res.status(400).json({ message: "Only SELECT / WITH queries are allowed" });

      const result = await pool.query(rawQuery);
      res.json({ rows: result.rows, fields: result.fields?.map(f => f.name) || [] });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /* Download full SQL backup. Tries pg_dump first; falls back to a
     pure-JS dump so it works on hosts without pg_dump installed. */
  app.get("/api/admin/db/backup", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin")
      return res.status(403).json({ message: "Forbidden" });

    const date = new Date().toISOString().slice(0, 10);
    const filename = `lucerne-backup-${date}.sql`;

    /* Try pg_dump first */
    const tryPgDump = (): Promise<boolean> =>
      new Promise((resolve) => {
        let started = false;
        const pgDump = spawn(PG_DUMP_BIN, [
          "--no-owner",
          "--no-acl",
          "--schema=public",
          "--column-inserts",
          process.env.DATABASE_URL!,
        ]);

        pgDump.on("error", (err: Error) => {
          console.warn("pg_dump unavailable, falling back to JS dump:", err.message);
          resolve(false);
        });

        pgDump.stdout.once("data", (chunk: Buffer) => {
          if (!started) {
            started = true;
            res.setHeader("Content-Type", "application/sql; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.write(chunk);
            pgDump.stdout.pipe(res);
          }
        });

        pgDump.stderr.on("data", (data: Buffer) => {
          console.error("pg_dump stderr:", data.toString());
        });

        pgDump.on("close", (code: number) => {
          if (started) {
            if (code !== 0) console.error(`pg_dump exited with code ${code}`);
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });

    try {
      const ok = await tryPgDump();
      if (ok) return;

      /* Fallback: pure-JS dump */
      const sql = await jsDumpSql();
      res.setHeader("Content-Type", "application/sql; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(sql);
    } catch (err: any) {
      console.error("Backup failed:", err);
      if (!res.headersSent) res.status(500).json({ message: "Backup failed: " + err.message });
    }
  });

  // --- Notification Routes ---
  app.get("/api/notifications", async (req: any, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const items = await storage.getUserNotifications((req.user as any).id);
    res.json(items);
  });

  app.patch("/api/notifications/read-all", async (req: any, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    await storage.markAllNotificationsRead((req.user as any).id);
    res.json({ ok: true });
  });

  // --- Abandoned cart email (called by client hook) ---
  app.post("/api/notifications/cart-reminder-email", async (req, res) => {
    if (!req.isAuthenticated()) return res.json({ ok: false });
    const user = req.user as any;
    if (!user.email || isPlaceholderEmail(user.email)) return res.json({ ok: false });
    sendAbandonedCartEmail(user.email, user.fullName || user.email.split("@")[0]).catch(console.error);
    res.json({ ok: true });
  });

  // --- Admin: send sale/discount email blast to all customers ---
  app.post("/api/admin/send-sale-email", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { discountPercent, categoryMention } = z.object({
        discountPercent: z.number().min(1).max(99),
        categoryMention: z.string().max(200).optional().nullable(),
      }).parse(req.body);

      const allUsers = await storage.getAllUsers();
      const recipients = allUsers
        .filter((u: any) => u.email && !isPlaceholderEmail(u.email) && u.role !== "admin" && !u.isBlocked)
        .map((u: any) => ({ email: u.email, name: u.fullName || u.email.split("@")[0] }));

      sendSaleDiscountEmail(recipients, { discountPercent, categoryMention: categoryMention || null }).catch(console.error);
      res.json({ ok: true, recipientCount: recipients.length });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed" });
    }
  });

  app.post("/api/admin/send-discount-code-email", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { discountCodeId, userIds } = z.object({
        discountCodeId: z.number().int().positive(),
        userIds: z.array(z.number().int().positive()).optional(),
      }).parse(req.body);

      // Load the discount code
      const codeResult = await db.execute(sql`
        SELECT dc.id, dc.code, dc.discount_percent, dc.max_uses, dc.used_count, dc.expires_at,
               dc.category_ids, dc.subcategory_ids
        FROM discount_codes dc
        WHERE dc.id = ${discountCodeId}
      `);
      const codeRow = codeResult.rows[0] as any;
      if (!codeRow) return res.status(404).json({ message: "Discount code not found" });

      // Resolve category and subcategory names
      const catIds: number[] = codeRow.category_ids ?? [];
      const subIds: number[] = codeRow.subcategory_ids ?? [];
      let restrictionLabel: string | null = null;
      if (catIds.length > 0 || subIds.length > 0) {
        const labels: string[] = [];
        if (catIds.length > 0) {
          const catResult = await db.execute(sql`SELECT name, name_ar FROM categories WHERE id = ANY(${`{${catIds.join(",")}}`}::int[])`);
          for (const r of catResult.rows as any[]) labels.push(r.name_ar ? `${r.name_ar} / ${r.name}` : r.name);
        }
        if (subIds.length > 0) {
          const subResult = await db.execute(sql`SELECT name, name_ar FROM subcategories WHERE id = ANY(${`{${subIds.join(",")}}`}::int[])`);
          for (const r of subResult.rows as any[]) labels.push(r.name_ar ? `${r.name_ar} / ${r.name}` : r.name);
        }
        restrictionLabel = labels.join("، ");
      }

      const allUsers = await storage.getAllUsers();
      let recipientUsers = allUsers.filter((u: any) => u.email && !isPlaceholderEmail(u.email) && u.role !== "admin" && !u.isBlocked);
      if (userIds && userIds.length > 0) {
        const idSet = new Set(userIds);
        recipientUsers = recipientUsers.filter((u: any) => idSet.has(u.id));
      }
      const recipients = recipientUsers.map((u: any) => ({ email: u.email, name: u.fullName || u.email.split("@")[0] }));

      sendDiscountCodeEmail(recipients, {
        code: codeRow.code,
        discountPercent: Number(codeRow.discount_percent),
        restrictionLabel,
        expiresAt: codeRow.expires_at ? new Date(codeRow.expires_at) : null,
        maxUses: codeRow.max_uses ? Number(codeRow.max_uses) : null,
        usedCount: Number(codeRow.used_count ?? 0),
      }).catch(console.error);

      // Also send WhatsApp to recipients who have a phone number
      for (const u of recipientUsers) {
        if ((u as any).phone) {
          sendDiscountCodeWA((u as any).phone, {
            customerName: (u as any).fullName || (u as any).email.split("@")[0],
            code: codeRow.code,
            discountPercent: Number(codeRow.discount_percent),
            restrictionLabel,
            expiresAt: codeRow.expires_at ? new Date(codeRow.expires_at) : null,
          }).catch(console.error);
        }
      }

      res.json({ ok: true, recipientCount: recipients.length });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed" });
    }
  });

  // ── Send discount code via WhatsApp only ─────────────────────────────────
  app.post("/api/admin/send-discount-code-whatsapp", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { discountCodeId, userIds } = z.object({
        discountCodeId: z.number().int().positive(),
        userIds: z.array(z.number().int().positive()).optional(),
      }).parse(req.body);

      const codeResult = await db.execute(sql`
        SELECT dc.id, dc.code, dc.discount_percent, dc.max_uses, dc.used_count, dc.expires_at,
               dc.category_ids, dc.subcategory_ids
        FROM discount_codes dc WHERE dc.id = ${discountCodeId}
      `);
      const codeRow = codeResult.rows[0] as any;
      if (!codeRow) return res.status(404).json({ message: "Discount code not found" });

      const catIds: number[] = codeRow.category_ids ?? [];
      const subIds: number[] = codeRow.subcategory_ids ?? [];
      let restrictionLabel: string | null = null;
      if (catIds.length > 0 || subIds.length > 0) {
        const labels: string[] = [];
        if (catIds.length > 0) {
          const catResult = await db.execute(sql`SELECT name, name_ar FROM categories WHERE id = ANY(${`{${catIds.join(",")}}`}::int[])`);
          for (const r of catResult.rows as any[]) labels.push(r.name_ar ? `${r.name_ar} / ${r.name}` : r.name);
        }
        if (subIds.length > 0) {
          const subResult = await db.execute(sql`SELECT name, name_ar FROM subcategories WHERE id = ANY(${`{${subIds.join(",")}}`}::int[])`);
          for (const r of subResult.rows as any[]) labels.push(r.name_ar ? `${r.name_ar} / ${r.name}` : r.name);
        }
        restrictionLabel = labels.join("، ");
      }

      const allUsers = await storage.getAllUsers();
      let phoneUsers = allUsers.filter((u: any) => u.phone && u.role !== "admin" && !u.isBlocked);
      if (userIds && userIds.length > 0) {
        const idSet = new Set(userIds);
        phoneUsers = phoneUsers.filter((u: any) => idSet.has(u.id));
      }

      for (const u of phoneUsers) {
        sendDiscountCodeWA((u as any).phone, {
          customerName: (u as any).fullName || "عزيزي العميل",
          code: codeRow.code,
          discountPercent: Number(codeRow.discount_percent),
          restrictionLabel,
          expiresAt: codeRow.expires_at ? new Date(codeRow.expires_at) : null,
        }).catch(console.error);
      }

      res.json({ ok: true, recipientCount: phoneUsers.length });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed" });
    }
  });

  // ── Send sale notification via WhatsApp only ──────────────────────────────
  app.post("/api/admin/send-sale-whatsapp", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { discountPercent, categoryMention } = z.object({
        discountPercent: z.number().min(1).max(99),
        categoryMention: z.string().max(200).optional().nullable(),
      }).parse(req.body);

      const allUsers = await storage.getAllUsers();
      const phoneUsers = allUsers.filter((u: any) => u.phone && u.role !== "admin" && !u.isBlocked);

      for (const u of phoneUsers) {
        const name = (u as any).fullName || "عزيزي العميل";
        const cat = categoryMention ? ` على ${categoryMention}` : "";
        const msg =
          `مرحباً ${name} 👋\n\n` +
          `🔥 عرض خاص من Lucerne Boutique!\n\n` +
          `خصم ${discountPercent}%${cat} الآن!\n\n` +
          `تسوقي الآن ولا تفوتي الفرصة 🛍️\n\nLucerne Boutique 🌿`;
        sendTextMessage((u as any).phone, msg).catch(console.error);
      }

      res.json({ ok: true, recipientCount: phoneUsers.length });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed" });
    }
  });

  // ── WhatsApp Status Check (admin only) ───────────────────────────────────
  app.get("/api/admin/whatsapp-status", (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const sid  = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM;
    res.json({
      configured: isWhatsAppConfigured(),
      hasAccountSid: !!sid,
      hasAuthToken:  !!auth,
      hasFromNumber: !!from,
      accountSidPreview: sid  ? sid.slice(0, 8)  + "…" : null,
      authTokenPreview:  auth ? auth.slice(0, 6)  + "…" : null,
      fromNumberPreview: from ? from : null,
    });
  });

  // ── Twilio connectivity check (admin only) ────────────────────────────────
  app.get("/api/admin/whatsapp-phone-numbers", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const sid  = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !auth) return res.status(400).json({ message: "Twilio credentials not set" });
    try {
      const creds = Buffer.from(`${sid}:${auth}`).toString("base64");
      // Fetch account details from Twilio
      const accRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: `Basic ${creds}` },
      });
      const accData = await accRes.json() as any;
      // Fetch the WhatsApp senders on this account
      const sendersRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`,
        { headers: { Authorization: `Basic ${creds}` } }
      );
      const sendersData = await sendersRes.json() as any;
      res.json({ ok: accRes.ok, account: accData, senders: sendersData });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err.message });
    }
  });

  // ── WhatsApp Test Route (admin only) ──────────────────────────────────────
  app.post("/api/admin/whatsapp-test", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { phone, type, customerName, orderId, totalAmount, items, status,
            code, discountPercent, restrictionLabel, text } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone is required" });
    try {
      let msgBody = "";
      const name = customerName || "عميل";
      const oRef = `#${String(Number(orderId) || 1).padStart(6, "0")}`;

      if (type === "order_confirmation") {
        const parsedItems: { name: string; quantity: number }[] =
          Array.isArray(items) && items.length > 0
            ? items
            : [{ name: "منتج تجريبي", quantity: 1 }];
        const itemLines = parsedItems.map((i: any) => `  • ${i.name} ×${i.quantity}`).join("\n");
        msgBody =
          `مرحباً ${name} 👋\n\n` +
          `✅ تم استلام طلبك بنجاح!\n\nرقم الطلب: ${oRef}\n` +
          `المنتجات:\n${itemLines}\n\nالمجموع: ${totalAmount || "0.00"} ₪\n\n` +
          `شكراً لتسوقك معنا في Lucerne Boutique 🌿`;
      } else if (type === "order_status") {
        const statusMap: Record<string, string> = {
          Processing: `⚙️ طلبك ${oRef} قيد المعالجة الآن.`,
          Shipped:    `🚚 طلبك ${oRef} في الطريق إليك! سيصل قريباً.`,
          Delivered:  `✅ تم تسليم طلبك ${oRef} بنجاح. نأمل أن ينال إعجابك!`,
          Cancelled:  `❌ تم إلغاء طلبك ${oRef}. للاستفسار تواصل معنا.`,
        };
        msgBody = `مرحباً ${name} 👋\n\n${statusMap[status] || statusMap.Shipped}\n\nشكراً — Lucerne Boutique 🌿`;
      } else if (type === "discount_code") {
        msgBody =
          `مرحباً ${name} 👋\n\n🎁 هدية خاصة لكِ من Lucerne Boutique!\n\n` +
          `كود الخصم: *${code || "TEST10"}*\nنسبة الخصم: ${discountPercent || 10}%` +
          (restrictionLabel ? `\nيُطبَّق على: ${restrictionLabel}` : "") +
          `\n\nتسوقي الآن وادخلي الكود عند الدفع 🛍️\n\nLucerne Boutique 🌿`;
      } else {
        msgBody = text || "رسالة اختبار من Lucerne Boutique 🌿";
      }

      const result = await sendTextMessage(phone, msgBody);
      res.json({ ok: true, messageId: result.messageId, to: result.to });
    } catch (err: any) {
      console.error("[whatsapp-test]", err);
      res.status(500).json({ ok: false, message: err.message || "Send failed" });
    }
  });

  /* ── Chatbot ──────────────────────────────────────────────────────────── */
  app.post("/api/chat", chatLimiter, async (req, res) => {
    try {
      const { message, lang, context = {} } = req.body as {
        message: string;
        lang: "ar" | "en";
        context: { lastIntent?: string; lastFilters?: Record<string, string> };
      };

      // ── Input validation ─────────────────────────────────────────────────
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ reply: "Invalid message", buttons: [] });
      }
      // Cap message length to prevent regex DoS on very long inputs
      if (message.length > 500) {
        return res.status(400).json({ reply: "Message too long (max 500 characters).", buttons: [] });
      }
      // Enforce known lang values — fall back to "ar" for anything unexpected
      const safeLang: "ar" | "en" = lang === "en" ? "en" : "ar";

      // Validate lastIntent against the declared union to prevent client-side manipulation
      const VALID_INTENTS = new Set([
        "greeting","product_navigation","sales_deals","order_tracking","delivery_policy",
        "exchange_policy","return_policy","size_help","payment_methods","discount_code",
        "loyalty_points","wishlist","account_help","location","faq","contact",
        "privacy_terms","human_support","complaint","unknown",
      ]);
      const safeLastIntent = VALID_INTENTS.has(context.lastIntent ?? "")
        ? context.lastIntent : undefined;

      // Only carry over known entity keys from lastFilters to prevent property injection
      const ENTITY_KEYS = new Set(["category","subcategory","color","size","style","occasion","priceMax","priceMin"]);
      const rawFilters = context.lastFilters ?? {};
      const safeLastFilters: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawFilters)) {
        if (ENTITY_KEYS.has(k) && (typeof v === "string" || typeof v === "number")) {
          safeLastFilters[k] = String(v);
        }
      }

      const settings = await storage.getSiteSettings();
      const waSetting = settings.find((s: any) => s.key === "whatsapp_number");
      const rawWhatsapp = waSetting?.value || "966500000000";
      // Strip anything that isn't a digit or leading + to prevent URL injection
      const whatsapp = rawWhatsapp.replace(/[^\d+]/g, "") || "966500000000";

      // Live taxonomy so the bot understands admin-added categories/subcategories
      const [cats, subs] = await Promise.all([
        storage.getCategories(),
        storage.getSubcategories(),
      ]);
      const taxonomy = {
        categories: cats.map((c: any) => ({ slug: c.slug, name: c.name, nameAr: c.nameAr })),
        subcategories: subs
          .filter((s: any) => s.isActive !== false)
          .map((s: any) => ({
            slug: s.slug,
            name: s.name,
            nameAr: s.nameAr,
            categorySlug: cats.find((c: any) => c.id === s.categoryId)?.slug ?? "",
          })),
      };

      const knownCategorySlugs = new Set<string>(cats.map((c: any) => c.slug));

      const intent = detectIntent(message, safeLastIntent as any);
      const entities = extractEntities(message, safeLastFilters as any, taxonomy);

      // ── Secure order-status lookup ──────────────────────────────────────
      // A customer may only ever see their OWN orders. We require a logged-in
      // session and verify ownership; replies for "not found" and "not yours"
      // are intentionally identical so order numbers cannot be enumerated.
      const asciiDigits = message.replace(/[\u0660-\u0669]/g, (d) =>
        String("٠١٢٣٤٥٦٧٨٩".indexOf(d)),
      ).replace(/[\u06F0-\u06F9]/g, (d) =>
        String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)),
      );
      const numMatch = asciiDigits.match(/\d{1,9}/);
      const isPureNumber = /^[#\s]*\d{1,9}\s*$/.test(asciiDigits.trim());
      const wantsOrderLookup =
        !!numMatch &&
        (intent === "order_tracking" ||
          safeLastIntent === "order_tracking" ||
          isPureNumber);

      if (wantsOrderLookup) {
        let orderResp;
        if (!req.isAuthenticated() || !req.user) {
          orderResp = orderStatusReply({ lang: safeLang, whatsapp, state: "not_authed" });
        } else {
          const userId = (req.user as any).id;
          const orderId = Number(numMatch![0]);
          const order = await storage.getOrderForUser(orderId, userId);
          if (!order) {
            orderResp = orderStatusReply({ lang: safeLang, whatsapp, state: "not_found" });
          } else {
            orderResp = orderStatusReply({
              lang: safeLang,
              whatsapp,
              state: "found",
              order: { id: order.id, status: order.status },
            });
          }
        }
        return res.json({
          reply: orderResp.reply,
          buttons: orderResp.buttons ?? [],
          context: { lastIntent: "order_tracking", lastFilters: {} },
        });
      }

      const { reply, buttons } = buildResponse(intent, safeLang, entities, whatsapp, knownCategorySlugs);

      return res.json({
        reply,
        buttons: buttons ?? [],
        context: { lastIntent: intent, lastFilters: entities },
      });
    } catch (err) {
      console.error("[chatbot]", err);
      return res.status(500).json({ reply: "Sorry, something went wrong.", buttons: [] });
    }
  });

  // ── Cloudinary image browser ─────────────────────────────────────────────
  app.get("/api/admin/cloudinary/images", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { cloudinary: cloudinaryV2 } = await import("./cloudinary");
      const maxResults = Math.min(parseInt(String(req.query.max_results || "30")), 100);
      const nextCursor = req.query.next_cursor as string | undefined;
      const result: any = await cloudinaryV2.api.resources({
        type: "upload",
        resource_type: "image",
        max_results: maxResults,
        next_cursor: nextCursor,
      });
      res.json({
        resources: result.resources.map((r: any) => ({
          publicId: r.public_id,
          url: r.secure_url.replace("/upload/", "/upload/f_auto,q_auto,w_400/"),
          fullUrl: r.secure_url.replace("/upload/", "/upload/f_auto,q_auto/"),
          width: r.width,
          height: r.height,
          createdAt: r.created_at,
          format: r.format,
          bytes: r.bytes,
        })),
        nextCursor: result.next_cursor || null,
        totalCount: result.total_count || null,
      });
    } catch (err: any) {
      console.error("[cloudinary-browser]", err);
      res.status(500).json({ message: err?.message || "Failed to fetch images" });
    }
  });

  // ── Browse uploaded VIDEOS (for attaching to products — NOT sent to AI) ────
  app.get("/api/admin/cloudinary/videos", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { cloudinary: cloudinaryV2 } = await import("./cloudinary");
      const maxResults = Math.min(parseInt(String(req.query.max_results || "30")), 100);
      const nextCursor = req.query.next_cursor as string | undefined;
      const result: any = await cloudinaryV2.api.resources({
        type: "upload",
        resource_type: "video",
        max_results: maxResults,
        next_cursor: nextCursor,
      });
      res.json({
        resources: result.resources.map((r: any) => ({
          publicId: r.public_id,
          // Playable, auto-optimised video stream.
          url: r.secure_url.replace("/upload/", "/upload/f_auto,q_auto/"),
          // A poster frame (first frame) so we can show a thumbnail without loading the video.
          poster: r.secure_url
            .replace("/upload/", "/upload/so_0,w_400/")
            .replace(/\.(mp4|mov|webm|avi|mkv|m4v)$/i, ".jpg"),
          duration: r.duration || null,
          createdAt: r.created_at,
          format: r.format,
          bytes: r.bytes,
        })),
        nextCursor: result.next_cursor || null,
        totalCount: result.total_count || null,
      });
    } catch (err: any) {
      console.error("[cloudinary-videos]", err);
      res.status(500).json({ message: err?.message || "Failed to fetch videos" });
    }
  });

  // ── AI product generation from image URLs ─────────────────────────────────
  app.post("/api/admin/ai-generate", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { imageUrls, isMultiColor, variantNames } = req.body as { imageUrls: string[]; isMultiColor?: boolean; variantNames?: string[] };
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({ message: "imageUrls required" });
    }
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const openaiBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    if (!geminiKey && !openaiKey && !openaiBase) {
      return res.status(503).json({ message: "No AI API configured. Add GEMINI_API_KEY in Secrets.", noKey: true });
    }

    const PROMPT = `أنت مساعد لتوليد بيانات المنتجات لمتجر إلكتروني. لديك صورة منتج، وعليك توليد:

1. اسم المنتج:
- بالعربية فقط
- من 2 إلى 3 كلمات كحد أقصى
- واضح ومباشر (مثال: "كندرة بيضاء"، "بليرينا أسود"، "كعب رفيع أحمر")
- ممنوع استخدام كلمة "حذاء" في الاسم — استخدم اسم النوع المحدد بدلاً منه (مثل: كندرة، بليرينا، بوت، صندل، كعب رفيع، كعب عريض، إلخ)
- ممنوع استخدام كلمات غريبة أو غير مفهومة للعميل العادي (مثل: "ميدي"، "أنيق"، "كلاسيك")، استخدم فقط كلمات يستخدمها الناس في حياتهم اليومية

2. الوصف:
- بالعربية فقط
- 12 كلمة كحد أقصى
- لغة بسيطة وواضحة يفهمها أي عميل عادي
- ممنوع تماماً استخدام كلمة "مدببة" أو "مقدمة" أو أي وصف لشكل الحذاء من الأمام (مثل: "مقدمة مدببة"، "بمقدمة دائرية") — العميل العادي لا يفهم هذه المصطلحات
- بدلاً من ذلك، صف الحذاء بالعناصر الواضحة فقط: نوع الحذاء (من القائمة في القسم 3)، الكعب وارتفاعه (إن وجد)، الألوان، التفاصيل الإضافية الواضحة (فيونكة، حزام، سحاب، إلخ)

3. تفاصيل خاصة بالأحذية:

- حدد نوع الحذاء من القائمة التالية حسب الشكل في الصورة:
  - كندرة (مسكر من الأمام والجوانب والخلف بالكامل، وله كعب واضح، تصميم يومي/كاجوال)
  - كعب رفيع (كعب عالي ورفيع جداً)
  - كعب رفيع مريح (كعب رفيع لكن منخفض أو متوسط، مصمم للراحة)
  - كعب مسكر رسمي (مسكر من قدام ومن ورا، كعب رفيع، تصميم رسمي وأنيق)
  - كعب عريض (كعب سميك وعريض، تصميم عادي)
  - كعب مربع مريح (كعب عريض ومربع الشكل، مصمم للراحة)
  - كعب قصير (كعب رفيع جداً ومنخفض)
  - كعب مفتوح (الكعب مفتوح من الخلف أو من الجوانب)
  - بابوج بكعب
  - بليرينا
  - حذاء بدون رباط
  - حذاء كلاسيكي مربوط
  - بوت
  - صندل رسمي
  - صندل زحاف

ملاحظة للتمييز بين "كندرة" و"كعب مسكر رسمي":
- إذا كان الحذاء مسكر بالكامل + له كعب + التصميم يومي/كاجوال (مثل قماش، جلد عادي، تصميم بسيط) → "كندرة"
- إذا كان الحذاء مسكر بالكامل + له كعب + التصميم رسمي/أنيق (مثل جلد لامع، كعب رفيع جداً، شكل أنيق) → "كعب مسكر رسمي"

- إذا كان للحذاء كعب واضح في الصورة:
  - اذكر ارتفاع الكعب بالسنتيمتر بأكبر دقة ممكنة، مثل "ارتفاع الكعب 6 سم" أو "ارتفاع الكعب 8 سم"
  - هذا الرقم مهم جداً للزبون لأنه يحدد راحة الحذاء، فلا تكتفِ بأرقام تقريبية فقط (4، 5، 7، 10) — استخدمها كنقطة انطلاق، لكن إذا رأيت أن الكعب أعلى أو أقل من ذلك بوضوح، اكتب الرقم الأقرب للواقع (مثل 6، 8، 9، 11، 12)
  - قدّر الارتفاع بدقة بناءً على نسبة الكعب لحجم القدم أو الحذاء كاملاً في الصورة
- إذا لم يكن للحذاء كعب (بليرينا، بوت مسطح، صندل زحاف، إلخ):
  - لا تذكر أي شيء عن الكعب أو الارتفاع نهائياً

4. تفاصيل خاصة بالملابس والفئات الأخرى:
- اذكر نوع/خامة القماش بشكل مبسط (مثل: "قطن"، "جينز"، "حرير")
- لا تجعل الوصف طويلاً جداً ولا قصيراً جداً — يجب أن يغطي: النوع، الخامة، الاستخدام المناسب

قواعد عامة:
- كل الأوصاف يجب أن تكون مفهومة وبسيطة، وكأنك تشرح للعميل في محادثة عادية
- التزم بالحد الأقصى لعدد الكلمات (12 كلمة للوصف، 2-3 كلمات للاسم)
- الدقة أهم من التفصيل — لا تخمن معلومات غير واضحة من الصورة

أمثلة على وصف صحيح:
- "كندرة جلد بني كعب 5 سم"
- "كعب مسكر رسمي 9 سم لون فضي"
- "كعب عريض 6 سم بفيونكة حمراء"
- "كعب مربع مريح 5 سم لون أسود"
- "كعب رفيع 11 سم لون أسود"
- "كعب رفيع مريح 4 سم لون بيج"
- "كعب مفتوح 5 سم مع حزام بني"
- "صندل رسمي 7 سم جلد أسود"
- "صندل زحاف جلد بني"
- "بليرينا جلد أسود مع رباط"
- "بابوج بكعب 8 سم لون بيج"

أعد الرد كـ JSON فقط بهذه الحقول بالضبط — بدون markdown وبدون أي نص إضافي:
- name: اسم المنتج بالعربية (2-3 كلمات)
- nameAr: نفس اسم المنتج بالعربية
- description: وصف المنتج بالعربية (12 كلمة كحد أقصى)
- descriptionAr: نفس الوصف بالعربية
- colors: مصفوفة تحتوي على كود لون HEX واحد فقط — اللون الرئيسي للمنتج (مثال: ["#c0392b"])
- colorNames: مصفوفة تحتوي على اسم اللون الرئيسي بالعربية (مثال: ["أحمر"])
- styleKey: وصف قصير بالإنجليزية للتصميم الهيكلي للمنتج بدون ذكر الألوان (للاستخدام الداخلي فقط)
- suggestedPrice: سعر بيع تقديري واقعي بالشيكل (رقم فقط)

Respond ONLY with valid JSON, no markdown, no extra text.`;

    const MULTI_COLOR_ADDENDUM = `

⚠️ تعليمات إضافية مهمة جداً: هذا المنتج متوفر بعدة ألوان مختلفة (صور مختلفة لنفس المنتج بألوان متعددة):
- ممنوع تماماً ذكر اللون في حقل "name" — الاسم يصف نوع المنتج فقط بدون أي إشارة للون (مثال صحيح: "بليرينا جلد"، "كعب رفيع" — مثال خاطئ: "بليرينا جلد أسود")
- ممنوع ذكر اللون في حقل "description" — الوصف يصف المنتج فقط بدون ذكر اللون (الألوان ستُضاف تلقائياً لاحقاً)
- في حقل "colors": اذكر اللون الرئيسي لهذه الصورة تحديداً
- في حقل "colorNames": اذكر اسم اللون بالعربية لهذه الصورة تحديداً`;

    const FINAL_PROMPT = isMultiColor ? PROMPT + MULTI_COLOR_ADDENDUM : PROMPT;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const parseRetryDelay = (msg: string): number | null => {
      const m = msg.match(/retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i);
      return m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
    };

    // Lazy-load SDKs once
    let model: any = null;
    let openai: any = null;
    if (geminiKey) {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      model = new GoogleGenerativeAI(geminiKey).getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-flash-latest" });
    } else {
      const OpenAI = (await import("openai")).default;
      openai = new OpenAI({
        apiKey: openaiKey || "replit",
        ...(openaiBase ? { baseURL: openaiBase } : {}),
      });
    }

    const callAI = async (url: string): Promise<string> => {
      if (model) {
        // ── Gemini Vision ──────────────────────────────────────────
        const imgRes = await fetch(url);
        if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
        const imgBuf = Buffer.from(await imgRes.arrayBuffer());
        const mimeType = (imgRes.headers.get("content-type") || "image/jpeg") as any;
        const result = await model.generateContent([
          FINAL_PROMPT,
          { inlineData: { data: imgBuf.toString("base64"), mimeType } },
        ]);
        return result.response.text();
      }
      // ── OpenAI / Replit AI fallback ────────────────────────────
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: FINAL_PROMPT },
            { type: "image_url", image_url: { url, detail: "low" } },
          ],
        }],
      });
      return response.choices[0]?.message?.content || "{}";
    };

    const processUrl = async (url: string) => {
      const MAX_ATTEMPTS = 3;
      // Cap any single wait so a batch can't exceed the gateway timeout.
      const MAX_DELAY = 8000;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const text = await callAI(url);
          const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const parsed = JSON.parse(cleaned);
          return { url, success: true, data: parsed };
        } catch (err: any) {
          const msg = String(err?.message || err);
          const isRateLimit = msg.includes("429") || /too many requests|quota|rate limit/i.test(msg);
          if (isRateLimit && attempt < MAX_ATTEMPTS) {
            const suggested = parseRetryDelay(msg) ?? 2000 * 2 ** (attempt - 1);
            await sleep(Math.min(suggested, MAX_DELAY));
            continue;
          }
          const friendly = isRateLimit
            ? "Gemini rate limit / quota reached. Wait a minute and try fewer images, or use Ollama."
            : msg;
          return { url, success: false, error: friendly };
        }
      }
      return { url, success: false, error: "AI generation failed after retries" };
    };

    // Limited concurrency (2 at a time) to respect free-tier rate limits
    try {
      const CONCURRENCY = 2;
      const results: any[] = [];
      for (let i = 0; i < imageUrls.length; i += CONCURRENCY) {
        const chunk = imageUrls.slice(i, i + CONCURRENCY);
        const chunkResults = await Promise.all(chunk.map(processUrl));
        results.push(...chunkResults);
      }

      // ── Post-process multi-color groups ────────────────────────────────────
      // Strip Arabic color words from AI-generated names and inject a unified
      // color list (built from the INPUT variant names, not AI output) into
      // descriptions after word 12.
      if (isMultiColor && results.filter((r) => r.success).length >= 2) {
        const ARABIC_COLOR_WORDS = [
          // Basic colors
          "أحمر","أسود","أبيض","أزرق","أخضر","أصفر","وردي","بنفسجي",
          "برتقالي","بيج","رمادي","ذهبي","فضي","بني","زيتي","كحلي",
          "تركواز","كريمي",
          // Extended fashion colors
          "خمري","عنابي","نيلي","قرمزي","مشمشي","فيروزي","ليلكي","بلاتيني",
          "نحاسي","برونزي","خردلي","زهري","سلمون","فحمي","ترابي","سماوي",
          "رصاصي","قهوي","توتي","عقيقي","لبني","قرنفلي","ليموني","موف",
          "مارون","لافندر","بيرل","شامبين","أوف وايت","أوف-وايت","تيفاني",
          "صدئ","خوخي","أرجواني","نعناعي","كاراميل","شوكولاتي","طوبي","دموي",
        ];

        function stripArabicColors(name: string): string {
          // Sort longest first so compound phrases like "أوف وايت" are removed
          // before their individual component words.
          const sorted = [...ARABIC_COLOR_WORDS].sort((a, b) => b.length - a.length);
          let result = name || "";
          for (const color of sorted) {
            result = result.split(color).join("");
          }
          return result.replace(/\s+/g, " ").trim();
        }

        function injectColorList(desc: string, colors: string[]): string {
          if (!colors.length) return desc;
          const sentence = `متوفر باللون ${colors.join(" و")}`;
          const words = (desc || "").trim().split(/\s+/);
          if (words.length <= 12) return ((desc || "").trim() + " " + sentence).trim();
          return (
            words.slice(0, 12).join(" ") +
            " " + sentence + " " +
            words.slice(12).join(" ")
          );
        }

        // Build color list from INPUT variant names sent by client.
        // Fall back to scanning the AI-generated names if none provided.
        const inputNames: string[] = Array.isArray(variantNames) ? variantNames : [];
        const allColors: string[] = [];
        const namesToScan = inputNames.length > 0
          ? inputNames
          : results.filter((r) => r.success && r.data).map((r) => r.data.name || "");

        for (const name of namesToScan) {
          for (const color of ARABIC_COLOR_WORDS) {
            if (name.includes(color) && !allColors.includes(color)) {
              allColors.push(color);
            }
          }
        }

        // Also pull explicit colorNames from AI response if we found nothing
        if (!allColors.length) {
          for (const r of results) {
            if (!r.success || !r.data) continue;
            const cnames: string[] = Array.isArray(r.data.colorNames) ? r.data.colorNames : [];
            for (const c of cnames) {
              if (c && !allColors.includes(c)) allColors.push(c);
            }
          }
        }

        for (const r of results) {
          if (!r.success || !r.data) continue;
          r.data.name = stripArabicColors(r.data.name);
          r.data.nameAr = stripArabicColors(r.data.nameAr);
          if (allColors.length >= 2) {
            r.data.description = injectColorList(r.data.description, allColors);
            r.data.descriptionAr = injectColorList(r.data.descriptionAr, allColors);
          }
        }
      }

      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "AI generation failed" });
    }
  });

  // ── AI visual grouping: detect the SAME product shown in different colors ───
  // The per-image analysis can't compare photos to each other, so this pass
  // sends all the photos together and asks the model which ones are literally
  // the same garment in a different colour. Returns index groups.
  app.post("/api/admin/ai-group", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { imageUrls } = req.body as { imageUrls: string[] };
    if (!Array.isArray(imageUrls) || imageUrls.length < 2) {
      return res.json({ groups: null }); // nothing to compare
    }
    // Too many images would make one request huge/slow — let the client fall
    // back to its text-based grouping instead.
    if (imageUrls.length > 40) {
      return res.json({ groups: null, tooMany: true });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const openaiBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    if (!geminiKey && !openaiKey && !openaiBase) {
      return res.json({ groups: null, noKey: true });
    }

    const GROUP_PROMPT = `You are shown ${imageUrls.length} photos of women's boutique products, in order. Image index 0 is the first photo, 1 is the second, and so on.
Your task: find groups of photos that show the EXACT SAME product — identical garment design, cut, silhouette, fabric, pattern, length, sleeves, neckline and details — but in a DIFFERENT COLOR. Also group photos that show the same product in the same color from different angles.
STRICT RULES:
- Only group photos when you are HIGHLY CONFIDENT they are literally the same style item. When in doubt, keep them separate.
- Different products that merely look similar (e.g. two different black dresses) must NOT be grouped.
- Every image index must appear EXACTLY once. A photo with no match is its own group of one.
Respond with ONLY valid JSON, no markdown, no extra text, in this exact shape:
{"groups": [[0,2],[1],[3,4]]}`;

    // Shrink images so one multi-image request stays fast and cheap.
    const small = (url: string) =>
      url.includes("/upload/") ? url.replace("/upload/", "/upload/w_500,q_auto/") : url;

    const normalizeGroups = (raw: any, n: number): number[][] => {
      const seen = new Set<number>();
      const groups: number[][] = [];
      for (const g of Array.isArray(raw) ? raw : []) {
        if (!Array.isArray(g)) continue;
        const clean: number[] = [];
        for (const idx of g) {
          const i = Number(idx);
          if (Number.isInteger(i) && i >= 0 && i < n && !seen.has(i)) { seen.add(i); clean.push(i); }
        }
        if (clean.length) groups.push(clean);
      }
      for (let i = 0; i < n; i++) if (!seen.has(i)) groups.push([i]);
      return groups;
    };

    try {
      let rawText = "{}";

      if (geminiKey) {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const model = new GoogleGenerativeAI(geminiKey)
          .getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-flash-latest" });
        const parts: any[] = [GROUP_PROMPT];
        for (let i = 0; i < imageUrls.length; i++) {
          const imgRes = await fetch(small(imageUrls[i]));
          if (!imgRes.ok) throw new Error(`Failed to fetch image ${i}: ${imgRes.status}`);
          const imgBuf = Buffer.from(await imgRes.arrayBuffer());
          const mimeType = (imgRes.headers.get("content-type") || "image/jpeg") as any;
          parts.push(`Image ${i}:`);
          parts.push({ inlineData: { data: imgBuf.toString("base64"), mimeType } });
        }
        const result = await model.generateContent(parts);
        rawText = result.response.text();
      } else {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: openaiKey || "replit", ...(openaiBase ? { baseURL: openaiBase } : {}) });
        const content: any[] = [{ type: "text", text: GROUP_PROMPT }];
        for (let i = 0; i < imageUrls.length; i++) {
          content.push({ type: "text", text: `Image ${i}:` });
          content.push({ type: "image_url", image_url: { url: small(imageUrls[i]), detail: "low" } });
        }
        const response = await openai.chat.completions.create({
          model: "gpt-4o", max_tokens: 500,
          messages: [{ role: "user", content }],
        });
        rawText = response.choices[0]?.message?.content || "{}";
      }

      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const groups = normalizeGroups(parsed?.groups, imageUrls.length);
      res.json({ groups });
    } catch (err: any) {
      // On any failure, tell the client to fall back to text-based grouping.
      res.json({ groups: null, error: String(err?.message || err) });
    }
  });

  // ── Clean main-photo export ────────────────────────────────────────────
  // Downloads only the MAIN photo for every color variant of each selected
  // product. No watermark is burned in. Every exported item is normalized to
  // a standard JPEG and written directly at the ZIP root (no nested folders),
  // so opening the ZIP immediately shows normal image files.
  app.post("/api/admin/products/main-photos", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { ids } = req.body as { ids?: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids required" });
    }

    const MAX_PHOTOS = 300; // keep one request bounded
    try {
      const { buildZip } = await import("./watermark");
      const sharp = (await import("sharp")).default;
      const entries: { name: string; data: Buffer }[] = [];
      let failed = 0;

      const safeName = (s: string, fallback = "product") =>
        (s || fallback)
          .replace(/[^\p{L}\p{N} _-]+/gu, "")
          .trim()
          .replace(/\s+/g, "-")
          .slice(0, 50) || fallback;

      type ExportPhoto = { url: string; colorName?: string; colorIndex?: number };

      outer: for (const rawId of ids) {
        const id = Number(rawId);
        if (!Number.isInteger(id) || id <= 0) continue;

        const product = await storage.getProduct(id);
        if (!product) continue;

        const variants = Array.isArray((product as any).colorVariants)
          ? ((product as any).colorVariants as any[])
          : [];
        const photos: ExportPhoto[] = [];

        if (variants.length > 0) {
          // Exactly one image per color: prefer the color's explicit mainImage,
          // then its primary image media, then its first legacy side image.
          variants.forEach((variant, colorIndex) => {
            const media = Array.isArray(variant?.media) ? variant.media : [];
            const primaryMedia = media.find(
              (m: any) => m?.type === "image" && m?.isPrimary && typeof m?.url === "string",
            );
            const firstImageMedia = media.find(
              (m: any) => m?.type === "image" && typeof m?.url === "string",
            );
            const url =
              (typeof variant?.mainImage === "string" && variant.mainImage) ||
              primaryMedia?.url ||
              firstImageMedia?.url ||
              (Array.isArray(variant?.images) && typeof variant.images[0] === "string"
                ? variant.images[0]
                : "");

            if (url) {
              photos.push({
                url,
                colorName: typeof variant?.name === "string" ? variant.name : `color-${colorIndex + 1}`,
                colorIndex,
              });
            }
          });
        } else {
          // Older/single-color products have no colorVariants, so export their
          // top-level main image as the one product photo.
          const url = typeof (product as any).mainImage === "string"
            ? (product as any).mainImage
            : "";
          if (url) photos.push({ url });
        }

        const base = `${id}-${safeName((product as any).name)}`;
        for (let i = 0; i < photos.length; i++) {
          if (entries.length >= MAX_PHOTOS) break outer;
          const photo = photos[i];
          try {
            const imgRes = await fetch(photo.url);
            if (!imgRes.ok) throw new Error(`fetch ${imgRes.status}`);
            const input = Buffer.from(await imgRes.arrayBuffer());

            // Convert to a regular JPEG photo. This does NOT composite or add
            // the Lucerne watermark; stored product images remain untouched.
            const jpeg = await sharp(input, { failOn: "none" })
              .rotate()
              .jpeg({ quality: 95, mozjpeg: true })
              .toBuffer();

            const colorPart = photo.colorName
              ? `-${safeName(photo.colorName, `color-${(photo.colorIndex ?? i) + 1}`)}`
              : "-main";
            // Flat file name — deliberately no `/`, so there are no folders.
            let filename = `${base}${colorPart}.jpg`;
            let suffix = 2;
            const existing = new Set(entries.map((entry) => entry.name));
            while (existing.has(filename)) {
              filename = `${base}${colorPart}-${suffix++}.jpg`;
            }
            entries.push({ name: filename, data: jpeg });
          } catch (err) {
            failed++;
            console.error("[main-photo-export] photo failed:", photo.url, err);
          }
        }
      }

      if (entries.length === 0) {
        return res.status(404).json({ message: "No main photos could be processed", failed });
      }

      const zip = buildZip(entries);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="lucerne-main-photos-${Date.now()}.zip"`,
      );
      res.setHeader("X-Photos-Included", String(entries.length));
      res.setHeader("X-Photos-Failed", String(failed));
      res.send(zip);
    } catch (err: any) {
      console.error("[main-photo-export] export failed:", err);
      res.status(500).json({ message: err?.message || "Main photo export failed" });
    }
  });

  // ── AI product photo generation (Gemini image model / "Nano Banana") ───────
  // Takes an existing product image (uploaded reference OR an existing
  // product's current photo) and generates a brand-new premium campaign
  // photo of the SAME physical product — background/lighting/angle only.
  // Used by: (1) AI Autofill, to turn the uploaded reference photo into a
  // generated main photo while the original becomes a side photo, and
  // (2) the "Generate AI Photo" button on any existing product photo.
  app.post("/api/admin/ai-generate-photo", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { imageUrl, shotType, isFootwear } = req.body as {
      imageUrl?: string;
      shotType?: "model" | "product";
      isFootwear?: boolean;
    };
    if (!imageUrl || typeof imageUrl !== "string") {
      return res.status(400).json({ message: "imageUrl required" });
    }
    try {
      const { generateAiProductPhoto } = await import("./aiPhotoGen");
      const { buffer } = await generateAiProductPhoto(
        imageUrl,
        shotType === "model" ? "model" : "product",
        !!isFootwear,
      );
      const url = await uploadToCloudinary(buffer, "ai-generated-photo.png");
      res.json({ url });
    } catch (err: any) {
      console.error("[ai-generate-photo]", err?.message || err);
      res.status(err?.noKey ? 503 : 500).json({
        message: err?.message || "AI photo generation failed",
        noKey: !!err?.noKey,
      });
    }
  });

  // ── AI image generation from a text description (no source photo) ──────────
  // Used for category tiles, hero banners, and subcategory thumbnails where
  // the admin has only typed a name/description — not an existing product
  // photo to re-shoot. Separate from /api/admin/ai-generate-photo above,
  // which always requires a source image.
  app.post("/api/admin/ai-generate-image", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { prompt, aspect } = req.body as {
      prompt?: string;
      aspect?: "square" | "portrait" | "landscape";
    };
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ message: "prompt required" });
    }
    try {
      const { generateImageFromPrompt } = await import("./aiPhotoGen");
      const { buffer } = await generateImageFromPrompt(
        prompt.trim().slice(0, 300),
        aspect === "square" || aspect === "portrait" ? aspect : "landscape",
      );
      const url = await uploadToCloudinary(buffer, "ai-generated-image.png");
      res.json({ url });
    } catch (err: any) {
      console.error("[ai-generate-image]", err?.message || err);
      res.status(err?.noKey ? 503 : 500).json({
        message: err?.message || "AI image generation failed",
        noKey: !!err?.noKey,
      });
    }
  });

  // ── Ollama backend proxy (tags / chat / health / url) ──────────────────────
  registerOllamaRoutes(app);

  // ── Bulk product creation ──────────────────────────────────────────────────
  app.post("/api/admin/bulk-create", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return failureResponse(res, 401, "Unauthorized");
    }
    const { products: productsInput } = req.body as { products: any[] };
    if (!Array.isArray(productsInput) || productsInput.length === 0) {
      return failureResponse(res, 400, "products array required");
    }
    const created: any[] = [];
    const errors: { index: number; error: string }[] = [];
    for (let i = 0; i < productsInput.length; i++) {
      try {
        const p = productsInput[i];

        // Build colour variants (with per-size inventory) from the client, then
        // aggregate the product-level sizes/colors/sizeInventory/stock from them.
        const rawVariants = Array.isArray(p.colorVariants) ? p.colorVariants : [];
        const colorVariants = rawVariants.map((v: any) => {
          const sizeInventory: Record<string, number> = {};
          const srcInv = (v && typeof v.sizeInventory === "object" && v.sizeInventory) || {};
          for (const [sz, qty] of Object.entries(srcInv)) {
            const n = Number(qty);
            if (sz) sizeInventory[sz] = Number.isFinite(n) ? n : 0;
          }
          const sizes = Array.isArray(v?.sizes) && v.sizes.length
            ? v.sizes.map(String)
            : Object.keys(sizeInventory);
          return {
            name: String(v?.name || "").trim() || "Default",
            colorCode: String(v?.colorCode || "#000000"),
            colorTags: Array.isArray(v?.colorTags) ? v.colorTags : [],
            mainImage: String(v?.mainImage || ""),
            images: Array.isArray(v?.images) ? v.images : [],
            media: Array.isArray(v?.media) ? v.media : [],
            sizes,
            sizeInventory,
            barcode: typeof v?.barcode === "string" && v.barcode.trim() ? v.barcode.trim() : undefined,
          };
        });

        if (p.videoUrl && colorVariants.length > 0) {
          const videoUrl = String(p.videoUrl).trim();
          const firstMedia = Array.isArray(colorVariants[0].media) ? colorVariants[0].media : [];
          if (videoUrl && !firstMedia.some((item: any) => item?.type === "video" && item?.url === videoUrl)) {
            colorVariants[0].media = [{ type: "video", url: videoUrl }, ...firstMedia];
          }
        }

        const aggSizeInventory: Record<string, number> = {};
        for (const cv of colorVariants) {
          for (const [sz, qty] of Object.entries(cv.sizeInventory)) {
            aggSizeInventory[sz] = (aggSizeInventory[sz] || 0) + (qty as number);
          }
        }
        const aggSizes = Array.from(new Set(colorVariants.flatMap((cv: any) => cv.sizes)));
        const aggColors = Array.isArray(p.colors) && p.colors.length
          ? p.colors
          : colorVariants.map((cv: any) => cv.name).filter(Boolean);
        const variantStock = Object.values(aggSizeInventory).reduce((s, q) => s + (q as number), 0);

        const productData: any = {
          name: String(p.name || "").trim(),
          description: String(p.description || p.name || "").trim(),
          price: String(parseFloat(p.price || "0") || 0),
          mainImage: String(p.mainImage || ""),
          images: Array.isArray(p.images) ? p.images.filter((u: string) => u && u !== String(p.mainImage || "")) : [],
          videoUrl: p.videoUrl ? String(p.videoUrl) : null,
          categoryId: p.categoryId ? Number(p.categoryId) : null,
          subcategoryId: p.subcategoryId ? Number(p.subcategoryId) : null,
          subcategoryIds: Array.isArray(p.subcategoryIds) ? p.subcategoryIds : (p.subcategoryId ? [Number(p.subcategoryId)] : []),
          colors: aggColors,
          sizes: aggSizes,
          sizeInventory: aggSizeInventory,
          colorVariants,
          stockQuantity: variantStock || Number(p.stockQuantity || 0),
          isFeatured: Boolean(p.isFeatured),
          isNewArrival: Boolean(p.isNewArrival),
          isBestSeller: Boolean(p.isBestSeller),
          brand: p.brand || null,
        };
        if (!productData.name) { errors.push({ index: i, error: "Name is required" }); continue; }
        const cleanProductData = await normalizeProductPayload(productData, { partial: false });
        const product = await storage.createProduct(cleanProductData);
        warmCloudinaryCache(cleanProductData.mainImage).catch(() => {});
        created.push(product);
      } catch (err: any) {
        errors.push({ index: i, error: err.message });
      }
    }
    return successResponse(res, { created: created.length, errors }, 200, { created: created.length, errors });
  });

  // ── Products export (JSON backup) ─────────────────────────────────────────
  app.get("/api/admin/products/export-json", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const products = await storage.getProducts();
      const cats = await storage.getCategories();
      const subs = await storage.getSubcategories();
      const catMap = Object.fromEntries(cats.map((c: any) => [c.id, c.name]));
      const subMap = Object.fromEntries(subs.map((s: any) => [s.id, s.name]));
      const exportData = {
        version: "3",
        exportedAt: new Date().toISOString(),
        totalProducts: products.length,
        products: products.map((p: any) => ({
          ...p,
          categoryName: p.categoryId ? catMap[p.categoryId] : null,
          subcategoryName: p.subcategoryId ? subMap[p.subcategoryId] : null,
        })),
        categories: cats,
        subcategories: subs,
      };
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="lucerne-products-backup-${new Date().toISOString().slice(0, 10)}.json"`);
      res.json(exportData);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Export failed" });
    }
  });

  // ── Products import (JSON backup restore) ─────────────────────────────────
  app.post("/api/admin/products/import", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return failureResponse(res, 401, "Unauthorized");
    }
    try {
      const body = req.body as {
        products: any[];
        updateExisting?: boolean;
        skipExisting?: boolean;
      };
      const productsInput = body.products;
      const updateExisting = body.updateExisting ?? body.skipExisting ?? true;
      if (!Array.isArray(productsInput) || productsInput.length === 0) {
        return failureResponse(res, 400, "products array required");
      }

      const categories = await storage.getCategories();
      const subcategories = await storage.getSubcategories();
      const validCategoryIds = new Set(categories.map((category: any) => Number(category.id)));
      const validSubcategoryIds = new Set(subcategories.map((subcategory: any) => Number(subcategory.id)));
      const categoryNameToId = new Map<string, number>();
      const subcategoryNameToId = new Map<string, number>();
      for (const category of categories as any[]) {
        if (category.name) categoryNameToId.set(String(category.name).toLowerCase(), category.id);
        if (category.nameAr) categoryNameToId.set(String(category.nameAr).toLowerCase(), category.id);
      }
      for (const subcategory of subcategories as any[]) {
        if (subcategory.name) subcategoryNameToId.set(String(subcategory.name).toLowerCase(), subcategory.id);
        if (subcategory.nameAr) subcategoryNameToId.set(String(subcategory.nameAr).toLowerCase(), subcategory.id);
      }

      let created = 0;
      let updated = 0;
      const errors: string[] = [];

      for (let index = 0; index < productsInput.length; index++) {
        try {
          const source = productsInput[index] || {};
          const sourceCategoryId = Number(source.categoryId);
          const sourceSubcategoryId = Number(source.subcategoryId);
          const categoryId = validCategoryIds.has(sourceCategoryId)
            ? sourceCategoryId
            : source.categoryName
              ? categoryNameToId.get(String(source.categoryName).toLowerCase()) ?? null
              : null;
          const subcategoryId = validSubcategoryIds.has(sourceSubcategoryId)
            ? sourceSubcategoryId
            : source.subcategoryName
              ? subcategoryNameToId.get(String(source.subcategoryName).toLowerCase()) ?? null
              : null;
          const subcategoryIds = Array.from(
            new Set(
              (Array.isArray(source.subcategoryIds) ? source.subcategoryIds : [])
                .map((value: any) => Number(value))
                .filter((value: number) => Number.isInteger(value) && validSubcategoryIds.has(value)),
            ),
          );
          if (subcategoryId && !subcategoryIds.includes(subcategoryId)) subcategoryIds.unshift(subcategoryId);

          const colorVariants = Array.isArray(source.colorVariants) ? source.colorVariants : [];
          const mainImage = String(
            source.mainImage || colorVariants[0]?.mainImage || "",
          ).trim();
          const price = parseFloat(String(source.price ?? "0"));
          const productData: any = {
            name: String(source.name || "").trim(),
            description: String(source.description || source.name || "").trim(),
            price: Number.isFinite(price) ? price.toFixed(2) : "0.00",
            mainImage,
            images: Array.isArray(source.images) ? source.images : [],
            categoryId,
            subcategoryId,
            subcategoryIds,
            brand: source.brand || null,
            barcode: source.barcode || null,
            sizes: Array.isArray(source.sizes) ? source.sizes : [],
            colors: Array.isArray(source.colors) ? source.colors : [],
            sizeInventory: source.sizeInventory && typeof source.sizeInventory === "object"
              ? source.sizeInventory
              : {},
            colorVariants,
            stockQuantity: Math.max(0, Number(source.stockQuantity) || 0),
            discountPrice: source.discountPrice || null,
            costPrice: source.costPrice || null,
            isFeatured: Boolean(source.isFeatured),
            isNewArrival: Boolean(source.isNewArrival),
            isBestSeller: Boolean(source.isBestSeller),
            videoUrl: source.videoUrl || null,
          };

          if (!productData.name || parseFloat(productData.price) <= 0) {
            errors.push(`Product ${index + 1}: valid name and price are required`);
            continue;
          }
          const cleanProductData = await normalizeProductPayload(productData, { partial: false });

          const sourceId = Number(source.id);
          const existing = Number.isInteger(sourceId) && sourceId > 0
            ? await storage.getProduct(sourceId)
            : undefined;
          if (existing && updateExisting) {
            await storage.updateProduct(existing.id, cleanProductData);
            updated++;
          } else {
            await storage.createProduct(cleanProductData);
            created++;
          }

          // Warm main image
          warmCloudinaryCache(cleanProductData.mainImage).catch(() => {});
          // Warm product-level side photos
          for (const url of cleanProductData.images || []) {
            const u = typeof url === "string" ? url.trim() : "";
            if (u && u !== cleanProductData.mainImage) warmCloudinaryCache(u).catch(() => {});
          }
          // Warm all variant images (main + side photos + media)
          for (const variant of cleanProductData.colorVariants || []) {
            const variantMain = typeof variant?.mainImage === "string" ? variant.mainImage.trim() : "";
            if (variantMain && variantMain !== cleanProductData.mainImage) warmCloudinaryCache(variantMain).catch(() => {});
            for (const url of (Array.isArray(variant?.images) ? variant.images : [])) {
              const u = typeof url === "string" ? url.trim() : "";
              if (u && u !== cleanProductData.mainImage && u !== variantMain) warmCloudinaryCache(u).catch(() => {});
            }
            for (const item of (Array.isArray(variant?.media) ? variant.media : [])) {
              const u = typeof item?.url === "string" ? item.url.trim() : "";
              if (u && item?.type === "image" && u !== cleanProductData.mainImage && u !== variantMain) warmCloudinaryCache(u).catch(() => {});
            }
          }
        } catch (err: any) {
          errors.push(`Product ${index + 1}: ${err?.message || "Unknown error"}`);
        }
      }

      const data = { created, updated, errors, total: productsInput.length };
      return successResponse(res, data, 200, data);
    } catch (err: any) {
      logProductError("products.import-json", err, { payload: req.body, userId: (req.user as any)?.id });
      return failureResponse(res, 500, err?.message || "Import failed", err);
    }
  });

  app.get("/api/chat/suggestions", (_req, res) => {
    res.json({
      ar: [
        { label: "فساتين 👗",          query: "ابي اشوف الفساتين" },
        { label: "أحذية 👠",            query: "ابي اشوف الأحذية" },
        { label: "عروض 🏷️",            query: "في عندكم عروض وتخفيضات" },
        { label: "وين طلبي؟ 🚚",        query: "وين طلبي" },
        { label: "نقاطي 💎",            query: "كم نقاطي" },
        { label: "الاستبدال 🔁",         query: "كيف ابدل المنتج" },
        { label: "اعرف مقاسي 📏",       query: "اكتشف مقاسي" },
      ],
      en: [
        { label: "Dresses 👗",         query: "show me dresses" },
        { label: "Shoes 👠",           query: "show me shoes" },
        { label: "Sales 🏷️",          query: "do you have sales or deals" },
        { label: "Track Order 🚚",     query: "where is my order" },
        { label: "My Points 💎",       query: "how many points do I have" },
        { label: "Exchange 🔁",        query: "how do I exchange an item" },
        { label: "Find My Size 📏",    query: "find my size" },
      ],
    });
  });

  // ── Product Groups ──────────────────────────────────────────────────────
  app.get("/api/admin/product-groups", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const groups = await storage.getProductGroups();
    res.json(groups);
  });

  app.post("/api/admin/product-groups", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { name, productIds } = req.body;
    if (!name) return res.status(400).json({ message: "name required" });
    const group = await storage.createProductGroup(name, Array.isArray(productIds) ? productIds : []);
    res.json(group);
  });

  app.patch("/api/admin/product-groups/:id/add", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { productIds } = req.body;
    const group = await storage.addProductsToGroup(Number(req.params.id), Array.isArray(productIds) ? productIds : []);
    if (!group) return res.status(404).json({ message: "Group not found" });
    res.json(group);
  });

  app.delete("/api/admin/product-groups/:id", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    await storage.deleteProductGroup(Number(req.params.id));
    res.json({ success: true });
  });

  return httpServer;
}
