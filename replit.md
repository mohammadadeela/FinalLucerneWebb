# Lucerne Boutique

## Overview
A full-stack e-commerce website for women's fashion (clothes, shoes) targeting Palestinian customers. Built with Express + React + PostgreSQL.

## Architecture
- **Backend**: Express.js + Passport session auth + drizzle-orm (PostgreSQL)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **State**: Zustand (cart, language), TanStack Query (server state)
- **Currency**: ILS (₪)
- **Payment**: Cash on Delivery + Stripe Card Payment
- **Email**: Nodemailer (Gmail app password) with console.log fallback

## Key Features
- Arabic/English bilingual support (Arabic default, custom i18n via zustand)
- RTL/LTR layout switching
- Product catalog with categories, subcategories, per-color variants, images
- Shopping cart with persistent state
- Checkout with delivery details + COD/Card payment toggle
- User authentication (register/login) with email verification (6-digit code)
- User profile with order history + order details dialog
- Admin dashboard (products CRUD, order management, stats)
- **POS System**: product barcode scan, cart with stock limits, customer notes, hold/recall carts, split payment (cash+card), return/refund modal, revenue chart (recharts), date filter, Excel export, shift summary print, low-stock badges
- Discount codes with optional category/subcategory restriction (partial discount applies only to qualifying items)
- Wishlist & Reviews
- Stripe card payment via Stripe checkout sessions
- Order notification emails to mohammad.adeela@gmail.com
- Social media links (Instagram/Facebook) in footer
- "موقعنا" (Our Location) page with video embed + store info

## Color Variant System
- Products support **multiple color variants** via `colorVariants` JSONB column on the products table
- Each `ColorVariant` has: `name`, `colorCode` (hex), `mainImage`, `images[]`, `sizes[]`, `sizeInventory: Record<string, number>`, `colorTags?: string[]`, and `media?: MediaItem[]`
- **Unified Media System**: Each variant now supports a `media?: MediaItem[]` array containing both images and videos with `{ type: "image"|"video", url, isPrimary? }`. The primary item is displayed first and as the hero.
- **Admin**: "Add Color" button creates variant cards; each card has a unified media gallery that accepts photos and videos freely — upload, set primary (⭐), and remove per item. All variants can have videos.
- **Customer**: Product page `allMedia` prefers the `media` array (primary first) when present; falls back to `mainImage`/`images`/`videoUrl` for older products. Video items autoplay muted+loop in the main viewer, no controls.
- **Backward compat**: Products with empty colorVariants fall back to flat `mainImage`/`sizes`/`sizeInventory` fields. Products without `media` array fall back to `mainImage`+`images`+product `videoUrl`.
- Product-level `mainImage`, `images`, `videoUrl`, `colors`, `sizes`, `sizeInventory`, `stockQuantity` are auto-computed from variants on save
- Stock validation and deduction during orders is color-variant-aware

## Shipping Regions
- West Bank (الضفة الغربية) = ₪20
- Jerusalem (القدس) = ₪30
- Interior/48 (الداخل) = ₪75
- Server-side validation of shipping costs (SHIPPING_RATES map in routes.ts)
- Shipping cost added to totalAmount; stored in orders.shippingCost and orders.shippingRegion

## Data Integrity
- Order creation and status updates are wrapped in database transactions to prevent partial writes
- Discount code usage uses atomic SQL increment with max-use enforcement at the database level
- Stripe checkout success uses DB-persisted session markers (in order notes) for idempotent replay protection
- Firebase social login validates token issuer, subject, issued-at time, and audience claims

## Order Statuses
- Pending (بالانتظار)
- OnTheWay (بالطريق إلك)
- Delivered (تم التسليم)
- Cancelled (تم إلغاء الطلب)

