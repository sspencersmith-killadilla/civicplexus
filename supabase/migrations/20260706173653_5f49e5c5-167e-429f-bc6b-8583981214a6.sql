
-- 1. PAF action lines
CREATE TABLE public.paf_action_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paf_id uuid NOT NULL REFERENCES public.personnel_actions(id) ON DELETE CASCADE,
  ordinal integer NOT NULL DEFAULT 1,
  action_type text NOT NULL,
  effective_date date NOT NULL,
  before_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | denied | applied
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_paf_action_lines_paf ON public.paf_action_lines(paf_id, ordinal);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paf_action_lines TO authenticated;
GRANT ALL ON public.paf_action_lines TO service_role;
ALTER TABLE public.paf_action_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read paf lines via parent"
ON public.paf_action_lines FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.personnel_actions p WHERE p.id = paf_id));

CREATE POLICY "hr or initiator writes paf lines"
ON public.paf_action_lines FOR ALL TO authenticated
USING (
  private.has_role(auth.uid(), 'hr_admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.personnel_actions p WHERE p.id = paf_id AND p.initiated_by = auth.uid())
)
WITH CHECK (
  private.has_role(auth.uid(), 'hr_admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.personnel_actions p WHERE p.id = paf_id AND p.initiated_by = auth.uid())
);

-- 2. Per-line approval votes
CREATE TABLE public.approval_step_line_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.approval_steps(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES public.paf_action_lines(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved','denied')),
  note text,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (step_id, line_id)
);
CREATE INDEX idx_line_votes_step ON public.approval_step_line_votes(step_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_step_line_votes TO authenticated;
GRANT ALL ON public.approval_step_line_votes TO service_role;
ALTER TABLE public.approval_step_line_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read line votes"
ON public.approval_step_line_votes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.approval_steps s WHERE s.id = step_id));

CREATE POLICY "assigned approver writes own vote"
ON public.approval_step_line_votes FOR INSERT TO authenticated
WITH CHECK (
  decided_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.approval_steps s WHERE s.id = step_id AND (s.approver_id = auth.uid() OR private.has_role(auth.uid(),'hr_admin'::app_role)))
);
CREATE POLICY "assigned approver updates own vote"
ON public.approval_step_line_votes FOR UPDATE TO authenticated
USING (decided_by = auth.uid() OR private.has_role(auth.uid(),'hr_admin'::app_role))
WITH CHECK (decided_by = auth.uid() OR private.has_role(auth.uid(),'hr_admin'::app_role));

-- 3. Volunteers: archived_at + interests
ALTER TABLE public.volunteers
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}'::text[];

-- 4. Vendors: archived_at
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 5. Email templates: is_custom + category
ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category text;

-- 6. Job requisitions: icon
ALTER TABLE public.job_requisitions
  ADD COLUMN IF NOT EXISTS icon text;

-- 7. AI settings (single row)
CREATE TABLE public.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  default_model text NOT NULL DEFAULT 'openai/gpt-5.5',
  feature_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  byok jsonb NOT NULL DEFAULT '{}'::jsonb, -- {provider, secret_name, base_url?}
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read ai settings"
ON public.ai_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write ai settings"
ON public.ai_settings FOR ALL TO authenticated
USING (private.has_role(auth.uid(),'hr_admin'::app_role) OR private.has_role(auth.uid(),'it_admin'::app_role))
WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role) OR private.has_role(auth.uid(),'it_admin'::app_role));

INSERT INTO public.ai_settings (singleton) VALUES (true) ON CONFLICT DO NOTHING;

-- 8. updated_at triggers
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_paf_action_lines_touch ON public.paf_action_lines;
CREATE TRIGGER trg_paf_action_lines_touch BEFORE UPDATE ON public.paf_action_lines
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_ai_settings_touch ON public.ai_settings;
CREATE TRIGGER trg_ai_settings_touch BEFORE UPDATE ON public.ai_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 9. Backfill: seed one action line per existing PAF
INSERT INTO public.paf_action_lines (paf_id, ordinal, action_type, effective_date, before_values, after_values, status)
SELECT p.id, 1, p.action_type, p.effective_date, p.before_values, p.after_values,
  CASE WHEN p.status = 'applied' THEN 'applied'
       WHEN p.status = 'approved' THEN 'approved'
       WHEN p.status = 'denied' THEN 'denied'
       ELSE 'pending' END
FROM public.personnel_actions p
WHERE NOT EXISTS (SELECT 1 FROM public.paf_action_lines l WHERE l.paf_id = p.id);
