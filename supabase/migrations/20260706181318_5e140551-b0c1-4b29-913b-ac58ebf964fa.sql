-- Employees may INSERT their own equipment/PPE request (status must be 'requested')
CREATE POLICY "employee create own equipment request"
ON public.equipment_issuance
FOR INSERT
TO authenticated
WITH CHECK (
  status = 'requested'
  AND employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- Managers may SELECT equipment records for their direct reports
CREATE POLICY "manager read reports equipment"
ON public.equipment_issuance
FOR SELECT
TO authenticated
USING (
  employee_id IN (
    SELECT e.id FROM public.employees e
    WHERE e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  )
);

-- Managers may INSERT a request on behalf of a direct report (status must be 'requested')
CREATE POLICY "manager create report equipment request"
ON public.equipment_issuance
FOR INSERT
TO authenticated
WITH CHECK (
  status = 'requested'
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    WHERE e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  )
);