## Email System
- **Service**: `server/email.ts` with Nodemailer (Gmail transport)
- **Secrets needed**: EMAIL_USER, EMAIL_PASS (Gmail app password)
- **Fallback**: console.log if EMAIL_USER/EMAIL_PASS not set
- **Email verification on signup**: 6-digit code sent via email; user must verify before logging in
- **Forgot password**: Backend sends 6-digit reset code; user enters code + new password; codes expire in 15 minutes
- **Social login**: Google and Facebook via Firebase SDK (popup); backend verifies Firebase ID token via REST; creates/finds user in DB
- **Firebase config**: `VITE_FIREBASE_*` env vars for frontend; `FIREBASE_API_KEY` for backend token verification
- **Unverified users cannot log in**: Passport strategy rejects `isVerified: false` users; login redirects them to verification step
- **Order notifications**: Sent to mohammad.adeela@gmail.com on every order
- **Customer confirmation**: Arabic RTL email sent to customer with order #, items, shipping cost breakdown

## Card Payment: Lahza
- **Provider**: Lahza payment gateway (Palestinian, supports ILS)
- **Secret**: `LAHZA_SECRET_KEY` (stored in Replit Secrets)
- **File**: `server/lahza.ts` — wraps Lahza REST API (initialize + verify)
- **Routes**: `POST /api/lahza/create-checkout` → calls Lahza API, returns `authorization_url`; `GET /api/lahza/verify?reference=...` → verifies payment + saves order
- **Flow**: Client POSTs cart → server verifies prices + calls Lahza → user redirected to Lahza hosted checkout (new tab) → Lahza redirects to `/checkout/success?reference=...` → server verifies via `GET /transaction/verify/{ref}` → order saved
- **Amounts**: Lahza requires amounts in agorot (1 ILS = 100 agorot), conversion done in `lahza.ts`
- **Pending orders**: Stored in-memory Map (`pendingLahzaOrders`) keyed by `LUC-{timestamp}-{userId}`
- **Success page**: `/checkout/success?reference=...` → `CheckoutSuccess.tsx`

## Stripe Integration (legacy, unused)
- **Files**: `server/stripeClient.ts`, `server/webhookHandlers.ts` (kept but not actively used)
- Stripe was replaced by Lahza. Routes still exist at `/api/stripe/*` for backward compat.

