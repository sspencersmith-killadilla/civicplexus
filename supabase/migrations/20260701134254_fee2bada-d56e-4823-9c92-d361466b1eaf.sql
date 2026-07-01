
-- Fix broken supervisor policies on employee_training (manager_id is employees.id, not auth.uid)
DROP POLICY IF EXISTS "supervisor read team training" ON public.employee_training;
DROP POLICY IF EXISTS "supervisor assign team training" ON public.employee_training;

CREATE POLICY "supervisor read team training"
ON public.employee_training FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.employees m ON m.id = e.manager_id
    WHERE e.id = employee_training.employee_id
      AND m.user_id = auth.uid()
  )
);

CREATE POLICY "supervisor assign team training"
ON public.employee_training FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.employees m ON m.id = e.manager_id
    WHERE e.id = employee_training.employee_id
      AND m.user_id = auth.uid()
  )
);

CREATE POLICY "supervisor update team training"
ON public.employee_training FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.employees m ON m.id = e.manager_id
    WHERE e.id = employee_training.employee_id
      AND m.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.employees m ON m.id = e.manager_id
    WHERE e.id = employee_training.employee_id
      AND m.user_id = auth.uid()
  )
);

-- Recursive chain-of-command visibility for reviews & training: supervisors up the chain can see reports below them
CREATE OR REPLACE FUNCTION public.is_in_report_chain(_manager_uid uuid, _employee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, manager_id FROM public.employees WHERE id = _employee_id
    UNION ALL
    SELECT e.id, e.manager_id
      FROM public.employees e
      JOIN chain c ON e.id = c.manager_id
  )
  SELECT EXISTS (
    SELECT 1 FROM chain c
    JOIN public.employees m ON m.id = c.manager_id
    WHERE m.user_id = _manager_uid
  );
$$;

-- Extend performance_reviews supervisor policy to include the full reporting chain
DROP POLICY IF EXISTS "Manager manage own reviews" ON public.performance_reviews;
CREATE POLICY "Manager manage own reviews"
ON public.performance_reviews FOR ALL TO authenticated
USING (public.is_in_report_chain(auth.uid(), employee_id))
WITH CHECK (public.is_in_report_chain(auth.uid(), employee_id));

-- Extend employee_training supervisor policies to chain-of-command as well
DROP POLICY IF EXISTS "supervisor read team training" ON public.employee_training;
DROP POLICY IF EXISTS "supervisor assign team training" ON public.employee_training;
DROP POLICY IF EXISTS "supervisor update team training" ON public.employee_training;

CREATE POLICY "supervisor read team training"
ON public.employee_training FOR SELECT TO authenticated
USING (public.is_in_report_chain(auth.uid(), employee_id));

CREATE POLICY "supervisor assign team training"
ON public.employee_training FOR INSERT TO authenticated
WITH CHECK (public.is_in_report_chain(auth.uid(), employee_id));

CREATE POLICY "supervisor update team training"
ON public.employee_training FOR UPDATE TO authenticated
USING (public.is_in_report_chain(auth.uid(), employee_id))
WITH CHECK (public.is_in_report_chain(auth.uid(), employee_id));
