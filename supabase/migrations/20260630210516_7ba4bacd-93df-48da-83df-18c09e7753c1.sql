
DO $$ BEGIN CREATE TYPE public.interview_kit_kind AS ENUM ('one_way','live'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.interview_invitation_status AS ENUM ('pending','in_progress','submitted','expired','revoked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.interview_dsr_kind AS ENUM ('export','delete'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.interview_dsr_status AS ENUM ('pending','processing','completed','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.is_panelist_for_interview(_user uuid, _interview uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = _interview AND _user = ANY(i.interviewer_ids));
$$;

CREATE OR REPLACE FUNCTION public.is_iv_manager(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(_uid,'hr_admin'::app_role) OR private.has_role(_uid,'hiring_manager'::app_role);
$$;

ALTER TABLE public.job_requisitions
  ADD COLUMN IF NOT EXISTS interview_retention_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS interview_ai_assist_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.interview_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind public.interview_kit_kind NOT NULL,
  description text,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rubric jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_retention_days integer NOT NULL DEFAULT 90,
  ai_assist_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_kits TO authenticated;
GRANT ALL ON public.interview_kits TO service_role;
ALTER TABLE public.interview_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kits_read_auth" ON public.interview_kits FOR SELECT TO authenticated USING (true);
CREATE POLICY "kits_manage_hr" ON public.interview_kits FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.interview_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  requisition_id uuid REFERENCES public.job_requisitions(id) ON DELETE SET NULL,
  kit_id uuid REFERENCES public.interview_kits(id) ON DELETE SET NULL,
  kind public.interview_kit_kind NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status public.interview_invitation_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  consent_at timestamptz,
  consent_ip text,
  consent_user_agent text,
  aivi_disclosure_ack_at timestamptz,
  accommodation_request jsonb,
  accommodation_approved_at timestamptz,
  device_check jsonb,
  submitted_at timestamptz,
  retention_days integer NOT NULL DEFAULT 90,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iv_inv_app ON public.interview_invitations(application_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_invitations TO authenticated;
GRANT ALL ON public.interview_invitations TO service_role;
ALTER TABLE public.interview_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_hr_all" ON public.interview_invitations FOR ALL TO authenticated
  USING (public.is_iv_manager(auth.uid())) WITH CHECK (public.is_iv_manager(auth.uid()));

CREATE TABLE IF NOT EXISTS public.interview_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.interview_invitations(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  take_number smallint NOT NULL CHECK (take_number BETWEEN 1 AND 2),
  is_final boolean NOT NULL DEFAULT false,
  media_object_path text,
  media_mime text,
  duration_seconds integer,
  transcript text,
  captions_vtt_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitation_id, question_id, take_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_responses TO authenticated;
GRANT ALL ON public.interview_responses TO service_role;
ALTER TABLE public.interview_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resp_hr" ON public.interview_responses FOR ALL TO authenticated
  USING (public.is_iv_manager(auth.uid())) WITH CHECK (public.is_iv_manager(auth.uid()));

CREATE TABLE IF NOT EXISTS public.interview_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  livekit_room_name text NOT NULL UNIQUE,
  livekit_sid text,
  started_at timestamptz,
  ended_at timestamptz,
  egress_id text,
  recording_object_path text,
  recording_duration_seconds integer,
  watermark_text text,
  consent_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  retention_days integer NOT NULL DEFAULT 90,
  ai_captions_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_rooms TO authenticated;
GRANT ALL ON public.interview_rooms TO service_role;
ALTER TABLE public.interview_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms_panel_read" ON public.interview_rooms FOR SELECT TO authenticated USING (
  public.is_iv_manager(auth.uid()) OR public.is_panelist_for_interview(auth.uid(), interview_id)
);
CREATE POLICY "rooms_manage_hr" ON public.interview_rooms FOR ALL TO authenticated
  USING (public.is_iv_manager(auth.uid())) WITH CHECK (public.is_iv_manager(auth.uid()));

CREATE TABLE IF NOT EXISTS public.interview_recording_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_object_path text NOT NULL,
  context text NOT NULL,
  context_id uuid,
  viewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  signed_url_expires_at timestamptz,
  ip text,
  user_agent text
);
GRANT SELECT, INSERT ON public.interview_recording_access TO authenticated;
GRANT ALL ON public.interview_recording_access TO service_role;
ALTER TABLE public.interview_recording_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec_audit_hr_read" ON public.interview_recording_access FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "rec_audit_self_insert" ON public.interview_recording_access FOR INSERT TO authenticated
  WITH CHECK (viewed_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.interview_dsr_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid REFERENCES public.interview_invitations(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  kind public.interview_dsr_kind NOT NULL,
  status public.interview_dsr_status NOT NULL DEFAULT 'pending',
  requested_email text,
  notes text,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.interview_dsr_requests TO authenticated;
GRANT ALL ON public.interview_dsr_requests TO service_role;
ALTER TABLE public.interview_dsr_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dsr_hr_all" ON public.interview_dsr_requests FOR ALL TO authenticated
  USING (public.is_iv_manager(auth.uid())) WITH CHECK (public.is_iv_manager(auth.uid()));

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS invitation_id uuid REFERENCES public.interview_invitations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind text;

CREATE OR REPLACE FUNCTION public.tg_iv_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS t_kits_touch ON public.interview_kits;
CREATE TRIGGER t_kits_touch BEFORE UPDATE ON public.interview_kits FOR EACH ROW EXECUTE FUNCTION public.tg_iv_touch_updated_at();
DROP TRIGGER IF EXISTS t_inv_touch ON public.interview_invitations;
CREATE TRIGGER t_inv_touch BEFORE UPDATE ON public.interview_invitations FOR EACH ROW EXECUTE FUNCTION public.tg_iv_touch_updated_at();
DROP TRIGGER IF EXISTS t_rooms_touch ON public.interview_rooms;
CREATE TRIGGER t_rooms_touch BEFORE UPDATE ON public.interview_rooms FOR EACH ROW EXECUTE FUNCTION public.tg_iv_touch_updated_at();
