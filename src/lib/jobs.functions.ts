import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

const RequisitionInput = z.object({
  title: z.string().trim().min(2).max(200),
  department: z.string().trim().max(100).optional().nullable(),
  position_id: z.string().uuid().optional().nullable(),
  worker_type_id: z.string().uuid().optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  employment_type: z.string().trim().max(40).optional().nullable(),
  salary_min: z.number().nonnegative().optional().nullable(),
  salary_max: z.number().nonnegative().optional().nullable(),
  summary: z.string().trim().max(500).optional().nullable(),
  description: z.string().trim().max(20000).optional().nullable(),
  requirements: z.string().trim().max(10000).optional().nullable(),
  benefits: z.string().trim().max(5000).optional().nullable(),
  internal_only: z.boolean().default(false),
  closes_at: z.string().datetime().optional().nullable(),
  hiring_manager_id: z.string().uuid().optional().nullable(),
  posting_sections: z.object({
    essential_functions: z.string().max(10000).optional().nullable(),
    ksa: z.string().max(10000).optional().nullable(),
    qualifications: z.string().max(5000).optional().nullable(),
    physical_demands: z.string().max(5000).optional().nullable(),
    supplemental: z.string().max(5000).optional().nullable(),
  }).partial().optional().nullable(),
  brochure_url: z.string().max(500).optional().nullable(),
});

export const createRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RequisitionInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("job_requisitions" as never)
      .insert({
        ...data,
        requested_by: context.userId,
        hiring_manager_id: data.hiring_manager_id ?? context.userId,
        slug: `${slugify(data.title)}-${Math.random().toString(36).slice(2, 7)}`,
        status: "draft",
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.rpc("record_audit_event" as never, {
      _action: "create", _entity: "job_requisition",
      _entity_id: (row as { id: string }).id, _diff: { title: data.title },
    } as never);
    return row;
  });

export const updateRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), patch: RequisitionInput.partial() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("job_requisitions" as never)
      .update(data.patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Resolve approver users for default chain: Supervisor (requester's manager) -> HR Admin */
async function defaultApproverChain(supabase: never, requesterId: string) {
  const sb = supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
      };
    };
  };
  // supervisor = requester's manager in employees table (if any)
  const empRes = await sb.from("employees").select("manager_id").eq("user_id", requesterId).maybeSingle();
  const empRow = empRes.data as { manager_id: string | null } | null;
  let supervisorUserId: string | null = null;
  if (empRow?.manager_id) {
    const mgrRes = await sb.from("employees").select("user_id").eq("id", empRow.manager_id).maybeSingle();
    supervisorUserId = (mgrRes.data as { user_id: string | null } | null)?.user_id ?? null;
  }
  // pick first HR admin
  const hrRes = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown }> } } } } })
    .from("user_roles").select("user_id").eq("role", "hr_admin").limit(1).maybeSingle();
  const hrUserId = (hrRes.data as { user_id: string } | null)?.user_id ?? null;
  return [
    { stage: 1, approver_label: "Supervisor", approver_role: "supervisor", approver_id: supervisorUserId },
    { stage: 2, approver_label: "HR Admin", approver_role: "hr_admin", approver_id: hrUserId },
  ].filter((s) => s.approver_id);
}

export const submitRequisitionForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requisition_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as never;
    let chain = await defaultApproverChain(sb, context.userId);
    // Fallback: try the requisition's hiring manager as a stage-1 approver
    if (chain.length === 0) {
      const { data: req } = await context.supabase
        .from("job_requisitions" as never)
        .select("hiring_manager_id").eq("id", data.requisition_id).maybeSingle();
      const hmId = (req as { hiring_manager_id: string | null } | null)?.hiring_manager_id ?? null;
      if (hmId && hmId !== context.userId) {
        chain = [{ stage: 1, approver_label: "Hiring Manager", approver_role: "hiring_manager", approver_id: hmId }];
      }
    }
    if (chain.length === 0) {
      // No approvers configured — surface gracefully so the wizard can offer direct posting
      return { chain_id: null, skipped: true, reason: "no_approvers" as const };
    }
    const { data: chainRow, error: cErr } = await context.supabase
      .from("approval_chains" as never)
      .insert({ entity_type: "requisition", entity_id: data.requisition_id, created_by: context.userId } as never)
      .select().single();
    if (cErr) throw new Error(cErr.message);
    const chainId = (chainRow as { id: string }).id;
    const { error: sErr } = await context.supabase
      .from("approval_steps" as never)
      .insert(chain.map((c) => ({ ...c, chain_id: chainId })) as never);
    if (sErr) throw new Error(sErr.message);
    await context.supabase.from("job_requisitions" as never).update({ status: "pending_approval" } as never).eq("id", data.requisition_id);
    // notify first approver
    if (chain[0].approver_id) {
      await context.supabase.from("notifications").insert({
        user_id: chain[0].approver_id, type: "approval", title: "Requisition pending your approval",
        body: `A new job requisition needs ${chain[0].approver_label} approval`,
        link: "/approvals",
      });
    }
    return { chain_id: chainId, skipped: false as const };
  });

