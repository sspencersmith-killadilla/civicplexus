import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Row = { id: string; first_name: string; last_name: string; department: string | null; job_title: string | null };

export const listOneOnOneCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Role + permission checks (server-side)
    const [{ data: roles }, { data: perms }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.rpc("get_effective_permissions", { _uid: userId }),
    ]);
    const roleSet = new Set(((roles ?? []) as Array<{ role: string }>).map((r) => r.role));
    const permSet = new Set(((perms ?? []) as Array<{ permission_key: string }>).map((p) => p.permission_key));
    const isHr = roleSet.has("hr_admin");
    const canManage = isHr || permSet.has("one_on_ones.manage");
    const canReadChain = permSet.has("one_on_ones.read.reports");

    if (canManage) {
      const { data, error } = await supabaseAdmin
        .from("employees")
        .select("id, first_name, last_name, department, job_title")
        .in("status", ["active", "preboarding"])
        .order("last_name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    }

    // Look up caller's employee row
    const { data: me } = await supabaseAdmin
      .from("employees").select("id, department").eq("user_id", userId).maybeSingle();
    const myId = (me as { id?: string } | null)?.id ?? null;
    const myDept = (me as { department?: string | null } | null)?.department ?? null;

    // Department-admin scope
    const { data: deptAdmins } = await supabaseAdmin
      .from("department_admins").select("department").eq("user_id", userId);
    const scopedDepts = new Set(((deptAdmins ?? []) as Array<{ department: string }>).map((d) => d.department));

    const results = new Map<string, Row>();

    if (myId) {
      // Direct reports
      const { data: direct } = await supabaseAdmin
        .from("employees")
        .select("id, first_name, last_name, department, job_title")
        .eq("manager_id", myId)
        .in("status", ["active", "preboarding"]);
      for (const r of (direct ?? []) as Row[]) results.set(r.id, r);

      if (canReadChain) {
        // Transitive reports — walk down the tree
        const stack = [myId];
        const seen = new Set<string>([myId]);
        while (stack.length) {
          const parent = stack.pop()!;
          const { data: kids } = await supabaseAdmin
            .from("employees")
            .select("id, first_name, last_name, department, job_title")
            .eq("manager_id", parent)
            .in("status", ["active", "preboarding"]);
          for (const k of (kids ?? []) as Row[]) {
            if (!seen.has(k.id)) {
              seen.add(k.id);
              results.set(k.id, k);
              stack.push(k.id);
            }
          }
        }
      }
    }

    if (scopedDepts.size) {
      const { data: deptRows } = await supabaseAdmin
        .from("employees")
        .select("id, first_name, last_name, department, job_title")
        .in("department", Array.from(scopedDepts))
        .in("status", ["active", "preboarding"]);
      for (const r of (deptRows ?? []) as Row[]) results.set(r.id, r);
    }

    // Always include self last so the picker isn't empty for peer-managers
    if (myId && !results.has(myId)) {
      const { data: selfRow } = await supabaseAdmin
        .from("employees")
        .select("id, first_name, last_name, department, job_title")
        .eq("id", myId).maybeSingle();
      if (selfRow) results.set((selfRow as Row).id, selfRow as Row);
    }
    // Silence unused warning
    void myDept;

    return Array.from(results.values()).sort((a, b) => a.last_name.localeCompare(b.last_name));
  });