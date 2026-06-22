
-- ============ 1. Employees external_id for batch import =============
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS external_id text UNIQUE;

-- ============ 2. Performance reviews =============
CREATE TABLE public.performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  manager_user_id uuid REFERENCES auth.users(id),
  review_period_start date NOT NULL,
  review_period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','manager_complete','employee_acknowledged','finalized')),
  manager_narrative text,
  employee_self_assessment text,
  overall_rating smallint CHECK (overall_rating BETWEEN 1 AND 5),
  ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_draft text,
  ai_generated_at timestamptz,
  finalized_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_reviews TO authenticated;
GRANT ALL ON public.performance_reviews TO service_role;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR full access reviews" ON public.performance_reviews
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "Manager manage own reviews" ON public.performance_reviews
  FOR ALL TO authenticated
  USING (manager_user_id = auth.uid())
  WITH CHECK (manager_user_id = auth.uid());

CREATE POLICY "Employee read own review" ON public.performance_reviews
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Employee update own self-assessment" ON public.performance_reviews
  FOR UPDATE TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE TRIGGER trg_performance_reviews_updated_at
  BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.performance_review_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.performance_reviews(id) ON DELETE CASCADE,
  signer_user_id uuid NOT NULL REFERENCES auth.users(id),
  signer_role text NOT NULL CHECK (signer_role IN ('manager','employee','hr')),
  signed_at timestamptz NOT NULL DEFAULT now(),
  signature_text text,
  ip_address text,
  UNIQUE (review_id, signer_role)
);
GRANT SELECT, INSERT ON public.performance_review_signatures TO authenticated;
GRANT ALL ON public.performance_review_signatures TO service_role;
ALTER TABLE public.performance_review_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read sigs for accessible reviews" ON public.performance_review_signatures
  FOR SELECT TO authenticated
  USING (review_id IN (SELECT id FROM public.performance_reviews));

CREATE POLICY "Sign own row" ON public.performance_review_signatures
  FOR INSERT TO authenticated
  WITH CHECK (signer_user_id = auth.uid());

-- ============ 3. Grievances =============
CREATE TABLE public.grievances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text UNIQUE,
  submitted_by uuid REFERENCES auth.users(id),
  subject_employee_id uuid REFERENCES public.employees(id),
  category text NOT NULL CHECK (category IN ('harassment','discrimination','retaliation','policy','pay','safety','other')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  summary text NOT NULL,
  details text,
  is_anonymous boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','triage','investigating','resolved','closed','withdrawn')),
  assigned_hr_id uuid REFERENCES auth.users(id),
  resolution_summary text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.grievances TO authenticated;
GRANT ALL ON public.grievances TO service_role;
ALTER TABLE public.grievances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR full access grievances" ON public.grievances
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "Submitter read own grievance" ON public.grievances
  FOR SELECT TO authenticated
  USING (submitted_by = auth.uid());

CREATE POLICY "Anyone signed-in can file grievance" ON public.grievances
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() OR submitted_by IS NULL);

CREATE TRIGGER trg_grievances_updated_at
  BEFORE UPDATE ON public.grievances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Simple case_number generator
CREATE OR REPLACE FUNCTION public.tg_grievance_case_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.case_number IS NULL THEN
    NEW.case_number := 'GRV-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random()*900000)+100000)::int::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_grievances_case_number
  BEFORE INSERT ON public.grievances
  FOR EACH ROW EXECUTE FUNCTION public.tg_grievance_case_number();

CREATE TABLE public.grievance_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id uuid NOT NULL REFERENCES public.grievances(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id),
  visibility text NOT NULL DEFAULT 'hr_only' CHECK (visibility IN ('hr_only','shared_with_submitter')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.grievance_notes TO authenticated;
GRANT ALL ON public.grievance_notes TO service_role;
ALTER TABLE public.grievance_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR full access grievance notes" ON public.grievance_notes
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "Submitter read shared notes" ON public.grievance_notes
  FOR SELECT TO authenticated
  USING (
    visibility = 'shared_with_submitter'
    AND grievance_id IN (SELECT id FROM public.grievances WHERE submitted_by = auth.uid())
  );

-- ============ 4. Seed 1-on-1 templates =============
INSERT INTO public.one_on_one_templates (title, description, agenda_prompts, is_default, is_active) VALUES
('Weekly Check-in', 'Standard recurring 1-on-1 for ongoing alignment.',
  '["What were your wins this week?","What''s blocking you?","Top priorities for next week?","What support do you need from me?","Anything personal I should know about?"]'::jsonb, true, true),
('Bi-weekly Coaching', 'Skill development and feedback focus.',
  '["Progress on current goals","One skill you want to grow","Feedback for me as your manager","Feedback I have for you","Commitments before next session"]'::jsonb, false, true),
('Monthly Career Growth', 'Longer-term career and development conversation.',
  '["Where do you want to be in 1-2 years?","Strengths you want to lean into","Growth areas to develop","Learning or training you''d like to pursue","Stretch opportunities to explore"]'::jsonb, false, true),
('Quarterly Goals Review', 'Recalibrate goals and commitments each quarter.',
  '["Progress on each goal this quarter","Goals to keep, drop, or change","New goals for next quarter","Resources or support needed","How can the team help you succeed?"]'::jsonb, false, true),
('Project Retro 1-on-1', 'After a major project or milestone.',
  '["What went well?","What didn''t go well?","Key lessons learned","What would you do differently?","Next steps and follow-ups"]'::jsonb, false, true),
('New Hire 30-day', 'First-month check-in for new employees.',
  '["How is onboarding going so far?","Is your role what you expected?","Early wins or contributions","Points of friction or confusion","What do you need to feel set up for success?"]'::jsonb, false, true),
('New Hire 60/90-day', 'Ramp progress for newer employees.',
  '["How are key relationships forming?","Performance signals — what''s clicking?","Where are you still ramping?","Feedback on onboarding process","Goals for the next 30 days"]'::jsonb, false, true),
('Skip-Level', 'For directors meeting with non-direct reports.',
  '["How is your team functioning?","How is your manager supporting you?","Org-wide concerns or ideas","Career development","Anything you''d want leadership to know"]'::jsonb, false, true),
('Return-from-Leave', 'Re-onboarding after extended leave.',
  '["How are you feeling about being back?","Workload calibration for first few weeks","Catch-up needs (projects, people, decisions)","Flexibility or accommodations needed","Anything else to support your transition"]'::jsonb, false, true),
('Performance Concern', 'Documented coaching for performance gaps.',
  '["Specific expectations not being met","Examples and impact","Root cause discussion","Support plan and resources","Follow-up cadence and success criteria"]'::jsonb, false, true);
