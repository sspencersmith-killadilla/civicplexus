
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'elected_official';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'city_clerk';
COMMIT;
BEGIN;

INSERT INTO public.permission_keys(key, label, category, description) VALUES
  ('officials.read',               'Read officials',            'Officials', 'View bodies, seats, terms, officials'),
  ('officials.write',              'Manage officials',          'Officials', 'Create/edit bodies, seats, terms, swearing-in'),
  ('officials.publish_roster',     'Publish roster',            'Officials', 'Toggle a body public/internal'),
  ('officials.disclosures.review', 'Review disclosures',        'Officials', 'Review financial and ethics disclosures'),
  ('officials.stipend.approve',    'Approve stipend runs',      'Officials', 'Generate and approve stipend payroll lines'),
  ('officials.attendance.record',  'Record meeting attendance', 'Officials', 'Mark attendance for board/commission meetings')
ON CONFLICT (key) DO NOTHING;

DO $$ BEGIN CREATE TYPE public.official_body_kind AS ENUM ('council','board','commission','authority','committee'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.official_comp_model AS ENUM ('unpaid','fixed_stipend','per_meeting','mixed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.official_appointment_type AS ENUM ('elected','appointed','ex_officio'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.official_term_status AS ENUM ('pending','active','expired','resigned','removed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.official_disclosure_kind AS ENUM ('sfi','ch176','ethics_attest','oma_training','pia_training'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.official_disclosure_status AS ENUM ('pending','submitted','reviewed','waived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.official_reimb_status AS ENUM ('draft','submitted','approved','denied','paid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.can_manage_officials(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,private AS $$
  SELECT private.has_role(_uid,'hr_admin'::app_role)
      OR private.has_role(_uid,'city_clerk'::app_role);
$$;

-- Bodies
CREATE TABLE public.official_bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  kind public.official_body_kind NOT NULL DEFAULT 'board',
  description text,
  comp_model public.official_comp_model NOT NULL DEFAULT 'unpaid',
  fixed_stipend_amount numeric(12,2),
  fixed_stipend_period text CHECK (fixed_stipend_period IN ('monthly','annual','per_pay_period')),
  per_meeting_amount numeric(12,2),
  meeting_cadence text,
  roster_public boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_bodies TO authenticated;
GRANT SELECT ON public.official_bodies TO anon;
GRANT ALL ON public.official_bodies TO service_role;
ALTER TABLE public.official_bodies ENABLE ROW LEVEL SECURITY;
CREATE POLICY ob_public_read ON public.official_bodies FOR SELECT TO anon USING (roster_public = true);
CREATE POLICY ob_auth_read   ON public.official_bodies FOR SELECT TO authenticated USING (true);
CREATE POLICY ob_manage      ON public.official_bodies FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid())) WITH CHECK (public.can_manage_officials(auth.uid()));
CREATE TRIGGER trg_ob_updated BEFORE UPDATE ON public.official_bodies FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seats
CREATE TABLE public.official_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id uuid NOT NULL REFERENCES public.official_bodies(id) ON DELETE CASCADE,
  seat_label text NOT NULL,
  seat_number int,
  is_chair boolean NOT NULL DEFAULT false,
  is_ex_officio boolean NOT NULL DEFAULT false,
  term_length_months int,
  appointing_authority text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (body_id, seat_label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_seats TO authenticated;
GRANT SELECT ON public.official_seats TO anon;
GRANT ALL ON public.official_seats TO service_role;
ALTER TABLE public.official_seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY os_public_read ON public.official_seats FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.official_bodies b WHERE b.id = body_id AND b.roster_public));
CREATE POLICY os_auth_read ON public.official_seats FOR SELECT TO authenticated USING (true);
CREATE POLICY os_manage ON public.official_seats FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid())) WITH CHECK (public.can_manage_officials(auth.uid()));
CREATE TRIGGER trg_os_updated BEFORE UPDATE ON public.official_seats FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Officials (no public-read policy yet — added after terms table exists)
CREATE TABLE public.officials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  preferred_name text,
  email text,
  phone text,
  bio text,
  photo_path text,
  publish_contact boolean NOT NULL DEFAULT false,
  publish_photo boolean NOT NULL DEFAULT false,
  publish_bio boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.officials TO authenticated;
