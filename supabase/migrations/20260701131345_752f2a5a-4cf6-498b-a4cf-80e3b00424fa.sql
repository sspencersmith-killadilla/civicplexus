-- Ensure HR admins are not blocked when granular permission keys are incomplete or absent.
CREATE OR REPLACE FUNCTION private.has_permission(_uid uuid, _key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT
    private.has_role(_uid, 'hr_admin'::app_role)
    OR EXISTS (
      SELECT 1
        FROM public.user_permission_grants g
       WHERE g.user_id = _uid
         AND g.permission_key = _key
         AND g.mode = 'grant'
    )
    OR (
      EXISTS (
        SELECT 1
          FROM public.user_permission_groups upg
          JOIN public.permission_group_keys pgk ON pgk.group_id = upg.group_id
         WHERE upg.user_id = _uid
           AND pgk.permission_key = _key
      )
      AND NOT EXISTS (
        SELECT 1
          FROM public.user_permission_grants d
         WHERE d.user_id = _uid
           AND d.permission_key = _key
           AND d.mode = 'deny'
      )
    );
$$;