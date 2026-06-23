
-- ============================================================
-- REVIEW CYCLES
-- ============================================================
CREATE TABLE public.review_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  kickoff_at timestamptz,
  self_review_due date,
  manager_review_due date,
  signoff_due date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','in_calibration','closed')),
  eligibility_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_key text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_cycles TO authenticated;
GRANT ALL ON public.review_cycles TO service_role;
ALTER TABLE public.review_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR admins manage review cycles" ON public.review_cycles
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "Authenticated can read review cycles" ON public.review_cycles
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_review_cycles_updated_at BEFORE UPDATE ON public.review_cycles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- PARTICIPANTS
-- ============================================================
CREATE TABLE public.review_cycle_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.review_cycles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  review_id uuid REFERENCES public.performance_reviews(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','self_submitted','manager_submitted','calibrated','acknowledged','finalized')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_cycle_participants TO authenticated;
GRANT ALL ON public.review_cycle_participants TO service_role;
ALTER TABLE public.review_cycle_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR admins manage cycle participants" ON public.review_cycle_participants
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "Managers see their reports' participation" ON public.review_cycle_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees m WHERE m.id = manager_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  );

CREATE TRIGGER trg_review_cycle_participants_updated_at BEFORE UPDATE ON public.review_cycle_participants
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- RATINGS (per-competency)
-- ============================================================
CREATE TABLE public.review_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.performance_reviews(id) ON DELETE CASCADE,
  competency text NOT NULL,
  rating numeric(3,1),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, competency)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_ratings TO authenticated;
GRANT ALL ON public.review_ratings TO service_role;
ALTER TABLE public.review_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR admins manage all ratings" ON public.review_ratings
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "Managers & employees access own review ratings" ON public.review_ratings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.performance_reviews pr
      JOIN public.employees e ON e.id = pr.employee_id
      WHERE pr.id = review_id
        AND (e.user_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.employees m WHERE m.id = e.manager_id AND m.user_id = auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.performance_reviews pr
      JOIN public.employees e ON e.id = pr.employee_id
      WHERE pr.id = review_id
        AND EXISTS (SELECT 1 FROM public.employees m WHERE m.id = e.manager_id AND m.user_id = auth.uid())
    )
  );

CREATE TRIGGER trg_review_ratings_updated_at BEFORE UPDATE ON public.review_ratings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- RATING CHANGE AUDIT (calibration)
-- ============================================================
CREATE TABLE public.review_rating_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.performance_reviews(id) ON DELETE CASCADE,
  from_rating numeric(3,1),
  to_rating numeric(3,1),
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.review_rating_changes TO authenticated;
GRANT ALL ON public.review_rating_changes TO service_role;
ALTER TABLE public.review_rating_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR admins see all rating changes" ON public.review_rating_changes
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "HR admins insert rating changes" ON public.review_rating_changes
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

-- ============================================================
-- GOALS - cascading
-- ============================================================
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS parent_goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS weight numeric(5,2) NOT NULL DEFAULT 1.0;
CREATE INDEX IF NOT EXISTS idx_goals_parent ON public.goals(parent_goal_id);

-- ============================================================
-- ONE_ON_ONES - recurring cadence
-- ============================================================
ALTER TABLE public.one_on_ones ADD COLUMN IF NOT EXISTS cadence_weeks int;
ALTER TABLE public.one_on_ones ADD COLUMN IF NOT EXISTS next_scheduled_at timestamptz;

-- ============================================================
-- TRIGGER: seed reviews when a cycle opens
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_seed_review_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp record;
  _filter jsonb := COALESCE(NEW.eligibility_filter, '{}'::jsonb);
  _depts text[];
  _review_id uuid;
BEGIN
  IF NOT (NEW.status = 'open' AND (OLD.status IS DISTINCT FROM 'open')) THEN
    RETURN NEW;
  END IF;

  IF _filter ? 'departments' THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(_filter->'departments')) INTO _depts;
  END IF;

  FOR _emp IN
    SELECT e.* FROM public.employees e
     WHERE e.status = 'active'::employee_status
       AND (_depts IS NULL OR e.department = ANY(_depts))
  LOOP
    INSERT INTO public.performance_reviews (employee_id, review_period_start, review_period_end, status)
    VALUES (_emp.id, NEW.period_start, NEW.period_end, 'draft')
    RETURNING id INTO _review_id;

    INSERT INTO public.review_cycle_participants (cycle_id, employee_id, manager_id, review_id, status)
    VALUES (NEW.id, _emp.id, _emp.manager_id, _review_id, 'not_started')
    ON CONFLICT (cycle_id, employee_id) DO UPDATE SET review_id = EXCLUDED.review_id, manager_id = EXCLUDED.manager_id;

    IF _emp.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (_emp.user_id, 'review_cycle', 'Performance review opened',
              'Your self-assessment for ' || NEW.name || ' is open',
              '/reviews/' || _review_id::text);
    END IF;

    IF _emp.manager_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      SELECT m.user_id, 'review_cycle', 'Review to complete',
             'Review for ' || _emp.first_name || ' ' || _emp.last_name || ' opened',
             '/reviews/' || _review_id::text
        FROM public.employees m WHERE m.id = _emp.manager_id AND m.user_id IS NOT NULL;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_seed_review_cycle() FROM PUBLIC;

CREATE TRIGGER trg_review_cycle_seed
  AFTER UPDATE ON public.review_cycles
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_review_cycle();

-- ============================================================
-- TRIGGER: lock finalized reviews
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_review_lock_when_finalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF OLD.status = 'finalized' AND NOT private.has_role(auth.uid(), 'hr_admin'::app_role) THEN
    RAISE EXCEPTION 'Review is finalized and cannot be edited';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_review_lock_when_finalized() FROM PUBLIC;

CREATE TRIGGER trg_perf_review_lock
  BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_review_lock_when_finalized();

-- ============================================================
-- TRIGGER: parent goal rollup
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_goal_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent uuid := COALESCE(NEW.parent_goal_id, OLD.parent_goal_id);
  _weighted numeric;
  _total_weight numeric;
BEGIN
  IF _parent IS NULL THEN RETURN NEW; END IF;
  SELECT SUM(COALESCE(progress,0) * COALESCE(weight,1)), SUM(COALESCE(weight,1))
    INTO _weighted, _total_weight
    FROM public.goals WHERE parent_goal_id = _parent;
  IF _total_weight IS NULL OR _total_weight = 0 THEN RETURN NEW; END IF;
  UPDATE public.goals SET progress = ROUND(_weighted / _total_weight)::int
   WHERE id = _parent;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_goal_rollup() FROM PUBLIC;

CREATE TRIGGER trg_goal_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_goal_rollup();

-- ============================================================
-- SEED default competencies
-- ============================================================
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS review_competencies jsonb NOT NULL DEFAULT '["Communication","Ownership","Craft","Collaboration","Growth"]'::jsonb;
