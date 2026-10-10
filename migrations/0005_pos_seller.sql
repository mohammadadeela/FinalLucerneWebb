ALTER TABLE pos_orders
ADD COLUMN IF NOT EXISTS seller_id integer,
ADD COLUMN IF NOT EXISTS seller_name text,
ADD COLUMN IF NOT EXISTS seller_role text;
