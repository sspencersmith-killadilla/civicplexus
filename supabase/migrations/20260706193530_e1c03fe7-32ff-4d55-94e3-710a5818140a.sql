GRANT USAGE ON SCHEMA private TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_one_on_one(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION private.is_one_on_one_manager(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, app_role) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION private.reports_into(uuid, uuid) TO authenticated, anon, service_role;
NOTIFY pgrst, 'reload schema';