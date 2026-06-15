
-- ===== P10 Notifications =====
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "hr can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'hiring_manager'));

-- ===== P11 Audit Events =====
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON public.audit_events(entity, entity_id);
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr reads audit" ON public.audit_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'hr_admin'));
CREATE POLICY "auth inserts audit" ON public.audit_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);

-- ===== P12 Equipment & PPE =====
CREATE TABLE public.equipment_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  sizes jsonb DEFAULT '[]'::jsonb,
  cost_center text,
  unit_cost numeric(10,2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_catalog TO authenticated;
GRANT ALL ON public.equipment_catalog TO service_role;
ALTER TABLE public.equipment_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read catalog" ON public.equipment_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr manage catalog" ON public.equipment_catalog FOR ALL TO authenticated USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_equipment_catalog_updated BEFORE UPDATE ON public.equipment_catalog FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ppe_sizing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  shirt text, pants text, boot text, glove text, hat text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ppe_sizing TO authenticated;
GRANT ALL ON public.ppe_sizing TO service_role;
ALTER TABLE public.ppe_sizing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manage ppe" ON public.ppe_sizing FOR ALL TO authenticated USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'hiring_manager')) WITH CHECK (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'hiring_manager'));

CREATE TABLE public.equipment_issuance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.equipment_catalog(id),
  size text,
  status text NOT NULL DEFAULT 'requested',
  issued_at timestamptz, returned_at timestamptz,
  condition text, cost numeric(10,2), notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_issuance TO authenticated;
GRANT ALL ON public.equipment_issuance TO service_role;
ALTER TABLE public.equipment_issuance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manage issuance" ON public.equipment_issuance FOR ALL TO authenticated USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'hiring_manager')) WITH CHECK (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'hiring_manager'));
CREATE TRIGGER trg_equipment_issuance_updated BEFORE UPDATE ON public.equipment_issuance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== P13 Training & Certs =====
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, provider text, duration_minutes int,
  required_for_worker_types uuid[] DEFAULT '{}',
  compliance_framework text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read courses" ON public.courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr manage courses" ON public.courses FOR ALL TO authenticated USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, issuer text,
  validity_months int, compliance_framework text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certifications TO authenticated;
GRANT ALL ON public.certifications TO service_role;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read certs" ON public.certifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr manage certs" ON public.certifications FOR ALL TO authenticated USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_certifications_updated BEFORE UPDATE ON public.certifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.employee_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned',
  due_date date, completed_at timestamptz, score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_training TO authenticated;
GRANT ALL ON public.employee_training TO service_role;
ALTER TABLE public.employee_training ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manage training" ON public.employee_training FOR ALL TO authenticated USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'hiring_manager')) WITH CHECK (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'hiring_manager'));
CREATE TRIGGER trg_emp_training_updated BEFORE UPDATE ON public.employee_training FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.employee_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  certification_id uuid NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  issued_at date, expires_at date,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_certifications TO authenticated;
GRANT ALL ON public.employee_certifications TO service_role;
ALTER TABLE public.employee_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manage emp certs" ON public.employee_certifications FOR ALL TO authenticated USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'hiring_manager')) WITH CHECK (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'hiring_manager'));
CREATE TRIGGER trg_emp_certs_updated BEFORE UPDATE ON public.employee_certifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== P14 Screenings =====
CREATE TABLE public.screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type text NOT NULL,
  vendor text,
  status text NOT NULL DEFAULT 'requested',
  scheduled_at timestamptz, completed_at timestamptz,
  result text, document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screenings TO authenticated;
GRANT ALL ON public.screenings TO service_role;
ALTER TABLE public.screenings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manage screenings" ON public.screenings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_screenings_updated BEFORE UPDATE ON public.screenings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== P15 Benefits =====
CREATE TABLE public.dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  first_name text NOT NULL, last_name text NOT NULL,
  relationship text NOT NULL, dob date, ssn_last4 text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dependents TO authenticated;
GRANT ALL ON public.dependents TO service_role;
ALTER TABLE public.dependents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manage deps" ON public.dependents FOR ALL TO authenticated USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));

CREATE TABLE public.benefits_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  carrier text NOT NULL, plan_type text NOT NULL,
  enrollment_window_start date, enrollment_window_end date,
  status text NOT NULL DEFAULT 'pending',
  external_ref text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benefits_handoffs TO authenticated;
GRANT ALL ON public.benefits_handoffs TO service_role;
ALTER TABLE public.benefits_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manage benefits" ON public.benefits_handoffs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_benefits_updated BEFORE UPDATE ON public.benefits_handoffs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== P16 Policies =====
CREATE TABLE public.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, version int NOT NULL DEFAULT 1,
  body_md text NOT NULL,
  effective_date date NOT NULL DEFAULT current_date,
  requires_reack_months int,
  applies_to_worker_types uuid[] DEFAULT '{}',
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.policies TO authenticated;
GRANT ALL ON public.policies TO service_role;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read published policies" ON public.policies FOR SELECT TO authenticated USING (published OR public.has_role(auth.uid(),'hr_admin'));
CREATE POLICY "hr manage policies" ON public.policies FOR ALL TO authenticated USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_policies_updated BEFORE UPDATE ON public.policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.policy_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  version int NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  signature_id uuid REFERENCES public.signatures(id) ON DELETE SET NULL,
  ip text
);
CREATE INDEX idx_ack_emp ON public.policy_acknowledgments(employee_id);
GRANT SELECT, INSERT ON public.policy_acknowledgments TO authenticated;
GRANT ALL ON public.policy_acknowledgments TO service_role;
ALTER TABLE public.policy_acknowledgments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users insert own ack" ON public.policy_acknowledgments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users read own ack" ON public.policy_acknowledgments FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'hr_admin'));

-- ===== P17 Offboarding =====
ALTER TABLE public.onboarding_templates ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'onboarding';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS rehire_eligible boolean NOT NULL DEFAULT true;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS separation_date date;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS separation_reason text;

-- ===== P18 Org Settings =====
CREATE TABLE public.org_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  org_name text NOT NULL DEFAULT 'Kyberna',
  ein text, address text, phone text, logo_url text,
  primary_color text DEFAULT '#1a2942',
  accent_color text DEFAULT '#c9a961',
  retention_policy jsonb DEFAULT '{}'::jsonb,
  sso_metadata_url text,
  notification_defaults jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.org_settings TO authenticated;
GRANT INSERT, UPDATE ON public.org_settings TO authenticated;
GRANT ALL ON public.org_settings TO service_role;
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read settings" ON public.org_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr update settings" ON public.org_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE POLICY "hr insert settings" ON public.org_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_org_settings_updated BEFORE UPDATE ON public.org_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.org_settings (singleton, org_name) VALUES (true, 'Kyberna') ON CONFLICT DO NOTHING;
