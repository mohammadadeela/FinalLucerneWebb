-- ─────────────────────────────────────────────────────────────────────────────
-- Lucerne Boutique — read-only reporting views
--
-- Creates a separate schema "report" with a few flat tables (views) that describe
-- stock and sales, and a login that can read ONLY those views.
--
-- What the reporting login can NOT see: customers' names, phones, addresses, e-mails,
-- passwords, sessions, notes on invoices, or any other table of the shop.
-- What it can NOT do: change or delete anything.
--
-- Safe to run again: views are replaced, the login is created only if missing.
-- Run it as the postgres superuser, inside the shop's database (see reporting-setup.sh).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS report;

-- 1) STOCK — one row per product × colour × size, with what is left of it right now.
CREATE OR REPLACE VIEW report.stock AS
WITH colour_rows AS (
  -- products with colours: every size of every colour
  SELECT p.id AS product_id, v.value->>'name' AS colour, s.key AS size, GREATEST(0, (s.value)::text::numeric)::int AS quantity
  FROM products p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.color_variants, '[]'::jsonb)) AS v(value)
  CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(v.value->'sizeInventory') = 'object' THEN v.value->'sizeInventory' ELSE '{}'::jsonb END) AS s(key, value)
  WHERE jsonb_typeof(p.color_variants) = 'array' AND jsonb_typeof(s.value) = 'number'
),
plain_rows AS (
  -- products without colours but with sizes
  SELECT p.id AS product_id, NULL::text AS colour, s.key AS size, GREATEST(0, (s.value)::text::numeric)::int AS quantity
  FROM products p
  CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.size_inventory) = 'object' THEN p.size_inventory ELSE '{}'::jsonb END) AS s(key, value)
  WHERE jsonb_typeof(s.value) = 'number'
    AND NOT EXISTS (SELECT 1 FROM colour_rows c WHERE c.product_id = p.id)
),
single_rows AS (
  -- products with neither: one row with the total
  SELECT p.id AS product_id, NULL::text AS colour, NULL::text AS size, GREATEST(0, p.stock_quantity) AS quantity
  FROM products p
  WHERE NOT EXISTS (SELECT 1 FROM colour_rows c WHERE c.product_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM plain_rows r WHERE r.product_id = p.id)
),
all_rows AS (
  SELECT * FROM colour_rows UNION ALL SELECT * FROM plain_rows UNION ALL SELECT * FROM single_rows
)
SELECT
  (p.id::text || '|' || COALESCE(a.colour, '') || '|' || COALESCE(a.size, '')) AS row_id,
  p.id                                   AS product_id,
  p.name                                 AS product_name,
  COALESCE(c.name_ar, c.name)            AS category,
  p.barcode                              AS barcode,
  a.colour                               AS colour,
  a.size                                 AS size,
  a.quantity                             AS quantity,
  p.price::numeric                       AS price,
  p.discount_price::numeric  AS discount_price,
  p.cost_price::numeric      AS cost_price,
  p.created_at::date                     AS added_on,
  (CURRENT_DATE - p.created_at::date)    AS days_in_shop
FROM all_rows a
JOIN products p ON p.id = a.product_id
LEFT JOIN categories c ON c.id = p.category_id;

-- 2) SALES — one row per sold line, from every channel.
--    channel: website | store (customer in the shop) | delivery (page / WhatsApp order rung up on the POS)
CREATE OR REPLACE VIEW report.sales AS
SELECT
  ('W' || o.id::text || '-' || i.id::text) AS row_id,
  o.created_at                              AS sold_at,
  o.created_at::date                        AS sold_on,
  'website'::text                           AS channel,
  ('W' || o.id::text)                       AS invoice,
  o.status                                  AS status,
  (o.status <> 'Cancelled')                 AS counts_as_sale,
  i.product_id                              AS product_id,
  p.name                                    AS product_name,
  COALESCE(c.name_ar, c.name)               AS category,
  i.color                                   AS colour,
  i.size                                    AS size,
  i.quantity                                AS quantity,
  i.price::numeric                          AS unit_price,
  (i.price::numeric * i.quantity)           AS line_total,
  o.payment_method                          AS payment_method,
  o.delivery_method                         AS delivery_method,
  o.shipping_region                         AS region,
  o.city                                    AS city,
  o.discount_code                           AS discount_code
