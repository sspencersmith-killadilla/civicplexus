-- HR admin universal internal access safety net for workflow tables.
-- This does not grant anonymous access and keeps public careers access unchanged.

-- Effective permissions: HR admin is the built-in superuser for internal HR modules.
CREATE OR REPLACE FUNCTION private.has_permission(_uid uuid, _key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT
    private.has_role(_uid, 'hr_admin'::app_role)
    OR EXISTS (
      SELECT 1
        FROM public.user_permission_grants g
       WHERE g.user_id = _uid
         AND g.permission_key = _key
         AND g.mode = 'grant'
    )
    OR (
      EXISTS (
        SELECT 1
          FROM public.user_permission_groups upg
          JOIN public.permission_group_keys pgk ON pgk.group_id = upg.group_id
         WHERE upg.user_id = _uid
           AND pgk.permission_key = _key
      )
      AND NOT EXISTS (
        SELECT 1
          FROM public.user_permission_grants d
         WHERE d.user_id = _uid
           AND d.permission_key = _key
           AND d.mode = 'deny'
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_effective_permissions(_uid uuid)
RETURNS TABLE(permission_key text, source text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  WITH hr_all AS (
    SELECT pk.key AS permission_key, 'role:hr_admin'::text AS source
      FROM public.permission_keys pk
     WHERE private.has_role(_uid, 'hr_admin'::app_role)
  ),
  from_groups AS (
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
    SELECT * FROM hr_all
    UNION
    SELECT * FROM from_groups
    UNION
    SELECT * FROM from_grants
  )
  SELECT m.permission_key, m.source
    FROM merged m
   WHERE m.permission_key NOT IN (SELECT permission_key FROM denies);
$$;

-- Job requisitions: HR admins can manage every requisition.
DROP POLICY IF EXISTS "job_requisitions: hr admin all" ON public.job_requisitions;
CREATE POLICY "job_requisitions: hr admin all"
  ON public.job_requisitions
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

-- Job applications: HR admins can manage all applicant pipeline rows.
DROP POLICY IF EXISTS "job_applications: hr admin all" ON public.job_applications;
CREATE POLICY "job_applications: hr admin all"
  ON public.job_applications
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

-- Approval chains and steps: HR admins can see and act on all internal approvals.
DROP POLICY IF EXISTS "approval_chains: hr admin all" ON public.approval_chains;
CREATE POLICY "approval_chains: hr admin all"
  ON public.approval_chains
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "approval_steps: hr admin all" ON public.approval_steps;
CREATE POLICY "approval_steps: hr admin all"
  ON public.approval_steps
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

-- Personnel actions and audit: HR admins can manage/read all PAF activity.
DROP POLICY IF EXISTS "personnel_actions: hr admin all" ON public.personnel_actions;
CREATE POLICY "personnel_actions: hr admin all"
  ON public.personnel_actions
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "paf_audit: hr admin read all" ON public.paf_audit;
CREATE POLICY "paf_audit: hr admin read all"
  ON public.paf_audit
  FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role));

-- Coaching and review workflows: HR admins can see all activity without changing public access.
DROP POLICY IF EXISTS "one_on_ones: hr admin all" ON public.one_on_ones;
CREATE POLICY "one_on_ones: hr admin all"
  ON public.one_on_ones
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "performance_reviews: hr admin all" ON public.performance_reviews;
CREATE POLICY "performance_reviews: hr admin all"
  ON public.performance_reviews
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "review_cycle_participants: hr admin all" ON public.review_cycle_participants;
CREATE POLICY "review_cycle_participants: hr admin all"
  ON public.review_cycle_participants
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "review_cycles: hr admin all" ON public.review_cycles;
CREATE POLICY "review_cycles: hr admin all"
  ON public.review_cycles
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));