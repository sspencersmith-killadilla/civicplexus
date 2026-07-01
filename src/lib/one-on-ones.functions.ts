import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Row = { id: string; first_name: string; last_name: string; department: string | null; job_title: string | null };

async function oneOnOneAccess(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: roles }, { data: perms }, { data: me }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.rpc("get_effective_permissions", { _uid: userId }),
    supabaseAdmin.from("employees").select("id, department").eq("user_id", userId).maybeSingle(),
  ]);
  const roleSet = new Set(((roles ?? []) as Array<{ role: string }>).map((r) => r.role));
  const permSet = new Set(((perms ?? []) as Array<{ permission_key: string }>).map((p) => p.permission_key));
  const { data: deptAdmins } = await supabaseAdmin
    .from("department_admins").select("department").eq("user_id", userId);
  return {
    supabaseAdmin,
    roles: roleSet,
    perms: permSet,
    isHr: roleSet.has("hr_admin"),
    canManage: roleSet.has("hr_admin") || permSet.has("one_on_ones.manage"),
    canReadChain: roleSet.has("hr_admin") || permSet.has("one_on_ones.read.reports"),
    employeeId: (me as { id?: string } | null)?.id ?? null,
    departments: new Set(((deptAdmins ?? []) as Array<{ department: string }>).map((d) => d.department)),
  };
}

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

export const listOneOnOneSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await oneOnOneAccess(context.userId);
    const { data, error } = await access.supabaseAdmin
      .from("one_on_ones")
      .select("id,title,short_code,status,scheduled_at,manager_user_id,employee_id,created_at, employees(first_name,last_name,department,user_id,manager_id)")
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<{
      id: string; title: string | null; short_code: string; status: string; scheduled_at: string | null; manager_user_id: string | null; employee_id: string | null; created_at: string;
      employees: { first_name: string; last_name: string; department: string | null; user_id: string | null; manager_id: string | null } | null;
    }>).filter((s) => {
      if (access.canManage) return true;
      if (s.manager_user_id === context.userId) return true;
      const emp = s.employees;
      if (!emp) return false;
      if (emp.user_id === context.userId) return true;
      if (access.employeeId && emp.manager_id === access.employeeId) return true;
      if (access.canReadChain && s.employee_id) return true;
      if (emp.department && access.departments.has(emp.department)) return true;
      return false;
    }).map((s) => ({
      id: s.id,
      title: s.title,
      short_code: s.short_code,
      status: s.status,
      scheduled_at: s.scheduled_at,
      manager_user_id: s.manager_user_id,
      employee_id: s.employee_id,
      created_at: s.created_at,
    }));
  });

export const createOneOnOneSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    employee_id: z.string().uuid().nullable().optional(),
    template_id: z.string().uuid().nullable().optional(),
    title: z.string().max(200).nullable().optional(),
    scheduled_at: z.string().datetime().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const access = await oneOnOneAccess(context.userId);
    if (data.employee_id && !access.canManage) {
      const { data: emp } = await access.supabaseAdmin
        .from("employees")
        .select("id, user_id, manager_id, department")
        .eq("id", data.employee_id)
        .maybeSingle();
      const target = emp as { user_id: string | null; manager_id: string | null; department: string | null } | null;
      const allowed = !!target && (
        target.user_id === context.userId ||
        (!!access.employeeId && target.manager_id === access.employeeId) ||
        (!!target.department && access.departments.has(target.department))
      );
      if (!allowed) throw new Error("Not authorized to schedule a 1-on-1 with this employee");
    }
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data: row, error } = await access.supabaseAdmin
      .from("one_on_ones")
      .insert({
        manager_user_id: context.userId,
        employee_id: data.employee_id ?? null,
        template_id: data.template_id ?? null,
        short_code: code,
        title: data.title ?? null,
        scheduled_at: data.scheduled_at ?? null,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string };
  });