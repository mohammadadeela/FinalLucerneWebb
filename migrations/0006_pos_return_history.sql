ALTER TABLE pos_orders
ADD COLUMN IF NOT EXISTS return_history jsonb DEFAULT '[]'::jsonb;
