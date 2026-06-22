
CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  position_code text UNIQUE,
  department text,
  worker_type_id uuid REFERENCES public.worker_types(id) ON DELETE SET NULL,
  flsa_class text CHECK (flsa_class IN ('exempt','non_exempt')),
  pay_grade text,
  pay_step text,
  budgeted_fte numeric(5,2) NOT NULL DEFAULT 1.00,
  reports_to_position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','frozen','closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.positions TO authenticated;
GRANT ALL ON public.positions TO service_role;

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY positions_read_authenticated ON public.positions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY positions_write_hr ON public.positions
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'));

CREATE TRIGGER trg_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_positions_status ON public.positions(status);
CREATE INDEX idx_positions_department ON public.positions(department);
CREATE INDEX idx_positions_reports_to ON public.positions(reports_to_position_id);

ALTER TABLE public.employees
  ADD COLUMN position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL;

CREATE INDEX idx_employees_position_id ON public.employees(position_id);

CREATE OR REPLACE VIEW public.position_headcount AS
SELECT
  p.department,
  COUNT(*) FILTER (WHERE p.status IN ('open','filled')) AS total_positions,
  SUM(p.budgeted_fte) FILTER (WHERE p.status IN ('open','filled')) AS budgeted_fte,
  COUNT(e.id) AS filled_count,
  COUNT(*) FILTER (WHERE p.status = 'open' AND NOT EXISTS (
    SELECT 1 FROM public.employees e2 WHERE e2.position_id = p.id
  )) AS vacant_count
FROM public.positions p
LEFT JOIN public.employees e ON e.position_id = p.id
GROUP BY p.department;

GRANT SELECT ON public.position_headcount TO authenticated;
