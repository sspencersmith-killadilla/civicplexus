
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('hr_admin','hiring_manager','it_admin','employee','candidate');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "HR admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'hr_admin'));
CREATE POLICY "HR admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin'));

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles: read own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles: HR reads all" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'hiring_manager'));
CREATE POLICY "Profiles: update own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles: insert own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile + default candidate role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'candidate')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ WORKER TYPES ============
CREATE TABLE public.worker_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.worker_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_types TO authenticated;
GRANT ALL ON public.worker_types TO service_role;
ALTER TABLE public.worker_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Worker types: all auth read" ON public.worker_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Worker types: HR manages" ON public.worker_types
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_wt_updated BEFORE UPDATE ON public.worker_types
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ ONBOARDING TEMPLATES ============
CREATE TABLE public.onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_type_id UUID NOT NULL REFERENCES public.worker_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_templates TO authenticated;
GRANT ALL ON public.onboarding_templates TO service_role;
ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Templates: auth read" ON public.onboarding_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Templates: HR manages" ON public.onboarding_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_ot_updated BEFORE UPDATE ON public.onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TYPE public.task_category AS ENUM ('forms','compliance','equipment','training','provisioning','policy','introduction','other');
CREATE TYPE public.task_assignee AS ENUM ('employee','manager','hr','it','facilities','payroll','automated');

CREATE TABLE public.template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category public.task_category NOT NULL DEFAULT 'other',
  assignee public.task_assignee NOT NULL DEFAULT 'employee',
  is_required BOOLEAN NOT NULL DEFAULT true,
  days_offset INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_tasks TO authenticated;
GRANT ALL ON public.template_tasks TO service_role;
ALTER TABLE public.template_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tpl tasks: auth read" ON public.template_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Tpl tasks: HR manages" ON public.template_tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin'));

-- ============ EMPLOYEES ============
CREATE TYPE public.employee_status AS ENUM ('candidate','preboarding','active','offboarded');

CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  worker_type_id UUID REFERENCES public.worker_types(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  personal_email TEXT,
  work_email TEXT,
  phone TEXT,
  department TEXT,
  job_title TEXT,
  manager_id UUID REFERENCES auth.users(id),
  start_date DATE,
  end_date DATE,
  status public.employee_status NOT NULL DEFAULT 'candidate',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_user_id ON public.employees(user_id);
CREATE INDEX idx_employees_manager_id ON public.employees(manager_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees: read own" ON public.employees
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Employees: manager reads" ON public.employees
  FOR SELECT TO authenticated USING (manager_id = auth.uid());
CREATE POLICY "Employees: HR reads all" ON public.employees
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'it_admin'));
CREATE POLICY "Employees: HR manages" ON public.employees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE POLICY "Employees: self update limited" ON public.employees
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_emp_updated BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ ONBOARDING INSTANCES ============
CREATE TYPE public.task_status AS ENUM ('pending','in_progress','complete','skipped','blocked');

CREATE TABLE public.onboarding_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.onboarding_templates(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_instances TO authenticated;
GRANT ALL ON public.onboarding_instances TO service_role;
ALTER TABLE public.onboarding_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inst: HR all" ON public.onboarding_instances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE POLICY "Inst: employee reads own" ON public.onboarding_instances
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND (e.user_id = auth.uid() OR e.manager_id = auth.uid()))
  );

CREATE TABLE public.task_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_instance_id UUID NOT NULL REFERENCES public.onboarding_instances(id) ON DELETE CASCADE,
  template_task_id UUID REFERENCES public.template_tasks(id),
  title TEXT NOT NULL,
  description TEXT,
  category public.task_category NOT NULL DEFAULT 'other',
  assignee public.task_assignee NOT NULL DEFAULT 'employee',
  is_required BOOLEAN NOT NULL DEFAULT true,
  due_date DATE,
  status public.task_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_inst_oi ON public.task_instances(onboarding_instance_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_instances TO authenticated;
GRANT ALL ON public.task_instances TO service_role;
ALTER TABLE public.task_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tasks: HR all" ON public.task_instances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE POLICY "Tasks: employee/manager reads" ON public.task_instances
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.onboarding_instances oi
      JOIN public.employees e ON e.id = oi.employee_id
      WHERE oi.id = onboarding_instance_id
        AND (e.user_id = auth.uid() OR e.manager_id = auth.uid())
    )
  );
CREATE POLICY "Tasks: employee updates own" ON public.task_instances
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.onboarding_instances oi
      JOIN public.employees e ON e.id = oi.employee_id
      WHERE oi.id = onboarding_instance_id AND e.user_id = auth.uid()
    )
  ) WITH CHECK (true);
CREATE TRIGGER trg_ti_updated BEFORE UPDATE ON public.task_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ SEED WORKER TYPES + DEFAULT TEMPLATES ============
INSERT INTO public.worker_types (key, name, description, icon, sort_order) VALUES
  ('office','Office / Admin','Desktop staff with SSO, email, and standard policy training','briefcase',10),
  ('field','Field Staff','Public works, parks, utilities — mobile-first, PPE, equipment','hard-hat',20),
  ('public_safety','Public Safety','Sworn officers, fire — CJIS, fingerprinting, FTO',  'shield',30),
  ('temporary','Temporary / Seasonal','Short-term staff with abbreviated flow','clock',40),
  ('contractor','Contractor / Vendor','Third-party access, scoped credentials, NDA','file-badge',50),
  ('volunteer','Volunteer','Background check + waiver, limited access','heart-handshake',60),
  ('elected','Elected / Appointee','Council, board, commissioners — ethics & public records','landmark',70);
