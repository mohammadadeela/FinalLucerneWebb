import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("customer"),
  fullName: text("full_name"),
  phone: text("phone"),
  address: text("address"),
  isVerified: boolean("is_verified").default(false),
  isBlocked: boolean("is_blocked").default(false),
  verificationCode: text("verification_code"),
  points: integer("points").notNull().default(0),
  credit: numeric("credit").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  slug: text("slug").notNull().unique(),
  image: text("image"),
  showOnHome: boolean("show_on_home").default(false),
  sizeGuide: text("size_guide").default("auto"),
});

export const subcategories = pgTable("subcategories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  slug: text("slug").notNull(),
  image: text("image"),
  categoryId: integer("category_id").references(() => categories.id).notNull(),
  isActive: boolean("is_active").default(true),
  showOnHome: boolean("show_on_home").default(false),
});

export interface MediaItem {
  type: "image" | "video";
  url: string;
  isPrimary?: boolean;
}

export interface ColorVariant {
  name: string;
  colorCode: string;
  mainImage: string;
  images: string[];
  sizes: string[];
  sizeInventory: Record<string, number>;
  colorTags?: string[];
  media?: MediaItem[];
}

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: numeric("price").notNull(),
  costPrice: numeric("cost_price"),
  discountPrice: numeric("discount_price"),
  mainImage: text("main_image").notNull(),
  images: jsonb("images").$type<string[]>().default([]),
  categoryId: integer("category_id").references(() => categories.id),
  subcategoryId: integer("subcategory_id").references(() => subcategories.id),
  brand: text("brand"),
  barcode: text("barcode"),
  sizes: jsonb("sizes").$type<string[]>().default([]),
  colors: jsonb("colors").$type<string[]>().default([]),
  sizeInventory: jsonb("size_inventory").$type<Record<string, number>>().default({}),
  colorVariants: jsonb("color_variants").$type<ColorVariant[]>().default([]),
  videoUrl: text("video_url"),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  isFeatured: boolean("is_featured").default(false),
  isNewArrival: boolean("is_new_arrival").default(false),
  isBestSeller: boolean("is_best_seller").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  totalAmount: numeric("total_amount").notNull(),
  shippingCost: numeric("shipping_cost").notNull().default("0"),
  shippingRegion: text("shipping_region"),
  status: text("status").notNull().default("Pending"), // Pending, OnTheWay, Delivered, Cancelled
  paymentMethod: text("payment_method").notNull().default("Cash on delivery"),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  phone2: text("phone2"),
  address: text("address").notNull(),
  city: text("city").notNull(),
  notes: text("notes"),
  discountCode: text("discount_code"),
  discountAmount: numeric("discount_amount"),
  creditUsed: numeric("credit_used"),
  createdAt: timestamp("created_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  price: numeric("price").notNull(),
  size: text("size"),
  color: text("color"),
});

export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  orderItems: many(orderItems),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
}));

export const wishlist = pgTable("wishlist", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  size: text("size"),
  color: text("color"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const discountCodes = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountPercent: integer("discount_percent").notNull(),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  categoryIds: integer("category_ids").array(),
  subcategoryIds: integer("subcategory_ids").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const wishlistRelations = relations(wishlist, ({ one }) => ({
  user: one(users),
  product: one(products),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products),
  user: one(users),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertSubcategorySchema = createInsertSchema(subcategories).omit({ id: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertWishlistSchema = createInsertSchema(wishlist).omit({ id: true, createdAt: true });
export const insertCartItemSchema = createInsertSchema(cartItems).omit({ id: true, updatedAt: true });
export type CartItemRow = typeof cartItems.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true, createdAt: true });
export const insertDiscountCodeSchema = createInsertSchema(discountCodes).omit({ id: true, createdAt: true, usedCount: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

export type Subcategory = typeof subcategories.$inferSelect;
export type InsertSubcategory = z.infer<typeof insertSubcategorySchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

export type Wishlist = typeof wishlist.$inferSelect;
export type InsertWishlist = z.infer<typeof insertWishlistSchema>;

export type Review = typeof reviews.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = z.infer<typeof insertDiscountCodeSchema>;

export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

export const insertSiteSettingSchema = createInsertSchema(siteSettings).omit({ id: true });
export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = z.infer<typeof insertSiteSettingSchema>;

export const posOrders = pgTable("pos_orders", {
  id: serial("id").primaryKey(),
  totalAmount: numeric("total_amount").notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  items: jsonb("items").$type<{ productId: number; name: string; barcode: string | null; quantity: number; price: string; size?: string; color?: string }[]>().notNull(),
  note: text("note"),
  cashAmount: numeric("cash_amount"),
  cardAmount: numeric("card_amount"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPosOrderSchema = createInsertSchema(posOrders).omit({ id: true, createdAt: true });
export type PosOrder = typeof posOrders.$inferSelect;
export type InsertPosOrder = z.infer<typeof insertPosOrderSchema>;

export const exchangeRequests = pgTable("exchange_requests", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  orderItemId: integer("order_item_id").references(() => orderItems.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  reason: text("reason").notNull(),
  preferredSize: text("preferred_size"),
  preferredColor: text("preferred_color"),
  status: text("status").notNull().default("pending"), // pending | approved | denied
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertExchangeRequestSchema = createInsertSchema(exchangeRequests).omit({
  id: true, createdAt: true, resolvedAt: true, status: true, adminNote: true, userId: true,
});
export type ExchangeRequest = typeof exchangeRequests.$inferSelect;
export type InsertExchangeRequest = z.infer<typeof insertExchangeRequestSchema>;

export const productEvents = pgTable("product_events", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  eventType: text("event_type").notNull(), // 'view' | 'cart_add'
  sessionId: text("session_id"),
  userId: integer("user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ProductEvent = typeof productEvents.$inferSelect;
export type InsertProductEvent = typeof productEvents.$inferInsert;

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // "exchange_approved" | "exchange_denied"
  message: text("message").notNull(),
  messageAr: text("message_ar").notNull(),
  link: text("link").notNull().default("/profile"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// API Contracts
export type LoginRequest = z.infer<typeof insertUserSchema>;
export type RegisterRequest = z.infer<typeof insertUserSchema>;
export type CreateProductRequest = InsertProduct;
export type UpdateProductRequest = Partial<InsertProduct>;
export type CreateOrderRequest = InsertOrder & { items: Omit<InsertOrderItem, 'orderId'>[] };
export type UpdateOrderRequest = Partial<InsertOrder>;

export type AuthResponse = Omit<User, "password">;
