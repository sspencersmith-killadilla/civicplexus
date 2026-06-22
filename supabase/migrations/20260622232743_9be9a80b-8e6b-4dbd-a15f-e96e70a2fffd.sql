
REVOKE EXECUTE ON FUNCTION public.tg_grievance_log_changes() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.approval_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  current_stage int NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id)
);
GRANT SELECT, INSERT, UPDATE ON public.approval_chains TO authenticated;
GRANT ALL ON public.approval_chains TO service_role;
ALTER TABLE public.approval_chains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ac read" ON public.approval_chains FOR SELECT TO authenticated USING (true);
CREATE POLICY "ac insert" ON public.approval_chains FOR INSERT TO authenticated WITH CHECK (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  private.has_role(auth.uid(),'hiring_manager'::app_role) OR
  private.has_role(auth.uid(),'supervisor'::app_role)
);
CREATE POLICY "ac update" ON public.approval_chains FOR UPDATE TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role)
);
CREATE TRIGGER trg_ac_upd BEFORE UPDATE ON public.approval_chains FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES public.approval_chains(id) ON DELETE CASCADE,
  stage int NOT NULL,
  approver_label text NOT NULL,
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_role text,
  status text NOT NULL DEFAULT 'pending',
  decision_notes text,
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_as_chain ON public.approval_steps(chain_id, stage);
GRANT SELECT, INSERT, UPDATE ON public.approval_steps TO authenticated;
GRANT ALL ON public.approval_steps TO service_role;
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "as read" ON public.approval_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "as update" ON public.approval_steps FOR UPDATE TO authenticated USING (
  approver_id = auth.uid() OR private.has_role(auth.uid(),'hr_admin'::app_role)
);
CREATE POLICY "as insert" ON public.approval_steps FOR INSERT TO authenticated WITH CHECK (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  private.has_role(auth.uid(),'hiring_manager'::app_role) OR
  private.has_role(auth.uid(),'supervisor'::app_role)
);
CREATE TRIGGER trg_as_upd BEFORE UPDATE ON public.approval_steps FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.job_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  title text NOT NULL,
  department text,
  worker_type_id uuid REFERENCES public.worker_types(id) ON DELETE SET NULL,
  location text,
  employment_type text,
  salary_min numeric,
  salary_max numeric,
  summary text,
  description text,
  requirements text,
  benefits text,
  slug text UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  posted_at timestamptz,
  closes_at timestamptz,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hiring_manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_only boolean NOT NULL DEFAULT false,
  hire_request_id uuid REFERENCES public.hire_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_req_status ON public.job_requisitions(status);
CREATE INDEX idx_req_slug ON public.job_requisitions(slug);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_requisitions TO authenticated;
GRANT SELECT ON public.job_requisitions TO anon;
GRANT ALL ON public.job_requisitions TO service_role;
ALTER TABLE public.job_requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "req public read" ON public.job_requisitions FOR SELECT TO anon USING (
  status='posted' AND internal_only=false
);
CREATE POLICY "req auth read" ON public.job_requisitions FOR SELECT TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  requested_by=auth.uid() OR hiring_manager_id=auth.uid() OR status='posted'
);
CREATE POLICY "req insert" ON public.job_requisitions FOR INSERT TO authenticated WITH CHECK (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  private.has_role(auth.uid(),'hiring_manager'::app_role) OR
  private.has_role(auth.uid(),'supervisor'::app_role)
);
CREATE POLICY "req update" ON public.job_requisitions FOR UPDATE TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  requested_by=auth.uid() OR hiring_manager_id=auth.uid()
);
CREATE POLICY "req delete" ON public.job_requisitions FOR DELETE TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role)
);
CREATE TRIGGER trg_req_upd BEFORE UPDATE ON public.job_requisitions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.job_requisitions(id) ON DELETE CASCADE,
  applicant_name text NOT NULL,
  email text NOT NULL,
  phone text,
  resume_url text,
  cover_letter text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  status text NOT NULL DEFAULT 'new',
  rating int,
  notes text,
  rejection_reason text,
  is_internal boolean NOT NULL DEFAULT false,
  internal_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  notify_current_manager boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_req ON public.job_applications(requisition_id);
