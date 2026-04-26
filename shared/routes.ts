import { z } from 'zod';
import { insertProductSchema, insertOrderSchema, insertCategorySchema, products, categories, orders, users, orderItems } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// Types with string values since Decimal/numeric returns strings from postgres
const productSelectSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  price: z.string(),
  costPrice: z.string().nullable().optional(),
  discountPrice: z.string().nullable(),
  mainImage: z.string(),
  images: z.array(z.string()).nullable(),
  categoryId: z.number().nullable(),
  subcategoryId: z.number().nullable().optional(),
  brand: z.string().nullable(),
  barcode: z.string().nullable().optional(),
  sizes: z.array(z.string()).nullable(),
  colors: z.array(z.string()).nullable(),
  sizeInventory: z.record(z.string(), z.number()).nullable(),
  colorVariants: z.array(z.object({
    name: z.string(),
    colorCode: z.string(),
    mainImage: z.string(),
    images: z.array(z.string()),
    sizes: z.array(z.string()),
    sizeInventory: z.record(z.string(), z.number()),
    colorTags: z.array(z.string()).optional(),
    media: z.array(z.object({
      type: z.enum(['image', 'video']),
      url: z.string(),
      isPrimary: z.boolean().optional(),
    })).optional(),
  })).nullable(),
  videoUrl: z.string().nullable().optional(),
  stockQuantity: z.number(),
  isFeatured: z.boolean().nullable(),
  isNewArrival: z.boolean().nullable(),
  isBestSeller: z.boolean().nullable(),
  createdAt: z.string().nullable(),
});

const categorySelectSchema = z.object({
  id: z.number(),
  name: z.string(),
  nameAr: z.string().nullable().optional(),
  slug: z.string(),
  image: z.string().nullable().optional(),
  showOnHome: z.boolean().nullable().optional(),
});

const userSelectSchema = z.object({
  id: z.number(),
  email: z.string(),
  role: z.string(),
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  isVerified: z.boolean().nullable(),
  createdAt: z.string().nullable(),
});

const orderSelectSchema = z.object({
  id: z.number(),
  userId: z.number().nullable(),
  totalAmount: z.string(),
  shippingCost: z.string().nullable(),
  shippingRegion: z.string().nullable(),
  status: z.string(),
  paymentMethod: z.string(),
  fullName: z.string(),
  phone: z.string(),
  phone2: z.string().nullable().optional(),
  address: z.string(),
  city: z.string(),
  notes: z.string().nullable(),
  discountCode: z.string().nullable().optional(),
  discountAmount: z.string().nullable().optional(),
  creditUsed: z.string().nullable().optional(),
  createdAt: z.string().nullable(),
  deliveredAt: z.string().nullable().optional(),
});

const reviewSelectSchema = z.object({
  id: z.number(),
  productId: z.number(),
  userId: z.number().nullable(),
  rating: z.number(),
  comment: z.string().nullable(),
  createdAt: z.string().nullable(),
});

const discountCodeSelectSchema = z.object({
  id: z.number(),
  code: z.string(),
  discountPercent: z.number(),
  maxUses: z.number().nullable(),
  usedCount: z.number().nullable(),
  expiresAt: z.string().nullable(),
  isActive: z.boolean().nullable(),
  createdAt: z.string().nullable(),
});

