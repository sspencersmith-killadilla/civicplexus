
CREATE TABLE public.one_on_one_agenda_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.one_on_ones(id) ON DELETE CASCADE,
  agenda_index int NOT NULL,
  agenda_prompt text,
  content text NOT NULL DEFAULT '',
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, agenda_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.one_on_one_agenda_notes TO authenticated;
GRANT ALL ON public.one_on_one_agenda_notes TO service_role;

ALTER TABLE public.one_on_one_agenda_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agenda notes: read"
  ON public.one_on_one_agenda_notes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.one_on_ones s
      LEFT JOIN public.employees e ON e.id = s.employee_id
      WHERE s.id = session_id
        AND (
          s.manager_user_id = auth.uid()
          OR e.user_id = auth.uid()
          OR private.has_role(auth.uid(), 'hr_admin'::app_role)
        )
    )
  );

CREATE POLICY "agenda notes: insert"
  ON public.one_on_one_agenda_notes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.one_on_ones s
      LEFT JOIN public.employees e ON e.id = s.employee_id
      WHERE s.id = session_id
        AND (
          s.manager_user_id = auth.uid()
          OR e.user_id = auth.uid()
          OR private.has_role(auth.uid(), 'hr_admin'::app_role)
        )
    )
  );

CREATE POLICY "agenda notes: update"
  ON public.one_on_one_agenda_notes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.one_on_ones s
      LEFT JOIN public.employees e ON e.id = s.employee_id
      WHERE s.id = session_id
        AND (
          s.manager_user_id = auth.uid()
          OR e.user_id = auth.uid()
          OR private.has_role(auth.uid(), 'hr_admin'::app_role)
        )
    )
  );

CREATE POLICY "agenda notes: delete"
  ON public.one_on_one_agenda_notes FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.one_on_ones s
      WHERE s.id = session_id
        AND (s.manager_user_id = auth.uid() OR private.has_role(auth.uid(), 'hr_admin'::app_role))
    )
  );

CREATE TRIGGER trg_agenda_notes_updated
  BEFORE UPDATE ON public.one_on_one_agenda_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.grievances
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS appeal_deadline date;

CREATE TABLE public.grievance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id uuid NOT NULL REFERENCES public.grievances(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.grievance_events TO authenticated;
GRANT ALL ON public.grievance_events TO service_role;

ALTER TABLE public.grievance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grievance events: read"
  ON public.grievance_events FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.grievances g
      WHERE g.id = grievance_id
        AND (g.submitted_by = auth.uid() OR g.assigned_hr_id = auth.uid())
    )
  );

CREATE POLICY "grievance events: HR insert"
  ON public.grievance_events FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TABLE public.grievance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id uuid NOT NULL REFERENCES public.grievances(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grievance_tasks TO authenticated;
GRANT ALL ON public.grievance_tasks TO service_role;

ALTER TABLE public.grievance_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grievance tasks: HR manage"
  ON public.grievance_tasks FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "grievance tasks: assignee read"
  ON public.grievance_tasks FOR SELECT TO authenticated
  USING (assignee_id = auth.uid());

CREATE TRIGGER trg_grievance_tasks_updated
  BEFORE UPDATE ON public.grievance_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_grievance_log_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.grievance_events (grievance_id, actor_id, event_type, to_status, payload)
    VALUES (NEW.id, NEW.submitted_by, 'filed', NEW.status, jsonb_build_object('case_number', NEW.case_number));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.grievance_events (grievance_id, actor_id, event_type, from_status, to_status)
      VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
    END IF;
    IF NEW.assigned_hr_id IS DISTINCT FROM OLD.assigned_hr_id THEN
      INSERT INTO public.grievance_events (grievance_id, actor_id, event_type, payload)
      VALUES (NEW.id, auth.uid(), 'assigned', jsonb_build_object('assigned_hr_id', NEW.assigned_hr_id));
    END IF;
    IF NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at AND NEW.acknowledged_at IS NOT NULL THEN
      INSERT INTO public.grievance_events (grievance_id, actor_id, event_type)
      VALUES (NEW.id, auth.uid(), 'acknowledged');
    END IF;
    IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at AND NEW.resolved_at IS NOT NULL THEN
      INSERT INTO public.grievance_events (grievance_id, actor_id, event_type, payload)
      VALUES (NEW.id, auth.uid(), 'resolved', jsonb_build_object('outcome', NEW.outcome));
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_grievance_log_changes
  AFTER INSERT OR UPDATE ON public.grievances
  FOR EACH ROW EXECUTE FUNCTION public.tg_grievance_log_changes();
