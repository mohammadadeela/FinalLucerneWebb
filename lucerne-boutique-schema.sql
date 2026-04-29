-- ============================================================
-- Lucerne Boutique — Full Database Schema (up to date)
-- Safe to run on any fresh or existing PostgreSQL database.
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- so they will never break tables that already exist.
-- Run this in order — do not skip sections.
-- ============================================================


-- ─────────────────────────────────────────
-- 1. USERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                serial       PRIMARY KEY,
  email             text         NOT NULL UNIQUE,
  password          text         NOT NULL,
  role              text         NOT NULL DEFAULT 'customer',
  full_name         text,
  phone             text,
  address           text,
  is_verified       boolean      DEFAULT false,
  is_blocked        boolean      DEFAULT false,
  verification_code text,
  points            integer      NOT NULL DEFAULT 0,
  credit            numeric      NOT NULL DEFAULT 0,
  created_at        timestamp    DEFAULT now()
);

-- Add columns that may have been added after initial deploy
ALTER TABLE users ADD COLUMN IF NOT EXISTS points  integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit  numeric NOT NULL DEFAULT 0;


-- ─────────────────────────────────────────
-- 2. CATEGORIES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id           serial    PRIMARY KEY,
  name         text      NOT NULL,
  name_ar      text,
  slug         text      NOT NULL UNIQUE,
  image        text,
  show_on_home boolean   DEFAULT false,
  size_guide   text      DEFAULT 'auto'
);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_ar      text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_on_home boolean DEFAULT false;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS size_guide   text    DEFAULT 'auto';


-- ─────────────────────────────────────────
-- 3. SUBCATEGORIES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subcategories (
  id           serial   PRIMARY KEY,
  name         text     NOT NULL,
  name_ar      text,
  slug         text     NOT NULL,
  image        text,
  category_id  integer  NOT NULL REFERENCES categories(id),
  is_active    boolean  DEFAULT true,
  show_on_home boolean  DEFAULT false
);

ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS name_ar      text;
ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS show_on_home boolean DEFAULT false;


-- ─────────────────────────────────────────
-- 4. PRODUCTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id               serial    PRIMARY KEY,
  name             text      NOT NULL,
  description      text      NOT NULL,
  price            numeric   NOT NULL,
  cost_price       numeric,
  discount_price   numeric,
  main_image       text      NOT NULL,
  images           jsonb     DEFAULT '[]',
  category_id      integer   REFERENCES categories(id),
  subcategory_id   integer   REFERENCES subcategories(id),
  brand            text,
  barcode          text,
  sizes            jsonb     DEFAULT '[]',
  colors           jsonb     DEFAULT '[]',
  size_inventory   jsonb     DEFAULT '{}',
  color_variants   jsonb     DEFAULT '[]',
  stock_quantity   integer   NOT NULL DEFAULT 0,
  is_featured      boolean   DEFAULT false,
  is_new_arrival   boolean   DEFAULT false,
  is_best_seller   boolean   DEFAULT false,
  created_at       timestamp DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price       numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_price   numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id   integer REFERENCES subcategories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand            text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode          text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS size_inventory   jsonb   DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS color_variants   jsonb   DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_new_arrival   boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_best_seller   boolean DEFAULT false;


-- ─────────────────────────────────────────
-- 5. ORDERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               serial    PRIMARY KEY,
  user_id          integer   REFERENCES users(id),
  total_amount     numeric   NOT NULL,
  shipping_cost    numeric   NOT NULL DEFAULT 0,
  shipping_region  text,
  status           text      NOT NULL DEFAULT 'Pending',
  payment_method   text      NOT NULL DEFAULT 'Cash on delivery',
  full_name        text      NOT NULL,
  phone            text      NOT NULL,
  phone2           text,
  address          text      NOT NULL,
  city             text      NOT NULL,
  notes            text,
  discount_code    text,
  discount_amount  numeric,
  credit_used      numeric,
  created_at       timestamp DEFAULT now(),
  delivered_at     timestamp
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost   numeric   DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_region text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone2          text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code   text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_used     numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at    timestamp;


