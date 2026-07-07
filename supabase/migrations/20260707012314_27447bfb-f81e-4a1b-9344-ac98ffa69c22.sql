CREATE OR REPLACE FUNCTION public.is_active_body_reviewer(_uid uuid, _body_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.officials o
      JOIN public.official_terms t ON t.official_id = o.id
      JOIN public.official_seats s ON s.id = t.seat_id
     WHERE o.user_id = _uid
       AND s.body_id = _body_id
       AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
       AND (t.ended_at IS NULL)
       AND (t.status IS NULL OR t.status IN ('active','pending'))
  );
$$;

DROP POLICY IF EXISTS bas_read_own ON public.board_application_scores;
CREATE POLICY bas_read_own
  ON public.board_application_scores FOR SELECT TO authenticated
  USING (
    public.is_clerk_or_hr(auth.uid())
    OR (scorer_user_id = auth.uid() AND public.is_active_body_reviewer(auth.uid(), body_id))
  );

DROP POLICY IF EXISTS bas_update_own ON public.board_application_scores;
CREATE POLICY bas_update_own
  ON public.board_application_scores FOR UPDATE TO authenticated
  USING (
    public.is_clerk_or_hr(auth.uid())
    OR (scorer_user_id = auth.uid() AND public.is_active_body_reviewer(auth.uid(), body_id))
  )
  WITH CHECK (
    public.is_clerk_or_hr(auth.uid())
    OR (scorer_user_id = auth.uid() AND public.is_active_body_reviewer(auth.uid(), body_id))
  );

DROP POLICY IF EXISTS bas_delete_own ON public.board_application_scores;
CREATE POLICY bas_delete_own
  ON public.board_application_scores FOR DELETE TO authenticated
  USING (
    public.is_clerk_or_hr(auth.uid())
    OR (scorer_user_id = auth.uid() AND public.is_active_body_reviewer(auth.uid(), body_id))
  );