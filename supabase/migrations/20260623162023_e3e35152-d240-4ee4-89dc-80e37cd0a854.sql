CREATE TABLE public.doc_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  logo_url text,
  org_name text,
  org_address text,
  brand_primary text NOT NULL DEFAULT '#1E2761',
  brand_accent text NOT NULL DEFAULT '#CADCFC',
  header_font text NOT NULL DEFAULT 'Georgia, serif',
  body_font text NOT NULL DEFAULT 'Georgia, serif',
  cover_style text NOT NULL DEFAULT 'banner' CHECK (cover_style IN ('minimal','banner','full')),
  section_order text[] NOT NULL DEFAULT ARRAY['forms','policies','courses']::text[],
  footer_text text,
  include_toc boolean NOT NULL DEFAULT true,
  include_signature_block boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_templates TO authenticated;
GRANT ALL ON public.doc_templates TO service_role;

ALTER TABLE public.doc_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read doc templates"
  ON public.doc_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR admins manage doc templates"
  ON public.doc_templates FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER trg_doc_templates_updated_at
  BEFORE UPDATE ON public.doc_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed a sensible default so the generator works out of the box.
INSERT INTO public.doc_templates (name, description, cover_style, footer_text, is_default)
VALUES ('Standard Packet', 'Default branded onboarding packet layout', 'banner',
        'Confidential — for internal onboarding use only.', true);