GRANT SELECT ON public.officials TO anon;
GRANT ALL ON public.officials TO service_role;
ALTER TABLE public.officials ENABLE ROW LEVEL SECURITY;
CREATE POLICY of_auth_read ON public.officials FOR SELECT TO authenticated USING (true);
CREATE POLICY of_self_update ON public.officials FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY of_manage ON public.officials FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid())) WITH CHECK (public.can_manage_officials(auth.uid()));
CREATE TRIGGER trg_of_updated BEFORE UPDATE ON public.officials FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Terms
CREATE TABLE public.official_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_id uuid NOT NULL REFERENCES public.officials(id) ON DELETE CASCADE,
  seat_id uuid NOT NULL REFERENCES public.official_seats(id) ON DELETE RESTRICT,
  appointment_type public.official_appointment_type NOT NULL DEFAULT 'appointed',
  start_date date NOT NULL,
  end_date date,
  status public.official_term_status NOT NULL DEFAULT 'pending',
  appointing_authority text,
  oath_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  oath_signed_at timestamptz,
  oath_administered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  bond_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  bond_amount numeric(12,2),
  ended_reason text,
  ended_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_official_terms_seat_status ON public.official_terms(seat_id, status);
CREATE INDEX idx_official_terms_official ON public.official_terms(official_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_terms TO authenticated;
GRANT SELECT ON public.official_terms TO anon;
GRANT ALL ON public.official_terms TO service_role;
ALTER TABLE public.official_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY ot_public_read ON public.official_terms FOR SELECT TO anon
  USING (status='active' AND EXISTS (
    SELECT 1 FROM public.official_seats s JOIN public.official_bodies b ON b.id=s.body_id
    WHERE s.id = seat_id AND b.roster_public));
CREATE POLICY ot_auth_read ON public.official_terms FOR SELECT TO authenticated USING (true);
CREATE POLICY ot_manage ON public.official_terms FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid())) WITH CHECK (public.can_manage_officials(auth.uid()));
CREATE TRIGGER trg_ot_updated BEFORE UPDATE ON public.official_terms FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Now that official_terms exists, add anon-read policy on officials
CREATE POLICY of_public_read ON public.officials FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.official_terms t
    JOIN public.official_seats s ON s.id = t.seat_id
    JOIN public.official_bodies b ON b.id = s.body_id
    WHERE t.official_id = officials.id AND t.status='active' AND b.roster_public));

-- Disclosures
CREATE TABLE public.official_disclosures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.official_terms(id) ON DELETE CASCADE,
  kind public.official_disclosure_kind NOT NULL,
  cycle_year int NOT NULL,
  due_date date,
  status public.official_disclosure_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, kind, cycle_year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_disclosures TO authenticated;
GRANT ALL ON public.official_disclosures TO service_role;
ALTER TABLE public.official_disclosures ENABLE ROW LEVEL SECURITY;
CREATE POLICY od_manage ON public.official_disclosures FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid())) WITH CHECK (public.can_manage_officials(auth.uid()));
CREATE POLICY od_self_read ON public.official_disclosures FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.official_terms t JOIN public.officials o ON o.id=t.official_id
                  WHERE t.id = term_id AND o.user_id = auth.uid()));
CREATE POLICY od_self_write ON public.official_disclosures FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.official_terms t JOIN public.officials o ON o.id=t.official_id
                  WHERE t.id = term_id AND o.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.official_terms t JOIN public.officials o ON o.id=t.official_id
                       WHERE t.id = term_id AND o.user_id = auth.uid()));
CREATE TRIGGER trg_od_updated BEFORE UPDATE ON public.official_disclosures FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Meetings
CREATE TABLE public.official_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id uuid NOT NULL REFERENCES public.official_bodies(id) ON DELETE CASCADE,
  meeting_date date NOT NULL,
  title text,
  agenda_url text,
  minutes_url text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_official_meetings_body_date ON public.official_meetings(body_id, meeting_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_meetings TO authenticated;
GRANT SELECT ON public.official_meetings TO anon;
GRANT ALL ON public.official_meetings TO service_role;
ALTER TABLE public.official_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY om_public_read ON public.official_meetings FOR SELECT TO anon
  USING (is_public AND EXISTS (SELECT 1 FROM public.official_bodies b WHERE b.id=body_id AND b.roster_public));
CREATE POLICY om_auth_read ON public.official_meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY om_manage ON public.official_meetings FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid())) WITH CHECK (public.can_manage_officials(auth.uid()));
CREATE TRIGGER trg_om_updated BEFORE UPDATE ON public.official_meetings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Attendance
CREATE TABLE public.official_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.official_meetings(id) ON DELETE CASCADE,
  official_id uuid NOT NULL REFERENCES public.officials(id) ON DELETE CASCADE,
  present boolean NOT NULL DEFAULT true,
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, official_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_attendance TO authenticated;
GRANT ALL ON public.official_attendance TO service_role;
ALTER TABLE public.official_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY oa_manage ON public.official_attendance FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid())) WITH CHECK (public.can_manage_officials(auth.uid()));
CREATE POLICY oa_self_read ON public.official_attendance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.officials o WHERE o.id=official_id AND o.user_id=auth.uid()));

