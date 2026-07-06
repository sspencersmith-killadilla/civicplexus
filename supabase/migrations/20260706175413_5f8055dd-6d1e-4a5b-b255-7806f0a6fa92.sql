ALTER TABLE public.equipment_issuance
  ADD COLUMN IF NOT EXISTS expected_return_at date,
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;