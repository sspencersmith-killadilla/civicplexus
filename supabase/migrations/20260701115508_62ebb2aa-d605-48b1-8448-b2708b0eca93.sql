
-- 1. department_admins linking table
CREATE TABLE IF NOT EXISTS public.department_admins (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (user_id, department)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_admins TO authenticated;
GRANT ALL ON public.department_admins TO service_role;

ALTER TABLE public.department_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dept admins: HR manages"
  ON public.department_admins
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "Dept admins: self reads own"
  ON public.department_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. Helper: is_department_admin
CREATE OR REPLACE FUNCTION public.is_department_admin(_uid uuid, _dept text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_admins
     WHERE user_id = _uid AND department = _dept
  );
$$;

REVOKE ALL ON FUNCTION public.is_department_admin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_department_admin(uuid, text) TO authenticated, service_role;

-- Helper: viewer can see PAF (SECURITY DEFINER to avoid RLS recursion via employees/approval_steps)
CREATE OR REPLACE FUNCTION public.can_view_paf(_paf_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT
    private.has_role(_uid, 'hr_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.personnel_actions pa
       WHERE pa.id = _paf_id AND pa.initiated_by = _uid
    )
    OR EXISTS (
      SELECT 1
        FROM public.personnel_actions pa
        JOIN public.employees emp ON emp.id = pa.employee_id
        LEFT JOIN public.employees mgr ON mgr.id = emp.manager_id
       WHERE pa.id = _paf_id
         AND (
           emp.user_id = _uid
           OR mgr.user_id = _uid
           OR (emp.department IS NOT NULL AND public.is_department_admin(_uid, emp.department))
         )
    )
    OR EXISTS (
      SELECT 1
        FROM public.approval_steps s
        JOIN public.approval_chains c ON c.id = s.chain_id
       WHERE c.entity_type = 'personnel_action'
         AND c.entity_id = _paf_id
         AND s.approver_id = _uid
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_paf(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_paf(uuid, uuid) TO authenticated, service_role;

-- Helper: can_initiate_paf_for(target_employee, user) — used by INSERT policy WITH CHECK
CREATE OR REPLACE FUNCTION public.can_initiate_paf_for(_employee_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT
    private.has_role(_uid, 'hr_admin'::app_role)
    OR EXISTS (
      SELECT 1
        FROM public.employees emp
        LEFT JOIN public.employees mgr ON mgr.id = emp.manager_id
       WHERE emp.id = _employee_id
         AND (
           -- direct manager relationship
           (private.has_role(_uid, 'supervisor'::app_role) AND mgr.user_id = _uid)
           -- hiring manager acting as supervisor of record
           OR (private.has_role(_uid, 'hiring_manager'::app_role) AND mgr.user_id = _uid)
           -- department admin scoped to the employee's department
           OR (private.has_role(_uid, 'department_admin'::app_role)
               AND emp.department IS NOT NULL
               AND public.is_department_admin(_uid, emp.department))
         )
    );
$$;

REVOKE ALL ON FUNCTION public.can_initiate_paf_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_initiate_paf_for(uuid, uuid) TO authenticated, service_role;

-- 3. Replace personnel_actions RLS policies
DROP POLICY IF EXISTS "Read PAFs for self, reports, or HR" ON public.personnel_actions;
DROP POLICY IF EXISTS "Supervisors/HR create PAFs" ON public.personnel_actions;
DROP POLICY IF EXISTS "Update PAFs by initiator or HR" ON public.personnel_actions;

CREATE POLICY "PAF read: HR, initiator, self, manager, dept admin, approver"
  ON public.personnel_actions
  FOR SELECT
  TO authenticated
  USING (public.can_view_paf(id, auth.uid()));

CREATE POLICY "PAF insert: privileged roles for allowed targets"
  ON public.personnel_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    initiated_by = auth.uid()
    AND public.can_initiate_paf_for(employee_id, auth.uid())
  );

CREATE POLICY "PAF update: HR or initiator while open"
  ON public.personnel_actions
  FOR UPDATE
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR (initiated_by = auth.uid() AND status IN ('draft', 'pending_approval'))
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR (initiated_by = auth.uid() AND status IN ('draft', 'pending_approval'))
  );
