
-- 1. Photo column on employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS photo_path text;

-- 2. Badge templates
CREATE TABLE IF NOT EXISTS public.id_badge_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_name text NOT NULL,
  logo_path text,
  accent_color text NOT NULL DEFAULT '#0F3460',
  orientation text NOT NULL DEFAULT 'landscape' CHECK (orientation IN ('landscape','portrait')),
  show_fields jsonb NOT NULL DEFAULT '{"title":true,"department":true,"employee_id":true,"start_date":false,"barcode":true,"qr":true}'::jsonb,
  back_text text,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.id_badge_templates TO authenticated;
GRANT ALL ON public.id_badge_templates TO service_role;
ALTER TABLE public.id_badge_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read badge templates" ON public.id_badge_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr manage badge templates" ON public.id_badge_templates
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER trg_id_badge_templates_updated_at
  BEFORE UPDATE ON public.id_badge_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Only one default template
CREATE UNIQUE INDEX IF NOT EXISTS id_badge_templates_one_default
  ON public.id_badge_templates ((is_default)) WHERE is_default;

-- 3. Issued badges log
CREATE TABLE IF NOT EXISTS public.id_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.id_badge_templates(id) ON DELETE SET NULL,
  serial text NOT NULL UNIQUE,
  pdf_path text,
  issued_by uuid REFERENCES auth.users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_id_badges_employee ON public.id_badges(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.id_badges TO authenticated;
GRANT SELECT ON public.id_badges TO anon;
GRANT ALL ON public.id_badges TO service_role;
ALTER TABLE public.id_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr manage badges" ON public.id_badges
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "employee read own badges" ON public.id_badges
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

-- 4. Public verification view (only minimal info)
CREATE OR REPLACE VIEW public.public_badge_verify
WITH (security_invoker = true) AS
SELECT
  b.serial,
  trim(e.first_name) || ' ' || left(coalesce(e.last_name,''), 1) || '.' AS display_name,
  CASE
    WHEN b.revoked_at IS NOT NULL THEN 'revoked'
    WHEN e.status::text IN ('terminated','separated','inactive') THEN 'revoked'
    ELSE 'valid'
  END AS status,
  b.issued_at
FROM public.id_badges b
JOIN public.employees e ON e.id = b.employee_id;

GRANT SELECT ON public.public_badge_verify TO anon, authenticated;

-- 5. Storage RLS on employee-photos bucket
CREATE POLICY "hr write employee photos"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'employee-photos' AND private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (bucket_id = 'employee-photos' AND private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "auth read employee photo assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-photos'
    AND (
      (storage.foldername(name))[1] IN ('photos','logos')
      OR private.has_role(auth.uid(), 'hr_admin'::app_role)
    )
  );
