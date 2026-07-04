
-- ============ ENUMS ============
CREATE TYPE public.team_status AS ENUM ('forming','active','paused','complete','archived');
CREATE TYPE public.team_member_role AS ENUM ('sponsor','lead','member');
CREATE TYPE public.team_goal_status AS ENUM ('draft','active','at_risk','completed','cancelled');
CREATE TYPE public.team_deliverable_status AS ENUM ('todo','in_progress','blocked','done','cancelled');
CREATE TYPE public.team_update_kind AS ENUM ('comment','member_joined','member_left','goal_progress','deliverable_status','decision','charter_change','meeting_logged');

-- ============ TEAMS ============
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  purpose text,
  mission text,
  scope_in text,
  scope_out text,
  success_metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  sponsor_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  status public.team_status NOT NULL DEFAULT 'forming',
  start_date date,
  target_end_date date,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role public.team_member_role NOT NULL DEFAULT 'member',
  allocation_pct int CHECK (allocation_pct IS NULL OR (allocation_pct BETWEEN 0 AND 100)),
  skills text[] NOT NULL DEFAULT '{}',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX team_members_active_unique ON public.team_members (team_id, employee_id) WHERE left_at IS NULL;
CREATE INDEX team_members_team_idx ON public.team_members (team_id);
CREATE INDEX team_members_employee_idx ON public.team_members (employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.employees e ON e.id = tm.employee_id
    WHERE tm.team_id = _team_id
      AND e.user_id = _uid
      AND tm.left_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_lead(_team_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.employees e ON e.id = tm.employee_id
    WHERE tm.team_id = _team_id
      AND e.user_id = _uid
      AND tm.left_at IS NULL
      AND tm.role IN ('lead','sponsor')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_team(_team_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT public.is_team_member(_team_id, _uid) OR private.has_role(_uid, 'hr_admin'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_team(_team_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT public.is_team_lead(_team_id, _uid) OR private.has_role(_uid, 'hr_admin'::app_role);
$$;

-- ============ TEAMS RLS ============
CREATE POLICY "teams_select_members_or_hr" ON public.teams FOR SELECT TO authenticated
  USING (public.can_view_team(id, auth.uid()));
CREATE POLICY "teams_insert_authenticated" ON public.teams FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "teams_update_lead_or_hr" ON public.teams FOR UPDATE TO authenticated
  USING (public.can_manage_team(id, auth.uid()))
  WITH CHECK (public.can_manage_team(id, auth.uid()));
CREATE POLICY "teams_delete_hr" ON public.teams FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role));

-- Trigger: creator auto-added as lead
CREATE OR REPLACE FUNCTION public.tg_team_add_creator_as_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _emp uuid;
BEGIN
  SELECT id INTO _emp FROM public.employees WHERE user_id = NEW.created_by LIMIT 1;
  IF _emp IS NOT NULL THEN
    INSERT INTO public.team_members (team_id, employee_id, role)
    VALUES (NEW.id, _emp, 'lead')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teams_add_creator AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.tg_team_add_creator_as_lead();

CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ TEAM_MEMBERS RLS ============
CREATE POLICY "team_members_select" ON public.team_members FOR SELECT TO authenticated
  USING (public.can_view_team(team_id, auth.uid()));
CREATE POLICY "team_members_insert_lead" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_team(team_id, auth.uid()));
CREATE POLICY "team_members_update_lead" ON public.team_members FOR UPDATE TO authenticated
  USING (public.can_manage_team(team_id, auth.uid()))
  WITH CHECK (public.can_manage_team(team_id, auth.uid()));
-- Allow self-leave: update your own row's left_at
CREATE POLICY "team_members_self_leave" ON public.team_members FOR UPDATE TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));
CREATE POLICY "team_members_delete_lead" ON public.team_members FOR DELETE TO authenticated
  USING (public.can_manage_team(team_id, auth.uid()));

CREATE TRIGGER team_members_set_updated_at BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ TEAM_GOALS ============
CREATE TABLE public.team_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  parent_goal_id uuid REFERENCES public.team_goals(id) ON DELETE CASCADE,
  owner_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  target_date date,
  weight numeric NOT NULL DEFAULT 1 CHECK (weight > 0),
  progress int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  status public.team_goal_status NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_goals_team_idx ON public.team_goals (team_id);
