
-- =========================================================
-- OFFICIALS ONBOARDING MODULE
-- =========================================================

-- Enums
CREATE TYPE public.official_task_category AS ENUM (
  'oath','bond','ethics','disclosure','training','policy','provisioning','orientation','other'
);
CREATE TYPE public.official_task_assignee AS ENUM (
  'official','clerk','chair','hr','it','automated'
);
CREATE TYPE public.official_task_signal AS ENUM (
  'none','oath_signed','bond_filed','ethics_ack','coi_filed','toma_complete','pia_complete','photo_consent'
);
CREATE TYPE public.official_onboarding_status AS ENUM ('active','complete','cancelled');
CREATE TYPE public.official_task_status AS ENUM ('pending','in_progress','complete','skipped','blocked','waived');

-- =========================================================
-- 1) Templates
-- =========================================================
CREATE TABLE public.official_onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  body_id uuid REFERENCES public.official_bodies(id) ON DELETE CASCADE,      -- NULL = global default
  appointment_type public.official_appointment_type,                          -- NULL = any
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oobt_body ON public.official_onboarding_templates(body_id, appointment_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_onboarding_templates TO authenticated;
GRANT ALL ON public.official_onboarding_templates TO service_role;
ALTER TABLE public.official_onboarding_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY oobt_read ON public.official_onboarding_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY oobt_manage ON public.official_onboarding_templates
  FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid()))
  WITH CHECK (public.can_manage_officials(auth.uid()));
CREATE TRIGGER trg_oobt_updated BEFORE UPDATE ON public.official_onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- 2) Template tasks
-- =========================================================
CREATE TABLE public.official_template_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.official_onboarding_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category public.official_task_category NOT NULL DEFAULT 'other',
  assignee public.official_task_assignee NOT NULL DEFAULT 'official',
  is_required boolean NOT NULL DEFAULT true,
  days_offset int NOT NULL DEFAULT 0,      -- from term.start_date; negative = pre-seating
  sort_order int NOT NULL DEFAULT 0,
  completion_signal public.official_task_signal NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ott_template ON public.official_template_tasks(template_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_template_tasks TO authenticated;
GRANT ALL ON public.official_template_tasks TO service_role;
ALTER TABLE public.official_template_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY ott_read ON public.official_template_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ott_manage ON public.official_template_tasks
  FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid()))
  WITH CHECK (public.can_manage_officials(auth.uid()));

-- =========================================================
-- 3) Instances (one per term)
-- =========================================================
CREATE TABLE public.official_onboarding_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL UNIQUE REFERENCES public.official_terms(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.official_onboarding_templates(id) ON DELETE SET NULL,
  status public.official_onboarding_status NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ooi_term ON public.official_onboarding_instances(term_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_onboarding_instances TO authenticated;
GRANT ALL ON public.official_onboarding_instances TO service_role;
ALTER TABLE public.official_onboarding_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY ooi_manage ON public.official_onboarding_instances
  FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid()))
  WITH CHECK (public.can_manage_officials(auth.uid()));
CREATE POLICY ooi_official_read ON public.official_onboarding_instances
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.official_terms t
      JOIN public.officials o ON o.id = t.official_id
      WHERE t.id = term_id AND o.user_id = auth.uid()
    )
  );
CREATE TRIGGER trg_ooi_updated BEFORE UPDATE ON public.official_onboarding_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- 4) Task instances
-- =========================================================
CREATE TABLE public.official_task_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.official_onboarding_instances(id) ON DELETE CASCADE,
  template_task_id uuid REFERENCES public.official_template_tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  category public.official_task_category NOT NULL DEFAULT 'other',
  assignee public.official_task_assignee NOT NULL DEFAULT 'official',
  is_required boolean NOT NULL DEFAULT true,
  due_date date,
  status public.official_task_status NOT NULL DEFAULT 'pending',
  completion_signal public.official_task_signal NOT NULL DEFAULT 'none',
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evidence_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oti_instance ON public.official_task_instances(instance_id, sort_order);
CREATE INDEX idx_oti_status_due ON public.official_task_instances(status, due_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_task_instances TO authenticated;
GRANT ALL ON public.official_task_instances TO service_role;
ALTER TABLE public.official_task_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY oti_manage ON public.official_task_instances
  FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid()))
  WITH CHECK (public.can_manage_officials(auth.uid()));
