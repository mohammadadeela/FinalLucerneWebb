import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { setupAuth } from "./auth";
import passport from "passport";
import { z } from "zod";
import multer from "multer";
import path from "path";
import { randomUUID, randomInt } from "crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { uploadToCloudinary, deleteFromCloudinary, uploadVideoToCloudinary } from "./cloudinary";
import { sendPasswordResetCode, sendSignupVerificationCode, sendOrderNotification, sendOrderConfirmationToCustomer, sendExchangeStatusEmail, sendExchangeAdminNotification, sendAbandonedCartEmail, sendSaleDiscountEmail, sendDiscountCodeEmail } from "./email";
import ExcelJS from "exceljs";
import rateLimit from "express-rate-limit";
import { spawn } from "child_process";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const { hashPassword } = setupAuth(app);

  app.post("/api/upload", (req, res, next) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  }, (req, res, next) => {
    upload.array("images", 10)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ message: "File too large. Max 10MB per image." });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({ message: "Too many files. Max 10 images." });
        }
        return res.status(400).json({ message: err.message });
      }
      if (err) {
        return res.status(400).json({ message: err.message || "Upload failed" });
      }
      next();
    });
  }, async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }
    try {
      const urls = await Promise.all(
        files.map(f => uploadToCloudinary(f.buffer, f.originalname))
      );
      res.json({ urls });
    } catch (err: any) {
      console.error("Cloudinary upload error:", err);
      res.status(500).json({ message: "Image upload failed. Please try again." });
    }
  });

  app.delete("/api/upload", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ message: "url is required" });
    }
    if (!url.includes("cloudinary.com")) {
      return res.status(400).json({ message: "Not a Cloudinary URL" });
    }
    await deleteFromCloudinary(url);
    res.json({ success: true });
  });

  app.post("/api/upload-video", (req, res, next) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  }, (req, res, next) => {
    uploadVideo.single("video")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ message: "File too large. Max 100MB per video." });
        }
        return res.status(400).json({ message: err.message });
      }
      if (err) {
        return res.status(400).json({ message: err.message || "Upload failed" });
      }
      next();
    });
  }, async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No video uploaded" });
    try {
      const url = await uploadVideoToCloudinary(file.buffer, file.originalname);
      res.json({ url });
    } catch (err: any) {
      console.error("Cloudinary video upload error:", err);
      res.status(500).json({ message: "Video upload failed. Please try again." });
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

    const adminUser = await storage.getUserByEmail("admin@lucerne.com");
    if (!adminUser) {
      await storage.createUser({
        email: "admin@lucerne.com",
        password: await hashPassword("admin123"),
        role: "admin",
        fullName: "Store Admin",
        isVerified: true,
      });
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

      // Verify that the signup code was validated before allowing registration
      const signupCode = req.body.signupCode as string | undefined;
      if (signupCode) {
        const entry = signupCodes.get(input.email);
        if (!entry || entry.code !== signupCode || Date.now() > entry.expiresAt) {
          return res.status(400).json({ message: "invalid_code" });
        }
        signupCodes.delete(input.email);
      }

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
        if (code === "invalid_password") return res.status(401).json({ message: "invalid_password" });
        return res.status(401).json({ message: "invalid_credentials" });
      }

      req.login(user, (loginErr) => {
        if (loginErr) return res.status(500).json({ message: "Login failed" });
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
    try {
      const { idToken, provider, displayName } = req.body;
      if (!idToken) return res.status(400).json({ message: "Missing idToken" });

      const parts = idToken.split(".");
      if (parts.length !== 3) return res.status(401).json({ message: "Invalid Firebase token" });
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
      const projectId = process.env.FIREBASE_PROJECT_ID || "lucerne-69027";
      if (payload.aud !== projectId) {
        return res.status(401).json({ message: "Invalid Firebase token audience" });
      }
      if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
        return res.status(401).json({ message: "Invalid Firebase token issuer" });
      }
      if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length === 0) {
        return res.status(401).json({ message: "Invalid Firebase token subject" });
      }
      if (payload.auth_time && payload.auth_time > nowSec + 60) {
        return res.status(401).json({ message: "Invalid Firebase token auth time" });
      }

      const email: string = payload.email || "";
      if (!email) return res.status(400).json({ message: "No email in Firebase token" });

      let user = await storage.getUserByEmail(email);
      if (!user) {
        user = await storage.createUser({
          email,
          password: randomUUID(),
          fullName: displayName || payload.name || email.split("@")[0],
          role: "customer",
          isVerified: true,
        });
      } else if (!user.isVerified) {
        await storage.updateUser(user.id, { isVerified: true });
        user = (await storage.getUser(user.id))!;
      }

      if (user.isBlocked) return res.status(403).json({ message: "account_blocked" });

      req.login(user, (loginErr) => {
        if (loginErr) return res.status(500).json({ message: "Login failed" });
        const { password, verificationCode: _vc, ...safe } = user!;
        res.json(safe);
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
  const EXCHANGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

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

      const orderCreatedAt = orderData.order.createdAt ? new Date(orderData.order.createdAt as any).getTime() : null;
      if (!orderCreatedAt || (Date.now() - orderCreatedAt) > EXCHANGE_WINDOW_MS) {
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
      const isExcluded =
        (product.categoryId != null && excludedCategoryIds.has(Number(product.categoryId))) ||
        (product.subcategoryId != null && excludedSubcategoryIds.has(Number(product.subcategoryId)));
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
          const originalPrice = String(product.price ?? "0");
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
            true // skipStockCheck: exchange orders bypass inventory validation
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

          // Email notification so the customer doesn't miss the update
          if (exchReq.userId) {
            const customerUser = await storage.getUser(exchReq.userId);
            if (customerUser?.email) {
              sendExchangeStatusEmail(customerUser.email, {
                status: status as "approved" | "denied",
                orderRef,
                productName,
                adminNote: adminNote ?? null,
                preferredSize: exchReq.preferredSize ?? null,
                preferredColor: exchReq.preferredColor ?? null,
              }).catch(console.error);
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
    const limit = Math.min(parseInt(String(req.query.limit || "8")), 20);
    const items = await storage.getBestSellers(limit);
    res.json(items);
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
      const ids = await storage.getProductRecommendations(productId);
      res.json(ids);
    } catch (e) {
      res.json([]);
    }
  });

  app.get(api.products.list.path, async (req, res) => {
    const products = await storage.getProducts();
    res.json(products);
  });

  app.get(api.products.get.path, async (req, res) => {
    const product = await storage.getProduct(Number(req.params.id));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.post(api.products.create.path, async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.products.create.input.parse(req.body);
      const product = await storage.createProduct(input);
      res.status(201).json(product);
    } catch (err) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.put(api.products.update.path, async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const input = api.products.update.input.parse(req.body);
      const product = await storage.updateProduct(Number(req.params.id), input);
      if (!product) return res.status(404).json({ message: "Not found" });
      res.json(product);
    } catch (err) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  app.delete(api.products.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const success = await storage.deleteProduct(Number(req.params.id));
    if (!success) return res.status(404).json({ message: "Not found" });
    res.status(204).send();
  });

  app.patch("/api/products/bulk-flags", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { ids, updates } = req.body as {
      ids: number[];
      updates: { isBestSeller?: boolean; isNewArrival?: boolean; isFeatured?: boolean };
    };
    if (!Array.isArray(ids) || ids.length === 0 || typeof updates !== "object") {
      return res.status(400).json({ message: "Invalid payload" });
    }
    await Promise.all(ids.map(id => storage.updateProduct(id, updates as any)));
    res.json({ updated: ids.length });
  });

  // Expire new arrivals older than N days & persist the period setting
  app.patch("/api/admin/products/expire-new-arrivals", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const daysNum = Math.max(1, Math.min(365, Number(req.body.days ?? 14)));
    await storage.setSiteSetting("new_arrivals_days", String(daysNum));
    const result = await db.execute(sql`
      UPDATE products
      SET is_new_arrival = false
      WHERE is_new_arrival = true
        AND created_at < NOW() - (${daysNum} * INTERVAL '1 day')
    `);
    res.json({ updated: result.rowCount ?? 0, days: daysNum });
  });

  // --- Bulk Product Import (Excel) ---
  app.get("/api/admin/products/bulk-template", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const headers = [
      "name", "name_ar", "description", "price", "cost_price", "discount_price",
      "category_id", "barcode", "brand", "sizes", "stock_quantity",
      "colors", "color_codes",
      "is_featured", "is_new_arrival", "is_best_seller", "main_image_url",
    ];
    const example = [
      "Summer Dress", "فستان صيفي", "Product description", 150, 80, 120,
      1, "12345678", "Lucerne", "S,M,L", 10,
      "Black,White", "#000000,#FFFFFF",
      "no", "yes", "no", "https://res.cloudinary.com/YOUR_URL_HERE",
    ];
    const hint = [
      "اسم المنتج بالإنجليزي (مطلوب)", "اسم المنتج بالعربي (اختياري)", "وصف", "السعر (مطلوب)", "سعر التكلفة", "سعر الخصم",
      "رقم الفئة: 1=فساتين 4=شوزات 10=ملابس 11=بناطيل", "الباركود", "الماركة",
      "المقاسات مفصولة بفاصلة: S,M,L أو 36,37,38", "الكمية الإجمالية",
      "أسماء الألوان مفصولة بفاصلة: Black,White,Red", "كودات الألوان HEX مفصولة بفاصلة: #000000,#FFFFFF,#FF0000",
      "yes / no", "yes / no", "yes / no", "رابط صورة كلاودينري (مطلوب)",
    ];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Products");
    ws.addRow(headers);
    ws.addRow(hint);
    ws.addRow(example);
    ws.columns = headers.map(() => ({ width: 28 }));
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="lucerne-products-template.xlsx"');
    res.send(buf);
  });

  app.post("/api/admin/products/bulk-import", uploadExcel.single("file"), async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      const rows: Record<string, any>[] = [];
      const headerRow = (ws.getRow(1).values as any[]).slice(1);
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const obj: Record<string, any> = {};
        const values = (row.values as any[]).slice(1);
        headerRow.forEach((key: string, i: number) => { obj[key] = values[i] ?? ""; });
        rows.push(obj);
      });
      const results: { created: number; errors: string[] } = { created: 0, errors: [] };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        try {
          const name = String(row.name ?? "").trim();
          if (!name || name.startsWith("اسم المنتج")) continue; // skip hint row
          const price = parseFloat(String(row.price ?? "0").replace(/[^\d.]/g, ""));
          if (isNaN(price) || price <= 0) { results.errors.push(`صف ${rowNum}: السعر غير صحيح`); continue; }
          const mainImage = String(row.main_image_url ?? "").trim();
          if (!mainImage || mainImage.startsWith("رابط") || mainImage.includes("YOUR_URL")) {
            results.errors.push(`صف ${rowNum}: رابط الصورة مطلوب`); continue;
          }
          const categoryId = parseInt(String(row.category_id ?? "1")) || 1;
          const stockQty = parseInt(String(row.stock_quantity ?? "0")) || 0;
          const sizesRaw = String(row.sizes ?? "").trim();
          const sizesArr = sizesRaw ? sizesRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
          const colorsRaw = String(row.colors ?? "").trim();
          const colorCodesRaw = String(row.color_codes ?? "").trim();
          const colorsArr = colorsRaw ? colorsRaw.split(",").map((c: string) => c.trim()).filter(Boolean) : [];
          const colorCodesArr = colorCodesRaw ? colorCodesRaw.split(",").map((c: string) => c.trim()).filter(Boolean) : [];

          let sizeInventory: Record<string, number> = {};
          let colorVariants: any[] = [];

          if (colorsArr.length > 0) {
            // Build per-color variants with their own sizeInventory
            const perColor = colorsArr.length > 0 ? Math.floor(stockQty / colorsArr.length) : stockQty;
            const perColorPerSize = sizesArr.length > 0 ? Math.floor(perColor / sizesArr.length) : perColor;
            colorVariants = colorsArr.map((colorName: string, idx: number) => {
              const colorCode = colorCodesArr[idx] || "#000000";
              const sizeInv: Record<string, number> = {};
              sizesArr.forEach((s: string) => { sizeInv[s] = perColorPerSize; });
              return { name: colorName, sizes: sizesArr, sizeInventory: sizeInv, colorCode, mainImage, images: [] };
            });
            // Merge sizeInventory across all color variants
            colorVariants.forEach((cv: any) => {
              Object.entries(cv.sizeInventory as Record<string, number>).forEach(([sz, qty]) => {
                sizeInventory[sz] = (sizeInventory[sz] || 0) + qty;
              });
            });
          } else if (sizesArr.length > 0) {
            const perSize = Math.floor(stockQty / sizesArr.length);
            sizesArr.forEach((s: string) => { sizeInventory[s] = perSize; });
          }

          const yesNo = (v: any) => ["yes", "true", "1", "نعم"].includes(String(v ?? "").toLowerCase().trim());
          const nameAr = String(row.name_ar ?? "").trim();
          const product: any = {
            name,
            nameAr: nameAr || null,
            description: String(row.description ?? "").trim() || name,
            price: price.toFixed(2),
            costPrice: row.cost_price ? parseFloat(String(row.cost_price)).toFixed(2) : null,
            discountPrice: row.discount_price ? parseFloat(String(row.discount_price)).toFixed(2) : null,
            mainImage,
            images: [],
            categoryId,
            subcategoryId: null,
            barcode: String(row.barcode ?? "").trim(),
            brand: String(row.brand ?? "").trim(),
            sizes: sizesArr,
            colors: colorsArr,
            sizeInventory,
            colorVariants,
            stockQuantity: stockQty,
            isFeatured: yesNo(row.is_featured),
            isNewArrival: yesNo(row.is_new_arrival),
            isBestSeller: yesNo(row.is_best_seller),
          };
          await storage.createProduct(product);
          results.created++;
        } catch (err: any) {
          results.errors.push(`صف ${rowNum}: ${err.message}`);
        }
      }
      res.json(results);
    } catch (err: any) {
      res.status(400).json({ message: "فشل قراءة الملف: " + err.message });
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
    
    if (user.role === 'admin') {
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
    
    res.json(orderData);
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
              const subCatMatch = hasSubCatFilter && product.subcategoryId != null && discount.subcategoryIds!.includes(product.subcategoryId);
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
      if (customerUser?.email) {
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
      link: "/profile",
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
      .filter(p => p.stockQuantity < 3)
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
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { ids, discountPercent } = req.body as { ids: number[]; discountPercent: number };
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No product IDs provided" });
      }
      if (typeof discountPercent !== "number" || discountPercent <= 0 || discountPercent >= 100) {
        return res.status(400).json({ message: "Discount percent must be between 1 and 99" });
      }
      let updated = 0;
      for (const id of ids) {
        const product = await storage.getProduct(id);
        if (!product) continue;
        const basePrice = parseFloat(product.price);
        const discountPrice = (basePrice * (1 - discountPercent / 100)).toFixed(2);
        await storage.updateProduct(id, { discountPrice } as any);
        updated++;
      }
      res.json({ updated });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Remove discount from products
  app.patch("/api/admin/products/remove-discount", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { ids } = req.body as { ids: number[] };
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No product IDs provided" });
      }
      let updated = 0;
      for (const id of ids) {
        const product = await storage.getProduct(id);
        if (!product) continue;
        await storage.updateProduct(id, { discountPrice: null } as any);
        updated++;
      }
      res.json({ updated });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
      const { code, discountPercent, maxUses, expiresAt, isActive, categoryIds, subcategoryIds } = req.body;
      if (!code || !discountPercent) return res.status(400).json({ message: "Code and discount percent are required" });
      if (Number(discountPercent) < 1 || Number(discountPercent) > 100) return res.status(400).json({ message: "Discount percent must be between 1 and 100" });
      if (maxUses && Number(maxUses) < 1) return res.status(400).json({ message: "Max uses must be at least 1" });
      const created = await storage.createDiscountCode({
        code: code.toUpperCase().trim(),
        discountPercent: Number(discountPercent),
        maxUses: maxUses ? Number(maxUses) : null,
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
      const { code, discountPercent, maxUses, expiresAt, isActive, categoryIds, subcategoryIds } = req.body;
      if (discountPercent !== undefined && (Number(discountPercent) < 1 || Number(discountPercent) > 100)) return res.status(400).json({ message: "Discount percent must be between 1 and 100" });
      if (maxUses !== undefined && maxUses !== null && Number(maxUses) < 1) return res.status(400).json({ message: "Max uses must be at least 1" });
      const updates: any = {};
      if (code !== undefined) updates.code = code.toUpperCase().trim();
      if (discountPercent !== undefined) updates.discountPercent = Number(discountPercent);
      if (maxUses !== undefined) updates.maxUses = maxUses ? Number(maxUses) : null;
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
              const subCatMatch = hasSubCatFilter2 && product.subcategoryId != null && discount.subcategoryIds!.includes(product.subcategoryId);
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

      if (userEmail) {
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
        if (customerUser?.email) {
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

  app.post("/api/pos/return", async (req, res) => {
    if (!req.isAuthenticated() || !["admin", "employee"].includes(req.user.role)) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { orderId, items: returnItems } = req.body;
      if (!orderId || !returnItems || !Array.isArray(returnItems) || returnItems.length === 0) {
        return res.status(400).json({ message: "Invalid return data" });
      }
      const order = await storage.getPosOrderById(parseInt(orderId));
      if (!order) return res.status(404).json({ message: "Order not found" });
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
      res.json({ success: true, message: "Return processed" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/pos/orders", async (req, res) => {
    if (!req.isAuthenticated() || !["admin", "employee"].includes(req.user.role)) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { paymentMethod, items, note, cashAmount, cardAmount } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "No items provided" });
      }
      let computedTotal = 0;
      const validatedItems: any[] = [];
      for (const item of items) {
        if (!item.productId || !item.quantity || item.quantity < 1) {
          return res.status(400).json({ message: "Invalid item data" });
        }
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(400).json({ message: `Product ${item.productId} not found` });
        }
        const price = product.discountPrice ? parseFloat(product.discountPrice) : parseFloat(product.price);
        computedTotal += price * item.quantity;
        validatedItems.push({ ...item, price: price.toFixed(2), name: product.name, barcode: product.barcode || null });
      }
      const stockItems = validatedItems.map((item: any) => ({
        productId: item.productId,
        color: item.color || undefined,
        size: item.size || undefined,
        quantity: item.quantity,
      }));
      const order = await storage.createPosOrderAtomic(
        {
          totalAmount: computedTotal.toFixed(2),
          paymentMethod: paymentMethod || "cash",
          items: validatedItems,
          note: note || null,
          cashAmount: cashAmount ? String(cashAmount) : null,
          cardAmount: cardAmount ? String(cardAmount) : null,
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
                COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::integer), 0) AS revenue
              FROM pos_orders po
              CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
              JOIN products p ON p.id = (item->>'productId')::integer
              JOIN categories c ON c.id = p.category_id
              WHERE TO_CHAR(po.created_at, 'YYYY-MM') = ${monthParam}
              GROUP BY c.id, c.name, c.name_ar ORDER BY revenue DESC`
          : sql`
              SELECT c.name AS category, COALESCE(c.name_ar, c.name) AS category_ar,
                COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::integer), 0) AS revenue
              FROM pos_orders po
              CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
              JOIN products p ON p.id = (item->>'productId')::integer
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
                  (item->>'price')::numeric * (item->>'quantity')::integer *
                  CASE WHEN po.total_amount::numeric > 0
                    THEN COALESCE(po.cash_amount::numeric, 0) / po.total_amount::numeric
                    ELSE 0 END
                ), 0) AS cash,
                COALESCE(SUM(
                  (item->>'price')::numeric * (item->>'quantity')::integer *
                  CASE WHEN po.total_amount::numeric > 0
                    THEN COALESCE(po.card_amount::numeric, 0) / po.total_amount::numeric
                    ELSE 0 END
                ), 0) AS card
              FROM pos_orders po
              CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
              JOIN products p ON p.id = (item->>'productId')::integer
              JOIN categories c ON c.id = p.category_id
              WHERE TO_CHAR(po.created_at, 'YYYY-MM') = ${monthParam}
              GROUP BY c.id, c.name, c.name_ar ORDER BY c.name`
          : sql`
              SELECT c.name AS category, COALESCE(c.name_ar, c.name) AS category_ar,
                COALESCE(SUM(
                  (item->>'price')::numeric * (item->>'quantity')::integer *
                  CASE WHEN po.total_amount::numeric > 0
                    THEN COALESCE(po.cash_amount::numeric, 0) / po.total_amount::numeric
                    ELSE 0 END
                ), 0) AS cash,
                COALESCE(SUM(
                  (item->>'price')::numeric * (item->>'quantity')::integer *
                  CASE WHEN po.total_amount::numeric > 0
                    THEN COALESCE(po.card_amount::numeric, 0) / po.total_amount::numeric
                    ELSE 0 END
                ), 0) AS card
              FROM pos_orders po
              CROSS JOIN LATERAL jsonb_array_elements(po.items) AS item
              JOIN products p ON p.id = (item->>'productId')::integer
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
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    const items = await storage.getUserNotifications(req.session.userId);
    res.json(items);
  });

  app.patch("/api/notifications/read-all", async (req: any, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    await storage.markAllNotificationsRead(req.session.userId);
    res.json({ ok: true });
  });

  // --- Abandoned cart email (called by client hook) ---
  app.post("/api/notifications/cart-reminder-email", async (req, res) => {
    if (!req.isAuthenticated()) return res.json({ ok: false });
    const user = req.user as any;
    if (!user.email) return res.json({ ok: false });
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
        .filter((u: any) => u.email && u.role !== "admin" && !u.isBlocked)
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
          const catResult = await db.execute(sql`SELECT name, name_ar FROM categories WHERE id = ANY(${catIds}::int[])`);
          for (const r of catResult.rows as any[]) labels.push(r.name_ar ? `${r.name_ar} / ${r.name}` : r.name);
        }
        if (subIds.length > 0) {
          const subResult = await db.execute(sql`SELECT name, name_ar FROM subcategories WHERE id = ANY(${subIds}::int[])`);
          for (const r of subResult.rows as any[]) labels.push(r.name_ar ? `${r.name_ar} / ${r.name}` : r.name);
        }
        restrictionLabel = labels.join("، ");
      }

      const allUsers = await storage.getAllUsers();
      let recipientUsers = allUsers.filter((u: any) => u.email && u.role !== "admin" && !u.isBlocked);
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

      res.json({ ok: true, recipientCount: recipients.length });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed" });
    }
  });

  return httpServer;
}