## i18n System
- **Store**: `client/src/i18n/index.ts` - zustand store with `useLanguage()` hook
- **Translations**: `client/src/i18n/ar.ts` (Arabic), `client/src/i18n/en.ts` (English)
- **Default language**: Arabic (RTL)
- **Switching**: Globe icon in Navbar toggles between Arabic and English
- **RTL**: Handled via `document.documentElement.dir` and CSS `[dir="rtl"]` selectors
- **Arabic font**: Noto Sans Arabic (loaded from Google Fonts)
- Uses logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`) for RTL support

## Categories & Pages
- Dresses (فساتين) → /dresses — category ID 1
- Tops & Blouses + Pants & Skirts (ملابس) → /clothes — category IDs 2,3
- Shoes (شوزات) → /shoes — category ID 4
- Bags → category ID 5
- Accessories → category ID 6
- All categories also available in /shop with sidebar filters
- Sale page → /sale (products with discountPrice)
- New Arrivals → /new-arrivals
- Our Location → /our-location

## POS (Point of Sale)
- **Page**: `/admin/pos` — admin-only in-store sales system
- **Barcode**: Products have an optional `barcode` field; scanner input auto-focuses
- **Flow**: Scan barcode → product appears with photo/info → select size/color → add to invoice → complete sale → print invoice
- **Invoice**: Printable receipt with date/time, items, prices, total (no customer info)
- **Stock**: POS sales deduct inventory (sizeInventory + stockQuantity)
- **Storage**: `pos_orders` table stores POS sales (items as JSONB)
- **Routes**: `GET /api/pos/search-barcode/:barcode`, `POST /api/pos/orders`, `GET /api/pos/orders`

## Discount Codes
- **Admin page**: `/admin/discount-codes` — full CRUD for managing discount codes
- **Fields**: code (unique, uppercase), discountPercent (1-100%), maxUses (optional), expiresAt (optional date+time), isActive
- **Checkout**: Discount code input in order summary; validates via `POST /api/discounts/validate`; shows applied discount with green styling and removal button
- **Order tracking**: Orders store `discountCode` and `discountAmount` in the database
- **Payment safety**: For card payments (Stripe/Lahza), usage is only incremented after payment success — not at checkout creation — to prevent failed/abandoned payments from consuming usage
- **Server validation**: discountPercent must be 1-100; maxUses must be >= 1; duplicate codes rejected (unique constraint)

## Database Schema
Tables: users, categories, products, orders, order_items, wishlist, reviews, discount_codes, pos_orders
- users: email, password, fullName, role, isVerified, verificationCode
- products: has `barcode` field for POS scanning and admin product search
- products.colorVariants: JSONB array of ColorVariant objects
- orders: has `discountCode` and `discountAmount` fields for tracking applied discounts
- order_items has `size` and `color` columns for tracking per-item selections
- discount_codes: code, discountPercent, maxUses, usedCount, expiresAt, isActive
- pos_orders: POS sales with items stored as JSONB array
- 50 seeded products with color variants across 6 categories

## Important Files
- `shared/schema.ts` - Database schema, types, and ColorVariant interface
- `shared/routes.ts` - API contracts with Zod schemas
- `server/routes.ts` - API routes
- `server/storage.ts` - Storage interface with color-variant-aware stock deduction
- `server/email.ts` - Email service (verification + order notifications)
- `server/stripeClient.ts` - Stripe client with credential fetching
- `server/webhookHandlers.ts` - Stripe webhook processing
- `client/src/i18n/` - Translation system
- `client/src/store/use-cart.ts` - Cart state
- `client/src/pages/admin/Products.tsx` - Admin product form with color variant cards
- `client/src/pages/ProductDetails.tsx` - Product page with color swatches
- `client/src/pages/Shop.tsx` - Shop with color-variant-aware filtering
- `client/src/pages/Auth.tsx` - Login/Register with email verification step
- `client/src/pages/Checkout.tsx` - Checkout with COD/Card payment toggle
- `client/src/pages/CheckoutSuccess.tsx` - Stripe payment success handler
- `client/src/pages/OrderConfirmation.tsx` - Order confirmation page after COD checkout
- `client/src/pages/OurLocation.tsx` - Store location page

## Image Uploads
- **Backend**: `POST /api/upload` with multer (admin-only, max 10MB per file)
- **Storage**: Files saved to `uploads/` directory with UUID filenames
- **Serving**: Static files served from `/uploads/` path
- **Supported formats**: JPG, PNG, GIF, WebP, AVIF
- **Admin UI**: Each color variant card has its own main image and extra images upload

## Admin
- Login: admin@lucerne.com / admin123
- Routes: /admin, /admin/products, /admin/orders

## Mobile Responsiveness
- All product grids use `grid-cols-2` on mobile (2 products side by side)
- Navbar shows shortened logo "Lucerne" on small screens, full "Lucerne Boutique" on sm+
- ProductCard has smaller fonts, badges, and swatches on mobile
- Cart page has separate mobile layout (flex) vs desktop layout (grid)
- Section padding reduced on mobile (py-12 vs py-24)
- Hero section height responsive (h-[65vh] mobile, h-[78vh] sm+)
- All headings use responsive text sizes (text-2xl sm:text-4xl md:text-5xl etc.)
- Touch targets maintained for buttons, swatches, and interactive elements
- **Navbar mobile**: Wishlist, Logout, Admin icons hidden from top bar on mobile — all accessible via hamburger menu (which also has Profile + Logout links)
- **ProductDetails mobile**: Swipeable full-width image gallery with dot indicators + horizontal thumbnail strip; sticky add-to-cart bar fixed at bottom of viewport (sm:hidden)
- **Cart mobile**: Sticky bottom checkout bar (lg:hidden) shows total + checkout button; desktop-only order summary sidebar
- **Profile mobile**: Tab navigation is horizontal scroll row on mobile (md:flex-col becomes flex row with overflow-x-auto)

## Running
- `npm run dev` starts Express backend + Vite frontend on port 5000
- Replit migration completed: the project uses the built-in PostgreSQL database, the `Start application` web preview workflow runs `npm run dev` on port 5000, and deployment builds with `npm run build` then runs `node ./dist/index.cjs`.
