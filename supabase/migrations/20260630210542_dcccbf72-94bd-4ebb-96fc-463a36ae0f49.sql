
REVOKE EXECUTE ON FUNCTION public.is_panelist_for_interview(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_iv_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_panelist_for_interview(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_iv_manager(uuid) TO authenticated, service_role;
