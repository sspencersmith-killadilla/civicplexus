
DROP POLICY IF EXISTS "Employees: manager reads" ON public.employees;
CREATE POLICY "Employees: manager reads" ON public.employees
  FOR SELECT
  USING (
    manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "kits_read_auth" ON public.interview_kits;
CREATE POLICY "kits_read_hiring_staff" ON public.interview_kits
  FOR SELECT
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.interview_invitations inv
      WHERE inv.kit_id = interview_kits.id
        AND inv.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE (i.created_by = auth.uid() OR auth.uid() = ANY(i.interviewer_ids))
    )
  );
