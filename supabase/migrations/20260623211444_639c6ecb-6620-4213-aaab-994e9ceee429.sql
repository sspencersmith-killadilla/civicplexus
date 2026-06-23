
REVOKE EXECUTE ON FUNCTION public.restore_demo_changes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_demo_changes() TO service_role;
