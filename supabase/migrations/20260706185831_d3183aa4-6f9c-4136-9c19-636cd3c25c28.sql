DROP POLICY IF EXISTS documents_rw ON public.documents;
CREATE POLICY documents_rw ON public.documents FOR ALL TO authenticated
USING (
  (EXISTS (SELECT 1 FROM employees e WHERE e.id = documents.employee_id AND e.user_id = auth.uid()))
  OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  OR private.has_role(auth.uid(), 'it_admin'::app_role)
)
WITH CHECK (
  (EXISTS (SELECT 1 FROM employees e WHERE e.id = documents.employee_id AND e.user_id = auth.uid()))
  OR private.has_role(auth.uid(), 'hr_admin'::app_role)
);