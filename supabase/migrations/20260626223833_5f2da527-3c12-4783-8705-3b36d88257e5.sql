
CREATE TABLE public.shift_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  color text DEFAULT '#3b82f6',
  description text,
  is_off boolean NOT NULL DEFAULT false,
  total_paid_hours numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_types TO authenticated;
GRANT ALL ON public.shift_types TO service_role;
ALTER TABLE public.shift_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_types read" ON public.shift_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_types hr write" ON public.shift_types FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER shift_types_updated BEFORE UPDATE ON public.shift_types
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.shift_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_type_id uuid NOT NULL REFERENCES public.shift_types(id) ON DELETE CASCADE,
  segment_order int NOT NULL DEFAULT 1,
  start_time time NOT NULL,
  end_time time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  paid boolean NOT NULL DEFAULT true,
  unpaid_meal_min int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_segments TO authenticated;
GRANT ALL ON public.shift_segments TO service_role;
ALTER TABLE public.shift_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_segments read" ON public.shift_segments FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_segments hr write" ON public.shift_segments FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TABLE public.schedule_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  cycle_length_days int NOT NULL CHECK (cycle_length_days BETWEEN 1 AND 56),
  category text,
  is_preset boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_patterns TO authenticated;
GRANT ALL ON public.schedule_patterns TO service_role;
ALTER TABLE public.schedule_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patterns read" ON public.schedule_patterns FOR SELECT TO authenticated USING (true);
CREATE POLICY "patterns hr write" ON public.schedule_patterns FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER patterns_updated BEFORE UPDATE ON public.schedule_patterns
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.pattern_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id uuid NOT NULL REFERENCES public.schedule_patterns(id) ON DELETE CASCADE,
  day_index int NOT NULL,
  shift_type_id uuid REFERENCES public.shift_types(id) ON DELETE SET NULL,
  is_off boolean NOT NULL DEFAULT false,
  UNIQUE (pattern_id, day_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pattern_days TO authenticated;
GRANT ALL ON public.pattern_days TO service_role;
ALTER TABLE public.pattern_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pattern_days read" ON public.pattern_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "pattern_days hr write" ON public.pattern_days FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TABLE public.employee_pattern_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  pattern_id uuid NOT NULL REFERENCES public.schedule_patterns(id) ON DELETE RESTRICT,
  anchor_date date NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.employee_pattern_assignments (employee_id, effective_from DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_pattern_assignments TO authenticated;
GRANT ALL ON public.employee_pattern_assignments TO service_role;
ALTER TABLE public.employee_pattern_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "epa read" ON public.employee_pattern_assignments FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id=auth.uid())
         OR private.has_role(auth.uid(),'hr_admin'::app_role)
         OR private.has_role(auth.uid(),'supervisor'::app_role));
CREATE POLICY "epa hr write" ON public.employee_pattern_assignments FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER epa_updated BEFORE UPDATE ON public.employee_pattern_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.employee_work_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'standard_40',
  period_days int NOT NULL DEFAULT 7,
  period_anchor_date date NOT NULL DEFAULT CURRENT_DATE,
  ot_threshold_hours numeric NOT NULL DEFAULT 40,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_work_periods TO authenticated;
GRANT ALL ON public.employee_work_periods TO service_role;
ALTER TABLE public.employee_work_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ewp read" ON public.employee_work_periods FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id=auth.uid())
         OR private.has_role(auth.uid(),'hr_admin'::app_role)
         OR private.has_role(auth.uid(),'supervisor'::app_role));
CREATE POLICY "ewp hr write" ON public.employee_work_periods FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER ewp_updated BEFORE UPDATE ON public.employee_work_periods
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed preset shift types
INSERT INTO public.shift_types (name, code, color, is_off, total_paid_hours)
SELECT v.name, v.code, v.color, v.is_off, v.total_paid_hours
FROM (VALUES
  ('Off','OFF','#94a3b8',true,0::numeric),
  ('24-hour shift','24H','#ef4444',false,24),
  ('48-hour shift','48H','#dc2626',false,48),
  ('Patrol Day 12h','PD12','#3b82f6',false,12),
  ('Patrol Night 12h','PN12','#1e40af',false,12),
  ('Day 10h (4/10)','D10','#10b981',false,10),
  ('Day 8h','D8','#22c55e',false,8),
  ('EMS Day 12h','EMS-D','#f59e0b',false,12),
  ('EMS Night 12h','EMS-N','#b45309',false,12)
) AS v(name,code,color,is_off,total_paid_hours)
WHERE NOT EXISTS (SELECT 1 FROM public.shift_types t WHERE t.name=v.name);

INSERT INTO public.shift_segments (shift_type_id, segment_order, start_time, end_time, crosses_midnight, paid)
SELECT st.id, 1, seg.s::time, seg.e::time, seg.x, true FROM public.shift_types st
JOIN (VALUES
  ('24H','07:00','07:00',true),
  ('48H','07:00','07:00',true),
  ('PD12','06:00','18:00',false),
  ('PN12','18:00','06:00',true),
  ('D10','07:00','17:30',false),
  ('D8','08:00','17:00',false),
  ('EMS-D','06:00','18:00',false),
  ('EMS-N','18:00','06:00',true)
) AS seg(code,s,e,x) ON seg.code=st.code
WHERE NOT EXISTS (SELECT 1 FROM public.shift_segments x WHERE x.shift_type_id=st.id);