export const decideApprovalStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    step_id: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    notes: z.string().max(2000).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: step, error: stepErr } = await context.supabase
      .from("approval_steps" as never).select("*").eq("id", data.step_id).single();
    if (stepErr || !step) throw new Error("Step not found");
    const s = step as { id: string; chain_id: string; stage: number; approver_id: string };
    if (s.approver_id !== context.userId) throw new Error("Not your approval step");
    await context.supabase.from("approval_steps" as never).update({
      status: data.decision, decision_notes: data.notes ?? null,
      decided_at: new Date().toISOString(), decided_by: context.userId,
    } as never).eq("id", s.id);

    const { data: chain } = await context.supabase
      .from("approval_chains" as never).select("*").eq("id", s.chain_id).single();
    const c = chain as unknown as { id: string; entity_type: string; entity_id: string };

    if (data.decision === "rejected") {
      await context.supabase.from("approval_chains" as never).update({ status: "rejected" } as never).eq("id", c.id);
      if (c.entity_type === "requisition") {
        await context.supabase.from("job_requisitions" as never).update({ status: "draft" } as never).eq("id", c.entity_id);
      } else if (c.entity_type === "hire_request") {
        await context.supabase.from("hire_requests").update({ status: "rejected", hr_notes: data.notes ?? null } as never).eq("id", c.entity_id);
      }
      return { ok: true, terminal: true };
    }
    // approved: find next pending step
    const { data: next } = await context.supabase
      .from("approval_steps" as never).select("*")
      .eq("chain_id", c.id).eq("status", "pending")
      .order("stage", { ascending: true }).limit(1).maybeSingle();
    if (next) {
      const n = next as { stage: number; approver_id: string | null; approver_label: string };
      await context.supabase.from("approval_chains" as never).update({ current_stage: n.stage } as never).eq("id", c.id);
      if (n.approver_id) {
        await context.supabase.from("notifications").insert({
          user_id: n.approver_id, type: "approval", title: "Approval pending",
          body: `${n.approver_label} approval needed`, link: "/approvals",
        });
      }
      return { ok: true, terminal: false };
    }
    // all approved
    await context.supabase.from("approval_chains" as never).update({ status: "approved" } as never).eq("id", c.id);
    if (c.entity_type === "requisition") {
      await context.supabase.from("job_requisitions" as never).update({ status: "approved" } as never).eq("id", c.entity_id);
    } else if (c.entity_type === "hire_request") {
      await context.supabase.rpc("decide_hire_request" as never, { _request_id: c.entity_id, _action: "activate", _hr_notes: data.notes ?? null } as never);
    }
    return { ok: true, terminal: true };
  });

export const postRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requisition_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("job_requisitions" as never).update({
      status: "posted", posted_at: new Date().toISOString(),
    } as never).eq("id", data.requisition_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requisition_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await context.supabase.from("job_requisitions" as never).update({ status: "closed" } as never).eq("id", data.requisition_id);
    return { ok: true };
  });

/** Internal employee applying to a posted requisition. */
export const applyInternally = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    requisition_id: z.string().uuid(),
    cover_letter: z.string().trim().max(20000).optional(),
    notify_current_manager: z.boolean().default(true),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: emp, error: eErr } = await context.supabase
      .from("employees").select("id, first_name, last_name, work_email, personal_email")
      .eq("user_id", context.userId).maybeSingle();
    if (eErr || !emp) throw new Error("No employee record for current user");
    const { data: app, error } = await context.supabase
      .from("job_applications" as never)
      .insert({
        requisition_id: data.requisition_id,
        applicant_name: `${emp.first_name} ${emp.last_name}`,
        email: emp.work_email ?? emp.personal_email ?? "",
        cover_letter: data.cover_letter ?? null,
        is_internal: true,
        internal_employee_id: emp.id,
        notify_current_manager: data.notify_current_manager,
        source: "internal",
      } as never).select().single();
    if (error) throw new Error(error.message);
    const a = app as { id: string };
    await context.supabase.from("job_application_events" as never).insert({
      application_id: a.id, actor_id: context.userId, event_type: "submitted",
    } as never);
    return { id: a.id };
  });

