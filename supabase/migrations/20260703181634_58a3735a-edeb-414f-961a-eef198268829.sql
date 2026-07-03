
-- Volunteer job descriptions
CREATE TABLE public.volunteer_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  location TEXT,
  skills_required TEXT[],
  min_age INT,
  requires_background_check BOOLEAN NOT NULL DEFAULT false,
  requires_waiver BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'open',
  coordinator_email TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.volunteer_jobs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_jobs TO authenticated;
GRANT ALL ON public.volunteer_jobs TO service_role;
ALTER TABLE public.volunteer_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view open volunteer jobs" ON public.volunteer_jobs FOR SELECT USING (status = 'open');
CREATE POLICY "Authenticated can view all volunteer jobs" ON public.volunteer_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR admins can manage volunteer jobs" ON public.volunteer_jobs FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'hr_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE TRIGGER trg_volunteer_jobs_updated BEFORE UPDATE ON public.volunteer_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Volunteer shifts (occurrences with capacity)
CREATE TABLE public.volunteer_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.volunteer_jobs(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  capacity INT NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.volunteer_shifts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_shifts TO authenticated;
GRANT ALL ON public.volunteer_shifts TO service_role;
ALTER TABLE public.volunteer_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view shifts for open jobs" ON public.volunteer_shifts FOR SELECT USING (EXISTS (SELECT 1 FROM public.volunteer_jobs j WHERE j.id = job_id AND j.status = 'open'));
CREATE POLICY "Authenticated view all shifts" ON public.volunteer_shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR admins manage shifts" ON public.volunteer_shifts FOR ALL TO authenticated USING (private.has_role(auth.uid(),'hr_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE INDEX idx_volunteer_shifts_job ON public.volunteer_shifts(job_id, starts_at);
CREATE TRIGGER trg_volunteer_shifts_updated BEFORE UPDATE ON public.volunteer_shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Signups (apply-then-approve)
CREATE TABLE public.volunteer_shift_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.volunteer_shifts(id) ON DELETE CASCADE,
  volunteer_id UUID REFERENCES public.volunteers(id) ON DELETE SET NULL,
  applicant_first_name TEXT NOT NULL,
  applicant_last_name TEXT NOT NULL,
  applicant_email TEXT,
  applicant_phone TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  pin_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.volunteer_shift_signups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_shift_signups TO authenticated;
GRANT ALL ON public.volunteer_shift_signups TO service_role;
ALTER TABLE public.volunteer_shift_signups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can submit signups" ON public.volunteer_shift_signups FOR INSERT WITH CHECK (status = 'pending');
CREATE POLICY "HR view signups" ON public.volunteer_shift_signups FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'hr_admin'::app_role) OR private.has_role(auth.uid(),'hiring_manager'::app_role) OR private.has_role(auth.uid(),'supervisor'::app_role));
CREATE POLICY "HR manage signups" ON public.volunteer_shift_signups FOR UPDATE TO authenticated USING (private.has_role(auth.uid(),'hr_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "HR delete signups" ON public.volunteer_shift_signups FOR DELETE TO authenticated USING (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE INDEX idx_signups_shift ON public.volunteer_shift_signups(shift_id, status);
CREATE TRIGGER trg_signups_updated BEFORE UPDATE ON public.volunteer_shift_signups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Clock events
CREATE TABLE public.volunteer_clock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signup_id UUID NOT NULL REFERENCES public.volunteer_shift_signups(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  method TEXT NOT NULL DEFAULT 'self',
  logged_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.volunteer_clock_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_clock_events TO authenticated;
GRANT ALL ON public.volunteer_clock_events TO service_role;
ALTER TABLE public.volunteer_clock_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone with signup can clock via PIN" ON public.volunteer_clock_events FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.volunteer_shift_signups s WHERE s.id = signup_id AND s.status = 'approved'));
CREATE POLICY "Anyone can update own clock event" ON public.volunteer_clock_events FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public read own clock events by signup" ON public.volunteer_clock_events FOR SELECT USING (true);
CREATE INDEX idx_clock_signup ON public.volunteer_clock_events(signup_id, clock_in);
CREATE TRIGGER trg_clock_updated BEFORE UPDATE ON public.volunteer_clock_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vendor form templates (form builder, multiple by category)
CREATE TABLE public.vendor_form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT,
  schema JSONB NOT NULL DEFAULT '{"sections":[]}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendor_form_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_form_templates TO authenticated;
GRANT ALL ON public.vendor_form_templates TO service_role;
ALTER TABLE public.vendor_form_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active vendor templates" ON public.vendor_form_templates FOR SELECT USING (is_active = true);
CREATE POLICY "Auth read all vendor templates" ON public.vendor_form_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR manage vendor templates" ON public.vendor_form_templates FOR ALL TO authenticated USING (private.has_role(auth.uid(),'hr_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER trg_vendor_form_templates_updated BEFORE UPDATE ON public.vendor_form_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Store submitted vendor form data
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS form_template_id UUID REFERENCES public.vendor_form_templates(id) ON DELETE SET NULL;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS form_responses JSONB;
