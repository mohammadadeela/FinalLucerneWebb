-- Product management hardening: media/video compatibility + legacy data normalization
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_ids integer[] DEFAULT '{}'::integer[];

ALTER TABLE products ALTER COLUMN images SET DEFAULT '[]'::jsonb;
ALTER TABLE products ALTER COLUMN sizes SET DEFAULT '[]'::jsonb;
ALTER TABLE products ALTER COLUMN colors SET DEFAULT '[]'::jsonb;
ALTER TABLE products ALTER COLUMN size_inventory SET DEFAULT '{}'::jsonb;
ALTER TABLE products ALTER COLUMN color_variants SET DEFAULT '[]'::jsonb;
ALTER TABLE products ALTER COLUMN subcategory_ids SET DEFAULT '{}'::integer[];

UPDATE products
SET
  images = COALESCE(images, '[]'::jsonb),
  sizes = COALESCE(sizes, '[]'::jsonb),
  colors = COALESCE(colors, '[]'::jsonb),
  size_inventory = COALESCE(size_inventory, '{}'::jsonb),
  color_variants = COALESCE(color_variants, '[]'::jsonb),
  subcategory_ids = COALESCE(subcategory_ids, CASE WHEN subcategory_id IS NULL THEN '{}'::integer[] ELSE ARRAY[subcategory_id] END);

CREATE INDEX IF NOT EXISTS idx_products_subcategory_ids_gin ON products USING GIN (subcategory_ids);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode) WHERE barcode IS NOT NULL;
