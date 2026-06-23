ALTER TABLE public.org_settings ALTER COLUMN org_name SET DEFAULT 'Noöpolis';
UPDATE public.org_settings SET org_name = 'Noöpolis' WHERE org_name = 'Kyberna';