const wishlistSelectSchema = z.object({
  id: z.number(),
  userId: z.number(),
  productId: z.number(),
  color: z.string().nullable().optional(),
  createdAt: z.string().nullable(),
});

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/auth/login' as const,
      input: z.object({ email: z.string().email(), password: z.string() }),
      responses: {
        200: userSelectSchema,
        401: errorSchemas.unauthorized,
      }
    },
    register: {
      method: 'POST' as const,
      path: '/api/auth/register' as const,
      input: z.object({ 
        email: z.string().email(), 
        password: z.string().min(6),
        fullName: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional()
      }),
      responses: {
        201: userSelectSchema,
        400: errorSchemas.validation,
      }
    },
    me: {
      method: 'GET' as const,
      path: '/api/auth/me' as const,
      responses: {
        200: userSelectSchema,
        401: errorSchemas.unauthorized,
      }
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout' as const,
      responses: {
        200: z.object({ message: z.string() }),
      }
    },
    verify: {
      method: 'POST' as const,
      path: '/api/auth/verify' as const,
      input: z.object({ email: z.string().email(), code: z.string().length(6) }),
      responses: {
        200: userSelectSchema,
        400: errorSchemas.validation,
      }
    },
    resendCode: {
      method: 'POST' as const,
      path: '/api/auth/resend-code' as const,
      input: z.object({ email: z.string().email() }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
      }
    }
  },
  products: {
    list: {
      method: 'GET' as const,
      path: '/api/products' as const,
      responses: {
        200: z.array(productSelectSchema),
      }
    },
    get: {
      method: 'GET' as const,
      path: '/api/products/:id' as const,
      responses: {
        200: productSelectSchema,
        404: errorSchemas.notFound,
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/products' as const,
      input: insertProductSchema,
      responses: {
        201: productSelectSchema,
        401: errorSchemas.unauthorized,
        400: errorSchemas.validation,
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/products/:id' as const,
      input: insertProductSchema.partial(),
      responses: {
        200: productSelectSchema,
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/products/:id' as const,
      responses: {
        204: z.void(),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      }
    }
  },
  categories: {
    list: {
      method: 'GET' as const,
      path: '/api/categories' as const,
      responses: {
        200: z.array(categorySelectSchema),
      }
    }
  },
  orders: {
    list: {
      method: 'GET' as const,
      path: '/api/orders' as const,
      responses: {
        200: z.array(orderSelectSchema.extend({
          items: z.array(z.object({
            id: z.number(),
            productId: z.number(),
            quantity: z.number().optional(),
            price: z.string().optional(),
            size: z.string().nullable().optional(),
            color: z.string().nullable().optional(),
            name: z.string().nullable().optional(),
            barcode: z.string().nullable().optional(),
            mainImage: z.string().nullable().optional(),
            product: z.object({ categoryId: z.number().nullable(), subcategoryId: z.number().nullable() }).nullable(),
          })).optional(),
        })),
        401: errorSchemas.unauthorized,
      }
    },
    get: {
      method: 'GET' as const,
      path: '/api/orders/:id' as const,
      responses: {
        200: z.object({
          order: orderSelectSchema,
          items: z.array(z.object({
            id: z.number(),
            orderId: z.number(),
            productId: z.number(),
            quantity: z.number(),
            price: z.string(),
            size: z.string().nullable().optional(),
            color: z.string().nullable().optional(),
            product: productSelectSchema.optional(),
          }))
        }),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/orders' as const,
      input: z.object({
        order: insertOrderSchema.omit({ userId: true, totalAmount: true }),
        items: z.array(z.object({
          productId: z.number(),
          quantity: z.number().int().min(1),
          price: z.string(),
          size: z.string().nullable().optional(),
          color: z.string().nullable().optional(),
        })),
        useCredit: z.number().nonnegative().optional(),
      }),
      responses: {
        201: orderSelectSchema,
        400: errorSchemas.validation,
      }
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/orders/:id/status' as const,
      input: z.object({ status: z.string() }),
      responses: {
        200: orderSelectSchema,
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      }
    }
  },
  stats: {
    admin: {
      method: 'GET' as const,
      path: '/api/stats' as const,
      responses: {
        200: z.object({
          totalProducts: z.number(),
          totalUsers: z.number(),
          totalOrders: z.number(),
          totalSales: z.number(),
          lowStockCount: z.number(),
        }),
        401: errorSchemas.unauthorized,
      }
    }
  },
  reviews: {
    list: {
      method: 'GET' as const,
      path: '/api/reviews/:productId' as const,
      responses: {
        200: z.array(reviewSelectSchema),
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/reviews' as const,
      input: z.object({ productId: z.number(), rating: z.number().min(1).max(5), comment: z.string().optional() }),
      responses: {
        201: reviewSelectSchema,
        400: errorSchemas.validation,
      }
    }
  },
  wishlist: {
    list: {
      method: 'GET' as const,
      path: '/api/wishlist' as const,
      responses: {
        200: z.array(wishlistSelectSchema),
        401: errorSchemas.unauthorized,
      }
    },
    add: {
      method: 'POST' as const,
      path: '/api/wishlist' as const,
      input: z.object({ productId: z.number(), color: z.string().optional().nullable() }),
      responses: {
        201: wishlistSelectSchema,
        401: errorSchemas.unauthorized,
      }
    },
    remove: {
      method: 'DELETE' as const,
      path: '/api/wishlist/:id' as const,
      responses: {
        204: z.void(),
        401: errorSchemas.unauthorized,
      }
    }
  },
  discounts: {
    validate: {
      method: 'POST' as const,
      path: '/api/discounts/validate' as const,
      input: z.object({ code: z.string() }),
      responses: {
        200: discountCodeSelectSchema,
        404: errorSchemas.notFound,
      }
    }
  },
  stripe: {
    createCheckout: {
      method: 'POST' as const,
      path: '/api/stripe/create-checkout' as const,
      input: z.object({
        order: z.object({
          fullName: z.string(),
          phone: z.string(),
          address: z.string(),
          city: z.string(),
          notes: z.string().optional(),
          shippingRegion: z.string().optional(),
          shippingCost: z.string().optional(),
        }),
        items: z.array(z.object({
          productId: z.number(),
          quantity: z.number().int().min(1),
          price: z.string(),
          size: z.string().nullable().optional(),
          color: z.string().nullable().optional(),
        })),
      }),
      responses: {
        200: z.object({ url: z.string() }),
        400: errorSchemas.validation,
      }
    },
    publishableKey: {
      method: 'GET' as const,
      path: '/api/stripe/publishable-key' as const,
      responses: {
        200: z.object({ publishableKey: z.string() }),
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
