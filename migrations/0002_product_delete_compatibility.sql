-- Product deletion compatibility hardening.
-- Older/live databases may have NO ACTION product foreign keys, which blocks
-- admin product deletion. These changes are idempotent and align the database
-- with the backend's safe-delete behavior.

DO $$
DECLARE constraint_name text;
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid = 'public.order_items'::regclass
      AND confrelid = 'public.products'::regclass
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.order_items'::regclass AND attname = 'product_id')]::smallint[]
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.order_items DROP CONSTRAINT %I', constraint_name);
    END IF;

    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_product_id_products_id_fk
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE constraint_name text;
BEGIN
  IF to_regclass('public.exchange_requests') IS NOT NULL THEN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid = 'public.exchange_requests'::regclass
      AND confrelid = 'public.products'::regclass
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.exchange_requests'::regclass AND attname = 'product_id')]::smallint[]
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.exchange_requests DROP CONSTRAINT %I', constraint_name);
    END IF;

    ALTER TABLE public.exchange_requests
      ADD CONSTRAINT exchange_requests_product_id_products_id_fk
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE constraint_name text;
BEGIN
  IF to_regclass('public.exchange_requests') IS NOT NULL AND to_regclass('public.order_items') IS NOT NULL THEN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid = 'public.exchange_requests'::regclass
      AND confrelid = 'public.order_items'::regclass
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.exchange_requests'::regclass AND attname = 'order_item_id')]::smallint[]
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.exchange_requests DROP CONSTRAINT %I', constraint_name);
    END IF;

    ALTER TABLE public.exchange_requests
      ADD CONSTRAINT exchange_requests_order_item_id_order_items_id_fk
      FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;
  END IF;
END $$;
