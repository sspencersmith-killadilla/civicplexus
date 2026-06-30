import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type EmployeeDirectoryRow = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  department: string | null;
  status: string;
  manager_id: string | null;
  user_id: string | null;
  photo_path: string | null;
};

export type MyHrEmployeeRow = EmployeeDirectoryRow & {
  start_date: string | null;
};

export type MyHrReportRow = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  photo_path: string | null;
  status: string;
  date_of_birth: string | null;
  start_date: string | null;
};

export type OrgChartPositionRow = {
  id: string;
  title: string | null;
  department: string | null;
  status: string | null;
  budgeted_fte: number | null;
  reports_to_position_id: string | null;
};

const EmptyInput = z.object({}).optional();

const SearchInput = z.object({
  q: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  status: z.string().max(40).optional(),
  limit: z.number().int().min(1).max(200).optional(),
}).optional();

const ProfileInput = z.object({ id: z.string().uuid() });

export type EmployeeProfileView = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  department: string | null;
  status: string;
  start_date: string | null;
  work_email: string | null;
  phone: string | null;
  photo_path: string | null;
  manager_id: string | null;
  user_id: string | null;
  date_of_birth: string | null;
  personal_email: string | null;
  supervisor: {
    id: string;
    first_name: string;
    last_name: string;
    job_title: string | null;
    department: string | null;
    photo_path: string | null;
  } | null;
  reports: Array<{
    id: string;
    first_name: string;
    last_name: string;
    job_title: string | null;
    photo_path: string | null;
    status: string;
  }>;
  viewer: {
    is_hr_admin: boolean;
    is_self: boolean;
    is_manager_of: boolean;
  };
};

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || null;
}

async function resolveCurrentEmployee(supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"], userId: string) {
  const { data: linked, error: linkedErr } = await supabaseAdmin
    .from("employees")
    .select("id, first_name, last_name, job_title, department, status, manager_id, user_id, photo_path, start_date, work_email, personal_email")
    .eq("user_id", userId)
    .maybeSingle();
  if (linkedErr) throw linkedErr;
  if (linked) return linked;

  const [{ data: profile }, authUser] = await Promise.all([
    supabaseAdmin.from("profiles").select("email").eq("id", userId).maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(userId),
  ]);
  const email = normalizeEmail(profile?.email) ?? normalizeEmail(authUser.data.user?.email);
  if (!email) return null;

  const { data: candidates, error } = await supabaseAdmin
    .from("employees")
    .select("id, first_name, last_name, job_title, department, status, manager_id, user_id, photo_path, start_date, work_email, personal_email")
    .or(`work_email.ilike.${email},personal_email.ilike.${email}`)
    .limit(5);
  if (error) throw error;

  const employee = (candidates ?? []).find((row) => {
    const work = normalizeEmail(row.work_email);
    const personal = normalizeEmail(row.personal_email);
    return (work === email || personal === email) && (!row.user_id || row.user_id === userId);
  });
  if (!employee) return null;

  if (!employee.user_id) {
    const { error: updateErr } = await supabaseAdmin
      .from("employees")
      .update({ user_id: userId })
      .eq("id", employee.id)
      .is("user_id", null);
    if (updateErr) throw updateErr;

    await supabaseAdmin.from("audit_events").insert({
      actor_id: userId,
      action: "employee_user_auto_link",
      entity: "employee",
      entity_id: employee.id,
      diff: { user_id: userId, email, source: "employee_directory_resolve" },
    });
    return { ...employee, user_id: userId };
  }

  return employee;
}

async function isInternalUser(supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"], userId: string) {
  const { data: roles, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw error;
  return (roles ?? []).some((r) => ["employee", "hr_admin", "supervisor", "hiring_manager", "it_admin"].includes(String(r.role)));
}

export const getMyHrContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EmptyInput.parse(input ?? {}))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const employee = await resolveCurrentEmployee(supabaseAdmin, context.userId);
    if (!employee) return { employee: null, supervisor: null, reports: [] as MyHrReportRow[] };

    const [supervisorRes, reportsRes] = await Promise.all([
      employee.manager_id
        ? supabaseAdmin
            .from("employees")
            .select("id, first_name, last_name, job_title, department, photo_path")
            .eq("id", employee.manager_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from("employees")
        .select("id, first_name, last_name, job_title, photo_path, status, date_of_birth, start_date")
        .in("manager_id", [employee.id, context.userId])
        .eq("status", "active")
        .order("last_name"),
    ]);
    if (supervisorRes.error) throw supervisorRes.error;
    if (reportsRes.error) throw reportsRes.error;

    const { work_email: _work, personal_email: _personal, ...safeEmployee } = employee;
    return {
      employee: safeEmployee as MyHrEmployeeRow,
      supervisor: supervisorRes.data as { id: string; first_name: string; last_name: string; job_title: string | null; department: string | null; photo_path: string | null } | null,
      reports: (reportsRes.data ?? []) as MyHrReportRow[],
    };
  });

