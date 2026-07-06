
-- 1. team_members: block privilege escalation via self-update
CREATE OR REPLACE FUNCTION public.tg_team_members_self_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;
  -- HR admin and team managers bypass
  IF private.has_role(_uid, 'hr_admin'::app_role) THEN RETURN NEW; END IF;
  IF public.can_manage_team(OLD.team_id, _uid) THEN RETURN NEW; END IF;

  -- If this is a self-update, only allow changing left_at
  IF EXISTS (SELECT 1 FROM public.employees e WHERE e.id = OLD.employee_id AND e.user_id = _uid) THEN
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.team_id     IS DISTINCT FROM OLD.team_id
       OR NEW.role        IS DISTINCT FROM OLD.role
       OR NEW.allocation  IS DISTINCT FROM OLD.allocation
       OR NEW.joined_at   IS DISTINCT FROM OLD.joined_at
    THEN
      RAISE EXCEPTION 'Team members may only set left_at on their own membership';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS team_members_self_update_guard ON public.team_members;
CREATE TRIGGER team_members_self_update_guard
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_team_members_self_update_guard();

-- 2. approval_steps: add WITH CHECK + immutability trigger
DROP POLICY IF EXISTS "as update" ON public.approval_steps;
CREATE POLICY "as update" ON public.approval_steps
  FOR UPDATE
  USING (approver_id = auth.uid() OR private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (approver_id = auth.uid() OR private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE OR REPLACE FUNCTION public.tg_approval_steps_immutable_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF private.has_role(auth.uid(), 'hr_admin'::app_role) THEN RETURN NEW; END IF;
  IF NEW.chain_id       IS DISTINCT FROM OLD.chain_id
     OR NEW.stage       IS DISTINCT FROM OLD.stage
     OR NEW.approver_id IS DISTINCT FROM OLD.approver_id
     OR NEW.approver_role IS DISTINCT FROM OLD.approver_role
  THEN
    RAISE EXCEPTION 'Approvers cannot reassign approval steps';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS approval_steps_immutable_cols ON public.approval_steps;
CREATE TRIGGER approval_steps_immutable_cols
  BEFORE UPDATE ON public.approval_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_approval_steps_immutable_cols();

-- 3. official_task_instances: real WITH CHECK + immutability trigger
DROP POLICY IF EXISTS oti_official_update ON public.official_task_instances;
CREATE POLICY oti_official_update ON public.official_task_instances
  FOR UPDATE
  USING (
    assignee = 'official'::official_task_assignee
    AND EXISTS (
      SELECT 1
        FROM official_onboarding_instances oi
        JOIN official_terms t ON t.id = oi.term_id
        JOIN officials o      ON o.id = t.official_id
       WHERE oi.id = official_task_instances.instance_id
         AND o.user_id = auth.uid()
    )
  )
  WITH CHECK (
    assignee = 'official'::official_task_assignee
    AND EXISTS (
      SELECT 1
        FROM official_onboarding_instances oi
        JOIN official_terms t ON t.id = oi.term_id
        JOIN officials o      ON o.id = t.official_id
       WHERE oi.id = official_task_instances.instance_id
         AND o.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.tg_official_task_instances_immutable_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE _uid uuid := auth.uid(); _is_official boolean;
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;
  IF private.has_role(_uid, 'hr_admin'::app_role)
     OR private.has_role(_uid, 'city_clerk'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.official_onboarding_instances oi
      JOIN public.official_terms t ON t.id = oi.term_id
      JOIN public.officials o      ON o.id = t.official_id
     WHERE oi.id = OLD.instance_id AND o.user_id = _uid
  ) INTO _is_official;

  IF _is_official THEN
    IF NEW.instance_id        IS DISTINCT FROM OLD.instance_id
       OR NEW.template_task_id IS DISTINCT FROM OLD.template_task_id
       OR NEW.assignee         IS DISTINCT FROM OLD.assignee
       OR NEW.category         IS DISTINCT FROM OLD.category
       OR NEW.completion_signal IS DISTINCT FROM OLD.completion_signal
       OR NEW.is_required       IS DISTINCT FROM OLD.is_required
       OR NEW.title             IS DISTINCT FROM OLD.title
       OR NEW.description       IS DISTINCT FROM OLD.description
       OR NEW.sort_order        IS DISTINCT FROM OLD.sort_order
       OR NEW.due_date          IS DISTINCT FROM OLD.due_date
    THEN
      RAISE EXCEPTION 'Officials cannot modify task definition fields; only status/evidence can change';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS official_task_instances_immutable_cols ON public.official_task_instances;
CREATE TRIGGER official_task_instances_immutable_cols
  BEFORE UPDATE ON public.official_task_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_official_task_instances_immutable_cols();
