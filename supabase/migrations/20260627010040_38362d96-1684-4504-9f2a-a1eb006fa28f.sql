
-- Tighten comp_cycles SELECT to HR/managers/supervisors only
DROP POLICY IF EXISTS "manager reads relevant cycles" ON public.comp_cycles;
CREATE POLICY "managers and hr read cycles" ON public.comp_cycles
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR private.has_role(auth.uid(), 'supervisor'::app_role)
    OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  );

-- Restrict market_ranges to HR + hiring managers
DROP POLICY IF EXISTS "auth reads market ranges" ON public.market_ranges;
CREATE POLICY "hr and hiring managers read market ranges" ON public.market_ranges
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
  );

-- Restrict payroll_export_templates to HR only
DROP POLICY IF EXISTS "Auth users read templates" ON public.payroll_export_templates;
CREATE POLICY "hr reads payroll export templates" ON public.payroll_export_templates
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role));

-- Restrict positions read to HR, hiring managers, supervisors
DROP POLICY IF EXISTS "positions_read_authenticated" ON public.positions;
CREATE POLICY "positions_read_privileged" ON public.positions
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
    OR private.has_role(auth.uid(), 'supervisor'::app_role)
  );

-- Replace permissive employee self-update on performance_reviews with column-restricted policy.
-- The existing tg_perf_review_employee_self_cols trigger already enforces column-level rules,
-- but we tighten the WITH CHECK to make the restriction explicit at the policy layer.
DROP POLICY IF EXISTS "Employee update own self-assessment" ON public.performance_reviews;
CREATE POLICY "Employee update own self-assessment" ON public.performance_reviews
  FOR UPDATE TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND status <> 'finalized'
  )
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND status <> 'finalized'
  );
