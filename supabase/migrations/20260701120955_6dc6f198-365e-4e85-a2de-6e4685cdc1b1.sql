
-- 1) Update 1-on-1 helper functions to recognize the CURRENT supervisor
--    (via employees.manager_id -> employees.user_id), not just the historical
--    manager_user_id column stored on the session.
CREATE OR REPLACE FUNCTION private.can_access_one_on_one(_session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.one_on_ones s
    LEFT JOIN public.employees e   ON e.id = s.employee_id
    LEFT JOIN public.employees mgr ON mgr.id = e.manager_id
    WHERE s.id = _session_id
      AND (
        s.manager_user_id = auth.uid()
        OR e.user_id = auth.uid()
        OR mgr.user_id = auth.uid()
        OR private.has_role(auth.uid(), 'hr_admin'::app_role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.is_one_on_one_manager(_session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.one_on_ones s
    LEFT JOIN public.employees e   ON e.id = s.employee_id
    LEFT JOIN public.employees mgr ON mgr.id = e.manager_id
    WHERE s.id = _session_id
      AND (
        s.manager_user_id = auth.uid()
        OR mgr.user_id = auth.uid()
        OR private.has_role(auth.uid(), 'hr_admin'::app_role)
      )
  );
$$;

-- 2) one_on_ones policies: allow the current supervisor to read/update/delete
DROP POLICY IF EXISTS "1on1 read participants and hr" ON public.one_on_ones;
CREATE POLICY "1on1 read participants and hr"
  ON public.one_on_ones FOR SELECT TO authenticated
  USING (
    manager_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      LEFT JOIN public.employees mgr ON mgr.id = e.manager_id
      WHERE e.id = one_on_ones.employee_id
        AND (e.user_id = auth.uid() OR mgr.user_id = auth.uid())
    )
    OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  );

DROP POLICY IF EXISTS "1on1 update by manager or hr" ON public.one_on_ones;
CREATE POLICY "1on1 update by manager or hr"
  ON public.one_on_ones FOR UPDATE TO authenticated
  USING (
    manager_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      LEFT JOIN public.employees mgr ON mgr.id = e.manager_id
      WHERE e.id = one_on_ones.employee_id
        AND mgr.user_id = auth.uid()
    )
    OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  );

DROP POLICY IF EXISTS "1on1 delete by manager or hr" ON public.one_on_ones;
CREATE POLICY "1on1 delete by manager or hr"
  ON public.one_on_ones FOR DELETE TO authenticated
  USING (
    manager_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      LEFT JOIN public.employees mgr ON mgr.id = e.manager_id
      WHERE e.id = one_on_ones.employee_id
        AND mgr.user_id = auth.uid()
    )
    OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  );

-- Insert stays: manager-of-record or HR can create; the WITH CHECK is enforced
-- through can_access/is_manager helpers that now include the current supervisor.
DROP POLICY IF EXISTS "1on1 insert by manager or hr" ON public.one_on_ones;
CREATE POLICY "1on1 insert by manager or hr"
  ON public.one_on_ones FOR INSERT TO authenticated
  WITH CHECK (
    manager_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      LEFT JOIN public.employees mgr ON mgr.id = e.manager_id
      WHERE e.id = one_on_ones.employee_id
        AND mgr.user_id = auth.uid()
    )
    OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  );

-- 3) review_cycle_participants: managers see their reports; employees see their own row
DROP POLICY IF EXISTS "Managers see their reports' participation" ON public.review_cycle_participants;
CREATE POLICY "Managers see their reports' participation"
  ON public.review_cycle_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      LEFT JOIN public.employees mgr ON mgr.id = e.manager_id
      WHERE e.id = review_cycle_participants.employee_id
        AND mgr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Employee read own participation" ON public.review_cycle_participants;
CREATE POLICY "Employee read own participation"
  ON public.review_cycle_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = review_cycle_participants.employee_id
        AND e.user_id = auth.uid()
    )
  );