export const getOrgChartDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EmptyInput.parse(input ?? {}))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [internal, employee] = await Promise.all([
      isInternalUser(supabaseAdmin, context.userId),
      resolveCurrentEmployee(supabaseAdmin, context.userId),
    ]);
    if (!internal && !employee) throw new Error("Employee access required");

    const [employeesRes, positionsRes, orgRes] = await Promise.all([
      supabaseAdmin
        .from("employees")
        .select("id, first_name, last_name, job_title, department, status, manager_id, user_id, photo_path")
        .order("last_name")
        .range(0, 4999),
      supabaseAdmin
        .from("positions")
        .select("id, title, department, status, budgeted_fte, reports_to_position_id")
        .range(0, 4999),
      supabaseAdmin
        .from("org_settings")
        .select("org_name")
        .maybeSingle(),
    ]);
    if (employeesRes.error) throw employeesRes.error;
    if (positionsRes.error) throw positionsRes.error;
    if (orgRes.error) throw orgRes.error;

    return {
      employees: (employeesRes.data ?? []) as EmployeeDirectoryRow[],
      positions: (positionsRes.data ?? []) as OrgChartPositionRow[],
      org_name: (orgRes.data?.org_name as string | null | undefined) ?? "Organization",
    };
  });

export const searchEmployeeDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SearchInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const internal = await isInternalUser(supabaseAdmin, context.userId);
    if (!internal) {
      const employee = await resolveCurrentEmployee(supabaseAdmin, context.userId);
      if (!employee) throw new Error("Employee access required");
    }
    const q = (data?.q ?? "").trim();
    const limit = data?.limit ?? 100;
    let query = supabaseAdmin
      .from("employees")
      .select("id, first_name, last_name, job_title, department, status, manager_id, user_id, photo_path")
      .order("last_name")
      .limit(limit);
    if (data?.department) query = query.eq("department", data.department);
    if (data?.status) query = query.eq("status", data.status as "active");
    if (q) {
      const safe = q.replace(/[%,]/g, " ");
      query = query.or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,job_title.ilike.%${safe}%,department.ilike.%${safe}%`,
      );
    }
    const { data: rows, error } = await query;
    if (error) throw error;
    const departments = Array.from(
      new Set((rows ?? []).map((r) => r.department).filter(Boolean) as string[]),
    ).sort();
    return {
      employees: (rows ?? []) as EmployeeDirectoryRow[],
      departments,
    };
  });

export const getEmployeeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: roleRows }, viewerEmployee] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId),
      resolveCurrentEmployee(supabaseAdmin, context.userId),
    ]);
    const roles = (roleRows ?? []).map((r) => String(r.role));
    const isHrAdmin = roles.includes("hr_admin");
    const isInternal =
      isHrAdmin ||
      roles.some((r) => ["hiring_manager", "supervisor", "it_admin", "employee"].includes(r));
    if (!isInternal && !viewerEmployee) throw new Error("Employee access required");

    const { data: emp, error } = await supabaseAdmin
      .from("employees")
      .select("id, first_name, last_name, job_title, department, status, start_date, work_email, phone, photo_path, manager_id, user_id, date_of_birth, personal_email")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!emp) throw new Error("Employee not found");

    const isSelf = emp.user_id === context.userId;
    const isManagerOf =
      !!viewerEmployee && !!emp.manager_id && emp.manager_id === viewerEmployee.id;
    const canSeePersonal = isHrAdmin || isSelf || isManagerOf;

    const [supRes, repsRes] = await Promise.all([
      emp.manager_id
        ? supabaseAdmin
            .from("employees")
            .select("id, first_name, last_name, job_title, department, photo_path")
            .eq("id", emp.manager_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from("employees")
        .select("id, first_name, last_name, job_title, photo_path, status")
        .eq("manager_id", emp.id)
        .order("last_name"),
    ]);
    if (supRes.error) throw supRes.error;
    if (repsRes.error) throw repsRes.error;

    const profile: EmployeeProfileView = {
      id: emp.id,
      first_name: emp.first_name,
      last_name: emp.last_name,
      job_title: emp.job_title,
      department: emp.department,
      status: emp.status,
      start_date: emp.start_date,
      work_email: emp.work_email,
      phone: canSeePersonal ? emp.phone : null,
      photo_path: emp.photo_path,
      manager_id: emp.manager_id,
      user_id: emp.user_id,
      date_of_birth: canSeePersonal ? emp.date_of_birth : null,
      personal_email: canSeePersonal ? emp.personal_email : null,
      supervisor: (supRes.data ?? null) as EmployeeProfileView["supervisor"],
      reports: (repsRes.data ?? []) as EmployeeProfileView["reports"],
      viewer: { is_hr_admin: isHrAdmin, is_self: isSelf, is_manager_of: isManagerOf },
    };
    return profile;
  });