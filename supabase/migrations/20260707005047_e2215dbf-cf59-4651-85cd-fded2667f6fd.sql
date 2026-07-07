
CREATE TABLE IF NOT EXISTS public.leave_accrual_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.leave_plans(id) ON DELETE CASCADE,
  worker_type_id uuid REFERENCES public.worker_types(id) ON DELETE CASCADE,
  min_months_service int NOT NULL DEFAULT 0 CHECK (min_months_service >= 0),
  max_months_service int CHECK (max_months_service IS NULL OR max_months_service > min_months_service),
  accrual_hours numeric(8,4) NOT NULL DEFAULT 0 CHECK (accrual_hours >= 0),
  frequency text NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('per_pay_period','monthly','annually')),
  max_balance_hours numeric(10,2),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_accrual_rules_plan ON public.leave_accrual_rules(plan_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_accrual_rules TO authenticated;
GRANT ALL ON public.leave_accrual_rules TO service_role;

ALTER TABLE public.leave_accrual_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in reads accrual rules"
  ON public.leave_accrual_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "HR manages accrual rules"
  ON public.leave_accrual_rules FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER trg_leave_accrual_rules_updated_at
  BEFORE UPDATE ON public.leave_accrual_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
