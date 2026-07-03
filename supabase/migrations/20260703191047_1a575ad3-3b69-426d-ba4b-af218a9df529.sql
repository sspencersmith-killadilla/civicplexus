
-- SAVED REPORTS
CREATE TABLE public.saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  sql text NOT NULL,
  builder_state jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_reports TO authenticated;
GRANT ALL ON public.saved_reports TO service_role;
ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_reports select own or shared or hr"
  ON public.saved_reports FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR (is_shared = true AND private.has_role(auth.uid(), 'hr_admin'::app_role))
    OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  );
CREATE POLICY "saved_reports insert hr_admin"
  ON public.saved_reports FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role) AND created_by = auth.uid());
CREATE POLICY "saved_reports update own or hr"
  ON public.saved_reports FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (created_by = auth.uid() OR private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE POLICY "saved_reports delete own or hr"
  ON public.saved_reports FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER trg_saved_reports_updated_at
  BEFORE UPDATE ON public.saved_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- FAVORITES
CREATE TABLE public.report_favorites (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  report_id uuid NOT NULL REFERENCES public.saved_reports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, report_id)
);
GRANT SELECT, INSERT, DELETE ON public.report_favorites TO authenticated;
GRANT ALL ON public.report_favorites TO service_role;
ALTER TABLE public.report_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_favorites own"
  ON public.report_favorites FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- QUERY LOG
CREATE TABLE public.report_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  sql text NOT NULL,
  row_count integer,
  duration_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.report_query_log TO authenticated;
GRANT ALL ON public.report_query_log TO service_role;
ALTER TABLE public.report_query_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_query_log hr read"
  ON public.report_query_log FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role));

-- SQL RUNNER: safe read-only single-SELECT execution
CREATE OR REPLACE FUNCTION public.run_report_sql(_sql text, _limit int DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
  _trimmed text;
  _no_comments text;
  _lower text;
  _wrapped text;
  _rows jsonb;
  _started timestamptz := clock_timestamp();
  _duration_ms int;
  _row_count int;
  _limit_final int;
  _denylist text[] := ARRAY[
    'insert','update','delete','drop','alter','create','grant','revoke',
    'truncate','copy','call','vacuum','comment','merge','reindex','listen',
    'notify','lock','refresh','cluster','analyze','set ','reset','begin','commit',
    'rollback','savepoint','prepare','execute','deallocate','discard','security','pg_read','pg_write'
  ];
  _kw text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT private.has_role(_uid, 'hr_admin'::app_role) THEN
    RAISE EXCEPTION 'Only HR admins can run reports';
  END IF;

  _limit_final := LEAST(GREATEST(COALESCE(_limit, 1000), 1), 10000);

  _trimmed := btrim(COALESCE(_sql, ''));
  IF _trimmed = '' THEN
    RAISE EXCEPTION 'SQL is empty';
  END IF;

  -- strip line and block comments for safety checks
  _no_comments := regexp_replace(_trimmed, '/\*.*?\*/', '', 'gs');
  _no_comments := regexp_replace(_no_comments, '--[^\n]*', '', 'g');
  _no_comments := btrim(_no_comments);

  -- strip trailing semicolon(s)
  _no_comments := regexp_replace(_no_comments, ';+\s*$', '');

  IF position(';' in _no_comments) > 0 THEN
    RAISE EXCEPTION 'Multiple statements are not allowed';
  END IF;

  _lower := lower(_no_comments);
  IF NOT (_lower LIKE 'select%' OR _lower LIKE 'with%' OR _lower LIKE '(select%' OR _lower LIKE '(with%') THEN
    RAISE EXCEPTION 'Only SELECT / WITH queries are allowed';
  END IF;

  FOREACH _kw IN ARRAY _denylist LOOP
    IF _lower ~ ('\m' || _kw || '\M') THEN
      RAISE EXCEPTION 'Disallowed keyword: %', trim(_kw);
    END IF;
  END LOOP;

  -- Wrap in outer SELECT with row_to_json + LIMIT
  _wrapped := format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(_r)), ''[]''::jsonb) FROM (%s) _r LIMIT %s',
    _no_comments, _limit_final
  );

  BEGIN
    PERFORM set_config('statement_timeout', '15000', true);
    PERFORM set_config('transaction_read_only', 'on', true);
    EXECUTE _wrapped INTO _rows;
  EXCEPTION WHEN OTHERS THEN
    _duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - _started)) * 1000;
    INSERT INTO public.report_query_log (actor_id, sql, duration_ms, error)
    VALUES (_uid, _sql, _duration_ms, SQLERRM);
    RAISE;
  END;

  _row_count := COALESCE(jsonb_array_length(_rows), 0);
  _duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - _started)) * 1000;

  INSERT INTO public.report_query_log (actor_id, sql, row_count, duration_ms)
  VALUES (_uid, _sql, _row_count, _duration_ms);

  RETURN jsonb_build_object(
    'rows', _rows,
    'row_count', _row_count,
    'duration_ms', _duration_ms,
    'limit_applied', _limit_final,
    'truncated', _row_count >= _limit_final
  );
END $$;

REVOKE ALL ON FUNCTION public.run_report_sql(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_report_sql(text, int) TO authenticated;

-- SCHEMA BROWSER helper
CREATE OR REPLACE FUNCTION public.get_report_schema()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, information_schema
AS $$
DECLARE
  _uid uuid := auth.uid();
  _denylist text[] := ARRAY[
    'signatures','candidate_tokens','interview_tokens','scim_tokens',
    'interview_responses','audit_events','paf_audit','board_application_audit',
    'demo_audit_log','identity_links','identity_providers','vault_secrets'
  ];
  _tables jsonb;
  _fks jsonb;
BEGIN
  IF _uid IS NULL OR NOT private.has_role(_uid, 'hr_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_agg(t ORDER BY t->>'table_name') INTO _tables
  FROM (
    SELECT jsonb_build_object(
      'table_name', c.table_name,
      'columns', (
        SELECT jsonb_agg(jsonb_build_object(
          'name', col.column_name,
          'type', col.data_type,
          'nullable', col.is_nullable = 'YES'
        ) ORDER BY col.ordinal_position)
        FROM information_schema.columns col
        WHERE col.table_schema = 'public' AND col.table_name = c.table_name
      )
    ) AS t
    FROM information_schema.tables c
    WHERE c.table_schema = 'public'
      AND c.table_type = 'BASE TABLE'
      AND NOT (c.table_name = ANY(_denylist))
  ) sub;

  SELECT jsonb_agg(jsonb_build_object(
    'table', tc.table_name,
    'column', kcu.column_name,
    'references_table', ccu.table_name,
    'references_column', ccu.column_name
  ))
  INTO _fks
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';

  RETURN jsonb_build_object('tables', COALESCE(_tables, '[]'::jsonb), 'foreign_keys', COALESCE(_fks, '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.get_report_schema() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_schema() TO authenticated;