export const transitionApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    application_id: z.string().uuid(),
    status: z.enum(["new","screening","interview","offer","hired","rejected","withdrawn"]),
    notes: z.string().max(5000).optional(),
    rejection_reason: z.string().max(2000).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase.from("job_applications" as never)
      .select("status").eq("id", data.application_id).single();
    const patch: Record<string, unknown> = { status: data.status };
    if (data.notes) patch.notes = data.notes;
    if (data.rejection_reason) patch.rejection_reason = data.rejection_reason;
    const { error } = await context.supabase.from("job_applications" as never).update(patch as never).eq("id", data.application_id);
    if (error) throw new Error(error.message);
    await context.supabase.from("job_application_events" as never).insert({
      application_id: data.application_id, actor_id: context.userId,
      event_type: "status_changed",
      from_status: (prev as { status: string } | null)?.status ?? null,
      to_status: data.status,
      payload: { notes: data.notes ?? null, rejection_reason: data.rejection_reason ?? null },
    } as never);
    return { ok: true };
  });

export const scheduleInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    application_id: z.string().uuid(),
    scheduled_at: z.string().datetime(),
    duration_minutes: z.number().int().min(15).max(480).default(45),
    stage: z.enum(["phone_screen","first_round","panel","final"]).default("first_round"),
    location: z.string().max(500).optional(),
    interviewer_ids: z.array(z.string().uuid()).min(1),
    use_inapp_room: z.boolean().optional().default(false),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    let resolvedLocation: string | null = data.location ?? null;
    const { data: iv, error } = await context.supabase.from("interviews" as never).insert({
      application_id: data.application_id, scheduled_at: data.scheduled_at,
      duration_minutes: data.duration_minutes, stage: data.stage,
      location: resolvedLocation, interviewer_ids: data.interviewer_ids,
      created_by: context.userId,
    } as never).select().single();
    if (error) throw new Error(error.message);
    const ivRow = iv as { id: string };

    if (data.use_inapp_room) {
      const origin = getRequestHeader("origin") || getRequestHeader("x-forwarded-host")
        ? (getRequestHeader("origin") || `https://${getRequestHeader("x-forwarded-host")}`)
        : (process.env.SITE_URL || "");
      resolvedLocation = `${origin}/interviews/${ivRow.id}/room`;
      await context.supabase.from("interviews" as never)
        .update({ location: resolvedLocation } as never).eq("id", ivRow.id);
    }

    // Try calendar sync (best-effort)
    let calendarEventId: string | null = null;
    try {
      const { tryCreateCalendarEvent } = await import("./calendar.functions");
      calendarEventId = await tryCreateCalendarEvent({
        summary: `Interview - ${data.stage}`,
        startISO: data.scheduled_at,
        durationMinutes: data.duration_minutes,
        location: data.location ?? undefined,
        attendeeEmails: [],
      });
      if (calendarEventId) {
        await context.supabase.from("interviews" as never).update({ calendar_event_id: calendarEventId } as never).eq("id", ivRow.id);
      }
    } catch { /* graceful */ }

    // Notify each interviewer in-app
    for (const uid of data.interviewer_ids) {
      await context.supabase.from("notifications").insert({
        user_id: uid, type: "interview", title: "Interview scheduled",
        body: `You're scheduled for an interview on ${new Date(data.scheduled_at).toLocaleString()}`,
        link: `/interviews/${ivRow.id}`,
      });
    }

    // Notify the applicant (best-effort email)
    try {
      const { sendApplicantEmail } = await import("./applicant-emails.functions");
      const { data: app } = await context.supabase.from("job_applications" as never).select("email, applicant_name").eq("id", data.application_id).single();
      const a = app as unknown as { email: string; applicant_name: string };
      await sendApplicantEmail({
        to: a.email, subject: "Interview scheduled",
        body: `Hi ${a.applicant_name},\n\nYou're scheduled for an interview on ${new Date(data.scheduled_at).toLocaleString()}.\n${resolvedLocation ? `Location: ${resolvedLocation}\n` : ""}\nWe look forward to speaking with you.`,
      });
    } catch { /* graceful */ }

    await context.supabase.from("job_application_events" as never).insert({
      application_id: data.application_id, actor_id: context.userId,
      event_type: "interview_scheduled",
      payload: { interview_id: ivRow.id, calendar_event_id: calendarEventId },
    } as never);

    return { id: ivRow.id, calendar_event_id: calendarEventId };
  });

