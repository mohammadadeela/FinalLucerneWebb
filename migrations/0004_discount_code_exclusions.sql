-- Adds category/subcategory exclusion rules to discount codes.
-- NULL/empty means no exclusions. Existing discount codes keep their current behavior.
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS category_exclude_ids integer[],
  ADD COLUMN IF NOT EXISTS subcategory_exclude_ids integer[];
