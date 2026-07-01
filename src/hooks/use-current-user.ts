import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getCurrentUserContext } from "@/lib/hr-context.functions";

export type AppRole = Database["public"]["Enums"]["app_role"];

export function useCurrentUser() {
  const getContext = useServerFn(getCurrentUserContext);
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const ctx = await getContext();
      return {
        user: u.user,
        profile: ctx.profile,
        roles: ctx.roles,
        permissions: ctx.permissions,
        employee_id: ctx.employee_id,
        is_hr_admin: ctx.is_hr_admin,
      };
    },
    staleTime: 30_000,
  });
}

export function hasRole(roles: AppRole[] | undefined, role: AppRole) {
  return !!roles?.includes(role);
}