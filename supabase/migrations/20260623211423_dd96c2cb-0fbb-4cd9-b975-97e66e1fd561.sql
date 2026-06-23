
-- demo_config: single-row table identifying who the demo user is
CREATE TABLE public.demo_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  demo_user_id uuid,
  last_reset_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.demo_config TO authenticated;
GRANT ALL ON public.demo_config TO service_role;
ALTER TABLE public.demo_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_admin reads demo_config" ON public.demo_config FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role));
INSERT INTO public.demo_config (id) VALUES (true);

-- demo_audit_log: captures every row touched by the demo user
CREATE TABLE public.demo_audit_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  op text NOT NULL,
  pk_val text,
  old_row jsonb,
  new_row jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.demo_audit_log TO authenticated;
GRANT ALL ON public.demo_audit_log TO service_role;
ALTER TABLE public.demo_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_admin reads demo_audit_log" ON public.demo_audit_log FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE INDEX demo_audit_log_created_idx ON public.demo_audit_log (created_at DESC);

-- Trigger function: log demo user changes
CREATE OR REPLACE FUNCTION public.demo_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _demo uuid;
  _pk text;
BEGIN
  SELECT demo_user_id INTO _demo FROM public.demo_config WHERE id = true;
  IF _demo IS NULL OR auth.uid() IS DISTINCT FROM _demo THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    _pk := (to_jsonb(OLD)->>'id');
    INSERT INTO public.demo_audit_log(table_name, op, pk_val, old_row, new_row)
    VALUES (TG_TABLE_NAME, TG_OP, _pk, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSE
    _pk := (to_jsonb(NEW)->>'id');
    INSERT INTO public.demo_audit_log(table_name, op, pk_val, old_row, new_row)
    VALUES (TG_TABLE_NAME, TG_OP, _pk,
            CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
            to_jsonb(NEW));
    RETURN NEW;
  END IF;
END $$;

-- Attach trigger to every public table with an `id` column (excluding system/audit tables)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT IN (
        'demo_audit_log','demo_config','audit_events','paf_audit',
        'grievance_events','job_application_events','review_rating_changes',
        'notifications','module_settings','migration_sources','migration_stages',
        'new_hire_reports','new_hire_batches','tmrs_file_lines','tmrs_monthly_files'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS demo_audit_trg ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER demo_audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.demo_audit_trigger()',
      r.table_name
    );
  END LOOP;
END $$;

-- Restore function: undo every captured change in reverse order
CREATE OR REPLACE FUNCTION public.restore_demo_changes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  _ok int := 0;
  _err int := 0;
BEGIN
  FOR r IN SELECT * FROM public.demo_audit_log WHERE op IN ('INSERT','UPDATE','DELETE') ORDER BY id DESC LOOP
    BEGIN
      IF r.op = 'INSERT' THEN
        EXECUTE format('DELETE FROM public.%I WHERE id::text = $1', r.table_name) USING r.pk_val;
      ELSIF r.op = 'UPDATE' THEN
        EXECUTE format('DELETE FROM public.%I WHERE id::text = $1', r.table_name) USING r.pk_val;
        EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)', r.table_name, r.table_name) USING r.old_row;
      ELSIF r.op = 'DELETE' THEN
        EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)', r.table_name, r.table_name) USING r.old_row;
      END IF;
      _ok := _ok + 1;
    EXCEPTION WHEN OTHERS THEN
      _err := _err + 1;
      INSERT INTO public.demo_audit_log(table_name, op, pk_val, old_row, note)
      VALUES (r.table_name, 'restore_error', r.pk_val, r.old_row, SQLERRM);
    END;
  END LOOP;
  DELETE FROM public.demo_audit_log WHERE op IN ('INSERT','UPDATE','DELETE');
  UPDATE public.demo_config SET last_reset_at = now(), updated_at = now() WHERE id = true;
  RETURN jsonb_build_object('reverted', _ok, 'errors', _err);
END $$;
