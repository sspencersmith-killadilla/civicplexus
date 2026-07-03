
DROP POLICY IF EXISTS "auth read vendors" ON public.vendors;
DROP POLICY IF EXISTS "auth write vendors" ON public.vendors;
DROP POLICY IF EXISTS "auth update vendors" ON public.vendors;
DROP POLICY IF EXISTS "auth delete vendors" ON public.vendors;

CREATE POLICY "vendors read: hr or clerk"
  ON public.vendors FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'city_clerk'::app_role));

CREATE POLICY "vendors insert: hr or clerk"
  ON public.vendors FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role)
           OR private.has_role(auth.uid(), 'city_clerk'::app_role));

CREATE POLICY "vendors update: hr or clerk"
  ON public.vendors FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'city_clerk'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role)
           OR private.has_role(auth.uid(), 'city_clerk'::app_role));

CREATE POLICY "vendors delete: hr or clerk"
  ON public.vendors FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'city_clerk'::app_role));

DROP POLICY IF EXISTS "auth all vendor_assignments" ON public.vendor_assignments;
CREATE POLICY "vendor_assignments manage: hr or clerk"
  ON public.vendor_assignments FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'city_clerk'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role)
           OR private.has_role(auth.uid(), 'city_clerk'::app_role));

DROP POLICY IF EXISTS "auth all volunteer_hours" ON public.volunteer_hours;
CREATE POLICY "volunteer_hours manage: hr or clerk"
  ON public.volunteer_hours FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'city_clerk'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role)
           OR private.has_role(auth.uid(), 'city_clerk'::app_role));

DROP POLICY IF EXISTS "PAF update: HR or initiator while open" ON public.personnel_actions;
CREATE POLICY "PAF update: HR or initiator while open"
  ON public.personnel_actions FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR (
      initiated_by = auth.uid()
      AND status = ANY (ARRAY['draft'::text, 'pending_approval'::text])
      AND public.can_initiate_paf_for(employee_id, auth.uid())
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR (
      initiated_by = auth.uid()
      AND status = ANY (ARRAY['draft'::text, 'pending_approval'::text])
      AND public.can_initiate_paf_for(employee_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Anyone can read supplemental questions for posted jobs" ON public.job_supplemental_questions;
CREATE POLICY "Public read supplemental questions for posted jobs"
  ON public.job_supplemental_questions FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.job_requisitions r
     WHERE r.id = job_supplemental_questions.requisition_id
       AND r.status = 'posted'::text
  ));
