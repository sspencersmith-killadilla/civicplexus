
-- Training assignment, completion, reminders
ALTER TABLE public.employee_training
  ADD COLUMN IF NOT EXISTS assigned_by uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_emp_training_due ON public.employee_training(due_date) WHERE status <> 'complete';
CREATE INDEX IF NOT EXISTS idx_emp_training_employee ON public.employee_training(employee_id);

-- Supervisor read of direct reports' training
DROP POLICY IF EXISTS "supervisor read team training" ON public.employee_training;
CREATE POLICY "supervisor read team training" ON public.employee_training
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_training.employee_id AND e.manager_id = auth.uid()
    )
  );

-- Employee may mark their own training complete (status + completed_at + score)
DROP POLICY IF EXISTS "employee update own training" ON public.employee_training;
CREATE POLICY "employee update own training" ON public.employee_training
  FOR UPDATE TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

-- Supervisors may assign training to their direct reports
DROP POLICY IF EXISTS "supervisor assign team training" ON public.employee_training;
CREATE POLICY "supervisor assign team training" ON public.employee_training
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_training.employee_id AND e.manager_id = auth.uid()
    )
  );
