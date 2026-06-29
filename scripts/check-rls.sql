-- Fails (exits non-zero via psql ON_ERROR_STOP) when a public table is
-- missing RLS or has zero policies. Wire into CI: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/check-rls.sql
do $$
declare r record; bad int := 0;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relrowsecurity = false
           or not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename = c.relname))
  loop
    raise warning 'RLS gap: public.%', r.relname;
    bad := bad + 1;
  end loop;
  if bad > 0 then raise exception '% public table(s) missing RLS or policies', bad; end if;
end $$;
