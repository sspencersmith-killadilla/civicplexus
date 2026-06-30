ALTER TABLE public.interview_invitations ADD COLUMN IF NOT EXISTS purge_at timestamptz;
CREATE INDEX IF NOT EXISTS ii_purge_idx ON public.interview_invitations(purge_at);

CREATE OR REPLACE FUNCTION public.tg_interview_purge_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.submitted_at IS NOT NULL AND NEW.purge_at IS NULL THEN
    NEW.purge_at := NEW.submitted_at + (COALESCE(NEW.retention_days,90) || ' days')::interval;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS interview_purge_at ON public.interview_invitations;
CREATE TRIGGER interview_purge_at BEFORE INSERT OR UPDATE ON public.interview_invitations FOR EACH ROW EXECUTE FUNCTION public.tg_interview_purge_at();

DROP POLICY IF EXISTS interview_media_hr_read ON storage.objects;
CREATE POLICY interview_media_hr_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('interview-media-oneway','interview-media-live') AND (private.has_role(auth.uid(), 'hr_admin'::public.app_role) OR private.has_role(auth.uid(), 'hiring_manager'::public.app_role)));
DROP POLICY IF EXISTS interview_media_hr_delete ON storage.objects;
CREATE POLICY interview_media_hr_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('interview-media-oneway','interview-media-live') AND private.has_role(auth.uid(), 'hr_admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.purge_expired_interview_media() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE rec record; purged int := 0;
BEGIN
  FOR rec IN
    SELECT r.id, r.media_object_path
    FROM public.interview_responses r
    JOIN public.interview_invitations i ON i.id = r.invitation_id
    WHERE i.purge_at IS NOT NULL AND i.purge_at < now() AND r.media_object_path IS NOT NULL
  LOOP
    DELETE FROM storage.objects WHERE bucket_id = 'interview-media-oneway' AND name = rec.media_object_path;
    UPDATE public.interview_responses SET media_object_path = NULL, transcript = NULL, captions_vtt_path = NULL WHERE id = rec.id;
    purged := purged + 1;
  END LOOP;
  RETURN purged;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('purge_interview_media_daily', '0 4 * * *', $cron$SELECT public.purge_expired_interview_media();$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;