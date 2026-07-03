
CREATE TABLE public.board_application_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.board_application_submissions(id) ON DELETE CASCADE,
  body_id uuid NOT NULL REFERENCES public.official_bodies(id) ON DELETE CASCADE,
  scorer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, body_id, scorer_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_application_scores TO authenticated;
GRANT ALL ON public.board_application_scores TO service_role;

ALTER TABLE public.board_application_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY bas_read_own ON public.board_application_scores
  FOR SELECT TO authenticated
  USING (scorer_user_id = auth.uid() OR public.is_clerk_or_hr(auth.uid()));

CREATE POLICY bas_write_own ON public.board_application_scores
  FOR INSERT TO authenticated
  WITH CHECK (scorer_user_id = auth.uid());

CREATE POLICY bas_update_own ON public.board_application_scores
  FOR UPDATE TO authenticated
  USING (scorer_user_id = auth.uid())
  WITH CHECK (scorer_user_id = auth.uid());

CREATE POLICY bas_delete_own ON public.board_application_scores
  FOR DELETE TO authenticated
  USING (scorer_user_id = auth.uid() OR public.is_clerk_or_hr(auth.uid()));

CREATE TRIGGER trg_bas_updated
  BEFORE UPDATE ON public.board_application_scores
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_bas_submission ON public.board_application_scores(submission_id);
CREATE INDEX idx_bas_body ON public.board_application_scores(body_id);