CREATE INDEX team_goals_parent_idx ON public.team_goals (parent_goal_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_goals TO authenticated;
GRANT ALL ON public.team_goals TO service_role;
ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_goals_select" ON public.team_goals FOR SELECT TO authenticated
  USING (public.can_view_team(team_id, auth.uid()));
CREATE POLICY "team_goals_insert_member" ON public.team_goals FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "team_goals_update_member" ON public.team_goals FOR UPDATE TO authenticated
  USING (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "team_goals_delete_lead" ON public.team_goals FOR DELETE TO authenticated
  USING (public.can_manage_team(team_id, auth.uid()));

CREATE TRIGGER team_goals_set_updated_at BEFORE UPDATE ON public.team_goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Rollup trigger (mirrors public.tg_goal_rollup)
CREATE OR REPLACE FUNCTION public.tg_team_goal_rollup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _parent uuid := COALESCE(NEW.parent_goal_id, OLD.parent_goal_id);
  _weighted numeric;
  _total_weight numeric;
BEGIN
  IF _parent IS NULL THEN RETURN NEW; END IF;
  SELECT SUM(COALESCE(progress,0) * COALESCE(weight,1)), SUM(COALESCE(weight,1))
    INTO _weighted, _total_weight
    FROM public.team_goals WHERE parent_goal_id = _parent;
  IF _total_weight IS NULL OR _total_weight = 0 THEN RETURN NEW; END IF;
  UPDATE public.team_goals SET progress = ROUND(_weighted / _total_weight)::int
    WHERE id = _parent;
  RETURN NEW;
END $$;
CREATE TRIGGER team_goals_rollup AFTER INSERT OR UPDATE OR DELETE ON public.team_goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_team_goal_rollup();

CREATE TABLE public.team_goal_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.team_goals(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  progress int,
  status public.team_goal_status,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_goal_updates_goal_idx ON public.team_goal_updates (goal_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_goal_updates TO authenticated;
GRANT ALL ON public.team_goal_updates TO service_role;
ALTER TABLE public.team_goal_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_goal_updates_select" ON public.team_goal_updates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_goals g WHERE g.id = goal_id AND public.can_view_team(g.team_id, auth.uid())));
CREATE POLICY "team_goal_updates_insert" ON public.team_goal_updates FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.team_goals g WHERE g.id = goal_id AND (public.is_team_member(g.team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role))));

-- ============ TEAM_DELIVERABLES ============
CREATE TABLE public.team_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  owner_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  linked_goal_id uuid REFERENCES public.team_goals(id) ON DELETE SET NULL,
  due_date date,
  status public.team_deliverable_status NOT NULL DEFAULT 'todo',
  completed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_deliverables_team_idx ON public.team_deliverables (team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_deliverables TO authenticated;
GRANT ALL ON public.team_deliverables TO service_role;
ALTER TABLE public.team_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_deliverables_select" ON public.team_deliverables FOR SELECT TO authenticated
  USING (public.can_view_team(team_id, auth.uid()));
CREATE POLICY "team_deliverables_insert" ON public.team_deliverables FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "team_deliverables_update" ON public.team_deliverables FOR UPDATE TO authenticated
  USING (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "team_deliverables_delete_lead" ON public.team_deliverables FOR DELETE TO authenticated
  USING (public.can_manage_team(team_id, auth.uid()));
CREATE TRIGGER team_deliverables_set_updated_at BEFORE UPDATE ON public.team_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ TEAM_MEETINGS ============
CREATE TABLE public.team_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  meeting_date date NOT NULL,
  title text NOT NULL,
  notes_md text,
  attendee_member_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_meetings_team_idx ON public.team_meetings (team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_meetings TO authenticated;
GRANT ALL ON public.team_meetings TO service_role;
ALTER TABLE public.team_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_meetings_select" ON public.team_meetings FOR SELECT TO authenticated
  USING (public.can_view_team(team_id, auth.uid()));
CREATE POLICY "team_meetings_write" ON public.team_meetings FOR ALL TO authenticated
  USING (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER team_meetings_set_updated_at BEFORE UPDATE ON public.team_meetings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ TEAM_DECISIONS ============
CREATE TABLE public.team_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  rationale text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid NOT NULL,
  linked_meeting_id uuid REFERENCES public.team_meetings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_decisions_team_idx ON public.team_decisions (team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_decisions TO authenticated;
GRANT ALL ON public.team_decisions TO service_role;
ALTER TABLE public.team_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_decisions_select" ON public.team_decisions FOR SELECT TO authenticated
  USING (public.can_view_team(team_id, auth.uid()));
CREATE POLICY "team_decisions_write" ON public.team_decisions FOR ALL TO authenticated
  USING (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role));

-- ============ TEAM_UPDATES (feed) ============
CREATE TABLE public.team_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  kind public.team_update_kind NOT NULL DEFAULT 'comment',
  author_id uuid,
  body_md text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_updates_team_idx ON public.team_updates (team_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_updates TO authenticated;
GRANT ALL ON public.team_updates TO service_role;
ALTER TABLE public.team_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_updates_select" ON public.team_updates FOR SELECT TO authenticated
  USING (public.can_view_team(team_id, auth.uid()));
CREATE POLICY "team_updates_insert_comment" ON public.team_updates FOR INSERT TO authenticated
  WITH CHECK ((author_id = auth.uid()) AND (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role)));

-- Auto-feed triggers
CREATE OR REPLACE FUNCTION public.tg_team_members_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _emp record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT first_name, last_name INTO _emp FROM public.employees WHERE id = NEW.employee_id;
    INSERT INTO public.team_updates (team_id, kind, author_id, body_md, payload)
    VALUES (NEW.team_id, 'member_joined', auth.uid(),
      COALESCE(_emp.first_name,'') || ' ' || COALESCE(_emp.last_name,'') || ' joined as ' || NEW.role,
      jsonb_build_object('employee_id', NEW.employee_id, 'role', NEW.role));
  ELSIF TG_OP = 'UPDATE' AND NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
    SELECT first_name, last_name INTO _emp FROM public.employees WHERE id = NEW.employee_id;
    INSERT INTO public.team_updates (team_id, kind, author_id, body_md, payload)
    VALUES (NEW.team_id, 'member_left', auth.uid(),
      COALESCE(_emp.first_name,'') || ' ' || COALESCE(_emp.last_name,'') || ' left the team',
      jsonb_build_object('employee_id', NEW.employee_id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER team_members_feed AFTER INSERT OR UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_team_members_feed();

CREATE OR REPLACE FUNCTION public.tg_team_deliverable_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.team_updates (team_id, kind, author_id, body_md, payload)
    VALUES (NEW.team_id, 'deliverable_status', auth.uid(),
      NEW.title || ' → ' || NEW.status,
      jsonb_build_object('deliverable_id', NEW.id, 'from', OLD.status, 'to', NEW.status));
    IF NEW.status = 'done' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER team_deliverable_feed BEFORE UPDATE ON public.team_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_team_deliverable_feed();

CREATE OR REPLACE FUNCTION public.tg_team_decision_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.team_updates (team_id, kind, author_id, body_md, payload)
  VALUES (NEW.team_id, 'decision', COALESCE(auth.uid(), NEW.decided_by),
    'Decision: ' || NEW.title,
    jsonb_build_object('decision_id', NEW.id));
  RETURN NEW;
END $$;
CREATE TRIGGER team_decision_feed AFTER INSERT ON public.team_decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_team_decision_feed();

CREATE OR REPLACE FUNCTION public.tg_team_meeting_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.team_updates (team_id, kind, author_id, body_md, payload)
  VALUES (NEW.team_id, 'meeting_logged', COALESCE(auth.uid(), NEW.created_by),
    'Meeting: ' || NEW.title || ' (' || NEW.meeting_date || ')',
    jsonb_build_object('meeting_id', NEW.id));
  RETURN NEW;
END $$;
CREATE TRIGGER team_meeting_feed AFTER INSERT ON public.team_meetings
  FOR EACH ROW EXECUTE FUNCTION public.tg_team_meeting_feed();

CREATE OR REPLACE FUNCTION public.tg_team_goal_progress_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _team uuid;
BEGIN
  SELECT team_id INTO _team FROM public.team_goals WHERE id = NEW.goal_id;
  IF _team IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.team_updates (team_id, kind, author_id, body_md, payload)
  VALUES (_team, 'goal_progress', NEW.author_id,
    'Goal update' || COALESCE(': ' || NEW.note, '') || COALESCE(' — ' || NEW.progress || '%', ''),
    jsonb_build_object('goal_id', NEW.goal_id, 'progress', NEW.progress, 'status', NEW.status));
  RETURN NEW;
END $$;
CREATE TRIGGER team_goal_update_feed AFTER INSERT ON public.team_goal_updates
  FOR EACH ROW EXECUTE FUNCTION public.tg_team_goal_progress_feed();

-- ============ TEAM_LINKS ============
CREATE TABLE public.team_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_links_team_idx ON public.team_links (team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_links TO authenticated;
GRANT ALL ON public.team_links TO service_role;
ALTER TABLE public.team_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_links_select" ON public.team_links FOR SELECT TO authenticated
  USING (public.can_view_team(team_id, auth.uid()));
CREATE POLICY "team_links_write" ON public.team_links FOR ALL TO authenticated
  USING (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role));

-- ============ TEAM_DOCUMENTS ============
CREATE TABLE public.team_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, document_id)
);
CREATE INDEX team_documents_team_idx ON public.team_documents (team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_documents TO authenticated;
GRANT ALL ON public.team_documents TO service_role;
ALTER TABLE public.team_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_documents_select" ON public.team_documents FOR SELECT TO authenticated
  USING (public.can_view_team(team_id, auth.uid()));
CREATE POLICY "team_documents_write" ON public.team_documents FOR ALL TO authenticated
  USING (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (public.is_team_member(team_id, auth.uid()) OR private.has_role(auth.uid(),'hr_admin'::app_role));
