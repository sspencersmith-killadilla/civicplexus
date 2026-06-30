DROP POLICY IF EXISTS "Manager manage own reviews" ON public.performance_reviews;

CREATE POLICY "Manager manage own reviews"
ON public.performance_reviews
FOR ALL
TO authenticated
USING (
  manager_user_id = auth.uid()
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    WHERE e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  manager_user_id = auth.uid()
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    WHERE e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  )
);