
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  requisition_id uuid NOT NULL REFERENCES public.job_requisitions(id) ON DELETE CASCADE,
  worker_type_id uuid REFERENCES public.worker_types(id),
  salary numeric(12,2),
  pay_grade text,
  start_date date,
  expires_at timestamptz,
  letter_html text,
  letter_path text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined','expired','void')),
  sent_at timestamptz,
  signed_at timestamptz,
  signature_id uuid REFERENCES public.signatures(id),
  decline_reason text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_offers_application ON public.offers(application_id);
CREATE INDEX idx_offers_status ON public.offers(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO authenticated;
GRANT ALL ON public.offers TO service_role;

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR admins manage offers" ON public.offers
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE POLICY "Hiring manager reads own requisition offers" ON public.offers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.job_requisitions r WHERE r.id = offers.requisition_id AND r.hiring_manager_id = auth.uid()));

CREATE POLICY "Hiring manager drafts offers" ON public.offers
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.job_requisitions r WHERE r.id = requisition_id AND r.hiring_manager_id = auth.uid()));

CREATE TRIGGER tg_offers_updated_at BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.candidate_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL DEFAULT 'portal' CHECK (purpose IN ('portal','offer')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidate_tokens_app ON public.candidate_tokens(application_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_tokens TO authenticated;
GRANT ALL ON public.candidate_tokens TO service_role;

ALTER TABLE public.candidate_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR admins manage candidate tokens" ON public.candidate_tokens
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TABLE public.application_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('recruiter','candidate')),
  sender_user_id uuid REFERENCES auth.users(id),
  body text NOT NULL,
  read_by_recruiter_at timestamptz,
  read_by_candidate_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_messages_application ON public.application_messages(application_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_messages TO authenticated;
GRANT ALL ON public.application_messages TO service_role;

ALTER TABLE public.application_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR admins manage application messages" ON public.application_messages
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE POLICY "Hiring manager reads own application messages" ON public.application_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.job_applications a JOIN public.job_requisitions r ON r.id = a.requisition_id WHERE a.id = application_messages.application_id AND r.hiring_manager_id = auth.uid()));

CREATE POLICY "Hiring manager replies on own applications" ON public.application_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender = 'recruiter' AND sender_user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.job_applications a JOIN public.job_requisitions r ON r.id = a.requisition_id WHERE a.id = application_id AND r.hiring_manager_id = auth.uid()));

CREATE TABLE public.application_self_id (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.job_applications(id) ON DELETE CASCADE,
  gender text,
  race_ethnicity text,
  veteran_status text,
  disability_status text,
  declined boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.application_self_id TO authenticated;
GRANT ALL ON public.application_self_id TO service_role;

ALTER TABLE public.application_self_id ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR admins read self-id" ON public.application_self_id
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE POLICY "Self-id insert by applicant" ON public.application_self_id
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.job_applications a JOIN public.employees e ON e.id = a.internal_employee_id WHERE a.id = application_id AND e.user_id = auth.uid()));

CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read email templates" ON public.email_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR admins manage email templates" ON public.email_templates
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TRIGGER tg_email_templates_updated_at BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.email_templates (template_key, name, subject, body, description) VALUES
('application_received','Application received','We received your application for {{job_title}}','Hi {{first_name}},

Thank you for applying to the {{job_title}} position with {{org_name}}. Our team will review your application shortly. Track status here: {{portal_url}}

— {{org_name}} HR','Auto-sent on application submission'),
('interview_invite','Interview invitation','Interview invitation: {{job_title}}','Hi {{first_name}},

We would like to invite you to interview for the {{job_title}} role on {{interview_date}}. {{interview_location}}

Details and confirmation: {{portal_url}}

— {{org_name}} HR','Sent when interview is scheduled'),
('offer_extended','Offer extended','Your offer for {{job_title}}','Hi {{first_name}},

We are pleased to extend an offer for the {{job_title}} position. Review and respond by {{offer_expires}}: {{offer_url}}

— {{org_name}} HR','Sent when offer is released'),
('rejection','Application update','Update on your application','Hi {{first_name}},

Thank you for your interest in the {{job_title}} role with {{org_name}}. After careful review, we are moving forward with other candidates. We appreciate your time and encourage future applications.

— {{org_name}} HR','Sent on rejection'),
('welcome','Welcome to the team','Welcome to {{org_name}}','Hi {{first_name}},

Welcome aboard! Your start date is {{start_date}} as {{job_title}}. Begin onboarding: {{onboarding_url}}

— {{org_name}} HR','Sent after offer accepted');

CREATE OR REPLACE FUNCTION public.tg_onboarding_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _emp_id uuid;
  _emp public.employees%ROWTYPE;
  _required int;
  _done int;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'complete' THEN RETURN NEW; END IF;

  SELECT oi.employee_id INTO _emp_id FROM public.onboarding_instances oi WHERE oi.id = NEW.onboarding_instance_id;
  IF _emp_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _emp FROM public.employees WHERE id = _emp_id;
  IF _emp.status <> 'preboarding' THEN RETURN NEW; END IF;

  SELECT COUNT(*) FILTER (WHERE is_required), COUNT(*) FILTER (WHERE is_required AND status = 'complete')
    INTO _required, _done
    FROM public.task_instances WHERE onboarding_instance_id = NEW.onboarding_instance_id;

  IF _required > 0 AND _done = _required AND _emp.start_date <= CURRENT_DATE THEN
    UPDATE public.employees SET status = 'active'::employee_status WHERE id = _emp_id;
    IF _emp.manager_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      SELECT m.user_id, 'onboarding', _emp.first_name || ' ' || _emp.last_name || ' is now active',
             'All required onboarding tasks complete', '/employees'
        FROM public.employees m WHERE m.id = _emp.manager_id AND m.user_id IS NOT NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_task_instances_progress ON public.task_instances;
CREATE TRIGGER tg_task_instances_progress
  AFTER UPDATE ON public.task_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_onboarding_progress();