FROM orders o
JOIN order_items i ON i.order_id = o.id
LEFT JOIN products p ON p.id = i.product_id
LEFT JOIN categories c ON c.id = p.category_id
UNION ALL
SELECT
  ('P' || po.id::text || '-' || item.ordinality::text) AS row_id,
  po.created_at,
  po.created_at::date,
  CASE WHEN po.sale_channel = 'delivery' THEN 'delivery' ELSE 'store' END,
  ('P' || po.id::text),
  'Completed',
  TRUE,
  NULLIF(item.value->>'productId', '')::int,
  COALESCE(p.name, item.value->>'name'),
  COALESCE(c.name_ar, c.name),
  item.value->>'color',
  item.value->>'size',
  COALESCE(NULLIF(item.value->>'quantity', '')::numeric, 1)::int,
  COALESCE(NULLIF(item.value->>'price', '')::numeric, 0),
  COALESCE(NULLIF(item.value->>'price', '')::numeric, 0) * COALESCE(NULLIF(item.value->>'quantity', '')::numeric, 1),
  po.payment_method,
  CASE WHEN po.sale_channel = 'delivery' THEN 'delivery' ELSE 'in store' END,
  NULL::text,
  NULL::text,
  NULL::text
FROM pos_orders po
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(po.items) = 'array' THEN po.items ELSE '[]'::jsonb END) WITH ORDINALITY AS item(value, ordinality)
LEFT JOIN products p ON p.id = NULLIF(item.value->>'productId', '')::int
LEFT JOIN categories c ON c.id = p.category_id;

-- 3) RETURNS — pieces that came back to the shop on a POS invoice (plain returns and the
--    returned side of an exchange). The replacement piece of an exchange is its own sale.
CREATE OR REPLACE VIEW report.returns AS
SELECT
  ('R' || po.id::text || '-' || h.ordinality::text || '-' || item.ordinality::text) AS row_id,
  NULLIF(h.value->>'returnedAt', '')::timestamptz::date AS returned_on,
  'return'::text                                         AS kind,
  ('P' || po.id::text)                                   AS invoice,
  NULLIF(item.value->>'productId', '')::int              AS product_id,
  COALESCE(p.name, item.value->>'name')                  AS product_name,
  item.value->>'color'                                   AS colour,
  item.value->>'size'                                    AS size,
  COALESCE(NULLIF(item.value->>'quantity', '')::numeric, 1)::int AS quantity
FROM pos_orders po
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(po.return_history) = 'array' THEN po.return_history ELSE '[]'::jsonb END) WITH ORDINALITY AS h(value, ordinality)
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(h.value->'items') = 'array' THEN h.value->'items' ELSE '[]'::jsonb END) WITH ORDINALITY AS item(value, ordinality)
LEFT JOIN products p ON p.id = NULLIF(item.value->>'productId', '')::int
UNION ALL
SELECT
  ('X' || po.id::text || '-' || h.ordinality::text || '-' || item.ordinality::text),
  NULLIF(h.value->>'exchangedAt', '')::timestamptz::date,
  'exchange',
  ('P' || po.id::text),
  NULLIF(item.value->>'productId', '')::int,
  COALESCE(p.name, item.value->>'name'),
  item.value->>'color',
  item.value->>'size',
  COALESCE(NULLIF(item.value->>'quantity', '')::numeric, 1)::int
FROM pos_orders po
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(po.exchange_history) = 'array' THEN po.exchange_history ELSE '[]'::jsonb END) WITH ORDINALITY AS h(value, ordinality)
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(h.value->'returnedItems') = 'array' THEN h.value->'returnedItems' ELSE '[]'::jsonb END) WITH ORDINALITY AS item(value, ordinality)
LEFT JOIN products p ON p.id = NULLIF(item.value->>'productId', '')::int;

