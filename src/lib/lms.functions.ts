import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((ln) => {
    const cols = ln.split(",");
    const obj: Row = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] ?? "").trim(); });
    return obj;
  });
}

export const previewLmsImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: string; filename: string; csv: string }) =>
    z.object({ provider: z.string(), filename: z.string(), csv: z.string().max(2000000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "hr_admin" });
    if (!ok) throw new Error("HR admin only");
    const rows = parseCsv(data.csv);
    const matched: Array<Row & { _employee_id?: string; _course_id?: string }> = [];
    const errors: Array<{ row: number; error: string }> = [];
    const { data: emps } = await context.supabase.from("employees").select("id,personal_email,work_email,first_name,last_name");
    const { data: courses } = await context.supabase.from("courses").select("id,name,external_course_id,external_provider");

    rows.forEach((r, i) => {
      const email = (r.email || r.work_email || r.personal_email || "").toLowerCase();
      const courseId = r.course_id || r.external_course_id || r.course || "";
      const emp = emps?.find((e: any) =>
        (e.personal_email && e.personal_email.toLowerCase() === email) ||
        (e.work_email && e.work_email.toLowerCase() === email));
      const course = courses?.find((c: any) =>
        (c.external_course_id && c.external_course_id === courseId) ||
        (c.name && c.name.toLowerCase() === courseId.toLowerCase()));
      if (!emp) errors.push({ row: i + 2, error: `No employee for ${email}` });
      else if (!course) errors.push({ row: i + 2, error: `No course for ${courseId}` });
      else matched.push({ ...r, _employee_id: emp.id, _course_id: course.id });
    });

    const { data: job, error } = await context.supabase.from("lms_credit_imports").insert({
      provider: data.provider, filename: data.filename, uploaded_by: context.userId,
      status: "preview", total_rows: rows.length, matched_rows: matched.length,
      unmatched_rows: rows.length - matched.length, preview: matched.slice(0, 200) as object,
      errors: errors.slice(0, 200) as object,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: job!.id, total: rows.length, matched: matched.length, unmatched: rows.length - matched.length, errors: errors.slice(0, 20) };
  });

export const commitLmsImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "hr_admin" });
    if (!ok) throw new Error("HR admin only");
    const { data: job, error } = await context.supabase.from("lms_credit_imports").select("*").eq("id", data.id).single();
    if (error || !job) throw new Error("Import not found");
    if (job.status !== "preview") throw new Error("Import already processed");
    const rows = (job.preview ?? []) as Array<{ _employee_id?: string; _course_id?: string; completed_at?: string; score?: string }>;
    let applied = 0;
    for (const r of rows) {
      if (!r._employee_id || !r._course_id) continue;
      const completedAt = r.completed_at ? new Date(r.completed_at).toISOString() : new Date().toISOString();
      const { error: insErr } = await context.supabase.from("employee_training").upsert({
        employee_id: r._employee_id,
        course_id: r._course_id,
        status: "complete",
        completed_at: completedAt,
        score: r.score ? Number(r.score) : null,
      } as never, { onConflict: "employee_id,course_id" });
      if (!insErr) applied++;
    }
    await context.supabase.from("lms_credit_imports").update({
      status: "committed", applied_rows: applied, committed_at: new Date().toISOString(),
    }).eq("id", data.id);
    return { applied };
  });
