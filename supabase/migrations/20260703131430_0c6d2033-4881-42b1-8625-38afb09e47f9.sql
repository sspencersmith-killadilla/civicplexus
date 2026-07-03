
CREATE TABLE public.application_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Standard application',
  schema jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.application_form_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_form_templates TO authenticated;
GRANT ALL ON public.application_form_templates TO service_role;
ALTER TABLE public.application_form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active template"
  ON public.application_form_templates FOR SELECT
  USING (is_active = true OR private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "HR admins manage templates"
  ON public.application_form_templates FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER update_application_form_templates_updated_at
  BEFORE UPDATE ON public.application_form_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enforce_single_active_app_template()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE public.application_form_templates
      SET is_active = false
      WHERE id <> NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_single_active_app_template_ins
  AFTER INSERT ON public.application_form_templates
  FOR EACH ROW WHEN (NEW.is_active) EXECUTE FUNCTION public.enforce_single_active_app_template();

CREATE TRIGGER enforce_single_active_app_template_upd
  AFTER UPDATE OF is_active ON public.application_form_templates
  FOR EACH ROW WHEN (NEW.is_active) EXECUTE FUNCTION public.enforce_single_active_app_template();

CREATE TABLE public.job_supplemental_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.job_requisitions(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  options jsonb,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requisition_id, key)
);
CREATE INDEX ON public.job_supplemental_questions (requisition_id, sort_order);

GRANT SELECT ON public.job_supplemental_questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_supplemental_questions TO authenticated;
GRANT ALL ON public.job_supplemental_questions TO service_role;
ALTER TABLE public.job_supplemental_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read supplemental questions for posted jobs"
  ON public.job_supplemental_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.job_requisitions r
      WHERE r.id = requisition_id
        AND (r.status = 'posted' OR private.has_role(auth.uid(), 'hr_admin'::app_role))
    )
  );

CREATE POLICY "HR admins manage supplemental questions"
  ON public.job_supplemental_questions FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER update_job_supplemental_questions_updated_at
  BEFORE UPDATE ON public.job_supplemental_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS supplemental_answers jsonb NOT NULL DEFAULT '{}'::jsonb;