-- ─────────────────────────────────────────
-- 6. ORDER ITEMS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id          serial   PRIMARY KEY,
  order_id    integer  NOT NULL REFERENCES orders(id),
  product_id  integer  NOT NULL REFERENCES products(id),
  quantity    integer  NOT NULL,
  price       numeric  NOT NULL,
  size        text,
  color       text
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size  text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS color text;


-- ─────────────────────────────────────────
-- 7. WISHLIST
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlist (
  id          serial    PRIMARY KEY,
  user_id     integer   NOT NULL REFERENCES users(id),
  product_id  integer   NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  timestamp DEFAULT now()
);


-- ─────────────────────────────────────────
-- 8. CART ITEMS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
  id          serial    PRIMARY KEY,
  user_id     integer   NOT NULL REFERENCES users(id),
  product_id  integer   NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    integer   NOT NULL DEFAULT 1,
  size        text,
  color       text,
  updated_at  timestamp DEFAULT now()
);


-- ─────────────────────────────────────────
-- 9. REVIEWS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          serial    PRIMARY KEY,
  product_id  integer   NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     integer   REFERENCES users(id),
  rating      integer   NOT NULL,
  comment     text,
  created_at  timestamp DEFAULT now()
);


-- ─────────────────────────────────────────
-- 10. DISCOUNT CODES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discount_codes (
  id                serial    PRIMARY KEY,
  code              text      NOT NULL UNIQUE,
  discount_percent  integer   NOT NULL,
  max_uses          integer,
  used_count        integer   DEFAULT 0,
  expires_at        timestamp,
  is_active         boolean   DEFAULT true,
  category_ids      integer[],
  subcategory_ids   integer[],
  created_at        timestamp DEFAULT now()
);

ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS category_ids    integer[];
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS subcategory_ids integer[];


-- ─────────────────────────────────────────
-- 11. SITE SETTINGS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  id     serial PRIMARY KEY,
  key    text   NOT NULL UNIQUE,
  value  text   NOT NULL
);


-- ─────────────────────────────────────────
-- 12. POS ORDERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_orders (
  id              serial    PRIMARY KEY,
  total_amount    numeric   NOT NULL,
  payment_method  text      NOT NULL DEFAULT 'cash',
  items           jsonb     NOT NULL,
  note            text,
  cash_amount     numeric,
  card_amount     numeric,
  created_at      timestamp DEFAULT now()
);

ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS cash_amount numeric;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS card_amount numeric;


-- ─────────────────────────────────────────
-- 13. EXCHANGE REQUESTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exchange_requests (
  id               serial    PRIMARY KEY,
  order_id         integer   NOT NULL REFERENCES orders(id),
  user_id          integer   NOT NULL REFERENCES users(id),
  order_item_id    integer   NOT NULL REFERENCES order_items(id),
  product_id       integer   NOT NULL REFERENCES products(id),
  reason           text      NOT NULL,
  preferred_size   text,
  preferred_color  text,
  status           text      NOT NULL DEFAULT 'pending',
  admin_note       text,
  created_at       timestamp DEFAULT now(),
  resolved_at      timestamp
);


-- ─────────────────────────────────────────
-- 14. PRODUCT EVENTS  (analytics)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_events (
  id          serial    PRIMARY KEY,
  product_id  integer   NOT NULL,
  event_type  text      NOT NULL,
  session_id  text,
  user_id     integer,
  created_at  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_events_product_id ON product_events (product_id);


-- ─────────────────────────────────────────
-- 15. NOTIFICATIONS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          serial    PRIMARY KEY,
  user_id     integer   NOT NULL REFERENCES users(id),
  type        text      NOT NULL,
  message     text      NOT NULL,
  message_ar  text      NOT NULL,
  link        text      NOT NULL DEFAULT '/profile',
  is_read     boolean   NOT NULL DEFAULT false,
  created_at  timestamp DEFAULT now()
);


-- ============================================================
-- Done. All tables, columns and indexes are now in place.
-- ============================================================
