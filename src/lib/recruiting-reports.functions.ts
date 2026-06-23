import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Aggregate EEO-4 applicant flow (HR admin only). No row-level PII returned. */
export const applicantFlowLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ from: z.string(), to: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role" as never, { _user_id: context.userId, _role: "hr_admin" } as never);
    if (!isAdmin) throw new Error("Forbidden");
    const { data: rows } = await context.supabase
      .from("application_self_id" as never)
      .select("gender, race_ethnicity, veteran_status, disability_status, declined, application_id, job_applications:application_id(status, created_at, job_requisitions:requisition_id(department))")
      .gte("created_at", data.from).lte("created_at", data.to);
    return (rows ?? []) as unknown as Array<{
      gender: string | null; race_ethnicity: string | null; veteran_status: string | null;
      disability_status: string | null; declined: boolean;
      job_applications: { status: string; created_at: string; job_requisitions: { department: string | null } | null } | null;
    }>;
  });

export const timeToFill = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: reqs } = await context.supabase
      .from("job_requisitions" as never)
      .select("id, title, department, posted_at, status");
    const list = (reqs ?? []) as Array<{ id: string; title: string; department: string | null; posted_at: string | null; status: string }>;
    const out: Array<{ id: string; title: string; department: string | null; days: number; status: string }> = [];
    for (const r of list) {
      if (!r.posted_at) continue;
      const { data: hire } = await context.supabase
        .from("job_application_events" as never)
        .select("created_at, job_applications:application_id(requisition_id)")
        .eq("event_type", "offer_accepted")
        .order("created_at", { ascending: true }).limit(50);
      const ev = ((hire ?? []) as unknown as Array<{ created_at: string; job_applications: { requisition_id: string } | null }>).find(e => e.job_applications?.requisition_id === r.id);
      if (!ev) continue;
      const days = Math.round((new Date(ev.created_at).getTime() - new Date(r.posted_at).getTime()) / 86400000);
      out.push({ id: r.id, title: r.title, department: r.department, days, status: r.status });
    }
    return out;
  });

export const sourceOfHire = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("job_applications" as never)
      .select("source, status");
    const rows = (data ?? []) as Array<{ source: string | null; status: string }>;
    const map: Record<string, { applied: number; hired: number }> = {};
    for (const r of rows) {
      const k = r.source ?? "unspecified";
      map[k] ??= { applied: 0, hired: 0 };
      map[k].applied++;
      if (r.status === "hired") map[k].hired++;
    }
    return Object.entries(map).map(([source, v]) => ({ source, ...v }));
  });