CREATE POLICY oti_official_read ON public.official_task_instances
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.official_onboarding_instances oi
      JOIN public.official_terms t ON t.id = oi.term_id
      JOIN public.officials o ON o.id = t.official_id
      WHERE oi.id = instance_id AND o.user_id = auth.uid()
    )
  );
CREATE POLICY oti_official_update ON public.official_task_instances
  FOR UPDATE TO authenticated USING (
    assignee = 'official' AND EXISTS (
      SELECT 1 FROM public.official_onboarding_instances oi
      JOIN public.official_terms t ON t.id = oi.term_id
      JOIN public.officials o ON o.id = t.official_id
      WHERE oi.id = instance_id AND o.user_id = auth.uid()
    )
  ) WITH CHECK (true);
CREATE TRIGGER trg_oti_updated BEFORE UPDATE ON public.official_task_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- Helper: pick best template for a term
-- =========================================================
CREATE OR REPLACE FUNCTION public.pick_official_onboarding_template(_term_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _body_id uuid;
  _appt public.official_appointment_type;
  _tpl_id uuid;
BEGIN
  SELECT s.body_id, t.appointment_type INTO _body_id, _appt
  FROM public.official_terms t
  JOIN public.official_seats s ON s.id = t.seat_id
  WHERE t.id = _term_id;

  -- 1: body + appointment type match
  SELECT id INTO _tpl_id FROM public.official_onboarding_templates
   WHERE is_active AND body_id = _body_id AND appointment_type = _appt
   ORDER BY is_default DESC, created_at DESC LIMIT 1;
  IF _tpl_id IS NOT NULL THEN RETURN _tpl_id; END IF;

  -- 2: body default (any appointment)
  SELECT id INTO _tpl_id FROM public.official_onboarding_templates
   WHERE is_active AND body_id = _body_id AND appointment_type IS NULL
   ORDER BY is_default DESC, created_at DESC LIMIT 1;
  IF _tpl_id IS NOT NULL THEN RETURN _tpl_id; END IF;

  -- 3: global default matching appointment type
  SELECT id INTO _tpl_id FROM public.official_onboarding_templates
   WHERE is_active AND body_id IS NULL AND appointment_type = _appt
   ORDER BY is_default DESC, created_at DESC LIMIT 1;
  IF _tpl_id IS NOT NULL THEN RETURN _tpl_id; END IF;

  -- 4: global default
  SELECT id INTO _tpl_id FROM public.official_onboarding_templates
   WHERE is_active AND body_id IS NULL AND appointment_type IS NULL
   ORDER BY is_default DESC, created_at DESC LIMIT 1;
  RETURN _tpl_id;
END $$;

-- =========================================================
-- Trigger: seed onboarding on new term
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_seed_official_onboarding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tpl_id uuid;
  _inst_id uuid;
BEGIN
  _tpl_id := public.pick_official_onboarding_template(NEW.id);
  IF _tpl_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.official_onboarding_instances (term_id, template_id)
  VALUES (NEW.id, _tpl_id)
  ON CONFLICT (term_id) DO NOTHING
  RETURNING id INTO _inst_id;

  IF _inst_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.official_task_instances (
    instance_id, template_task_id, title, description, category, assignee,
    is_required, due_date, completion_signal, sort_order
  )
  SELECT
    _inst_id, tt.id, tt.title, tt.description, tt.category, tt.assignee,
    tt.is_required,
    (NEW.start_date + tt.days_offset)::date,
    tt.completion_signal, tt.sort_order
  FROM public.official_template_tasks tt
  WHERE tt.template_id = _tpl_id
  ORDER BY tt.sort_order;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_seed_official_onboarding
  AFTER INSERT ON public.official_terms
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_official_onboarding();

-- =========================================================
-- Trigger: task completion writes back structured signals
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_official_task_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _term_id uuid;
  _uid uuid := auth.uid();
BEGIN
  IF NEW.status = 'complete' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'complete') THEN
    IF NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
    IF NEW.completed_by IS NULL THEN NEW.completed_by := _uid; END IF;

    SELECT oi.term_id INTO _term_id FROM public.official_onboarding_instances oi WHERE oi.id = NEW.instance_id;
    IF _term_id IS NULL THEN RETURN NEW; END IF;

    IF NEW.completion_signal = 'oath_signed' THEN
      UPDATE public.official_terms
         SET oath_signed_at = COALESCE(oath_signed_at, NEW.completed_at),
             oath_administered_by = COALESCE(oath_administered_by, _uid),
             oath_document_id = COALESCE(oath_document_id, NEW.evidence_document_id),
             status = CASE WHEN status = 'pending' THEN 'active'::public.official_term_status ELSE status END
       WHERE id = _term_id;
    ELSIF NEW.completion_signal = 'bond_filed' THEN
      UPDATE public.official_terms
         SET bond_document_id = COALESCE(bond_document_id, NEW.evidence_document_id)
       WHERE id = _term_id;
    ELSIF NEW.completion_signal IN ('coi_filed','ethics_ack') THEN
      -- Best-effort stub disclosure row when the enum supports these kinds; ignore failures
      BEGIN
        INSERT INTO public.official_disclosures (term_id, kind, filed_at, document_id, notes)
        VALUES (
          _term_id,
          CASE NEW.completion_signal WHEN 'coi_filed' THEN 'conflict_of_interest'::public.official_disclosure_kind
                                     ELSE 'ethics'::public.official_disclosure_kind END,
          NEW.completed_at,
          NEW.evidence_document_id,
          'Auto-recorded from onboarding task: ' || NEW.title
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_oti_signal
  BEFORE INSERT OR UPDATE ON public.official_task_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_official_task_completion();

-- =========================================================
-- Trigger: instance progress rollup + notifications
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_official_onboarding_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inst public.official_onboarding_instances%ROWTYPE;
  _term public.official_terms%ROWTYPE;
  _off record;
  _req int; _done int;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'complete' THEN RETURN NEW; END IF;

  SELECT * INTO _inst FROM public.official_onboarding_instances WHERE id = NEW.instance_id;
  IF _inst.id IS NULL OR _inst.status = 'complete' THEN RETURN NEW; END IF;

  SELECT COUNT(*) FILTER (WHERE is_required),
         COUNT(*) FILTER (WHERE is_required AND status IN ('complete','waived','skipped'))
    INTO _req, _done
    FROM public.official_task_instances WHERE instance_id = _inst.id;

  IF _req > 0 AND _done = _req THEN
    UPDATE public.official_onboarding_instances
       SET status = 'complete', completed_at = now()
     WHERE id = _inst.id;

    SELECT * INTO _term FROM public.official_terms WHERE id = _inst.term_id;
    IF _term.status = 'pending' THEN
      UPDATE public.official_terms SET status = 'active' WHERE id = _term.id;
    END IF;

    SELECT o.first_name, o.last_name, o.user_id, b.name AS body_name, b.slug AS body_slug, s.seat_label
      INTO _off
    FROM public.official_terms t
    JOIN public.officials o ON o.id = t.official_id
    JOIN public.official_seats s ON s.id = t.seat_id
    JOIN public.official_bodies b ON b.id = s.body_id
    WHERE t.id = _term.id;

    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT tgt.user_id, 'official_onboarding_complete',
           'Onboarding complete',
           _off.first_name || ' ' || _off.last_name || ' — ' || _off.body_name || ' · ' || _off.seat_label,
           '/admin-officials?body=' || COALESCE(_off.body_slug,'') || '&term=' || _term.id::text
    FROM public.officials_notify_targets() tgt;

    IF _off.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (_off.user_id, 'official_onboarding_complete',
              'Your onboarding is complete',
              'All required tasks for ' || _off.body_name || ' — ' || _off.seat_label || ' are done.',
              '/my-official-onboarding');
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_oti_progress
  AFTER UPDATE ON public.official_task_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_official_onboarding_progress();

-- =========================================================
-- SEED DATA — three starter templates
-- =========================================================
DO $$
DECLARE
  _tpl_default uuid;
  _tpl_council uuid;
  _tpl_quasi uuid;
BEGIN
  -- Default (global, any appointment)
  INSERT INTO public.official_onboarding_templates (name, description, body_id, appointment_type, is_default, is_active)
  VALUES ('Municipal official — standard onboarding',
          'Baseline packet for any elected or appointed official (oath, ethics, TOMA/PIA training, consent).',
          NULL, NULL, true, true)
  RETURNING id INTO _tpl_default;

  INSERT INTO public.official_template_tasks
    (template_id, title, description, category, assignee, is_required, days_offset, sort_order, completion_signal)
  VALUES
    (_tpl_default, 'Welcome & orientation packet', 'Review welcome letter, meeting calendar, key contacts.', 'orientation', 'official', true, -7, 10, 'none'),
    (_tpl_default, 'Oath of Office administered', 'Statement of Officer signed and oath sworn before an authorized officer.', 'oath', 'clerk', true, 0, 20, 'oath_signed'),
    (_tpl_default, 'Ethics Ordinance acknowledgment', 'Read and sign the city ethics ordinance acknowledgment.', 'ethics', 'official', true, 14, 30, 'ethics_ack'),
    (_tpl_default, 'Chapter 176 conflicts disclosure (CIQ)', 'File Local Gov Code Ch. 176 conflicts questionnaire.', 'disclosure', 'official', true, 30, 40, 'coi_filed'),
    (_tpl_default, 'TOMA training (Open Meetings Act)', 'Complete AG Open Meetings Act training and upload certificate. Required within 90 days.', 'training', 'official', true, 90, 50, 'toma_complete'),
    (_tpl_default, 'PIA training (Public Information Act)', 'Complete AG Public Information Act training and upload certificate. Required within 90 days.', 'training', 'official', true, 90, 60, 'pia_complete'),
    (_tpl_default, 'Roster photo & bio consent', 'Confirm publish consent for public roster photo, bio, and contact info.', 'policy', 'official', false, 30, 70, 'photo_consent'),
    (_tpl_default, 'Meeting portal access provisioned', 'IT provisions agenda/meeting portal login and calendar invites.', 'provisioning', 'it', true, 3, 80, 'none');

  -- Elected council overlay
  INSERT INTO public.official_onboarding_templates (name, description, body_id, appointment_type, is_default, is_active)
  VALUES ('City Council — elected member',
          'Council-specific additions: surety bond, personal financial statement, executive-session briefing.',
          NULL, 'elected', true, true)
  RETURNING id INTO _tpl_council;

  INSERT INTO public.official_template_tasks
    (template_id, title, description, category, assignee, is_required, days_offset, sort_order, completion_signal)
  VALUES
    (_tpl_council, 'Welcome & orientation packet', 'Council orientation binder, procedures, Robert''s Rules refresher.', 'orientation', 'official', true, -7, 10, 'none'),
    (_tpl_council, 'Oath of Office administered', 'Statement of Officer signed and oath sworn before an authorized officer.', 'oath', 'clerk', true, 0, 20, 'oath_signed'),
    (_tpl_council, 'Surety bond filed', 'Post required surety bond with the city secretary; upload evidence.', 'bond', 'clerk', true, 30, 25, 'bond_filed'),
    (_tpl_council, 'Ethics Ordinance acknowledgment', 'Read and sign the city ethics ordinance acknowledgment.', 'ethics', 'official', true, 14, 30, 'ethics_ack'),
    (_tpl_council, 'Chapter 176 conflicts disclosure (CIQ)', 'File Local Gov Code Ch. 176 conflicts questionnaire.', 'disclosure', 'official', true, 30, 40, 'coi_filed'),
    (_tpl_council, 'Personal Financial Statement', 'File Personal Financial Statement per local requirements.', 'disclosure', 'official', true, 45, 45, 'none'),
    (_tpl_council, 'Executive session confidentiality briefing', 'Briefing on Section 551 executive session rules and confidentiality.', 'orientation', 'clerk', true, 14, 47, 'none'),
    (_tpl_council, 'TOMA training (Open Meetings Act)', 'Complete AG training and upload certificate within 90 days.', 'training', 'official', true, 90, 50, 'toma_complete'),
    (_tpl_council, 'PIA training (Public Information Act)', 'Complete AG training and upload certificate within 90 days.', 'training', 'official', true, 90, 60, 'pia_complete'),
    (_tpl_council, 'Roster photo & bio consent', 'Confirm publish consent for public roster photo, bio, and contact info.', 'policy', 'official', false, 30, 70, 'photo_consent'),
    (_tpl_council, 'Meeting portal access provisioned', 'IT provisions agenda portal, council email alias, and calendar invites.', 'provisioning', 'it', true, 3, 80, 'none');

  -- Quasi-judicial (P&Z / ZBA style) overlay
  INSERT INTO public.official_onboarding_templates (name, description, body_id, appointment_type, is_default, is_active)
  VALUES ('Quasi-judicial board — appointed member',
          'For P&Z and ZBA-style boards: adds due-process and ex-parte briefing.',
          NULL, 'appointed', false, true)
  RETURNING id INTO _tpl_quasi;

  INSERT INTO public.official_template_tasks
    (template_id, title, description, category, assignee, is_required, days_offset, sort_order, completion_signal)
  VALUES
    (_tpl_quasi, 'Welcome & orientation packet', 'Board bylaws, meeting calendar, jurisdiction summary.', 'orientation', 'official', true, -7, 10, 'none'),
    (_tpl_quasi, 'Oath of Office administered', 'Statement of Officer signed and oath sworn.', 'oath', 'clerk', true, 0, 20, 'oath_signed'),
    (_tpl_quasi, 'Quasi-judicial due-process briefing', 'Ex-parte communications, findings of fact, record standards.', 'orientation', 'clerk', true, 14, 25, 'none'),
    (_tpl_quasi, 'Ethics Ordinance acknowledgment', 'Read and sign the ethics ordinance acknowledgment.', 'ethics', 'official', true, 14, 30, 'ethics_ack'),
    (_tpl_quasi, 'Chapter 176 conflicts disclosure (CIQ)', 'File Local Gov Code Ch. 176 conflicts questionnaire.', 'disclosure', 'official', true, 30, 40, 'coi_filed'),
    (_tpl_quasi, 'TOMA training', 'Complete AG Open Meetings Act training within 90 days.', 'training', 'official', true, 90, 50, 'toma_complete'),
    (_tpl_quasi, 'PIA training', 'Complete AG Public Information Act training within 90 days.', 'training', 'official', true, 90, 60, 'pia_complete'),
    (_tpl_quasi, 'Roster photo & bio consent', 'Confirm publish consent for public roster.', 'policy', 'official', false, 30, 70, 'photo_consent'),
    (_tpl_quasi, 'Meeting portal access provisioned', 'IT provisions agenda portal access.', 'provisioning', 'it', true, 3, 80, 'none');
END $$;

-- =========================================================
-- BACKFILL: seed instances for every existing term without one
-- =========================================================
DO $$
DECLARE
  _t record;
  _tpl uuid;
  _inst uuid;
BEGIN
  FOR _t IN
    SELECT t.id, t.start_date
    FROM public.official_terms t
    LEFT JOIN public.official_onboarding_instances oi ON oi.term_id = t.id
    WHERE oi.id IS NULL
      AND t.status IN ('pending','active')
  LOOP
    _tpl := public.pick_official_onboarding_template(_t.id);
    IF _tpl IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.official_onboarding_instances (term_id, template_id)
    VALUES (_t.id, _tpl) RETURNING id INTO _inst;

    INSERT INTO public.official_task_instances (
      instance_id, template_task_id, title, description, category, assignee,
      is_required, due_date, completion_signal, sort_order
    )
    SELECT _inst, tt.id, tt.title, tt.description, tt.category, tt.assignee,
           tt.is_required,
           (_t.start_date + tt.days_offset)::date,
           tt.completion_signal, tt.sort_order
      FROM public.official_template_tasks tt
     WHERE tt.template_id = _tpl
     ORDER BY tt.sort_order;
  END LOOP;
END $$;
