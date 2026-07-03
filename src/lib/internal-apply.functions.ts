import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type ResumeSection<T> = { included: boolean; items: T[] };

export type InternalResume = {
  header: {
    name: string;
    work_email: string | null;
    personal_email: string | null;
    phone: string | null;
    hire_date: string | null;
    tenure_years: number | null;
    department: string | null;
    job_title: string | null;
    supervisor_name: string | null;
  };
  current_role: ResumeSection<{ title: string; department: string | null; start_date: string | null; end_date: string | null; note?: string | null }>;
  work_history: ResumeSection<{ action_type: string; effective_date: string | null; reason: string | null; narrative: string | null }>;
  certifications: ResumeSection<{ name: string; issuer: string | null; issued_at: string | null; expires_at: string | null }>;
  training: ResumeSection<{ name: string; completed_at: string | null; score: number | null }>;
  performance: ResumeSection<{ period_end: string | null; overall_rating: string | null }>;
  accomplishments: ResumeSection<{ title: string; category: string | null; target_date: string | null }>;
  narrative: { included: boolean; text: string };
};

function tenureYears(hire: string | null): number | null {
  if (!hire) return null;
  const d = new Date(hire + (hire.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return null;
  return Math.round(((Date.now() - d.getTime()) / (365.25 * 86400000)) * 10) / 10;
}

export const buildInternalResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ narrative: z.string().max(4000).optional() }).parse(i))
  .handler(async ({ data, context }): Promise<InternalResume> => {
    const { data: emp } = await context.supabase.from("employees")
      .select("id, first_name, last_name, work_email, personal_email, phone, start_date, department, job_title, manager_id")
      .eq("user_id", context.userId).maybeSingle();
    if (!emp) throw new Error("No employee record for current user");

    let supervisor_name: string | null = null;
    if (emp.manager_id) {
      const { data: sup } = await context.supabase.from("employees").select("first_name, last_name").eq("id", emp.manager_id).maybeSingle();
      if (sup) supervisor_name = `${sup.first_name} ${sup.last_name}`;
    }

    const [pafRes, certRes, trainRes, revRes, goalRes] = await Promise.all([
      context.supabase.from("personnel_actions")
        .select("action_type, effective_date, reason, narrative")
        .eq("employee_id", emp.id).eq("status", "applied")
        .order("effective_date", { ascending: false }).limit(10),
      context.supabase.from("employee_certifications")
        .select("issued_at, expires_at, certifications(name, issuer)")
        .eq("employee_id", emp.id).order("issued_at", { ascending: false }).limit(20),
      context.supabase.from("employee_training")
        .select("completed_at, score, courses(name)")
        .eq("employee_id", emp.id).eq("status", "complete")
        .order("completed_at", { ascending: false }).limit(20),
      context.supabase.from("performance_reviews")
        .select("review_period_end, overall_rating")
        .eq("employee_id", emp.id).eq("status", "finalized")
        .order("review_period_end", { ascending: false }).limit(2),
      context.supabase.from("goals")
        .select("title, category, target_date")
        .eq("owner_employee_id", emp.id).eq("status", "completed")
        .order("target_date", { ascending: false }).limit(10),
    ]);

    return {
      header: {
        name: `${emp.first_name} ${emp.last_name}`,
        work_email: emp.work_email,
        personal_email: emp.personal_email,
        phone: emp.phone,
        hire_date: emp.start_date,
        tenure_years: tenureYears(emp.start_date),
        department: emp.department,
        job_title: emp.job_title,
        supervisor_name,
      },
      current_role: { included: true, items: [{
        title: emp.job_title ?? "—",
        department: emp.department,
        start_date: emp.start_date,
        end_date: null,
        note: supervisor_name ? `Reports to ${supervisor_name}` : null,
      }]},
      work_history: { included: true, items: (pafRes.data ?? []).map((p) => ({
        action_type: (p as { action_type: string }).action_type,
        effective_date: (p as { effective_date: string | null }).effective_date,
        reason: (p as { reason: string | null }).reason,
        narrative: (p as { narrative: string | null }).narrative,
      }))},
      certifications: { included: true, items: (certRes.data ?? []).map((c) => {
        const cc = c as { issued_at: string | null; expires_at: string | null; certifications: { name: string; issuer: string | null } | null };
        return { name: cc.certifications?.name ?? "—", issuer: cc.certifications?.issuer ?? null, issued_at: cc.issued_at, expires_at: cc.expires_at };
      })},
      training: { included: true, items: (trainRes.data ?? []).map((t) => {
        const tt = t as { completed_at: string | null; score: number | null; courses: { name: string } | null };
        return { name: tt.courses?.name ?? "—", completed_at: tt.completed_at, score: tt.score };
      })},
      performance: { included: false, items: (revRes.data ?? []).map((r) => ({
        period_end: (r as { review_period_end: string | null }).review_period_end,
        overall_rating: (r as { overall_rating: string | null }).overall_rating,
      }))},
      accomplishments: { included: true, items: (goalRes.data ?? []).map((g) => ({
        title: (g as { title: string }).title,
        category: (g as { category: string | null }).category,
        target_date: (g as { target_date: string | null }).target_date,
      }))},
      narrative: { included: !!(data.narrative && data.narrative.trim()), text: data.narrative ?? "" },
    };
  });

