import { users, categories, subcategories, products, orders, orderItems, wishlist, cartItems, reviews, discountCodes, siteSettings, posOrders, productEvents, exchangeRequests, notifications, type User, type InsertUser, type Category, type InsertCategory, type Subcategory, type InsertSubcategory, type Product, type InsertProduct, type Order, type InsertOrder, type OrderItem, type InsertOrderItem, type Wishlist, type InsertWishlist, type CartItemRow, type InsertCartItem, type Review, type InsertReview, type DiscountCode, type InsertDiscountCode, type SiteSetting, type PosOrder, type InsertPosOrder, type InsertProductEvent, type ExchangeRequest, type InsertExchangeRequest, type Notification, type InsertNotification } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // User
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
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
  getProducts(): Promise<Product[]>;
  getBestSellers(limit?: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  // Order
  getOrders(): Promise<(Order & { items: { id: number; productId: number; product: { categoryId: number | null; subcategoryId: number | null } | null }[] })[]>;
  getUserOrders(userId: number): Promise<(Order & { items: { id: number; productId: number; product: { categoryId: number | null; subcategoryId: number | null } | null }[] })[]>;
  getOrder(id: number): Promise<{order: Order, items: (OrderItem & {product?: Product})[]} | undefined>;
  createOrder(order: InsertOrder, items: Omit<InsertOrderItem, 'orderId'>[], skipStockCheck?: boolean): Promise<Order>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;

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
  createPosOrderAtomic(order: InsertPosOrder, items: Array<{ productId: number; color?: string; size?: string; quantity: number }>): Promise<PosOrder>;
  getPosOrders(): Promise<PosOrder[]>;
  getPosOrderById(id: number): Promise<PosOrder | undefined>;

  // Notifications
  createNotification(data: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: number): Promise<Notification[]>;
  markAllNotificationsRead(userId: number): Promise<void>;
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async getAllUsers(): Promise<(User & { orderCount: number; deliveredCount: number; cancelledCount: number })[]> {
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
        orderCount: sql<number>`cast(count(${orders.id}) as int)`,
        deliveredCount: sql<number>`cast(count(case when ${orders.status} = 'Delivered' then 1 end) as int)`,
        cancelledCount: sql<number>`cast(count(case when ${orders.status} = 'Cancelled' then 1 end) as int)`,
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

  async getProducts(): Promise<Product[]> {
    return await db.select().from(products).orderBy(desc(products.createdAt));
  }

  async getBestSellers(limit = 8): Promise<Product[]> {
    // Priority 1: manually flagged isBestSeller products
    const flagged = await db.select().from(products).where(eq(products.isBestSeller, true)).limit(limit);
    if (flagged.length > 0) return flagged;

    // Priority 2: products ranked by total quantity sold in orders
    const ranked = await db
      .select({
        productId: orderItems.productId,
        totalSold: sql<number>`cast(sum(${orderItems.quantity}) as int)`,
      })
      .from(orderItems)
      .groupBy(orderItems.productId)
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(limit);

    if (ranked.length >= 4) {
      const ids = ranked.map((r) => r.productId);
      const result: Product[] = [];
      for (const id of ids) {
        const [p] = await db.select().from(products).where(eq(products.id, id));
        if (p) result.push(p);
      }
      return result;
    }

    // Fallback: isFeatured products
    return await db.select().from(products).where(eq(products.isFeatured, true)).limit(limit);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: number, update: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updatedProduct] = await db.update(products).set(update).where(eq(products.id, id)).returning();
    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<boolean> {
    await db.delete(wishlist).where(eq(wishlist.productId, id));
    await db.delete(reviews).where(eq(reviews.productId, id));
    await db.delete(cartItems).where(eq(cartItems.productId, id));
    await db.delete(orderItems).where(eq(orderItems.productId, id));
    const [deleted] = await db.delete(products).where(eq(products.id, id)).returning();
    return !!deleted;
  }

  private async _attachItemsToOrders(orderList: Order[]) {
    if (orderList.length === 0) return orderList.map(o => ({ ...o, items: [] as { id: number; productId: number; quantity: number; price: string; size: string | null; color: string | null; name: string | null; barcode: string | null; mainImage: string | null; product: { categoryId: number | null; subcategoryId: number | null } | null }[] }));
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
        product: i.productDbId == null ? null : { categoryId: i.categoryId ?? null, subcategoryId: i.subcategoryId ?? null },
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
    const itemsWithProducts = await Promise.all(items.map(async (item) => {
      const [product] = await db.select().from(products).where(eq(products.id, item.productId));
      return { ...item, product };
    }));

    return { order, items: itemsWithProducts };
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
          if (totalStock === 0) {
            await tx.update(products).set({ stockQuantity: 0 }).where(eq(products.id, item.productId));
          } else {
            await tx.update(products).set({
              colorVariants,
              sizeInventory: mergedInv,
              stockQuantity: totalStock,
            }).where(eq(products.id, item.productId));
          }
        } else {
          const sizeInv = { ...((product.size_inventory as Record<string, number>) || {}) };
          if (itemSize && sizeInv[itemSize] !== undefined) {
            const avail = sizeInv[itemSize] ?? 0;
            if (avail < item.quantity) {
              throw new Error(`STOCK_ERROR:${product.name} (${itemSize}) — only ${avail} left`);
            }
            sizeInv[itemSize] = avail - item.quantity;
            const totalStock = Object.values(sizeInv).reduce((s, q) => s + (q as number), 0);
            if (totalStock === 0) {
              await tx.update(products).set({ stockQuantity: 0 }).where(eq(products.id, item.productId));
            } else {
              await tx.update(products).set({ sizeInventory: sizeInv, stockQuantity: totalStock }).where(eq(products.id, item.productId));
            }
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
    const lowStockCount = productsList.filter(p => p.stockQuantity < 3).length;

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
    items: Array<{ productId: number; color?: string; size?: string; quantity: number }>
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
          if (item.size) {
            const avail = inv[item.size] ?? 0;
            if (avail < item.quantity) {
              throw new Error(`STOCK_ERROR:${product.name} (${item.color} / ${item.size}) — only ${avail} left`);
            }
            inv[item.size] = avail - item.quantity;
          } else {
            const total = Object.values(inv).reduce((s: number, q: any) => s + (q as number), 0) as number;
            if (total < item.quantity) {
              throw new Error(`STOCK_ERROR:${product.name} (${item.color}) — only ${total} left`);
            }
          }
          colorVariants[variantIdx] = { ...cv, sizeInventory: inv };
          const mergedSizeInv: Record<string, number> = {};
          colorVariants.forEach((cv: any) => {
            Object.entries(cv.sizeInventory || {}).forEach(([sz, qty]) => {
              mergedSizeInv[sz] = (mergedSizeInv[sz] || 0) + (qty as number);
            });
          });
          const totalStock = colorVariants.reduce((sum: number, cv: any) =>
            sum + Object.values(cv.sizeInventory || {}).reduce((s: number, q: any) => s + (q as number), 0), 0);
          if (totalStock === 0) {
            await tx.update(products).set({ stockQuantity: 0 }).where(eq(products.id, item.productId));
          } else {
            await tx.update(products)
              .set({ colorVariants, sizeInventory: mergedSizeInv, stockQuantity: totalStock })
              .where(eq(products.id, item.productId));
          }
        } else {
          const sizeInv = (product.size_inventory as Record<string, number>) || {};
          if (item.size) {
            const avail = sizeInv[item.size] ?? 0;
            if (avail < item.quantity) {
              throw new Error(`STOCK_ERROR:${product.name} (${item.size}) — only ${avail} left`);
            }
            sizeInv[item.size] = avail - item.quantity;
            const newStock = Object.values(sizeInv).reduce((s: number, q: any) => s + (q as number), 0) as number;
            if (newStock === 0) {
              await tx.update(products).set({ stockQuantity: 0 }).where(eq(products.id, item.productId));
            } else {
              await tx.update(products)
                .set({ sizeInventory: sizeInv, stockQuantity: newStock })
                .where(eq(products.id, item.productId));
            }
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
    return await db.select().from(posOrders).orderBy(desc(posOrders.createdAt));
  }

  async getPosOrderById(id: number): Promise<PosOrder | undefined> {
    const [order] = await db.select().from(posOrders).where(eq(posOrders.id, id));
    return order;
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
}

export const storage = new DatabaseStorage();