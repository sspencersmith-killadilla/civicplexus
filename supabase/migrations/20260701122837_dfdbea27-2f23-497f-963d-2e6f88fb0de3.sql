
-- Permission catalog + groups + user assignments + per-user overrides.
CREATE TABLE public.permission_keys (
  key text PRIMARY KEY,
  label text NOT NULL,
  category text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_keys TO authenticated;
GRANT ALL ON public.permission_keys TO service_role;
ALTER TABLE public.permission_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permission_keys read authenticated" ON public.permission_keys
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "permission_keys hr write" ON public.permission_keys
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TABLE public.permission_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_groups TO authenticated;
GRANT ALL ON public.permission_groups TO service_role;
ALTER TABLE public.permission_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permission_groups read authenticated" ON public.permission_groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "permission_groups hr write" ON public.permission_groups
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER trg_permission_groups_updated_at
  BEFORE UPDATE ON public.permission_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.permission_group_keys (
  group_id uuid NOT NULL REFERENCES public.permission_groups(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permission_keys(key) ON DELETE CASCADE,
  PRIMARY KEY (group_id, permission_key)
);
GRANT SELECT ON public.permission_group_keys TO authenticated;
GRANT ALL ON public.permission_group_keys TO service_role;
ALTER TABLE public.permission_group_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pgk read authenticated" ON public.permission_group_keys
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pgk hr write" ON public.permission_group_keys
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TABLE public.user_permission_groups (
  user_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.permission_groups(id) ON DELETE CASCADE,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);
GRANT SELECT ON public.user_permission_groups TO authenticated;
GRANT ALL ON public.user_permission_groups TO service_role;
ALTER TABLE public.user_permission_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "upg read self or hr" ON public.user_permission_groups
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "upg hr write" ON public.user_permission_groups
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TABLE public.user_permission_grants (
  user_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES public.permission_keys(key) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('grant','deny')),
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);
GRANT SELECT ON public.user_permission_grants TO authenticated;
GRANT ALL ON public.user_permission_grants TO service_role;
ALTER TABLE public.user_permission_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "upgr read self or hr" ON public.user_permission_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "upgr hr write" ON public.user_permission_grants
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

-- Security-definer helpers
CREATE OR REPLACE FUNCTION private.has_permission(_uid uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN false
    -- HR always yes unless explicitly denied
    WHEN private.has_role(_uid, 'hr_admin'::app_role)
         AND NOT EXISTS (SELECT 1 FROM public.user_permission_grants
                          WHERE user_id = _uid AND permission_key = _key AND mode = 'deny')
      THEN true
    -- Explicit deny wins over any grant
    WHEN EXISTS (SELECT 1 FROM public.user_permission_grants
                  WHERE user_id = _uid AND permission_key = _key AND mode = 'deny')
      THEN false
    -- Explicit grant
    WHEN EXISTS (SELECT 1 FROM public.user_permission_grants
                  WHERE user_id = _uid AND permission_key = _key AND mode = 'grant')
      THEN true
    -- Group membership
    WHEN EXISTS (
      SELECT 1 FROM public.user_permission_groups upg
      JOIN public.permission_group_keys pgk ON pgk.group_id = upg.group_id
      WHERE upg.user_id = _uid AND pgk.permission_key = _key
    ) THEN true
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT private.has_permission(auth.uid(), _key);
$$;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_effective_permissions(_uid uuid)
RETURNS TABLE(permission_key text, source text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
  WITH from_groups AS (
    SELECT pgk.permission_key, 'group:'||pg.name AS source
      FROM public.user_permission_groups upg
      JOIN public.permission_group_keys pgk ON pgk.group_id = upg.group_id
      JOIN public.permission_groups pg ON pg.id = upg.group_id
     WHERE upg.user_id = _uid
  ),
  from_grants AS (
    SELECT permission_key, ('override:'||mode) AS source
      FROM public.user_permission_grants
     WHERE user_id = _uid AND mode = 'grant'
  ),
  denies AS (
    SELECT permission_key FROM public.user_permission_grants
     WHERE user_id = _uid AND mode = 'deny'
  ),
  merged AS (
    SELECT * FROM from_groups
    UNION
    SELECT * FROM from_grants
  )
  SELECT m.permission_key, m.source
    FROM merged m
   WHERE m.permission_key NOT IN (SELECT permission_key FROM denies);
$$;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(uuid) TO authenticated;

-- Seed catalog
INSERT INTO public.permission_keys(key, label, category, description) VALUES
  ('employees.read.all',         'Read all employee records',    'Employees', 'View every employee profile beyond directory-safe fields.'),
  ('employees.write.contact',    'Edit any employee contact',    'Employees', 'Update personal email, phone for any employee.'),
  ('employees.write.profile',    'Edit any employee profile',    'Employees', 'Update job title, department, manager, dates.'),
  ('employees.write.compensation','Edit compensation records',   'Employees', 'Create/update employee_comp rows.'),
  ('interview_kits.read',        'Read interview kits',          'Hiring',    'View interview kit rubrics.'),
  ('interview_kits.write',       'Create/update interview kits', 'Hiring',    'Author or edit interview kits.'),
  ('job_requisitions.read.internal','Read internal requisition fields','Hiring','See budget, hiring manager, AI rubric, internal notes.'),
  ('job_requisitions.write',     'Create/update requisitions',   'Hiring',    'Draft or edit job requisitions.'),
  ('job_requisitions.approve',   'Approve/post requisitions',    'Hiring',    'Move requisitions to posted.'),
  ('paf.initiate',               'Initiate PAFs',                'PAF',       'Start a personnel action.'),
  ('paf.approve',                'Approve PAF steps',            'PAF',       'Decide on approval steps outside normal role scope.'),
  ('reviews.finalize',           'Finalize performance reviews', 'Reviews',   'Lock finalized reviews.'),
  ('timekeeping.approve',        'Approve timesheets',           'Timekeeping','Approve/deny any timesheet.'),
  ('payroll.run',                'Run payroll',                  'Payroll',   'Create and post payroll runs.'),
  ('org_settings.write',         'Edit organization settings',   'Admin',     'Change org-wide settings.'),
  ('permissions.manage',         'Manage permissions',           'Admin',     'Create groups, assign users, override grants.')
ON CONFLICT (key) DO NOTHING;

-- Seed a few system groups
INSERT INTO public.permission_groups(name, description, is_system) VALUES
  ('HR Analyst', 'Read-only across employees + comp + reviews', true),
  ('Recruiter',  'Full hiring pipeline access', true),
  ('Payroll Specialist', 'Payroll and timekeeping approvals', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.permission_group_keys(group_id, permission_key)
SELECT g.id, k FROM public.permission_groups g
CROSS JOIN LATERAL (VALUES
  ('employees.read.all')
) AS v(k)
WHERE g.name = 'HR Analyst'
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_group_keys(group_id, permission_key)
SELECT g.id, k FROM public.permission_groups g
CROSS JOIN LATERAL (VALUES
  ('interview_kits.read'),('interview_kits.write'),
  ('job_requisitions.write'),('job_requisitions.read.internal'),
  ('job_requisitions.approve')
) AS v(k)
WHERE g.name = 'Recruiter'
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_group_keys(group_id, permission_key)
SELECT g.id, k FROM public.permission_groups g
CROSS JOIN LATERAL (VALUES
  ('payroll.run'),('timekeeping.approve')
) AS v(k)
WHERE g.name = 'Payroll Specialist'
ON CONFLICT DO NOTHING;

-- Additive policy clauses on the three target tables. We add NEW named
-- policies that grant additional access when a permission is present.
-- Existing policies remain untouched.

-- employees: permission-based broad read + write
CREATE POLICY "employees: permission read all" ON public.employees
  FOR SELECT TO authenticated
  USING (public.has_permission('employees.read.all'));
CREATE POLICY "employees: permission write profile" ON public.employees
  FOR UPDATE TO authenticated
  USING (public.has_permission('employees.write.profile'))
  WITH CHECK (public.has_permission('employees.write.profile'));

-- interview_kits: permission-based read + write
CREATE POLICY "interview_kits: permission read" ON public.interview_kits
  FOR SELECT TO authenticated
  USING (public.has_permission('interview_kits.read'));
CREATE POLICY "interview_kits: permission write" ON public.interview_kits
  FOR ALL TO authenticated
  USING (public.has_permission('interview_kits.write'))
  WITH CHECK (public.has_permission('interview_kits.write'));

-- job_requisitions: permission-based full read + write + approve
CREATE POLICY "job_requisitions: permission read internal" ON public.job_requisitions
  FOR SELECT TO authenticated
  USING (public.has_permission('job_requisitions.read.internal'));
CREATE POLICY "job_requisitions: permission write" ON public.job_requisitions
  FOR ALL TO authenticated
  USING (public.has_permission('job_requisitions.write'))
  WITH CHECK (public.has_permission('job_requisitions.write'));
