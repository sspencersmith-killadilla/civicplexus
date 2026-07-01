import type { ReactNode } from "react";
import { usePermission } from "@/hooks/use-permissions";

export function Can({ perm, children, fallback = null }: { perm: string; children: ReactNode; fallback?: ReactNode }) {
  const ok = usePermission(perm);
  return ok ? <>{children}</> : <>{fallback}</>;
}