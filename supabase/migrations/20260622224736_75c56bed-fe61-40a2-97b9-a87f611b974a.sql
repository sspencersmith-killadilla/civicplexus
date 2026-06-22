
-- =====================================================================
-- 1-on-1 Templates
-- =====================================================================
CREATE TABLE public.one_on_one_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  agenda_prompts jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.one_on_one_templates TO authenticated;
GRANT ALL ON public.one_on_one_templates TO service_role;
ALTER TABLE public.one_on_one_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tpl read" ON public.one_on_one_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpl hr write" ON public.one_on_one_templates FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE TRIGGER tg_one_on_one_templates_updated BEFORE UPDATE ON public.one_on_one_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- 1-on-1 Sessions
-- =====================================================================
CREATE TABLE public.one_on_ones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.one_on_one_templates(id) ON DELETE SET NULL,
  short_code text UNIQUE NOT NULL,
  title text,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  summary text,
  ai_summary text,
  ai_action_items jsonb,
  ai_generated_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_one_on_ones_manager ON public.one_on_ones(manager_user_id);
CREATE INDEX idx_one_on_ones_employee ON public.one_on_ones(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.one_on_ones TO authenticated;
GRANT ALL ON public.one_on_ones TO service_role;
ALTER TABLE public.one_on_ones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "1on1 read participants and hr" ON public.one_on_ones
  FOR SELECT TO authenticated USING (
    manager_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  );
CREATE POLICY "1on1 insert by manager or hr" ON public.one_on_ones
  FOR INSERT TO authenticated WITH CHECK (
    manager_user_id = auth.uid()
    OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  );
CREATE POLICY "1on1 update by manager or hr" ON public.one_on_ones
  FOR UPDATE TO authenticated USING (
    manager_user_id = auth.uid() OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  ) WITH CHECK (
    manager_user_id = auth.uid() OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  );
CREATE POLICY "1on1 delete by manager or hr" ON public.one_on_ones
  FOR DELETE TO authenticated USING (
    manager_user_id = auth.uid() OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  );
CREATE TRIGGER tg_one_on_ones_updated BEFORE UPDATE ON public.one_on_ones
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- helper: can the current user see/edit a session?
CREATE OR REPLACE FUNCTION private.can_access_one_on_one(_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.one_on_ones s
    LEFT JOIN public.employees e ON e.id = s.employee_id
    WHERE s.id = _session_id
      AND (
        s.manager_user_id = auth.uid()
        OR e.user_id = auth.uid()
        OR private.has_role(auth.uid(), 'hr_admin'::app_role)
      )
  );
$$;
REVOKE EXECUTE ON FUNCTION private.can_access_one_on_one(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_one_on_one(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.is_one_on_one_manager(_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.one_on_ones s
    WHERE s.id = _session_id
      AND (s.manager_user_id = auth.uid() OR private.has_role(auth.uid(), 'hr_admin'::app_role))
  );
$$;
REVOKE EXECUTE ON FUNCTION private.is_one_on_one_manager(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_one_on_one_manager(uuid) TO authenticated;

-- =====================================================================
-- 1-on-1 Notes (shared or manager-private)
-- =====================================================================
CREATE TABLE public.one_on_one_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.one_on_ones(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared','manager_private')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notes_session ON public.one_on_one_notes(session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.one_on_one_notes TO authenticated;
GRANT ALL ON public.one_on_one_notes TO service_role;
ALTER TABLE public.one_on_one_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes read" ON public.one_on_one_notes FOR SELECT TO authenticated USING (
  (visibility = 'shared' AND private.can_access_one_on_one(session_id))
  OR (visibility = 'manager_private' AND private.is_one_on_one_manager(session_id))
);
CREATE POLICY "notes insert" ON public.one_on_one_notes FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid() AND (
    (visibility = 'shared' AND private.can_access_one_on_one(session_id))
    OR (visibility = 'manager_private' AND private.is_one_on_one_manager(session_id))
  )
);
CREATE POLICY "notes update own" ON public.one_on_one_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "notes delete own or hr" ON public.one_on_one_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER tg_one_on_one_notes_updated BEFORE UPDATE ON public.one_on_one_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- 1-on-1 Action Items
-- =====================================================================
CREATE TABLE public.one_on_one_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.one_on_ones(id) ON DELETE CASCADE,
  text text NOT NULL,
  assignee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_label text,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_action_session ON public.one_on_one_action_items(session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.one_on_one_action_items TO authenticated;
GRANT ALL ON public.one_on_one_action_items TO service_role;
ALTER TABLE public.one_on_one_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai read" ON public.one_on_one_action_items FOR SELECT TO authenticated
  USING (private.can_access_one_on_one(session_id));
CREATE POLICY "ai write participants" ON public.one_on_one_action_items FOR INSERT TO authenticated
  WITH CHECK (private.can_access_one_on_one(session_id));
CREATE POLICY "ai update participants" ON public.one_on_one_action_items FOR UPDATE TO authenticated
  USING (private.can_access_one_on_one(session_id)) WITH CHECK (private.can_access_one_on_one(session_id));
CREATE POLICY "ai delete manager or hr" ON public.one_on_one_action_items FOR DELETE TO authenticated
  USING (private.is_one_on_one_manager(session_id));
CREATE TRIGGER tg_action_items_updated BEFORE UPDATE ON public.one_on_one_action_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- Goals
-- =====================================================================
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text CHECK (category IN ('performance','development','team','project','other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','at_risk','completed','cancelled')),
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  target_date date,
  parent_goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_goals_owner ON public.goals(owner_employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals read" ON public.goals FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = owner_employee_id
          AND (e.user_id = auth.uid() OR e.manager_id = auth.uid()))
  OR private.has_role(auth.uid(), 'hr_admin'::app_role)
);
CREATE POLICY "goals insert" ON public.goals FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = owner_employee_id
          AND (e.user_id = auth.uid() OR e.manager_id = auth.uid()))
  OR private.has_role(auth.uid(), 'hr_admin'::app_role)
);
CREATE POLICY "goals update" ON public.goals FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = owner_employee_id
          AND (e.user_id = auth.uid() OR e.manager_id = auth.uid()))
  OR private.has_role(auth.uid(), 'hr_admin'::app_role)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = owner_employee_id
          AND (e.user_id = auth.uid() OR e.manager_id = auth.uid()))
  OR private.has_role(auth.uid(), 'hr_admin'::app_role)
);
CREATE POLICY "goals delete" ON public.goals FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = owner_employee_id
          AND (e.user_id = auth.uid() OR e.manager_id = auth.uid()))
  OR private.has_role(auth.uid(), 'hr_admin'::app_role)
);
CREATE TRIGGER tg_goals_updated BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.goal_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  progress smallint CHECK (progress BETWEEN 0 AND 100),
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_goal_updates_goal ON public.goal_updates(goal_id);
GRANT SELECT, INSERT ON public.goal_updates TO authenticated;
GRANT ALL ON public.goal_updates TO service_role;
ALTER TABLE public.goal_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gu read" ON public.goal_updates FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.goals g JOIN public.employees e ON e.id = g.owner_employee_id
          WHERE g.id = goal_id AND (e.user_id = auth.uid() OR e.manager_id = auth.uid()))
  OR private.has_role(auth.uid(),'hr_admin'::app_role)
);
CREATE POLICY "gu insert" ON public.goal_updates FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid() AND (
    EXISTS (SELECT 1 FROM public.goals g JOIN public.employees e ON e.id = g.owner_employee_id
            WHERE g.id = goal_id AND (e.user_id = auth.uid() OR e.manager_id = auth.uid()))
    OR private.has_role(auth.uid(),'hr_admin'::app_role)
  )
);