-- 4) PRODUCTS — one row per product with everything at a glance: what is left, what sold
--    (per channel, all time and last 30 days), what came back, and how much shoppers looked at it.
CREATE OR REPLACE VIEW report.products AS
WITH stock AS (
  SELECT product_id,
         SUM(quantity)                                   AS pieces_left,
         COUNT(*) FILTER (WHERE quantity > 0)            AS sizes_left,
         COUNT(*)                                        AS sizes_total,
         string_agg(CASE WHEN quantity > 0 THEN concat_ws(' ', colour, size) || '×' || quantity END, ', ' ORDER BY colour, size) AS left_detail
  FROM report.stock GROUP BY product_id
),
sold AS (
  SELECT product_id,
         SUM(quantity)                                                         AS sold_all,
         SUM(quantity) FILTER (WHERE channel = 'store')                        AS sold_store,
         SUM(quantity) FILTER (WHERE channel = 'delivery')                     AS sold_delivery,
         SUM(quantity) FILTER (WHERE channel = 'website')                      AS sold_website,
         SUM(quantity) FILTER (WHERE sold_on >= CURRENT_DATE - 30)             AS sold_30d,
         SUM(quantity) FILTER (WHERE sold_on >= CURRENT_DATE - 7)              AS sold_7d,
         SUM(line_total)                                                       AS revenue_all,
         MIN(sold_on)                                                          AS first_sale,
         MAX(sold_on)                                                          AS last_sale
  FROM report.sales WHERE counts_as_sale AND product_id IS NOT NULL GROUP BY product_id
),
back AS (
  SELECT product_id, SUM(quantity) AS returned_all FROM report.returns WHERE product_id IS NOT NULL GROUP BY product_id
),
interest AS (
  SELECT product_id,
         COUNT(*) FILTER (WHERE event_type = 'view'     AND created_at >= now() - interval '30 days') AS views_30d,
         COUNT(*) FILTER (WHERE event_type = 'cart_add' AND created_at >= now() - interval '30 days') AS cart_adds_30d
  FROM product_events GROUP BY product_id
)
SELECT
  p.id                                   AS product_id,
  p.name                                 AS product_name,
  COALESCE(c.name_ar, c.name)            AS category,
  p.barcode                              AS barcode,
  p.price::numeric                       AS price,
  p.discount_price::numeric  AS discount_price,
  p.cost_price::numeric      AS cost_price,
  p.created_at::date                     AS added_on,
  (CURRENT_DATE - p.created_at::date)    AS days_in_shop,
  COALESCE(st.pieces_left, 0)            AS pieces_left,
  COALESCE(st.sizes_left, 0)             AS sizes_left,
  COALESCE(st.sizes_total, 0)            AS sizes_total,
  st.left_detail                         AS left_detail,
  COALESCE(s.sold_all, 0)                AS sold_all,
  COALESCE(s.sold_store, 0)              AS sold_store,
  COALESCE(s.sold_delivery, 0)           AS sold_delivery,
  COALESCE(s.sold_website, 0)            AS sold_website,
  COALESCE(s.sold_30d, 0)                AS sold_30d,
  COALESCE(s.sold_7d, 0)                 AS sold_7d,
  COALESCE(b.returned_all, 0)            AS returned_all,
  COALESCE(s.revenue_all, 0)             AS revenue_all,
  s.first_sale                           AS first_sale,
  s.last_sale                            AS last_sale,
  (CURRENT_DATE - s.last_sale)           AS days_since_last_sale,
  COALESCE(i.views_30d, 0)               AS views_30d,
  COALESCE(i.cart_adds_30d, 0)           AS cart_adds_30d,
  (COALESCE(st.pieces_left, 0) * COALESCE(p.cost_price::numeric, 0)) AS stock_cost_value,
  (COALESCE(st.pieces_left, 0) * p.price::numeric)                              AS stock_sale_value
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN stock st ON st.product_id = p.id
LEFT JOIN sold s ON s.product_id = p.id
LEFT JOIN back b ON b.product_id = p.id
LEFT JOIN interest i ON i.product_id = p.id;

-- ── The read-only login ──────────────────────────────────────────────────────
-- Created without a usable password; reporting-setup.sh asks you for one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lucerne_report') THEN
    CREATE ROLE lucerne_report LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 5;
  END IF;
END $$;

-- It may open this database and read the report views. Nothing else.
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO lucerne_report', current_database()); END $$;
REVOKE ALL ON SCHEMA public FROM lucerne_report;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM lucerne_report;
GRANT USAGE ON SCHEMA report TO lucerne_report;
GRANT SELECT ON ALL TABLES IN SCHEMA report TO lucerne_report;
ALTER ROLE lucerne_report SET default_transaction_read_only = on;
ALTER ROLE lucerne_report SET statement_timeout = '30s';
ALTER ROLE lucerne_report SET search_path = report;
