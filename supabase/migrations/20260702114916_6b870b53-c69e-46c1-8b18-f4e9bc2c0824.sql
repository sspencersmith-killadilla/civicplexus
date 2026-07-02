ALTER TABLE public.official_bodies
  ADD COLUMN IF NOT EXISTS accepting_applications boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS application_instructions text;

CREATE OR REPLACE FUNCTION public.is_clerk_or_hr(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.has_role(_uid, 'hr_admin'::app_role) OR private.has_role(_uid, 'city_clerk'::app_role)
$$;

CREATE TABLE public.board_application_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  address text,
  city text,
  state text,
  postal_code text,
  employer text,
  occupation text,
  qualifications text,
  statement text,
  conflicts_disclosure text,
  cover_letter_path text,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','shortlisted','approved','declined','withdrawn')),
  status_token text UNIQUE,
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id),
  decision_notes text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_application_submissions TO authenticated;
GRANT ALL ON public.board_application_submissions TO service_role;
ALTER TABLE public.board_application_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read_board_apps" ON public.board_application_submissions
FOR SELECT TO authenticated USING (public.is_clerk_or_hr(auth.uid()));
CREATE POLICY "staff_update_board_apps" ON public.board_application_submissions
FOR UPDATE TO authenticated USING (public.is_clerk_or_hr(auth.uid())) WITH CHECK (public.is_clerk_or_hr(auth.uid()));

CREATE TABLE public.board_application_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.board_application_submissions(id) ON DELETE CASCADE,
  body_id uuid NOT NULL REFERENCES public.official_bodies(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  seat_id uuid REFERENCES public.official_seats(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, body_id)
);
CREATE INDEX idx_bai_submission ON public.board_application_interests(submission_id);
CREATE INDEX idx_bai_body ON public.board_application_interests(body_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_application_interests TO authenticated;
GRANT ALL ON public.board_application_interests TO service_role;
ALTER TABLE public.board_application_interests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read_interests" ON public.board_application_interests
FOR SELECT TO authenticated USING (public.is_clerk_or_hr(auth.uid()));
CREATE POLICY "staff_write_interests" ON public.board_application_interests
FOR ALL TO authenticated USING (public.is_clerk_or_hr(auth.uid())) WITH CHECK (public.is_clerk_or_hr(auth.uid()));

CREATE TABLE public.board_application_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.board_application_submissions(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_baa_submission ON public.board_application_audit(submission_id);
GRANT SELECT, INSERT ON public.board_application_audit TO authenticated;
GRANT ALL ON public.board_application_audit TO service_role;
ALTER TABLE public.board_application_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read_audit" ON public.board_application_audit
FOR SELECT TO authenticated USING (public.is_clerk_or_hr(auth.uid()));
CREATE POLICY "staff_insert_audit" ON public.board_application_audit
FOR INSERT TO authenticated WITH CHECK (public.is_clerk_or_hr(auth.uid()));

CREATE TABLE public.candidate_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id uuid REFERENCES public.official_seats(id),
  seat_label text,
  election_date date,
  candidate_first_name text NOT NULL,
  candidate_last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  address text,
  packet_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','verified','deficient','withdrawn')),
  clerk_notes text,
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_filings TO authenticated;
GRANT ALL ON public.candidate_filings TO service_role;
ALTER TABLE public.candidate_filings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read_filings" ON public.candidate_filings
FOR SELECT TO authenticated USING (public.is_clerk_or_hr(auth.uid()));
CREATE POLICY "staff_write_filings" ON public.candidate_filings
FOR ALL TO authenticated USING (public.is_clerk_or_hr(auth.uid())) WITH CHECK (public.is_clerk_or_hr(auth.uid()));

CREATE TRIGGER trg_bas_updated_at BEFORE UPDATE ON public.board_application_submissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cf_updated_at BEFORE UPDATE ON public.candidate_filings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();