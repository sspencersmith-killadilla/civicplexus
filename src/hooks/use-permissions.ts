import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyPermissions } from "@/lib/permissions.functions";

export function useMyPermissions() {
  const fn = useServerFn(getMyPermissions);
  return useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => fn({ data: undefined as never }),
    staleTime: 60_000,
  });
}

export function usePermission(key: string): boolean {
  const { data } = useMyPermissions();
  return !!data?.includes(key);
}