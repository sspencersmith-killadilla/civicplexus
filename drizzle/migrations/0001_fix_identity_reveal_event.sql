CREATE OR REPLACE FUNCTION public.tg_applicant_identity_reveal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('interview','offer','hired') AND NEW.identity_revealed_at IS NULL THEN
    NEW.identity_revealed_at := now();
    INSERT INTO public.job_application_events (application_id, actor_id, event_type, from_status, to_status, payload)
    VALUES (NEW.id, auth.uid(), 'identity_revealed', OLD.status, NEW.status, '{}'::jsonb);
  END IF;
  RETURN NEW;
END $$;