DO $seed$
DECLARE
  off_id uuid; t24 uuid; pd12 uuid; pn12 uuid; p_id uuid;
BEGIN
  SELECT id INTO off_id FROM public.shift_types WHERE code='OFF';
  SELECT id INTO t24 FROM public.shift_types WHERE code='24H';
  SELECT id INTO pd12 FROM public.shift_types WHERE code='PD12';
  SELECT id INTO pn12 FROM public.shift_types WHERE code='PN12';

  IF NOT EXISTS (SELECT 1 FROM public.schedule_patterns WHERE name='24/48 (Fire)') THEN
    INSERT INTO public.schedule_patterns(name, description, cycle_length_days, category, is_preset)
    VALUES ('24/48 (Fire)','One 24-hour shift on, two days off',3,'fire',true) RETURNING id INTO p_id;
    INSERT INTO public.pattern_days(pattern_id, day_index, shift_type_id, is_off) VALUES
      (p_id,1,t24,false),(p_id,2,null,true),(p_id,3,null,true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schedule_patterns WHERE name='48/96 (Fire)') THEN
    INSERT INTO public.schedule_patterns(name, description, cycle_length_days, category, is_preset)
    VALUES ('48/96 (Fire)','48 hours on, 96 hours off',6,'fire',true) RETURNING id INTO p_id;
    INSERT INTO public.pattern_days(pattern_id, day_index, shift_type_id, is_off) VALUES
      (p_id,1,t24,false),(p_id,2,t24,false),(p_id,3,null,true),(p_id,4,null,true),(p_id,5,null,true),(p_id,6,null,true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schedule_patterns WHERE name='Kelly Schedule (Fire)') THEN
    INSERT INTO public.schedule_patterns(name, description, cycle_length_days, category, is_preset)
    VALUES ('Kelly Schedule (Fire)','9-day cycle: on/off/on/off/on then 4 off',9,'fire',true) RETURNING id INTO p_id;
    INSERT INTO public.pattern_days(pattern_id, day_index, shift_type_id, is_off) VALUES
      (p_id,1,t24,false),(p_id,2,null,true),(p_id,3,t24,false),(p_id,4,null,true),
      (p_id,5,t24,false),(p_id,6,null,true),(p_id,7,null,true),(p_id,8,null,true),(p_id,9,null,true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schedule_patterns WHERE name='4-on/4-off 12h Day (Patrol)') THEN
    INSERT INTO public.schedule_patterns(name, description, cycle_length_days, category, is_preset)
    VALUES ('4-on/4-off 12h Day (Patrol)','Four 12-hour days on, four off',8,'law',true) RETURNING id INTO p_id;
    INSERT INTO public.pattern_days(pattern_id, day_index, shift_type_id, is_off) VALUES
      (p_id,1,pd12,false),(p_id,2,pd12,false),(p_id,3,pd12,false),(p_id,4,pd12,false),
      (p_id,5,null,true),(p_id,6,null,true),(p_id,7,null,true),(p_id,8,null,true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schedule_patterns WHERE name='Pitman 2-3-2 Day (Patrol)') THEN
    INSERT INTO public.schedule_patterns(name, description, cycle_length_days, category, is_preset)
    VALUES ('Pitman 2-3-2 Day (Patrol)','14-day Pitman rotation, 12-hour day shifts',14,'law',true) RETURNING id INTO p_id;
    INSERT INTO public.pattern_days(pattern_id, day_index, shift_type_id, is_off) VALUES
      (p_id,1,pd12,false),(p_id,2,pd12,false),(p_id,3,null,true),(p_id,4,null,true),(p_id,5,null,true),
      (p_id,6,pd12,false),(p_id,7,pd12,false),(p_id,8,pd12,false),(p_id,9,pd12,false),
      (p_id,10,null,true),(p_id,11,null,true),(p_id,12,pd12,false),(p_id,13,pd12,false),(p_id,14,pd12,false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schedule_patterns WHERE name='DuPont (12h, 28-day)') THEN
    INSERT INTO public.schedule_patterns(name, description, cycle_length_days, category, is_preset)
    VALUES ('DuPont (12h, 28-day)','Classic DuPont rotation across days and nights',28,'general',true) RETURNING id INTO p_id;
    INSERT INTO public.pattern_days(pattern_id, day_index, shift_type_id, is_off) VALUES
      (p_id,1,pn12,false),(p_id,2,pn12,false),(p_id,3,pn12,false),(p_id,4,pn12,false),
      (p_id,5,null,true),(p_id,6,null,true),(p_id,7,null,true),
      (p_id,8,pd12,false),(p_id,9,pd12,false),(p_id,10,pd12,false),
      (p_id,11,null,true),
      (p_id,12,pn12,false),(p_id,13,pn12,false),(p_id,14,pn12,false),
      (p_id,15,null,true),(p_id,16,null,true),(p_id,17,null,true),
      (p_id,18,pd12,false),(p_id,19,pd12,false),(p_id,20,pd12,false),(p_id,21,pd12,false),
      (p_id,22,null,true),(p_id,23,null,true),(p_id,24,null,true),
      (p_id,25,null,true),(p_id,26,null,true),(p_id,27,null,true),(p_id,28,null,true);
  END IF;
END $seed$;