-- Reimbursements
CREATE TABLE public.officials_reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.official_terms(id) ON DELETE CASCADE,
  incurred_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  purpose text NOT NULL,
  receipt_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  status public.official_reimb_status NOT NULL DEFAULT 'draft',
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.officials_reimbursements TO authenticated;
GRANT ALL ON public.officials_reimbursements TO service_role;
ALTER TABLE public.officials_reimbursements ENABLE ROW LEVEL SECURITY;
CREATE POLICY orx_manage ON public.officials_reimbursements FOR ALL TO authenticated
  USING (public.can_manage_officials(auth.uid())) WITH CHECK (public.can_manage_officials(auth.uid()));
CREATE POLICY orx_self_read ON public.officials_reimbursements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.official_terms t JOIN public.officials o ON o.id=t.official_id
                  WHERE t.id = term_id AND o.user_id = auth.uid()));
CREATE POLICY orx_self_insert ON public.officials_reimbursements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.official_terms t JOIN public.officials o ON o.id=t.official_id
                       WHERE t.id = term_id AND o.user_id = auth.uid()));
CREATE TRIGGER trg_orx_updated BEFORE UPDATE ON public.officials_reimbursements FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Audit
CREATE OR REPLACE FUNCTION public.tg_official_term_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.audit_events(actor_id, action, entity, entity_id, diff)
    VALUES (auth.uid(), 'official_term_created', 'official_term', NEW.id,
            jsonb_build_object('seat_id', NEW.seat_id, 'official_id', NEW.official_id,
                               'start_date', NEW.start_date, 'end_date', NEW.end_date, 'status', NEW.status));
  ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_events(actor_id, action, entity, entity_id, diff)
    VALUES (auth.uid(), 'official_term_status_changed', 'official_term', NEW.id,
            jsonb_build_object('from', OLD.status, 'to', NEW.status, 'reason', NEW.ended_reason));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ot_audit AFTER INSERT OR UPDATE ON public.official_terms
  FOR EACH ROW EXECUTE FUNCTION public.tg_official_term_audit();

COMMIT;
BEGIN;

INSERT INTO public.official_bodies (slug, name, kind, comp_model, fixed_stipend_amount, fixed_stipend_period, per_meeting_amount, roster_public, meeting_cadence, sort_order) VALUES
 ('city-council',    'City Council',                'council',    'fixed_stipend', 100.00, 'monthly', NULL,  true, '1st & 3rd Tuesdays', 10),
 ('planning-zoning', 'Planning & Zoning Commission','commission', 'per_meeting',   NULL,   NULL,      50.00, true, '2nd Wednesday',      20),
 ('library-board',   'Library Board of Trustees',   'board',      'unpaid',        NULL,   NULL,      NULL,  true, 'Monthly',            30),
 ('parks-rec-board', 'Parks & Recreation Board',    'board',      'unpaid',        NULL,   NULL,      NULL,  true, 'Monthly',            40)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.official_seats (body_id, seat_label, seat_number, is_chair, term_length_months, appointing_authority)
SELECT b.id, s.label, s.num, s.chair, 48, 'Voters'
FROM public.official_bodies b,
     (VALUES ('Mayor',0,true),('Place 1',1,false),('Place 2',2,false),('Place 3',3,false),
             ('Place 4',4,false),('Place 5',5,false),('Place 6',6,false)) AS s(label,num,chair)
WHERE b.slug='city-council' ON CONFLICT DO NOTHING;

INSERT INTO public.official_seats (body_id, seat_label, seat_number, is_chair, term_length_months, appointing_authority)
SELECT b.id, s.label, s.num, s.chair, 24, 'City Council'
FROM public.official_bodies b,
     (VALUES ('Chair',1,true),('Place 2',2,false),('Place 3',3,false),('Place 4',4,false),('Place 5',5,false)) AS s(label,num,chair)
WHERE b.slug='planning-zoning' ON CONFLICT DO NOTHING;

INSERT INTO public.official_seats (body_id, seat_label, seat_number, is_chair, term_length_months, appointing_authority)
SELECT b.id, s.label, s.num, s.chair, 36, 'City Council'
FROM public.official_bodies b,
     (VALUES ('Chair',1,true),('Vice Chair',2,false),('Place 3',3,false),('Place 4',4,false),
             ('Place 5',5,false),('Place 6',6,false),('Place 7',7,false)) AS s(label,num,chair)
WHERE b.slug='library-board' ON CONFLICT DO NOTHING;

INSERT INTO public.official_seats (body_id, seat_label, seat_number, is_chair, term_length_months, appointing_authority)
SELECT b.id, s.label, s.num, s.chair, 24, 'City Council'
FROM public.official_bodies b,
     (VALUES ('Chair',1,true),('Place 2',2,false),('Place 3',3,false),('Place 4',4,false),('Place 5',5,false)) AS s(label,num,chair)
WHERE b.slug='parks-rec-board' ON CONFLICT DO NOTHING;

COMMIT;