export const listMyInternalApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: emp } = await context.supabase.from("employees").select("id").eq("user_id", context.userId).maybeSingle();
    if (!emp) return [];
    const { data, error } = await context.supabase.from("job_applications")
      .select("id, status, created_at, updated_at, requisition_id, confidential_until_finalist, job_requisitions(title, department)")
      .eq("internal_employee_id", emp.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; status: string; created_at: string; updated_at: string; requisition_id: string; confidential_until_finalist: boolean; job_requisitions: { title: string; department: string | null } | null }>;
  });

export const withdrawMyApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ application_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: emp } = await context.supabase.from("employees").select("id").eq("user_id", context.userId).maybeSingle();
    if (!emp) throw new Error("No employee record");
    const { data: app } = await context.supabase.from("job_applications")
      .select("id, internal_employee_id, status").eq("id", data.application_id).maybeSingle();
    if (!app || (app as { internal_employee_id: string | null }).internal_employee_id !== emp.id) throw new Error("Not your application");
    const { error } = await context.supabase.from("job_applications").update({ status: "withdrawn" } as never).eq("id", data.application_id);
    if (error) throw new Error(error.message);
    await context.supabase.from("job_application_events").insert({
      application_id: data.application_id, actor_id: context.userId, event_type: "status_changed",
      from_status: (app as { status: string }).status, to_status: "withdrawn",
    } as never);
    return { ok: true };
  });

export const evaluateInternalEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requisition_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: emp } = await context.supabase.from("employees")
      .select("id, start_date, status").eq("user_id", context.userId).maybeSingle();
    if (!emp) return { passes: [], warnings: [], blockers: ["No employee record on file"] };
    const { data: req } = await context.supabase.from("job_requisitions")
      .select("id, title, requirements, internal_only").eq("id", data.requisition_id).maybeSingle();
    if (!req) return { passes: [], warnings: [], blockers: ["Requisition not found"] };

    const passes: string[] = [];
    const warnings: string[] = [];
    const blockers: string[] = [];

    const tenure = tenureYears(emp.start_date);
    if (tenure !== null) passes.push(`${tenure} year${tenure === 1 ? "" : "s"} tenure with the organization`);

    // Tenure hint (soft)
    const reqText = ((req as { requirements: string | null }).requirements ?? "").toLowerCase();
    const tenureMatch = reqText.match(/(\d+)\s*(?:\+|or more)?\s*year/);
    if (tenureMatch && tenure !== null) {
      const need = Number(tenureMatch[1]);
      if (tenure >= need) passes.push(`Meets ${need}+ year tenure hint in the posting`);
      else warnings.push(`Posting mentions ${need}+ years; you have ${tenure}`);
    }

    // Certification hints — cross-check against employee certs
    const { data: myCerts } = await context.supabase.from("employee_certifications")
      .select("expires_at, certifications(name)").eq("employee_id", emp.id);
    const myCertNames = new Set(((myCerts ?? []) as Array<{ certifications: { name: string } | null }>).map((c) => (c.certifications?.name ?? "").toLowerCase()));
    const { data: allCerts } = await context.supabase.from("certifications").select("name").eq("active", true);
    for (const c of (allCerts ?? []) as Array<{ name: string }>) {
      if (reqText.includes(c.name.toLowerCase())) {
        if (myCertNames.has(c.name.toLowerCase())) passes.push(`Has required certification: ${c.name}`);
        else warnings.push(`Posting mentions certification: ${c.name} (not on your record)`);
      }
    }

    if ((emp as { status: string }).status && (emp as { status: string }).status !== "active") {
      blockers.push(`Your employment status is "${(emp as { status: string }).status}"`);
    }

    return { passes, warnings, blockers };
  });