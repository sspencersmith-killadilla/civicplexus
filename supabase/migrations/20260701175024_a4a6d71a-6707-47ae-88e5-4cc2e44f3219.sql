
-- 1. New pay-rule columns on the body
ALTER TABLE public.official_bodies
  ADD COLUMN IF NOT EXISTS chair_bonus_amount numeric,
  ADD COLUMN IF NOT EXISTS per_diem_amount numeric,
  ADD COLUMN IF NOT EXISTS pay_absent boolean NOT NULL DEFAULT false;

-- 2. Reimbursement dedup / provenance columns
ALTER TABLE public.officials_reimbursements
  ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES public.official_meetings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendance_id uuid REFERENCES public.official_attendance(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pay_kind text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reimb_attendance_kind
  ON public.officials_reimbursements(attendance_id, pay_kind)
  WHERE attendance_id IS NOT NULL AND pay_kind IS NOT NULL;

-- 3. Generator RPC
CREATE OR REPLACE FUNCTION public.generate_meeting_reimbursements(
  p_body_id uuid,
  p_from date,
  p_to date
) RETURNS TABLE(created integer, skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created integer := 0;
  v_skipped integer := 0;
  v_uid uuid := auth.uid();
  b record;
  r record;
  v_term_id uuid;
  v_base numeric;
  v_bonus numeric;
  v_diem numeric;
BEGIN
  IF NOT public.can_manage_officials(v_uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id, comp_model, per_meeting_amount, chair_bonus_amount, per_diem_amount, pay_absent
    INTO b FROM public.official_bodies WHERE id = p_body_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Body not found'; END IF;
  IF b.comp_model NOT IN ('per_meeting','mixed') AND COALESCE(b.per_diem_amount,0) = 0 THEN
    RAISE EXCEPTION 'Body compensation model does not support per-meeting generation';
  END IF;

  FOR r IN
    SELECT m.id AS meeting_id, m.meeting_date, a.id AS attendance_id, a.official_id, a.present, s.is_chair
    FROM public.official_meetings m
    JOIN public.official_attendance a ON a.meeting_id = m.id
    JOIN public.official_terms t ON t.official_id = a.official_id
      AND t.status IN ('active','resigned','removed','expired')
      AND t.start_date <= m.meeting_date
      AND (t.end_date IS NULL OR t.end_date >= m.meeting_date)
    JOIN public.official_seats s ON s.id = t.seat_id
    WHERE m.body_id = p_body_id
      AND m.meeting_date BETWEEN p_from AND p_to
      AND (a.present OR b.pay_absent)
  LOOP
    -- Term at time of meeting
    SELECT t.id INTO v_term_id
    FROM public.official_terms t
    JOIN public.official_seats s ON s.id = t.seat_id
    WHERE t.official_id = r.official_id
      AND s.body_id = p_body_id
      AND t.start_date <= r.meeting_date
      AND (t.end_date IS NULL OR t.end_date >= r.meeting_date)
    ORDER BY t.start_date DESC LIMIT 1;
    IF v_term_id IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    v_base  := COALESCE(b.per_meeting_amount, 0);
    v_bonus := CASE WHEN r.is_chair THEN COALESCE(b.chair_bonus_amount, 0) ELSE 0 END;
    v_diem  := COALESCE(b.per_diem_amount, 0);

    IF (v_base + v_bonus) > 0 THEN
      BEGIN
        INSERT INTO public.officials_reimbursements
          (term_id, incurred_date, amount, purpose, status, created_by,
           meeting_id, attendance_id, pay_kind)
        VALUES
          (v_term_id, r.meeting_date, v_base + v_bonus,
           'Meeting stipend' || CASE WHEN r.is_chair AND v_bonus > 0 THEN ' (chair)' ELSE '' END
             || CASE WHEN NOT r.present THEN ' — absent' ELSE '' END,
           'pending', v_uid, r.meeting_id, r.attendance_id, 'meeting_stipend');
        v_created := v_created + 1;
      EXCEPTION WHEN unique_violation THEN v_skipped := v_skipped + 1;
      END;
    END IF;

    IF v_diem > 0 AND r.present THEN
      BEGIN
        INSERT INTO public.officials_reimbursements
          (term_id, incurred_date, amount, purpose, status, created_by,
           meeting_id, attendance_id, pay_kind)
        VALUES
          (v_term_id, r.meeting_date, v_diem, 'Per-diem / travel',
           'pending', v_uid, r.meeting_id, r.attendance_id, 'per_diem');
        v_created := v_created + 1;
      EXCEPTION WHEN unique_violation THEN v_skipped := v_skipped + 1;
      END;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_created, v_skipped;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_meeting_reimbursements(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_meeting_reimbursements(uuid, date, date) TO authenticated, service_role;
