DROP POLICY IF EXISTS "Employees: manager reads" ON public.employees;

CREATE POLICY "Employees: manager reads reporting chain"
ON public.employees
FOR SELECT
TO authenticated
USING (public.is_in_report_chain(auth.uid(), id));