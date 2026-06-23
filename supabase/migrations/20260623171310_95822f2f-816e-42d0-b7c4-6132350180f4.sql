-- AI parse of an application's resume (one row per application, regenerable)
CREATE TABLE public.application_ai_parse (
  application_id uuid PRIMARY KEY REFERENCES public.job_applications(id) ON DELETE CASCADE,
  parsed jsonb NOT NULL,
  model text NOT NULL,
  redaction_version text NOT NULL,
  input_hash text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_aip_created ON public.application_ai_parse(created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_ai_parse TO authenticated;
GRANT ALL ON public.application_ai_parse TO service_role;
ALTER TABLE public.application_ai_parse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aip read" ON public.application_ai_parse FOR SELECT TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.job_applications a
    JOIN public.job_requisitions r ON r.id = a.requisition_id
    WHERE a.id = application_id
      AND (r.hiring_manager_id = auth.uid() OR r.requested_by = auth.uid())
  )
);
CREATE POLICY "aip write" ON public.application_ai_parse FOR ALL TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.job_applications a
    JOIN public.job_requisitions r ON r.id = a.requisition_id
    WHERE a.id = application_id
      AND (r.hiring_manager_id = auth.uid() OR r.requested_by = auth.uid())
  )
) WITH CHECK (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.job_applications a
    JOIN public.job_requisitions r ON r.id = a.requisition_id
    WHERE a.id = application_id
      AND (r.hiring_manager_id = auth.uid() OR r.requested_by = auth.uid())
  )
);
CREATE TRIGGER trg_aip_upd BEFORE UPDATE ON public.application_ai_parse
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Generic AI suggestion log (rubric scores, question banks, summaries, email drafts)
CREATE TABLE public.ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.job_applications(id) ON DELETE CASCADE,
  interview_id uuid REFERENCES public.interviews(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  model text NOT NULL,
  input_hash text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decision text,
  decision_diff jsonb,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  CHECK (application_id IS NOT NULL OR interview_id IS NOT NULL),
  CHECK (decision IS NULL OR decision IN ('accepted','edited','rejected'))
);
CREATE INDEX idx_ais_app ON public.ai_suggestions(application_id);
CREATE INDEX idx_ais_iv ON public.ai_suggestions(interview_id);
CREATE INDEX idx_ais_kind ON public.ai_suggestions(kind);
CREATE INDEX idx_ais_created ON public.ai_suggestions(created_at);
GRANT SELECT, INSERT, UPDATE ON public.ai_suggestions TO authenticated;
GRANT ALL ON public.ai_suggestions TO service_role;
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ais read" ON public.ai_suggestions FOR SELECT TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  (application_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.job_applications a
     JOIN public.job_requisitions r ON r.id = a.requisition_id
     WHERE a.id = application_id
       AND (r.hiring_manager_id = auth.uid() OR r.requested_by = auth.uid())
  )) OR
  (interview_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.interviews i
     JOIN public.job_applications a ON a.id = i.application_id
     JOIN public.job_requisitions r ON r.id = a.requisition_id
     WHERE i.id = interview_id
       AND (auth.uid() = ANY(i.interviewer_ids)
            OR r.hiring_manager_id = auth.uid()
            OR r.requested_by = auth.uid())
  ))
);
CREATE POLICY "ais insert" ON public.ai_suggestions FOR INSERT TO authenticated WITH CHECK (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  (application_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.job_applications a
     JOIN public.job_requisitions r ON r.id = a.requisition_id
     WHERE a.id = application_id
       AND (r.hiring_manager_id = auth.uid() OR r.requested_by = auth.uid())
  )) OR
  (interview_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.interviews i
     JOIN public.job_applications a ON a.id = i.application_id
     JOIN public.job_requisitions r ON r.id = a.requisition_id
     WHERE i.id = interview_id
       AND (auth.uid() = ANY(i.interviewer_ids)
            OR r.hiring_manager_id = auth.uid()
            OR r.requested_by = auth.uid())
  ))
);
CREATE POLICY "ais update" ON public.ai_suggestions FOR UPDATE TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  (application_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.job_applications a
     JOIN public.job_requisitions r ON r.id = a.requisition_id
     WHERE a.id = application_id
       AND (r.hiring_manager_id = auth.uid() OR r.requested_by = auth.uid())
  )) OR
  (interview_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.interviews i
     JOIN public.job_applications a ON a.id = i.application_id
     JOIN public.job_requisitions r ON r.id = a.requisition_id
     WHERE i.id = interview_id
       AND (auth.uid() = ANY(i.interviewer_ids)
            OR r.hiring_manager_id = auth.uid()
            OR r.requested_by = auth.uid())
  ))
);

-- Rubric for AI scoring lives on the requisition
ALTER TABLE public.job_requisitions
  ADD COLUMN IF NOT EXISTS ai_rubric jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Per-org AI feature toggles (default: off)
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS ai_features jsonb NOT NULL DEFAULT jsonb_build_object(
    'parse_resume', false,
    'rubric_scoring', false,
    'interview_questions', false,
    'feedback_summary', false,
    'panel_compare', false,
    'email_drafts', false,
    'name_blind_redaction', true
  );