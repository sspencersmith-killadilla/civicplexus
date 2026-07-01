
-- Helper: fanout targets = every hr_admin + city_clerk user
CREATE OR REPLACE FUNCTION public.officials_notify_targets()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ur.user_id
  FROM public.user_roles ur
  WHERE ur.role IN ('hr_admin','city_clerk');
$$;

REVOKE ALL ON FUNCTION public.officials_notify_targets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.officials_notify_targets() TO authenticated, service_role;

-- Daily sweep: term expirations within 120 days
CREATE OR REPLACE FUNCTION public.notify_officials_expiring()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
  v_link text;
  v_title text;
  v_body text;
  v_days integer;
BEGIN
  FOR r IN
    SELECT t.id AS term_id, t.end_date,
           o.first_name, o.last_name,
           s.seat_label,
           b.name AS body_name, b.slug AS body_slug
    FROM public.official_terms t
    JOIN public.official_seats s ON s.id = t.seat_id
    JOIN public.official_bodies b ON b.id = s.body_id
    JOIN public.officials o ON o.id = t.official_id
    WHERE t.status = 'active'
      AND t.end_date IS NOT NULL
      AND t.end_date <= (CURRENT_DATE + INTERVAL '120 days')
      AND t.end_date >= CURRENT_DATE
  LOOP
    v_days := (r.end_date - CURRENT_DATE);
    v_link := '/admin-officials?body=' || r.body_slug || '&term=' || r.term_id::text;
    v_title := 'Term ending in ' || v_days || ' day' || CASE WHEN v_days = 1 THEN '' ELSE 's' END;
    v_body := r.first_name || ' ' || r.last_name || ' — ' || r.body_name
              || ' · ' || r.seat_label || ' (ends ' || to_char(r.end_date, 'YYYY-MM-DD') || ')';

    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT tgt.user_id, 'official_term_expiring', v_title, v_body, v_link
    FROM public.officials_notify_targets() tgt
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = tgt.user_id
        AND n.type = 'official_term_expiring'
        AND n.link = v_link
        AND n.created_at > (now() - INTERVAL '30 days')
    );

    GET DIAGNOSTICS v_count = ROW_COUNT;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_officials_expiring() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_officials_expiring() TO service_role;

-- Immediate trigger: resignation / removal
CREATE OR REPLACE FUNCTION public.notify_official_term_ended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link text;
  v_title text;
  v_body text;
  r_body text;
  r_slug text;
  r_seat text;
  r_first text;
  r_last text;
BEGIN
  IF NEW.status IN ('resigned','removed') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT b.name, b.slug, s.seat_label, o.first_name, o.last_name
      INTO r_body, r_slug, r_seat, r_first, r_last
    FROM public.official_seats s
    JOIN public.official_bodies b ON b.id = s.body_id
    JOIN public.officials o ON o.id = NEW.official_id
    WHERE s.id = NEW.seat_id;

    v_link := '/admin-officials?body=' || COALESCE(r_slug,'') || '&term=' || NEW.id::text;
    v_title := CASE NEW.status WHEN 'resigned' THEN 'Resignation recorded' ELSE 'Term ended (removed)' END;
    v_body := COALESCE(r_first,'') || ' ' || COALESCE(r_last,'') || ' — ' || COALESCE(r_body,'')
              || ' · ' || COALESCE(r_seat,'')
              || COALESCE(' — ' || NEW.ended_reason, '');

    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT tgt.user_id,
           'official_term_' || NEW.status,
           v_title, v_body, v_link
    FROM public.officials_notify_targets() tgt;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_official_term_ended ON public.official_terms;
CREATE TRIGGER trg_notify_official_term_ended
AFTER UPDATE OF status ON public.official_terms
FOR EACH ROW
EXECUTE FUNCTION public.notify_official_term_ended();

-- Daily pg_cron schedule (SQL-only — no external endpoint needed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('officials-expiring-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'officials-expiring-daily');
    PERFORM cron.schedule(
      'officials-expiring-daily',
      '15 13 * * *',  -- 13:15 UTC daily ≈ 07:15/08:15 US Central
      $cron$ SELECT public.notify_officials_expiring(); $cron$
    );
  END IF;
END $$;
