ALTER TABLE pos_orders
ADD COLUMN IF NOT EXISTS exchange_history jsonb DEFAULT '[]'::jsonb;

UPDATE pos_orders
SET exchange_history = '[]'::jsonb
WHERE exchange_history IS NULL;
