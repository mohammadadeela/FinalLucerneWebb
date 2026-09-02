-- Adds a per-user usage limit to discount codes, independent of the
-- existing global max_uses. Lets admins make a code usable e.g. only once
-- per customer while still allowing many different customers to use it.
-- NULL means unlimited per-user uses (same as before this migration).

ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS max_uses_per_user integer;
