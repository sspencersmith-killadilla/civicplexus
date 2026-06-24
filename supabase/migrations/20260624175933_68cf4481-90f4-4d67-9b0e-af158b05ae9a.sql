ALTER TABLE public.approval_chains ADD COLUMN IF NOT EXISTS kind text;
CREATE INDEX IF NOT EXISTS approval_chains_kind_idx ON public.approval_chains (kind);