CREATE INDEX idx_app_status ON public.job_applications(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app read" ON public.job_applications FOR SELECT TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  EXISTS (SELECT 1 FROM public.job_requisitions r WHERE r.id=requisition_id AND (r.hiring_manager_id=auth.uid() OR r.requested_by=auth.uid())) OR
  (is_internal=true AND internal_employee_id IN (SELECT id FROM public.employees WHERE user_id=auth.uid()))
);
CREATE POLICY "app internal insert" ON public.job_applications FOR INSERT TO authenticated WITH CHECK (
  is_internal=true AND internal_employee_id IN (SELECT id FROM public.employees WHERE user_id=auth.uid())
);
CREATE POLICY "app update" ON public.job_applications FOR UPDATE TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  EXISTS (SELECT 1 FROM public.job_requisitions r WHERE r.id=requisition_id AND (r.hiring_manager_id=auth.uid() OR r.requested_by=auth.uid()))
);
CREATE TRIGGER trg_app_upd BEFORE UPDATE ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.job_application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ae_app ON public.job_application_events(application_id);
GRANT SELECT, INSERT ON public.job_application_events TO authenticated;
GRANT ALL ON public.job_application_events TO service_role;
ALTER TABLE public.job_application_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ae read" ON public.job_application_events FOR SELECT TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  EXISTS (SELECT 1 FROM public.job_applications a JOIN public.job_requisitions r ON r.id=a.requisition_id
    WHERE a.id=application_id AND (r.hiring_manager_id=auth.uid() OR r.requested_by=auth.uid()))
);
CREATE POLICY "ae insert" ON public.job_application_events FOR INSERT TO authenticated WITH CHECK (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  EXISTS (SELECT 1 FROM public.job_applications a JOIN public.job_requisitions r ON r.id=a.requisition_id
    WHERE a.id=application_id AND (r.hiring_manager_id=auth.uid() OR r.requested_by=auth.uid()))
);

CREATE TABLE public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'phone_screen',
  scheduled_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 45,
  location text,
  interviewer_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'scheduled',
  calendar_event_id text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_iv_app ON public.interviews(application_id);
CREATE INDEX idx_iv_when ON public.interviews(scheduled_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iv read" ON public.interviews FOR SELECT TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  auth.uid() = ANY(interviewer_ids) OR
  EXISTS (SELECT 1 FROM public.job_applications a JOIN public.job_requisitions r ON r.id=a.requisition_id
    WHERE a.id=application_id AND (r.hiring_manager_id=auth.uid() OR r.requested_by=auth.uid()))
);
CREATE POLICY "iv write" ON public.interviews FOR ALL TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  EXISTS (SELECT 1 FROM public.job_applications a JOIN public.job_requisitions r ON r.id=a.requisition_id
    WHERE a.id=application_id AND (r.hiring_manager_id=auth.uid() OR r.requested_by=auth.uid()))
) WITH CHECK (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  EXISTS (SELECT 1 FROM public.job_applications a JOIN public.job_requisitions r ON r.id=a.requisition_id
    WHERE a.id=application_id AND (r.hiring_manager_id=auth.uid() OR r.requested_by=auth.uid()))
);
CREATE TRIGGER trg_iv_upd BEFORE UPDATE ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.interview_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  interviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating int CHECK (rating BETWEEN 1 AND 5),
  recommendation text,
  notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(interview_id, interviewer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_feedback TO authenticated;
GRANT ALL ON public.interview_feedback TO service_role;
ALTER TABLE public.interview_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fb read" ON public.interview_feedback FOR SELECT TO authenticated USING (
  private.has_role(auth.uid(),'hr_admin'::app_role) OR
  interviewer_id=auth.uid() OR
  EXISTS (SELECT 1 FROM public.interviews i JOIN public.job_applications a ON a.id=i.application_id
    JOIN public.job_requisitions r ON r.id=a.requisition_id
    WHERE i.id=interview_id AND (r.hiring_manager_id=auth.uid() OR r.requested_by=auth.uid()))
);
CREATE POLICY "fb insert" ON public.interview_feedback FOR INSERT TO authenticated WITH CHECK (interviewer_id=auth.uid());
CREATE POLICY "fb update" ON public.interview_feedback FOR UPDATE TO authenticated USING (interviewer_id=auth.uid());
