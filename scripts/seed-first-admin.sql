-- Promote an existing auth.users account to hr_admin + super_admin.
-- Usage:  psql "$SUPABASE_DB_URL" -f scripts/seed-first-admin.sql -v email=you@city.gov
\set ON_ERROR_STOP on
do $$
declare _uid uuid;
begin
  select id into _uid from auth.users where email = :'email';
  if _uid is null then
    raise exception 'No auth.users row for %', :'email';
  end if;
  insert into public.user_roles(user_id, role) values (_uid, 'hr_admin') on conflict do nothing;
  insert into public.user_roles(user_id, role) values (_uid, 'super_admin') on conflict do nothing;
  raise notice 'Granted hr_admin + super_admin to %', :'email';
end $$;
