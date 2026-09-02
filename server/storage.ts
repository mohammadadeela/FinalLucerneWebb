import { users, categories, subcategories, products, orders, orderItems, wishlist, cartItems, reviews, discountCodes, siteSettings, posOrders, productEvents, exchangeRequests, notifications, productGroups, type User, type InsertUser, type Category, type InsertCategory, type Subcategory, type InsertSubcategory, type Product, type InsertProduct, type Order, type InsertOrder, type OrderItem, type InsertOrderItem, type Wishlist, type InsertWishlist, type CartItemRow, type InsertCartItem, type Review, type InsertReview, type DiscountCode, type InsertDiscountCode, type SiteSetting, type PosOrder, type InsertPosOrder, type InsertProductEvent, type ExchangeRequest, type InsertExchangeRequest, type Notification, type InsertNotification, type ProductGroup } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

function quotePgIdentifier(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function quotePgQualifiedName(schemaName: string, tableName: string): string {
  return `${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)}`;
}


// Older POS exchanges (created before exchange_history was added) are still
// recoverable because the replacement invoice note contains the original
// invoice number and the returned product lines. This keeps old invoices from
// becoming exchangeable again after the new tracking column is deployed.
function inferLegacyPosExchangeHistory(rawOrders: PosOrder[]): PosOrder[] {
  const byId = new Map<number, PosOrder>();
  rawOrders.forEach((order) => byId.set(Number(order.id), order));
  const inferred = new Map<number, any[]>();

  for (const exchangeInvoice of rawOrders) {
    const note = String((exchangeInvoice as any).note || "");
    if (!note.includes("فاتورة تبديل") && !note.includes("EXCHANGE INVOICE")) continue;

    const idMatch = note.match(/(?:الفاتورة الأصلية|Original invoice)\s*:\s*#?(\d+)/i);
    if (!idMatch) continue;
    const originalId = Number(idMatch[1]);
    const original = byId.get(originalId);
    if (!original) continue;

    const sectionMatch = note.match(
      /(?:القطع المرتجعة|المرتجع|Returned items|Returned)\s*:\s*\n([\s\S]*?)(?=\n(?:رصيد المرتجع|Return credit)\s*:)/i,
    );
    const returnedItems: any[] = [];
    if (sectionMatch) {
      const originalItems = Array.isArray((original as any).items) ? (original as any).items : [];
      for (const line of sectionMatch[1].split(/\r?\n/)) {
        const lineMatch = line.match(/^\s*•\s*(.*?)\s+×\s+(\d+)\s+—/);
        if (!lineMatch) continue;
        const descriptor = lineMatch[1].trim();
        const quantity = Math.max(0, Number(lineMatch[2]) || 0);
        if (!quantity) continue;
        const descriptorMatch = descriptor.match(/^(.*?)(?:\s+\((.*?)\))?$/);
        const name = (descriptorMatch?.[1] || descriptor).trim();
        const variantParts = (descriptorMatch?.[2] || "")
          .split("·")
          .map((v) => v.trim())
          .filter(Boolean);
        const originalItem = originalItems.find((item: any) => {
          if (String(item.name || "").trim() !== name) return false;
          if (item.size && !variantParts.includes(String(item.size))) return false;
          if (item.color && !variantParts.includes(String(item.color))) return false;
          return true;
        });
        returnedItems.push({
          productId: Number(originalItem?.productId ?? originalItem?.product_id ?? 0),
          name,
          quantity,
          size: originalItem?.size || undefined,
          color: originalItem?.color || undefined,
          price: originalItem?.price != null ? String(originalItem.price) : undefined,
        });
      }
    }

    const events = inferred.get(originalId) || [];
    events.push({
      exchangedAt: String((exchangeInvoice as any).createdAt || (exchangeInvoice as any).created_at || new Date(0).toISOString()),
      returnedItems,
      replacementItems: [],
      override: false,
      byRole: "legacy",
      sourceOrderId: Number(exchangeInvoice.id),
    });
    inferred.set(originalId, events);
  }

  return rawOrders.map((order) => {
    const stored = Array.isArray((order as any).exchangeHistory) ? (order as any).exchangeHistory : [];
    return {
      ...order,
      exchangeHistory: stored.length > 0 ? stored : (inferred.get(Number(order.id)) || []),
    } as any;
  });
}

// ── Cached schema introspection for product deletion ───────────────────────
// Deleting a product previously ran ~20 sequential catalog/existence queries
// EVERY time (checking which tables exist + discovering every foreign key that
// references products). The schema never changes while the server runs, so we
// compute this once and reuse it. This is what made each delete take seconds.
type ProductFkInfo = {
  existingTables: Set<string>;
  // Foreign keys (other than the core order/exchange ones handled explicitly)
  fkColumns: Array<{ schema_name: string; table_name: string; column_name: string; not_null: boolean }>;
};
let _productSchemaCache: ProductFkInfo | null = null;

async function loadProductSchemaInfo(tx: any): Promise<ProductFkInfo> {
  if (_productSchemaCache) return _productSchemaCache;

  const candidateTables = [
    "order_items",
    "exchange_requests",
    "wishlist",
    "reviews",
    "cart_items",
    "product_events",
    "product_groups",
  ];
  const existingTables = new Set<string>();
  for (const t of candidateTables) {
    const result = await tx.execute(sql`SELECT to_regclass(${`public.${t}`}) AS table_regclass`);
    if (((result as any).rows ?? [])[0]?.table_regclass) existingTables.add(t);
  }

  const fkResult = await tx.execute(sql`
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      a.attname AS column_name,
      a.attnotnull AS not_null
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = cols.attnum
    WHERE con.contype = 'f'
      AND con.confrelid = 'products'::regclass
      AND array_length(con.conkey, 1) = 1
  `);
  const fkColumns = (((fkResult as any).rows ?? []) as Array<{
    schema_name: string;
    table_name: string;
    column_name: string;
    not_null: boolean;
  }>);

  _productSchemaCache = { existingTables, fkColumns };
  return _productSchemaCache;
}

function cleanMediaUrl(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeUrls(values: unknown, exclude: Set<string> = new Set()): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const url = cleanMediaUrl(value);
    if (!url || exclude.has(url) || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function getVideoPosterUrl(url: unknown): string | undefined {
  const value = cleanMediaUrl(url);
  if (!value) return undefined;
  if (value.includes("res.cloudinary.com")) {
    return value
      .replace(/\/upload\/[^/]+\//, "/upload/so_0,f_jpg,q_auto,w_720/")
      .replace(/\.[^./?]+(\?.*)?$/, ".jpg");
  }
  if (value.startsWith("/uploads/")) {
    const base = value.replace(/_opt\.mp4$/i, "").replace(/\.[^/.?#]+(?:[?#].*)?$/i, "");
    return `${base}_poster.webp`;
  }
  return undefined;
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(cleanMediaUrl).filter(Boolean)));
}

function normalizeSizeInventory(input: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  for (const [rawSize, rawQty] of Object.entries(input as Record<string, unknown>)) {
    const size = String(rawSize || "").trim();
    if (!size) continue;
    const qty = Math.max(0, Math.floor(Number(rawQty) || 0));
    result[size] = qty;
  }
  return result;
}

function sanitizeColorVariantMedia(input: any): any {
  const variant = { ...(input || {}) };
  const mediaWasProvided = Object.prototype.hasOwnProperty.call(variant, "media") && Array.isArray(variant.media);
  const rawMedia = mediaWasProvided ? variant.media : [];
  const seenMedia = new Set<string>();
  const media: any[] = [];

  for (const raw of rawMedia) {
    if (!raw || (raw.type !== "image" && raw.type !== "video")) continue;
    const url = cleanMediaUrl(raw.url);
    if (!url) continue;
    const key = `${raw.type}:${url}`;
    if (seenMedia.has(key)) continue;
    seenMedia.add(key);
    media.push({
      ...raw,
      url,
      poster: cleanMediaUrl(raw.poster) || (raw.type === "video" ? getVideoPosterUrl(url) : undefined),
    });
  }

  let mainImage = cleanMediaUrl(variant.mainImage);

  if (!mediaWasProvided) {
    const legacyImages = dedupeUrls(variant.images, new Set(mainImage ? [mainImage] : []));
    const legacyMedia: any[] = [];
    if (mainImage) legacyMedia.push({ type: "image", url: mainImage, isPrimary: true });
    legacyImages.forEach((url) => legacyMedia.push({ type: "image", url }));
    media.push(...legacyMedia);
  } else if (mainImage && !media.some((item) => item.type === "image" && item.url === mainImage)) {
    media.unshift({ type: "image", url: mainImage });
  }

  const firstImage = media.find((item) => item.type === "image" && item.isPrimary) || media.find((item) => item.type === "image");
  if (!mainImage) {
    mainImage = cleanMediaUrl(firstImage?.url) || cleanMediaUrl(media.find((item) => item.type === "video" && item.poster)?.poster) || "";
  }

  let primaryIndex = media.findIndex((item) => item.type === "image" && item.isPrimary);
  if (primaryIndex < 0 && mainImage) primaryIndex = media.findIndex((item) => item.type === "image" && item.url === mainImage);
  if (primaryIndex < 0) primaryIndex = media.findIndex((item) => item.type === "image");
  if (primaryIndex < 0) primaryIndex = media.findIndex((item) => item.type === "video" && item.isPrimary);
  if (primaryIndex < 0 && media.length > 0) primaryIndex = 0;
  media.forEach((item, index) => {
    if (index === primaryIndex) item.isPrimary = true;
    else if (Object.prototype.hasOwnProperty.call(item, "isPrimary")) delete item.isPrimary;
  });

  const imageUrls = media
    .filter((item) => item.type === "image")
    .map((item) => cleanMediaUrl(item.url))
    .filter(Boolean);

  variant.name = typeof variant.name === "string" ? variant.name.trim() : String(variant.name || "").trim();
  variant.colorCode = typeof variant.colorCode === "string" && variant.colorCode.trim() ? variant.colorCode.trim() : "#000000";
  variant.mainImage = mainImage;
  variant.images = dedupeUrls(
    mediaWasProvided ? imageUrls : variant.images,
    new Set(mainImage ? [mainImage] : []),
  );
  variant.sizes = normalizeStringArray(variant.sizes);
  variant.sizeInventory = normalizeSizeInventory(variant.sizeInventory);
  if (variant.sizes.length === 0) variant.sizes = Object.keys(variant.sizeInventory);
  variant.colorTags = Array.isArray(variant.colorTags) ? normalizeStringArray(variant.colorTags) : [];
  variant.media = media;
  return variant;
}

function sanitizeProductMedia<T extends Record<string, any>>(input: T): T {
  const product: Record<string, any> = { ...input };

  if (Array.isArray(product.colorVariants)) {
    product.colorVariants = product.colorVariants.map(sanitizeColorVariantMedia);
  } else if (Object.prototype.hasOwnProperty.call(product, "colorVariants")) {
    product.colorVariants = [];
  }

  let productVideoUrl = cleanMediaUrl(product.videoUrl);
  if (!productVideoUrl && Array.isArray(product.colorVariants) && product.colorVariants.length > 0) {
    // The legacy videoUrl field mirrors ONLY color variant #0's video.
    // This used to flatMap across every variant's media, which meant a
    // secondary color's video could be pulled up and grafted onto the main
    // color (variant #0) below — resurrecting a deleted main-color video
    // from whichever other color still had one, on every read or write.
    const firstVariantMedia = Array.isArray(product.colorVariants[0]?.media) ? product.colorVariants[0].media : [];
    productVideoUrl = cleanMediaUrl(
      firstVariantMedia.find((item: any) => item?.type === "video")?.url,
    );
  }
  if (productVideoUrl) {
    product.videoUrl = productVideoUrl;
    if (Array.isArray(product.colorVariants) && product.colorVariants.length > 0) {
      const first = { ...product.colorVariants[0] };
      const firstMedia = Array.isArray(first.media) ? [...first.media] : [];
      if (!firstMedia.some((item: any) => item?.type === "video" && cleanMediaUrl(item?.url) === productVideoUrl)) {
        firstMedia.push({ type: "video", url: productVideoUrl, poster: getVideoPosterUrl(productVideoUrl) });
        product.colorVariants[0] = sanitizeColorVariantMedia({ ...first, media: firstMedia });
      }
    }
  } else if (Object.prototype.hasOwnProperty.call(product, "videoUrl")) {
    product.videoUrl = null;
  }

  let mainImage = cleanMediaUrl(product.mainImage);
  if (!mainImage && product.colorVariants?.length) {
    mainImage = cleanMediaUrl(product.colorVariants[0]?.mainImage);
  }
  if (!mainImage && productVideoUrl) {
    mainImage = getVideoPosterUrl(productVideoUrl) || "";
  }
  if (mainImage || Object.prototype.hasOwnProperty.call(product, "mainImage")) {
    product.mainImage = mainImage;
  }

  if (Object.prototype.hasOwnProperty.call(product, "images")) {
    product.images = dedupeUrls(product.images, new Set(mainImage ? [mainImage] : []));
  }
  if (Object.prototype.hasOwnProperty.call(product, "sizes")) product.sizes = normalizeStringArray(product.sizes);
  if (Object.prototype.hasOwnProperty.call(product, "colors")) product.colors = normalizeStringArray(product.colors);
  if (Object.prototype.hasOwnProperty.call(product, "sizeInventory")) product.sizeInventory = normalizeSizeInventory(product.sizeInventory);
  if (Object.prototype.hasOwnProperty.call(product, "subcategoryIds")) {
    product.subcategoryIds = Array.isArray(product.subcategoryIds)
      ? Array.from(new Set(product.subcategoryIds.map((x: any) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0)))
      : [];
  }

  return product as T;
}

export interface IStorage {
  // User
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  updateLastLogin(id: number): Promise<void>;
  getAllUsers(): Promise<(User & { orderCount: number; deliveredCount: number; cancelledCount: number })[]>;
  deleteUser(id: number): Promise<boolean>;

  // Category
  getCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, data: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: number): Promise<boolean>;

  // Subcategory
  getSubcategories(): Promise<Subcategory[]>;
  getSubcategoriesByCategory(categoryId: number): Promise<Subcategory[]>;
  createSubcategory(sub: InsertSubcategory): Promise<Subcategory>;
  updateSubcategory(id: number, data: Partial<InsertSubcategory>): Promise<Subcategory | undefined>;
  deleteSubcategory(id: number): Promise<boolean>;

  // Product
  getProducts(categoryIds?: number[]): Promise<Product[]>;
  getBestSellers(limit?: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  // Order
  getOrders(): Promise<(Order & { items: { id: number; productId: number; product: { categoryId: number | null; subcategoryId: number | null; subcategoryIds: number[] } | null }[] })[]>;
  getUserOrders(userId: number): Promise<(Order & { items: { id: number; productId: number; product: { categoryId: number | null; subcategoryId: number | null; subcategoryIds: number[] } | null }[] })[]>;
  getOrder(id: number): Promise<{order: Order, items: (OrderItem & {product?: Product})[]} | undefined>;
  getOrderForUser(id: number, userId: number): Promise<Order | undefined>;
  createOrder(order: InsertOrder, items: Omit<InsertOrderItem, 'orderId'>[], skipStockCheck?: boolean): Promise<Order>;
  adjustProductSizeStock(productId: number, color: string | null | undefined, size: string | null | undefined, delta: number): Promise<void>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;
  deleteOrders(ids: number[]): Promise<number>;
  // Admin-only order editing: add/replace/remove a single line item on an
  // existing order, keeping stock and the order total in sync.
  addOrderItem(orderId: number, item: { productId: number; quantity: number; size?: string | null; color?: string | null }): Promise<{order: Order, items: (OrderItem & {product?: Product})[]}>;
  updateOrderItem(orderId: number, itemId: number, changes: { productId?: number; quantity?: number; size?: string | null; color?: string | null }): Promise<{order: Order, items: (OrderItem & {product?: Product})[]}>;
  removeOrderItem(orderId: number, itemId: number): Promise<{order: Order, items: (OrderItem & {product?: Product})[]}>;

  // Product Events / Recommendations
  recordProductEvent(event: InsertProductEvent): Promise<void>;
  getProductRecommendations(productId: number): Promise<number[]>;

  // Stats
  getStats(): Promise<{totalProducts: number, totalUsers: number, totalOrders: number, totalSales: number, lowStockCount: number}>;

  // Wishlist
  getWishlist(userId: number): Promise<Wishlist[]>;
  getWishlistWithProducts(userId: number): Promise<(Wishlist & { product: Product | null })[]>;
  addToWishlist(userId: number, productId: number, color?: string | null): Promise<Wishlist>;
  removeFromWishlist(id: number): Promise<boolean>;
  isInWishlist(userId: number, productId: number): Promise<boolean>;

  // Cart
  getCartItems(userId: number): Promise<(CartItemRow & { product: Product })[]>;
  upsertCartItem(userId: number, productId: number, quantity: number, size?: string | null, color?: string | null): Promise<void>;
  updateCartItemQty(userId: number, productId: number, quantity: number, size?: string | null, color?: string | null): Promise<void>;
  removeCartItem(userId: number, productId: number, size?: string | null, color?: string | null): Promise<void>;
  clearUserCart(userId: number): Promise<void>;
  mergeGuestCart(userId: number, guestItems: Array<{ productId: number; quantity: number; size?: string | null; color?: string | null }>): Promise<void>;

  // Reviews
  getReviews(productId: number): Promise<Review[]>;
  createReview(review: InsertReview): Promise<Review>;

  // Discount Codes
  validateDiscountCode(code: string): Promise<DiscountCode | undefined>;
  useDiscountCode(code: string): Promise<DiscountCode | undefined>;
  getUserDiscountCodeUseCount(userId: number, code: string): Promise<number>;
  getAllDiscountCodes(): Promise<DiscountCode[]>;
  createDiscountCode(data: InsertDiscountCode): Promise<DiscountCode>;
  updateDiscountCode(id: number, data: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined>;
  deleteDiscountCode(id: number): Promise<boolean>;

  // Site Settings
  getSiteSettings(): Promise<SiteSetting[]>;
  getSiteSetting(key: string): Promise<string | undefined>;
  setSiteSetting(key: string, value: string): Promise<SiteSetting>;

  // Exchange Requests
  getOrderItem(id: number): Promise<OrderItem | undefined>;
  createExchangeRequest(userId: number, data: InsertExchangeRequest): Promise<ExchangeRequest>;
  getUserExchangeRequests(userId: number): Promise<(ExchangeRequest & { product: Product | null; order: Order | null })[]>;
  getAllExchangeRequests(): Promise<(ExchangeRequest & { product: Product | null; order: Order | null; user: User | null })[]>;
  getExchangeRequestById(id: number): Promise<(ExchangeRequest & { product: Product | null; order: Order | null; user: User | null }) | undefined>;
  updateExchangeRequest(id: number, status: string, adminNote?: string): Promise<ExchangeRequest | undefined>;

  // POS
  getProductByBarcode(barcode: string): Promise<Product | undefined>;
  createPosOrder(order: InsertPosOrder): Promise<PosOrder>;
  createPosOrderAtomic(order: InsertPosOrder, items: Array<{ productId: number; color?: string; size?: string; quantity: number; newSize?: boolean }>): Promise<PosOrder>;
  getPosOrders(): Promise<PosOrder[]>;
  getPosOrderById(id: number): Promise<PosOrder | undefined>;
  updatePosOrderExchangeHistory(id: number, history: any[]): Promise<PosOrder | undefined>;
  updatePosOrderPaymentMethod(
    id: number,
    method: "cash" | "card" | "split",
    splitAmounts?: { cashAmount: number; cardAmount: number },
  ): Promise<PosOrder | undefined>;
  updatePosOrdersTransferred(ids: number[], transferred: boolean): Promise<PosOrder[]>;
  deleteAllPosOrders(): Promise<number>;
  deletePosOrdersByIds(ids: number[]): Promise<number>;

  // Notifications
  createNotification(data: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: number): Promise<Notification[]>;
  markAllNotificationsRead(userId: number): Promise<void>;

  // Product Groups
  getProductGroups(): Promise<ProductGroup[]>;
  createProductGroup(name: string, productIds: number[]): Promise<ProductGroup>;
  addProductsToGroup(id: number, newProductIds: number[]): Promise<ProductGroup | undefined>;
  deleteProductGroup(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    let digits = String(phone || "").replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.length > 9) digits = digits.slice(-9);
    if (digits.length < 8) return undefined;

    const matches = await db
      .select()
      .from(users)
      .where(sql`RIGHT(REGEXP_REPLACE(COALESCE(${users.phone}, ''), '[^0-9]', '', 'g'), ${digits.length}) = ${digits}`);

    // A real phone-auth account is the correct match when the same number was
    // also saved on an email account during checkout/profile completion.
    return matches.find((user) => String(user.email || "").toLowerCase().endsWith("@phone.lucerne"))
      || matches.find((user) => user.phone === phone)
      || matches[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async updateLastLogin(id: number): Promise<void> {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<(User & { orderCount: number; deliveredCount: number; cancelledCount: number; lastCity: string | null; totalSpent: string | null })[]> {
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        password: users.password,
        role: users.role,
        fullName: users.fullName,
        phone: users.phone,
        address: users.address,
        isVerified: users.isVerified,
        isBlocked: users.isBlocked,
        verificationCode: users.verificationCode,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        orderCount: sql<number>`cast(count(${orders.id}) as int)`,
        deliveredCount: sql<number>`cast(count(case when ${orders.status} = 'Delivered' then 1 end) as int)`,
        cancelledCount: sql<number>`cast(count(case when ${orders.status} = 'Cancelled' then 1 end) as int)`,
        lastCity: sql<string | null>`(SELECT city FROM orders WHERE user_id = ${users.id} ORDER BY created_at DESC LIMIT 1)`,
        totalSpent: sql<string | null>`cast(sum(case when ${orders.status} != 'Cancelled' then cast(${orders.totalAmount} as numeric) end) as text)`,
      })
      .from(users)
      .leftJoin(orders, eq(orders.userId, users.id))
      .groupBy(users.id)
      .orderBy(desc(users.createdAt));
    return result;
  }

  async deleteUser(id: number): Promise<boolean> {
    // Remove all dependent records before deleting the user
    await db.delete(notifications).where(eq(notifications.userId, id));
    await db.delete(cartItems).where(eq(cartItems.userId, id));
    await db.delete(wishlist).where(eq(wishlist.userId, id));
    await db.delete(reviews).where(eq(reviews.userId, id));
    await db.delete(productEvents).where(eq(productEvents.userId, id));
    await db.delete(exchangeRequests).where(eq(exchangeRequests.userId, id));
    // Delete order items first, then orders
    const userOrders = await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, id));
    if (userOrders.length > 0) {
      const orderIds = userOrders.map(o => o.id);
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    }
    await db.delete(orders).where(eq(orders.userId, id));
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }

  async updateCategory(id: number, data: Partial<InsertCategory>): Promise<Category | undefined> {
    const [updated] = await db.update(categories).set(data).where(eq(categories.id, id)).returning();
    return updated;
  }

  async deleteCategory(id: number): Promise<boolean> {
    await db.update(products).set({ categoryId: null, subcategoryId: null }).where(eq(products.categoryId, id));
    await db.delete(subcategories).where(eq(subcategories.categoryId, id));
    const result = await db.delete(categories).where(eq(categories.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSubcategories(): Promise<Subcategory[]> {
    return await db.select().from(subcategories);
  }

  async getSubcategoriesByCategory(categoryId: number): Promise<Subcategory[]> {
    return await db.select().from(subcategories).where(eq(subcategories.categoryId, categoryId));
  }

  async createSubcategory(sub: InsertSubcategory): Promise<Subcategory> {
    const [newSub] = await db.insert(subcategories).values(sub).returning();
    return newSub;
  }

  async updateSubcategory(id: number, data: Partial<InsertSubcategory>): Promise<Subcategory | undefined> {
    const [updated] = await db.update(subcategories).set(data).where(eq(subcategories.id, id)).returning();
    return updated;
  }

  async deleteSubcategory(id: number): Promise<boolean> {
    const result = await db.delete(subcategories).where(eq(subcategories.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getProducts(categoryIds?: number[]): Promise<Product[]> {
    const rows = categoryIds && categoryIds.length > 0
      ? await db.select().from(products)
          .where(inArray(products.categoryId, categoryIds))
          .orderBy(desc(products.createdAt))
      : await db.select().from(products).orderBy(desc(products.createdAt));
    return rows.map((product) => sanitizeProductMedia(product as any) as Product);
  }

  async getBestSellers(limit = 8): Promise<Product[]> {
    // Products ranked by total quantity actually sold — this is the
    // "real" best sellers list based on customer purchases.
    const ranked = await db
      .select({
        productId: orderItems.productId,
        totalSold: sql<number>`cast(sum(${orderItems.quantity}) as int)`,
      })
      .from(orderItems)
      .groupBy(orderItems.productId)
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(limit);

    // Manually flagged isBestSeller products — the admin's own picks.
    // These are treated as additions on top of real sales data, not a
    // full replacement of it.
    const flaggedRows = await db.select().from(products).where(eq(products.isBestSeller, true));

    const orderedIds: number[] = [];
    const seen = new Set<number>();

    // Admin picks come first so they're guaranteed to be included...
    for (const p of flaggedRows) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        orderedIds.push(p.id);
      }
    }
    // ...then fill the rest with real sales ranking.
    for (const r of ranked) {
      if (!seen.has(r.productId)) {
        seen.add(r.productId);
        orderedIds.push(r.productId);
      }
    }

    if (orderedIds.length > 0) {
      const rows = await db.select().from(products).where(inArray(products.id, orderedIds));
      const byId = new Map(rows.map((p) => [p.id, p]));
      const result: Product[] = [];
      for (const id of orderedIds) {
        const p = byId.get(id);
        if (p) result.push(p);
        if (result.length >= limit) break;
      }
      return result.map((product) => sanitizeProductMedia(product as any) as Product);
    }

    // Fallback: isFeatured products
    const fallback = await db.select().from(products).where(eq(products.isFeatured, true)).limit(limit);
    return fallback.map((product) => sanitizeProductMedia(product as any) as Product);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product ? (sanitizeProductMedia(product as any) as Product) : undefined;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const cleanProduct = sanitizeProductMedia(product as any) as InsertProduct;
    const [newProduct] = await db.insert(products).values(cleanProduct).returning();
    return sanitizeProductMedia(newProduct as any) as Product;
  }

  async updateProduct(id: number, update: Partial<InsertProduct>): Promise<Product | undefined> {
    let cleanUpdate: Partial<InsertProduct> = { ...update };
    const touchesMedia =
      Object.prototype.hasOwnProperty.call(update, "mainImage") ||
      Object.prototype.hasOwnProperty.call(update, "images") ||
      Object.prototype.hasOwnProperty.call(update, "videoUrl") ||
      Object.prototype.hasOwnProperty.call(update, "colorVariants");

    if (touchesMedia) {
      const existing = await this.getProduct(id);
      if (!existing) return undefined;
      const merged = sanitizeProductMedia({ ...existing, ...update } as any);
      cleanUpdate = {
        ...cleanUpdate,
        mainImage: merged.mainImage,
        images: merged.images,
        colorVariants: merged.colorVariants,
        videoUrl: merged.videoUrl,
      };
    }

    const [updatedProduct] = await db.update(products).set(cleanUpdate).where(eq(products.id, id)).returning();
    return updatedProduct ? (sanitizeProductMedia(updatedProduct as any) as Product) : undefined;
  }

  async deleteProduct(id: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: products.id }).from(products).where(eq(products.id, id));
      if (!existing) return false;

      // Schema introspection is cached after the first delete, so subsequent
      // deletes skip all the table-existence + foreign-key discovery queries
      // that previously made every delete slow.
      const { existingTables, fkColumns } = await loadProductSchemaInfo(tx);

      const deleteByProductId = async (tableName: string) => {
        if (!existingTables.has(tableName)) return;
        const tableRef = quotePgQualifiedName("public", tableName);
        await tx.execute(sql`DELETE FROM ${sql.raw(tableRef)} WHERE product_id = ${id}`);
      };

      // Delete exchange requests before order_items because exchange_requests can
      // reference the same product both directly and through order_item_id.
      let productOrderItemIds: number[] = [];
      if (existingTables.has("order_items")) {
        const orderItemRows = await tx.execute(sql`SELECT id FROM order_items WHERE product_id = ${id}`);
        productOrderItemIds = (((orderItemRows as any).rows ?? []) as Array<{ id: number }>).map((item) => Number(item.id));
      }

      if (existingTables.has("exchange_requests")) {
        await tx.execute(sql`DELETE FROM exchange_requests WHERE product_id = ${id}`);
        if (productOrderItemIds.length > 0) {
          await tx.execute(sql`DELETE FROM exchange_requests WHERE order_item_id = ANY(${productOrderItemIds})`);
        }
      }

      // Known application tables.
      for (const tableName of ["wishlist", "reviews", "cart_items", "product_events"]) {
        await deleteByProductId(tableName);
      }

      // Product groups store IDs in an array rather than a foreign key. Use SQL
      // array_remove so legacy NULL/empty arrays cannot crash deletion.
      if (existingTables.has("product_groups")) {
        await tx.execute(sql`
          UPDATE product_groups
          SET product_ids = COALESCE(array_remove(product_ids, ${id}), '{}'::integer[])
          WHERE product_ids IS NOT NULL AND product_ids @> ARRAY[${id}]::integer[]
        `);
      }

      // Clear any remaining foreign keys pointing at products(id) (discovered
      // once and cached). Order so exchange_requests is cleared before
      // order_items; everything else in between.
      const orderedFkRows = fkColumns.slice().sort((a, b) => {
        const priority = (row: { table_name: string }) =>
          row.table_name === "exchange_requests" ? 0 : row.table_name === "order_items" ? 2 : 1;
        return priority(a) - priority(b);
      });

      for (const row of orderedFkRows) {
        const tableRef = quotePgQualifiedName(row.schema_name, row.table_name);
        const columnRef = quotePgIdentifier(row.column_name);
        if (row.not_null) {
          await tx.execute(sql`DELETE FROM ${sql.raw(tableRef)} WHERE ${sql.raw(columnRef)} = ${id}`);
        } else {
          await tx.execute(sql`UPDATE ${sql.raw(tableRef)} SET ${sql.raw(columnRef)} = NULL WHERE ${sql.raw(columnRef)} = ${id}`);
        }
      }

      const [deleted] = await tx.delete(products).where(eq(products.id, id)).returning({ id: products.id });
      return !!deleted;
    });
  }

  private async _attachItemsToOrders(orderList: Order[]) {
    if (orderList.length === 0) return orderList.map(o => ({ ...o, items: [] as { id: number; productId: number; quantity: number; price: string; size: string | null; color: string | null; name: string | null; barcode: string | null; mainImage: string | null; product: { categoryId: number | null; subcategoryId: number | null; subcategoryIds: number[] } | null }[] }));
    const orderIds = orderList.map(o => o.id);
    const allItems = await db.select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      quantity: orderItems.quantity,
      price: orderItems.price,
      size: orderItems.size,
      color: orderItems.color,
      productDbId: products.id,
      categoryId: products.categoryId,
      subcategoryId: products.subcategoryId,
      subcategoryIds: products.subcategoryIds,
      productName: products.name,
      barcode: products.barcode,
      mainImage: products.mainImage,
    })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(inArray(orderItems.orderId, orderIds));
    const itemsByOrderId = new Map<number, typeof allItems>();
    for (const item of allItems) {
      if (!itemsByOrderId.has(item.orderId)) itemsByOrderId.set(item.orderId, []);
      itemsByOrderId.get(item.orderId)!.push(item);
    }
    return orderList.map(o => ({
      ...o,
      items: (itemsByOrderId.get(o.id) ?? []).map(i => ({
        id: i.id,
        productId: i.productId,
        quantity: i.quantity,
        price: i.price,
        size: i.size,
        color: i.color,
        name: i.productName ?? null,
        barcode: i.barcode ?? null,
        mainImage: i.mainImage ?? null,
        // null when the product has been deleted (leftJoin found no match)
        product: i.productDbId == null ? null : { categoryId: i.categoryId ?? null, subcategoryId: i.subcategoryId ?? null, subcategoryIds: (i.subcategoryIds ?? []) as number[] },
      })),
    }));
  }

  async getOrders() {
    const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));
    return this._attachItemsToOrders(allOrders);
  }

  async getUserOrders(userId: number) {
    const userOrders = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
    return this._attachItemsToOrders(userOrders);
  }

  async getOrder(id: number): Promise<{order: Order, items: (OrderItem & {product?: Product})[]} | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;
    
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    // Batch-fetch all products in one query instead of N+1
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    const prods = productIds.length > 0
      ? await db.select().from(products).where(inArray(products.id, productIds))
      : [];
    const prodById = new Map(prods.map((p) => [p.id, p]));
    const itemsWithProducts = items.map((item) => ({
      ...item,
      product: prodById.get(item.productId),
    }));

    return { order, items: itemsWithProducts };
  }

  // Scoped lookup: returns the order ONLY if it belongs to userId.
  // A non-existent order and an order owned by someone else are
  // indistinguishable at the data layer (both resolve to undefined),
  // which prevents order-number enumeration via the chatbot.
  async getOrderForUser(id: number, userId: number): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId)));
    return order;
  }

  async createOrder(order: InsertOrder, items: Omit<InsertOrderItem, 'orderId'>[], skipStockCheck = false): Promise<Order> {
    return await db.transaction(async (tx) => {
      const [newOrder] = await tx.insert(orders).values(order).returning();

      for (const item of items) {
        await tx.insert(orderItems).values({ ...item, orderId: newOrder.id });

        if (skipStockCheck) continue;

        // Lock the product row to prevent concurrent overselling
        const lockResult = await tx.execute(
          sql`SELECT * FROM products WHERE id = ${item.productId} FOR UPDATE`
        );
        const product = (lockResult as any).rows?.[0] ?? (lockResult as any)[0];
        if (!product) continue;

        const colorVariants = ((product.color_variants) || []) as Array<{name: string; sizeInventory: Record<string, number>; sizes: string[]; mainImage: string; images: string[]; colorCode: string}>;
        const itemColor = (item as any).color;
        const itemSize = (item as any).size;

        if (colorVariants.length > 0 && itemColor) {
          const variantIdx = colorVariants.findIndex(v => v.name === itemColor);
          if (variantIdx >= 0 && itemSize) {
            const vInv = { ...(colorVariants[variantIdx].sizeInventory || {}) };
            const avail = vInv[itemSize] ?? 0;
            if (avail < item.quantity) {
              throw new Error(`STOCK_ERROR:${product.name} (${itemColor} / ${itemSize}) — only ${avail} left`);
            }
            vInv[itemSize] = avail - item.quantity;
            colorVariants[variantIdx] = { ...colorVariants[variantIdx], sizeInventory: vInv };
          }
          const mergedInv: Record<string, number> = {};
          colorVariants.forEach(v => {
            Object.entries(v.sizeInventory || {}).forEach(([s, q]) => {
              mergedInv[s] = (mergedInv[s] || 0) + (q as number);
            });
          });
          const totalStock = Object.values(mergedInv).reduce((s, q) => s + (q as number), 0);
          // Always persist colorVariants + sizeInventory, even when totalStock is 0 —
          // otherwise the per-size/per-color numbers stay stale at their old (nonzero)
          // value and every future order still sees "stock available" for that size/color.
          await tx.update(products).set({
            colorVariants,
            sizeInventory: mergedInv,
            stockQuantity: totalStock,
          }).where(eq(products.id, item.productId));
        } else {
          const sizeInv = { ...((product.size_inventory as Record<string, number>) || {}) };
          if (itemSize && sizeInv[itemSize] !== undefined) {
            const avail = sizeInv[itemSize] ?? 0;
            if (avail < item.quantity) {
              throw new Error(`STOCK_ERROR:${product.name} (${itemSize}) — only ${avail} left`);
            }
            sizeInv[itemSize] = avail - item.quantity;
            const totalStock = Object.values(sizeInv).reduce((s, q) => s + (q as number), 0);
            // Same fix as above: always write sizeInventory, even at 0 total stock.
            await tx.update(products).set({ sizeInventory: sizeInv, stockQuantity: totalStock }).where(eq(products.id, item.productId));
          } else {
            const avail = (product.stock_quantity as number) ?? 0;
            if (avail < item.quantity) {
              throw new Error(`STOCK_ERROR:${product.name} — only ${avail} left`);
            }
            const newStock = avail - item.quantity;
            if (newStock === 0) {
              await tx.update(products).set({ stockQuantity: 0 }).where(eq(products.id, item.productId));
            } else {
              await tx.update(products).set({ stockQuantity: newStock }).where(eq(products.id, item.productId));
            }
          }
        }
      }

      return newOrder;
    });
  }

  /**
   * Adjusts stock for a single size/color combination by `delta` (positive to
   * restock, negative to deduct), clamped at 0 — never throws, never blocks.
   * Used by the exchange-approval flow: the returned size gets +1 back into
   * inventory, the newly-shipped size gets -1, without failing the whole
   * approval if stock happens to be tight.
   */
  async adjustProductSizeStock(
    productId: number,
    color: string | null | undefined,
    size: string | null | undefined,
    delta: number,
  ): Promise<void> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        sql`SELECT * FROM products WHERE id = ${productId} FOR UPDATE`
      );
      const product = (lockResult as any).rows?.[0] ?? (lockResult as any)[0];
      if (!product) return;

      const colorVariants = ((product.color_variants) || []) as Array<{ name: string; sizeInventory: Record<string, number> }>;

      if (colorVariants.length > 0 && color) {
        const variantIdx = colorVariants.findIndex((v) => v.name === color);
        if (variantIdx >= 0 && size) {
          const vInv = { ...(colorVariants[variantIdx].sizeInventory || {}) };
          const current = vInv[size] ?? 0;
          vInv[size] = Math.max(0, current + delta);
          colorVariants[variantIdx] = { ...colorVariants[variantIdx], sizeInventory: vInv };
        }
        const mergedInv: Record<string, number> = {};
        colorVariants.forEach((v) => {
          Object.entries(v.sizeInventory || {}).forEach(([s, q]) => {
            mergedInv[s] = (mergedInv[s] || 0) + (q as number);
          });
        });
        const totalStock = Object.values(mergedInv).reduce((s, q) => s + (q as number), 0);
        await tx.update(products).set({
          colorVariants,
          sizeInventory: mergedInv,
          stockQuantity: totalStock,
        }).where(eq(products.id, productId));
      } else {
        const sizeInv = { ...((product.size_inventory as Record<string, number>) || {}) };
        if (size && sizeInv[size] !== undefined) {
          const current = sizeInv[size] ?? 0;
          sizeInv[size] = Math.max(0, current + delta);
          const totalStock = Object.values(sizeInv).reduce((s, q) => s + (q as number), 0);
          await tx.update(products).set({ sizeInventory: sizeInv, stockQuantity: totalStock }).where(eq(products.id, productId));
        } else {
          const avail = (product.stock_quantity as number) ?? 0;
          const newStock = Math.max(0, avail + delta);
          await tx.update(products).set({ stockQuantity: newStock }).where(eq(products.id, productId));
        }
      }
    });
  }

  /**
   * Recomputes an order's totalAmount from its current line items, keeping
   * shippingCost/discountAmount/creditUsed exactly as they were set at
   * checkout. Used after admin add/replace/remove edits to a placed order.
   */
  private async recalculateOrderTotal(orderId: number): Promise<void> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) return;
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const subtotal = items.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0);
    const discountAmount = Number(order.discountAmount || 0);
    const creditUsed = Number(order.creditUsed || 0);
    const shippingCost = Number(order.shippingCost || 0);
    const totalAmount = Math.max(0, subtotal - discountAmount - creditUsed + shippingCost);
    await db.update(orders).set({ totalAmount: totalAmount.toFixed(2) }).where(eq(orders.id, orderId));
  }

  /**
   * Admin-only: adds a new line item to an already-placed order. Deducts
   * stock for the added quantity/color/size the same way a normal checkout
   * would, then recalculates the order total.
   */
  async addOrderItem(
    orderId: number,
    item: { productId: number; quantity: number; size?: string | null; color?: string | null },
  ): Promise<{order: Order, items: (OrderItem & {product?: Product})[]}> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const [product] = await db.select().from(products).where(eq(products.id, item.productId));
    if (!product) throw new Error("PRODUCT_NOT_FOUND");

    const price = product.discountPrice || product.price;

    await this.adjustProductSizeStock(item.productId, item.color, item.size, -item.quantity);

    await db.insert(orderItems).values({
      orderId,
      productId: item.productId,
      quantity: item.quantity,
      price: String(price),
      size: item.size ?? null,
      color: item.color ?? null,
    });

    await this.recalculateOrderTotal(orderId);
    return (await this.getOrder(orderId))!;
  }

  /**
   * Admin-only: replaces the product, color, size, and/or quantity of an
   * existing line item. Restocks the old combination in full and deducts
   * the new one, so inventory always reflects what's actually shipping.
   */
  async updateOrderItem(
    orderId: number,
    itemId: number,
    changes: { productId?: number; quantity?: number; size?: string | null; color?: string | null },
  ): Promise<{order: Order, items: (OrderItem & {product?: Product})[]}> {
    const [existing] = await db.select().from(orderItems).where(eq(orderItems.id, itemId));
    if (!existing || existing.orderId !== orderId) throw new Error("ORDER_ITEM_NOT_FOUND");

    // Give back the stock the original line item was holding.
    await this.adjustProductSizeStock(existing.productId, existing.color, existing.size, existing.quantity);

    const newProductId = changes.productId ?? existing.productId;
    const newQuantity = changes.quantity ?? existing.quantity;
    const newSize = changes.size !== undefined ? changes.size : existing.size;
    const newColor = changes.color !== undefined ? changes.color : existing.color;

    const [product] = await db.select().from(products).where(eq(products.id, newProductId));
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    const price = product.discountPrice || product.price;

    // Deduct stock for whatever the item now actually is.
    await this.adjustProductSizeStock(newProductId, newColor, newSize, -newQuantity);

    await db.update(orderItems).set({
      productId: newProductId,
      quantity: newQuantity,
      size: newSize ?? null,
      color: newColor ?? null,
      price: String(price),
    }).where(eq(orderItems.id, itemId));

    await this.recalculateOrderTotal(orderId);
    return (await this.getOrder(orderId))!;
  }

  /**
   * Admin-only: removes a line item from an order entirely and restocks it.
   * Refuses to remove the last remaining item — an order can't have zero
   * items; the admin should cancel the order instead in that case.
   */
  async removeOrderItem(orderId: number, itemId: number): Promise<{order: Order, items: (OrderItem & {product?: Product})[]}> {
    const [existing] = await db.select().from(orderItems).where(eq(orderItems.id, itemId));
    if (!existing || existing.orderId !== orderId) throw new Error("ORDER_ITEM_NOT_FOUND");

    const allItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    if (allItems.length <= 1) throw new Error("CANNOT_REMOVE_LAST_ITEM");

    await this.adjustProductSizeStock(existing.productId, existing.color, existing.size, existing.quantity);
    await db.delete(orderItems).where(eq(orderItems.id, itemId));
    await this.recalculateOrderTotal(orderId);
    return (await this.getOrder(orderId))!;
  }

  async updateOrderStatus(id: number, status: string): Promise<Order | undefined> {
    return await db.transaction(async (tx) => {
      const [currentOrder] = await tx.select().from(orders).where(eq(orders.id, id));
      if (!currentOrder) return undefined;

      const wasDelivered = currentOrder.status === "Delivered";
      const isDelivered = status === "Delivered";

      const wasCanc = currentOrder.status === "Cancelled";
      const isCanc = status === "Cancelled";

      if (wasCanc !== isCanc) {
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));

        for (const item of items) {
          const [product] = await tx.select().from(products).where(eq(products.id, item.productId));
          if (!product) continue;

          const delta = isCanc ? item.quantity : -item.quantity;
          const colorVariants = ((product as any).colorVariants || []) as Array<{
            name: string;
            sizeInventory: Record<string, number>;
            sizes: string[];
            mainImage: string;
            images: string[];
            colorCode: string;
          }>;
          const itemColor = (item as any).color;
          const itemSize = (item as any).size;

          if (colorVariants.length > 0 && itemColor) {
            const variantIdx = colorVariants.findIndex((v) => v.name === itemColor);
            if (variantIdx >= 0) {
              const vInv = colorVariants[variantIdx].sizeInventory || {};
              if (itemSize) {
                vInv[itemSize] = Math.max(0, (vInv[itemSize] ?? 0) + delta);
              }
              colorVariants[variantIdx].sizeInventory = vInv;
            } else {
              const newStock = Math.max(0, product.stockQuantity + delta);
              await tx.update(products).set({ stockQuantity: newStock }).where(eq(products.id, item.productId));
              continue;
            }
            const mergedInv: Record<string, number> = {};
            colorVariants.forEach((v) => {
              Object.entries(v.sizeInventory || {}).forEach(([s, q]) => {
                mergedInv[s] = (mergedInv[s] || 0) + q;
              });
            });
            const totalStock = Object.values(mergedInv).reduce((s, q) => s + q, 0);
            await tx
              .update(products)
              .set({ colorVariants, sizeInventory: mergedInv, stockQuantity: totalStock })
              .where(eq(products.id, item.productId));
          } else {
            const sizeInv = (product.sizeInventory as Record<string, number>) || {};
            if (itemSize) {
              sizeInv[itemSize] = Math.max(0, (sizeInv[itemSize] ?? 0) + delta);
              const totalStock = Object.values(sizeInv).reduce((s, q) => s + q, 0);
              await tx
                .update(products)
                .set({ sizeInventory: sizeInv, stockQuantity: totalStock })
                .where(eq(products.id, item.productId));
            } else {
              const newStock = Math.max(0, product.stockQuantity + delta);
              await tx
                .update(products)
                .set({ stockQuantity: newStock })
                .where(eq(products.id, item.productId));
            }
          }
        }
      }

      const setData: any = { status };
      if (isDelivered && !wasDelivered) setData.deliveredAt = new Date();
      const [updatedOrder] = await tx.update(orders).set(setData).where(eq(orders.id, id)).returning();

      // Loyalty points: award when transitioning to Delivered, revoke when leaving Delivered
      if (updatedOrder && updatedOrder.userId && wasDelivered !== isDelivered) {
        const totalAmount = Number(updatedOrder.totalAmount || 0);
        const shippingCost = Number(updatedOrder.shippingCost || 0);
        const productsTotal = Math.max(0, totalAmount - shippingCost);
        const earnable = Math.floor(productsTotal / 2);
        if (earnable > 0) {
          const delta = isDelivered ? earnable : -earnable;
          await tx.execute(
            sql`UPDATE users SET points = GREATEST(0, points + ${delta}) WHERE id = ${updatedOrder.userId}`
          );
        }
      }

      return updatedOrder;
    });
  }

  /**
   * Permanently delete one or more orders (e.g. removing test orders).
   * Does NOT touch product stock — deleting an order record no longer
   * restocks its items; stock is only ever adjusted by actual returns/
   * exchanges/cancellations, not by removing the order record.
   * Removes dependent rows first (order items, exchange requests) to satisfy
   * foreign key constraints, then deletes the orders themselves.
   * Returns the number of orders actually deleted.
   */
  async deleteOrders(ids: number[]): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    return await db.transaction(async (tx) => {
      await tx.delete(exchangeRequests).where(inArray(exchangeRequests.orderId, ids));
      await tx.delete(orderItems).where(inArray(orderItems.orderId, ids));
      const deleted = await tx.delete(orders).where(inArray(orders.id, ids)).returning();
      return deleted.length;
    });
  }

  async getUserLoyalty(userId: number): Promise<{ points: number; credit: string }> {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return { points: (u as any)?.points ?? 0, credit: ((u as any)?.credit ?? "0").toString() };
  }

  async convertUserPoints(userId: number, requestedPoints?: number): Promise<{ points: number; credit: string; converted: number; creditAdded: number }> {
    return await db.transaction(async (tx) => {
      const [u] = await tx.select().from(users).where(eq(users.id, userId));
      if (!u) throw new Error("User not found");
      const currentPoints = (u as any).points ?? 0;
      const currentCredit = Number((u as any).credit ?? 0);
      if (currentPoints < 450) throw new Error("NOT_ENOUGH_POINTS");
      const desired = requestedPoints && requestedPoints > 0
        ? Math.floor(requestedPoints)
        : currentPoints;
      const capped = Math.min(desired, currentPoints);
      // Convert in whole-shekel units only: 30 points = ₪1
      const wholeShekels = Math.floor(capped / 30);
      const consumePoints = wholeShekels * 30;
      if (consumePoints < 450) throw new Error("NOT_ENOUGH_POINTS");
      const creditAdded = wholeShekels;
      const newPoints = currentPoints - consumePoints;
      const newCredit = Math.round((currentCredit + creditAdded) * 100) / 100;
      await tx.update(users).set({ points: newPoints, credit: newCredit.toString() } as any).where(eq(users.id, userId));
      return { points: newPoints, credit: newCredit.toString(), converted: consumePoints, creditAdded };
    });
  }

  async deductUserCredit(userId: number, amount: number): Promise<void> {
    if (amount <= 0) return;
    await db.execute(
      sql`UPDATE users SET credit = GREATEST(0, credit::numeric - ${amount}) WHERE id = ${userId}`
    );
  }

  async getStats(): Promise<{totalProducts: number, totalUsers: number, totalOrders: number, totalSales: number, lowStockCount: number}> {
    const productsList = await db.select().from(products);
    const usersList = await db.select().from(users);
    const ordersList = await db.select().from(orders);
    
    const totalSales = ordersList.filter(o => o.status === "Delivered").reduce((acc, order) => acc + Number(order.totalAmount || 0) - Number(order.shippingCost || 0), 0);
    const lowStockCount = productsList.filter(p => p.stockQuantity <= 2).length;

    return {
      totalProducts: productsList.length,
      totalUsers: usersList.length,
      totalOrders: ordersList.length,
      totalSales,
      lowStockCount
    };
  }

  async getWishlist(userId: number): Promise<Wishlist[]> {
    return await db.select().from(wishlist).where(eq(wishlist.userId, userId));
  }

  async getWishlistWithProducts(userId: number): Promise<(Wishlist & { product: Product | null })[]> {
    const items = await db.select().from(wishlist).where(eq(wishlist.userId, userId));
    const result = await Promise.all(
      items.map(async (item) => {
        const [product] = await db.select().from(products).where(eq(products.id, item.productId));
        return { ...item, product: product ?? null };
      })
    );
    return result;
  }

  async addToWishlist(userId: number, productId: number, color?: string | null): Promise<Wishlist> {
    const [item] = await db.insert(wishlist).values({ userId, productId, color: color ?? null }).returning();
    return item;
  }

  async removeFromWishlist(id: number): Promise<boolean> {
    const [deleted] = await db.delete(wishlist).where(eq(wishlist.id, id)).returning();
    return !!deleted;
  }

  async isInWishlist(userId: number, productId: number): Promise<boolean> {
    const [item] = await db.select().from(wishlist).where(and(eq(wishlist.userId, userId), eq(wishlist.productId, productId)));
    return !!item;
  }

  async getCartItems(userId: number): Promise<(CartItemRow & { product: Product })[]> {
    const rows = await db
      .select({ cartItem: cartItems, product: products })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.userId, userId));
    return rows.map(r => ({ ...r.cartItem, product: r.product }));
  }

  async upsertCartItem(userId: number, productId: number, quantity: number, size?: string | null, color?: string | null): Promise<void> {
    const existing = await db
      .select()
      .from(cartItems)
      .where(and(
        eq(cartItems.userId, userId),
        eq(cartItems.productId, productId),
        size ? eq(cartItems.size, size) : sql`${cartItems.size} is null`,
        color ? eq(cartItems.color, color) : sql`${cartItems.color} is null`,
      ));
    if (existing.length > 0) {
      await db
        .update(cartItems)
        .set({ quantity: existing[0].quantity + quantity, updatedAt: new Date() })
        .where(eq(cartItems.id, existing[0].id));
    } else {
      await db.insert(cartItems).values({ userId, productId, quantity, size: size ?? null, color: color ?? null });
    }
  }

  async updateCartItemQty(userId: number, productId: number, quantity: number, size?: string | null, color?: string | null): Promise<void> {
    if (quantity < 1) return;
    await db
      .update(cartItems)
      .set({ quantity, updatedAt: new Date() })
      .where(and(
        eq(cartItems.userId, userId),
        eq(cartItems.productId, productId),
        size ? eq(cartItems.size, size) : sql`${cartItems.size} is null`,
        color ? eq(cartItems.color, color) : sql`${cartItems.color} is null`,
      ));
  }

  async removeCartItem(userId: number, productId: number, size?: string | null, color?: string | null): Promise<void> {
    await db
      .delete(cartItems)
      .where(and(
        eq(cartItems.userId, userId),
        eq(cartItems.productId, productId),
        size ? eq(cartItems.size, size) : sql`${cartItems.size} is null`,
        color ? eq(cartItems.color, color) : sql`${cartItems.color} is null`,
      ));
  }

  async clearUserCart(userId: number): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  }

  async mergeGuestCart(userId: number, guestItems: Array<{ productId: number; quantity: number; size?: string | null; color?: string | null }>): Promise<void> {
    for (const item of guestItems) {
      await this.upsertCartItem(userId, item.productId, item.quantity, item.size, item.color);
    }
  }

  async getReviews(productId: number): Promise<Review[]> {
    return await db.select().from(reviews).where(eq(reviews.productId, productId));
  }

  async createReview(review: InsertReview): Promise<Review> {
    const [newReview] = await db.insert(reviews).values(review).returning();
    return newReview;
  }

  async validateDiscountCode(code: string): Promise<DiscountCode | undefined> {
    const [discount] = await db.select().from(discountCodes).where(eq(discountCodes.code, code));
    if (!discount || !discount.isActive) return undefined;
    if (discount.expiresAt && new Date(discount.expiresAt) < new Date()) return undefined;
    if (discount.maxUses && discount.usedCount && discount.usedCount >= discount.maxUses) return undefined;
    return discount;
  }

  async useDiscountCode(code: string): Promise<DiscountCode | undefined> {
    const [updated] = await db.update(discountCodes)
      .set({ usedCount: sql`COALESCE(${discountCodes.usedCount}, 0) + 1` })
      .where(
        and(
          eq(discountCodes.code, code),
          eq(discountCodes.isActive, true),
          sql`(${discountCodes.maxUses} IS NULL OR COALESCE(${discountCodes.usedCount}, 0) < ${discountCodes.maxUses})`,
          sql`(${discountCodes.expiresAt} IS NULL OR ${discountCodes.expiresAt} > NOW())`
        )
      )
      .returning();
    return updated;
  }

  async getAllDiscountCodes(): Promise<DiscountCode[]> {
    return await db.select().from(discountCodes).orderBy(discountCodes.createdAt);
  }

  async getUserDiscountCodeUseCount(userId: number, code: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.discountCode, code)));
    return Number(row?.count ?? 0);
  }

  async createDiscountCode(data: InsertDiscountCode): Promise<DiscountCode> {
    const [created] = await db.insert(discountCodes).values(data).returning();
    return created;
  }

  async updateDiscountCode(id: number, data: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined> {
    const [updated] = await db.update(discountCodes).set(data).where(eq(discountCodes.id, id)).returning();
    return updated;
  }

  async deleteDiscountCode(id: number): Promise<boolean> {
    const result = await db.delete(discountCodes).where(eq(discountCodes.id, id)).returning();
    return result.length > 0;
  }

  async getSiteSettings(): Promise<SiteSetting[]> {
    return await db.select().from(siteSettings);
  }

  async getSiteSetting(key: string): Promise<string | undefined> {
    const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
    return row?.value;
  }

  async setSiteSetting(key: string, value: string): Promise<SiteSetting> {
    const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
    if (existing.length > 0) {
      const [updated] = await db.update(siteSettings).set({ value }).where(eq(siteSettings.key, key)).returning();
      return updated;
    }
    const [created] = await db.insert(siteSettings).values({ key, value }).returning();
    return created;
  }

  async getProductByBarcode(barcode: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.barcode, barcode));
    return product;
  }

  async createPosOrder(order: InsertPosOrder): Promise<PosOrder> {
    const [created] = await db.insert(posOrders).values(order).returning();
    return created;
  }

  async createPosOrderAtomic(
    order: InsertPosOrder,
    items: Array<{ productId: number; color?: string; size?: string; quantity: number; newSize?: boolean }>
  ): Promise<PosOrder> {
    return await db.transaction(async (tx) => {
      for (const item of items) {
        // Lock the product row so concurrent transactions must wait
        const lockResult = await tx.execute(
          sql`SELECT * FROM products WHERE id = ${item.productId} FOR UPDATE`
        );
        const product = (lockResult as any).rows?.[0] ?? (lockResult as any)[0];
        if (!product) throw new Error(`Product ${item.productId} not found`);

        const colorVariants = (product.color_variants as any[]) || [];
        if (colorVariants.length > 0 && item.color) {
          const variantIdx = colorVariants.findIndex((cv: any) => cv.name === item.color);
          if (variantIdx === -1) throw new Error(`Color variant "${item.color}" not found`);
          const cv = colorVariants[variantIdx];
          const inv = { ...(cv.sizeInventory || {}) };
          const cvSizes: string[] = Array.isArray(cv.sizes) ? [...cv.sizes] : [];
          if (item.size) {
            const avail = inv[item.size] ?? 0;
            if (item.newSize) {
              // Selling a size the cashier picked from the POS "quick add"
              // hint — it isn't tracked in inventory yet (or was already
              // fully sold). Instead of rejecting the sale, record it as
              // newly received-and-immediately-sold stock: the size now
              // exists on the product and nets to 0 (or whatever remains),
              // so it shows up as out-of-stock everywhere afterward rather
              // than not existing at all.
              inv[item.size] = Math.max(0, avail - item.quantity);
              if (!cvSizes.includes(item.size)) cvSizes.push(item.size);
            } else {
              if (avail < item.quantity) {
                throw new Error(`STOCK_ERROR:${product.name} (${item.color} / ${item.size}) — only ${avail} left`);
              }
              inv[item.size] = avail - item.quantity;
            }
          } else {
            const total = Object.values(inv).reduce((s: number, q: any) => s + (q as number), 0) as number;
            if (total < item.quantity) {
              throw new Error(`STOCK_ERROR:${product.name} (${item.color}) — only ${total} left`);
            }
          }
          colorVariants[variantIdx] = { ...cv, sizes: cvSizes, sizeInventory: inv };
          const mergedSizeInv: Record<string, number> = {};
          const mergedSizes = new Set<string>();
          colorVariants.forEach((cv: any) => {
            (cv.sizes || []).forEach((sz: string) => mergedSizes.add(sz));
            Object.entries(cv.sizeInventory || {}).forEach(([sz, qty]) => {
              mergedSizeInv[sz] = (mergedSizeInv[sz] || 0) + (qty as number);
            });
          });
          const totalStock = colorVariants.reduce((sum: number, cv: any) =>
            sum + Object.values(cv.sizeInventory || {}).reduce((s: number, q: any) => s + (q as number), 0), 0);
          // Always write colorVariants + sizeInventory (even at 0) — otherwise the
          // stale nonzero JSON lets the same last piece be "sold" again next time.
          await tx.update(products)
            .set({ colorVariants, sizeInventory: mergedSizeInv, sizes: Array.from(mergedSizes), stockQuantity: totalStock })
            .where(eq(products.id, item.productId));
        } else {
          const sizeInv = (product.size_inventory as Record<string, number>) || {};
          const prodSizes: string[] = Array.isArray(product.sizes) ? [...product.sizes] : [];
          if (item.size) {
            const avail = sizeInv[item.size] ?? 0;
            if (item.newSize) {
              sizeInv[item.size] = Math.max(0, avail - item.quantity);
              if (!prodSizes.includes(item.size)) prodSizes.push(item.size);
            } else {
              if (avail < item.quantity) {
                throw new Error(`STOCK_ERROR:${product.name} (${item.size}) — only ${avail} left`);
              }
              sizeInv[item.size] = avail - item.quantity;
            }
            const newStock = Object.values(sizeInv).reduce((s: number, q: any) => s + (q as number), 0) as number;
            await tx.update(products)
              .set({ sizeInventory: sizeInv, sizes: prodSizes, stockQuantity: newStock })
              .where(eq(products.id, item.productId));
          } else {
            const avail = product.stock_quantity as number ?? 0;
            if (avail < item.quantity) {
              throw new Error(`STOCK_ERROR:${product.name} — only ${avail} left`);
            }
            const newStock = avail - item.quantity;
            if (newStock === 0) {
              await tx.update(products).set({ stockQuantity: 0 }).where(eq(products.id, item.productId));
            } else {
              await tx.update(products)
                .set({ stockQuantity: newStock })
                .where(eq(products.id, item.productId));
            }
          }
        }
      }
      const [created] = await tx.insert(posOrders).values(order).returning();
      return created;
    });
  }

  async getPosOrders(): Promise<PosOrder[]> {
    const [orders, rawTransferredIds] = await Promise.all([
      db.select().from(posOrders).orderBy(desc(posOrders.createdAt)),
      this.getSiteSetting("pos_transferred_order_ids"),
    ]);
    let transferredIds = new Set<number>();
    try {
      const parsed = JSON.parse(rawTransferredIds || "[]");
      if (Array.isArray(parsed)) transferredIds = new Set(parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0));
    } catch {}
    const enrichedOrders = inferLegacyPosExchangeHistory(orders as PosOrder[]);
    return enrichedOrders.map((order) => ({
      ...order,
      transferred: transferredIds.has(order.id),
    })) as any;
  }

  async getPosOrderById(id: number): Promise<PosOrder | undefined> {
    // Exchange history can be inferred from another (replacement) invoice, so
    // use the enriched list here instead of reading the target row in isolation.
    const orders = await this.getPosOrders();
    return orders.find((order) => Number(order.id) === Number(id));
  }

  async updatePosOrderExchangeHistory(id: number, history: any[]): Promise<PosOrder | undefined> {
    const [updated] = await db
      .update(posOrders)
      .set({ exchangeHistory: Array.isArray(history) ? history : [] } as any)
      .where(eq(posOrders.id, id))
      .returning();
    return updated;
  }

  /**
   * Switches an invoice between "cash" and "card" (used by the reports page
   * when the wrong method was picked at checkout). The cash_amount/
   * card_amount columns are re-synced to match — the full total moves onto
   * whichever method is now selected and the other is zeroed — since the
   * cash/card summary totals elsewhere are computed straight from these two
   * columns; leaving them stale would silently corrupt those reports.
   * Also used to convert a "split" invoice into a single cash/card invoice —
   * the full total moves onto the chosen method and the other is zeroed.
   */
  async updatePosOrderPaymentMethod(
    id: number,
    method: "cash" | "card" | "split",
    splitAmounts?: { cashAmount: number; cardAmount: number },
  ): Promise<PosOrder | undefined> {
    const [existing] = await db.select().from(posOrders).where(eq(posOrders.id, id));
    if (!existing) return undefined;
    const total = existing.totalAmount;
    const [updated] = await db
      .update(posOrders)
      .set({
        paymentMethod: method,
        cashAmount:
          method === "cash"
            ? total
            : method === "split"
              ? splitAmounts!.cashAmount.toFixed(2)
              : "0",
        cardAmount:
          method === "card"
            ? total
            : method === "split"
              ? splitAmounts!.cardAmount.toFixed(2)
              : "0",
      })
      .where(eq(posOrders.id, id))
      .returning();
    return updated;
  }

  async updatePosOrdersTransferred(ids: number[], transferred: boolean): Promise<PosOrder[]> {
    if (ids.length === 0) return [];
    const rawCurrent = await this.getSiteSetting("pos_transferred_order_ids");
    let current = new Set<number>();
    try {
      const parsed = JSON.parse(rawCurrent || "[]");
      if (Array.isArray(parsed)) current = new Set(parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0));
    } catch {}
    ids.forEach((id) => transferred ? current.add(id) : current.delete(id));
    await this.setSiteSetting("pos_transferred_order_ids", JSON.stringify(Array.from(current).sort((a, b) => a - b)));
    const updated = await db.select().from(posOrders).where(inArray(posOrders.id, ids));
    return updated.map((order) => ({ ...order, transferred })) as any;
  }

  /**
   * Permanently delete ALL POS invoices/transactions.
   * Does NOT touch product stock — deleting a POS invoice record no longer
   * restocks its items; stock is only ever adjusted by actual returns/
   * exchanges, not by removing the invoice record.
   * No other tables reference pos_orders, so the delete itself is safe.
   * Returns the number of rows deleted.
   */
  async deleteAllPosOrders(): Promise<number> {
    return await db.transaction(async (tx) => {
      const deleted = await tx.delete(posOrders).returning();
      return deleted.length;
    });
  }

  /**
   * Permanently delete specific POS invoices/transactions by id.
   * Same no-restock semantics as deleteAllPosOrders — deleting an invoice
   * record never touches product stock.
   */
  async deletePosOrdersByIds(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    return await db.transaction(async (tx) => {
      const deleted = await tx.delete(posOrders).where(inArray(posOrders.id, ids)).returning();
      return deleted.length;
    });
  }

  async recordProductEvent(event: InsertProductEvent): Promise<void> {
    await db.insert(productEvents).values(event);
  }

  async getProductRecommendations(productId: number): Promise<number[]> {
    // Combine order co-occurrence (weight 3) + session co-view (weight 1)
    const result = await db.execute(sql`
      SELECT product_id, SUM(score) AS total_score
      FROM (
        -- Products bought together in the same order (strongest signal)
        SELECT oi2.product_id, COUNT(*)::int * 3 AS score
        FROM order_items oi1
        JOIN order_items oi2
          ON oi1.order_id = oi2.order_id AND oi2.product_id != oi1.product_id
        WHERE oi1.product_id = ${productId}
        GROUP BY oi2.product_id

        UNION ALL

        -- Products viewed together in the same session
        SELECT pe2.product_id, COUNT(*)::int AS score
        FROM product_events pe1
        JOIN product_events pe2
          ON pe1.session_id = pe2.session_id AND pe2.product_id != pe1.product_id
        WHERE pe1.product_id = ${productId}
          AND pe1.session_id IS NOT NULL
          AND pe2.event_type IN ('view', 'cart_add')
        GROUP BY pe2.product_id

        UNION ALL

        -- Products added to cart together in the same session (weight 2)
        SELECT pe2.product_id, COUNT(*)::int * 2 AS score
        FROM product_events pe1
        JOIN product_events pe2
          ON pe1.session_id = pe2.session_id AND pe2.product_id != pe1.product_id
        WHERE pe1.product_id = ${productId}
          AND pe1.session_id IS NOT NULL
          AND pe2.event_type = 'cart_add'
        GROUP BY pe2.product_id
      ) sub
      GROUP BY product_id
      ORDER BY total_score DESC
      LIMIT 12
    `);
    return (result.rows as any[]).map((r) => Number(r.product_id));
  }

  // ---- Exchange Requests ----
  async getOrderItem(id: number): Promise<OrderItem | undefined> {
    const [it] = await db.select().from(orderItems).where(eq(orderItems.id, id));
    return it;
  }

  async createExchangeRequest(userId: number, data: InsertExchangeRequest): Promise<ExchangeRequest> {
    const [row] = await db.insert(exchangeRequests).values({ ...data, userId }).returning();
    return row;
  }

  async getUserExchangeRequests(userId: number): Promise<(ExchangeRequest & { product: Product | null; order: Order | null })[]> {
    const rows = await db
      .select()
      .from(exchangeRequests)
      .leftJoin(products, eq(exchangeRequests.productId, products.id))
      .leftJoin(orders, eq(exchangeRequests.orderId, orders.id))
      .where(eq(exchangeRequests.userId, userId))
      .orderBy(desc(exchangeRequests.createdAt));
    return rows.map((r: any) => ({ ...r.exchange_requests, product: r.products, order: r.orders }));
  }

  async getAllExchangeRequests(): Promise<(ExchangeRequest & { product: Product | null; order: Order | null; user: User | null })[]> {
    const rows = await db
      .select()
      .from(exchangeRequests)
      .leftJoin(products, eq(exchangeRequests.productId, products.id))
      .leftJoin(orders, eq(exchangeRequests.orderId, orders.id))
      .leftJoin(users, eq(exchangeRequests.userId, users.id))
      .orderBy(desc(exchangeRequests.createdAt));
    return rows.map((r: any) => ({ ...r.exchange_requests, product: r.products, order: r.orders, user: r.users }));
  }

  async getExchangeRequestById(id: number): Promise<(ExchangeRequest & { product: Product | null; order: Order | null; user: User | null }) | undefined> {
    const rows = await db
      .select()
      .from(exchangeRequests)
      .leftJoin(products, eq(exchangeRequests.productId, products.id))
      .leftJoin(orders, eq(exchangeRequests.orderId, orders.id))
      .leftJoin(users, eq(exchangeRequests.userId, users.id))
      .where(eq(exchangeRequests.id, id))
      .limit(1);
    if (!rows.length) return undefined;
    const r = rows[0] as any;
    return { ...r.exchange_requests, product: r.products, order: r.orders, user: r.users };
  }

  async updateExchangeRequest(id: number, status: string, adminNote?: string): Promise<ExchangeRequest | undefined> {
    const [row] = await db
      .update(exchangeRequests)
      .set({ status, adminNote: adminNote ?? null, resolvedAt: status === "pending" ? null : new Date() })
      .where(eq(exchangeRequests.id, id))
      .returning();
    return row;
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [row] = await db.insert(notifications).values(data).returning();
    return row;
  }

  async getUserNotifications(userId: number): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(30);
  }

  async markAllNotificationsRead(userId: number): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  }

  async getProductGroups(): Promise<ProductGroup[]> {
    return db.select().from(productGroups).orderBy(desc(productGroups.createdAt));
  }

  async createProductGroup(name: string, productIds: number[]): Promise<ProductGroup> {
    const [row] = await db.insert(productGroups).values({ name, productIds }).returning();
    return row;
  }

  async addProductsToGroup(id: number, newProductIds: number[]): Promise<ProductGroup | undefined> {
    const [existing] = await db.select().from(productGroups).where(eq(productGroups.id, id));
    if (!existing) return undefined;
    const merged = Array.from(new Set([...existing.productIds, ...newProductIds]));
    const [row] = await db.update(productGroups).set({ productIds: merged }).where(eq(productGroups.id, id)).returning();
    return row;
  }

  async deleteProductGroup(id: number): Promise<boolean> {
    await db.delete(productGroups).where(eq(productGroups.id, id));
    return true;
  }
}

export const storage = new DatabaseStorage();