-- =====================================================================
-- Cascade Broadcasts
-- =====================================================================
CREATE TABLE public.cascades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  broadcast_message text NOT NULL,
  attachment_url text,
  deadline date,
  ai_summary text,
  ai_generated_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cascades TO authenticated;
GRANT ALL ON public.cascades TO service_role;
ALTER TABLE public.cascades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cascade read all" ON public.cascades FOR SELECT TO authenticated USING (true);
CREATE POLICY "cascade hr write" ON public.cascades FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER tg_cascades_updated BEFORE UPDATE ON public.cascades
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.cascade_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cascade_id uuid NOT NULL REFERENCES public.cascades(id) ON DELETE CASCADE,
  responder_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  manager_name text,
  department text,
  team_feedback text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cascade_responses_cascade ON public.cascade_responses(cascade_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cascade_responses TO authenticated;
GRANT ALL ON public.cascade_responses TO service_role;
ALTER TABLE public.cascade_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr read hr or own" ON public.cascade_responses FOR SELECT TO authenticated USING (
  responder_id = auth.uid() OR private.has_role(auth.uid(),'hr_admin'::app_role)
);
CREATE POLICY "cr insert" ON public.cascade_responses FOR INSERT TO authenticated
  WITH CHECK (responder_id = auth.uid());
CREATE POLICY "cr update own" ON public.cascade_responses FOR UPDATE TO authenticated
  USING (responder_id = auth.uid()) WITH CHECK (responder_id = auth.uid());

-- =====================================================================
-- Seed default 1-on-1 template
-- =====================================================================
INSERT INTO public.one_on_one_templates (title, description, agenda_prompts, is_default)
VALUES (
  'Standard Weekly 1-on-1',
  'A balanced agenda for a recurring manager + direct-report check-in.',
  '[
    "Wins since our last 1-on-1",
    "Blockers or frustrations",
    "Progress on current goals",
    "Coaching / development focus",
    "Anything I (your manager) can do better",
    "Action items for the coming week"
  ]'::jsonb,
  true
);
