
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS default_summary text,
  ADD COLUMN IF NOT EXISTS default_essential_functions text,
  ADD COLUMN IF NOT EXISTS default_ksa text,
  ADD COLUMN IF NOT EXISTS default_qualifications text,
  ADD COLUMN IF NOT EXISTS default_physical_demands text,
  ADD COLUMN IF NOT EXISTS default_supplemental text,
  ADD COLUMN IF NOT EXISTS default_benefits text;