export const submitInterviewFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    interview_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    recommendation: z.enum(["strong_hire","hire","no_hire","strong_no_hire"]),
    notes: z.string().max(10000).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("interview_feedback" as never).upsert({
      interview_id: data.interview_id, interviewer_id: context.userId,
      rating: data.rating, recommendation: data.recommendation, notes: data.notes ?? null,
    } as never, { onConflict: "interview_id,interviewer_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Hiring manager kicks off a hire request from a finalist application, with multi-stage approval. */
export const convertApplicationToHire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    application_id: z.string().uuid(),
    worker_type_id: z.string().uuid(),
    start_date: z.string(),
    notes: z.string().max(2000).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: app, error: aErr } = await context.supabase
      .from("job_applications" as never)
      .select("id, applicant_name, email, requisition_id, job_requisitions:requisition_id(title, department, hiring_manager_id)")
      .eq("id", data.application_id).single();
    if (aErr || !app) throw new Error("Application not found");
    const a = app as {
      applicant_name: string; email: string; requisition_id: string;
      job_requisitions: { title: string; department: string | null; hiring_manager_id: string | null } | null;
    };
    const [firstName, ...rest] = a.applicant_name.split(" ");
    const lastName = rest.join(" ") || "—";
    const { data: reqId, error: rpcErr } = await context.supabase.rpc("create_hire_request" as never, {
      _first_name: firstName, _last_name: lastName, _email: a.email,
      _job_title: a.job_requisitions?.title ?? "",
      _department: a.job_requisitions?.department ?? "",
      _worker_type_id: data.worker_type_id, _start_date: data.start_date,
      _reason: `Hire from application ${data.application_id}`, _notes: data.notes ?? "",
    } as never);
    if (rpcErr) throw new Error(rpcErr.message);
    const hireRequestId = reqId as unknown as string;

    // Build approval chain for the hire request (Supervisor -> HR Admin)
    const chain = await defaultApproverChain(context.supabase as never, context.userId);
    if (chain.length) {
      const { data: chainRow } = await context.supabase.from("approval_chains" as never)
        .insert({ entity_type: "hire_request", entity_id: hireRequestId, created_by: context.userId } as never)
        .select().single();
      const cid = (chainRow as unknown as { id: string }).id;
      await context.supabase.from("approval_steps" as never)
        .insert(chain.map((c) => ({ ...c, chain_id: cid })) as never);
      if (chain[0].approver_id) {
        await context.supabase.from("notifications").insert({
          user_id: chain[0].approver_id, type: "approval", title: "Hire request approval",
          body: `${a.applicant_name} hire request needs ${chain[0].approver_label} approval`,
          link: "/approvals",
        });
      }
    }
    await context.supabase.from("job_application_events" as never).insert({
      application_id: data.application_id, actor_id: context.userId,
      event_type: "hire_request_created", payload: { hire_request_id: hireRequestId },
    } as never);
    return { hire_request_id: hireRequestId };
  });

/** Public: list posted, non-internal requisitions (no auth). Uses publishable server client. */
export const listPublicRequisitions = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.from("job_requisitions")
    .select("id, slug, title, department, location, employment_type, summary, posted_at")
    .eq("status", "posted").eq("internal_only", false)
    .order("posted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getPublicRequisition = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ slug: z.string() }).parse(i))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: row, error } = await sb.from("job_requisitions")
      .select("id, slug, title, department, location, employment_type, summary, description, requirements, benefits, posting_sections, posted_at, closes_at, salary_min, salary_max, brochure_url")
      .eq("slug", data.slug).eq("status", "posted").eq("internal_only", false).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Position not found");
    const r = row as Record<string, unknown> & { brochure_url?: string | null };
    let brochure_signed_url: string | null = null;
    if (r.brochure_url) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: signed } = await supabaseAdmin.storage
          .from("careers-brochures").createSignedUrl(r.brochure_url, 60 * 60);
        brochure_signed_url = signed?.signedUrl ?? null;
      } catch { /* ignore */ }
    }
    return { ...(row as Record<string, unknown>), brochure_signed_url } as typeof row & { brochure_signed_url: string | null };
  });

/** Authenticated: list active positions (job classifications) for the wizard dropdown. */
export const listPositionsForRequisition = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("positions")
      .select("id, title, department, worker_type_id, status")
      .in("status", ["open", "filled"])
      .order("title", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; title: string; department: string | null; worker_type_id: string | null; status: string }>;
  });
