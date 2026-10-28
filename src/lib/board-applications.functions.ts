import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { maskBoardApplication, isBoardIdentityRevealed } from "@/lib/applicant-alias";

async function assertClerkOrHr(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["hr_admin", "city_clerk"]);
  if (!data || data.length === 0) throw new Error("HR admin or City Clerk only");
}

async function isClerkOrHr(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["hr_admin", "city_clerk"]);
  return !!(data && data.length);
}

/** Public — list bodies currently accepting applications. */
export const listBodiesAcceptingApplications = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("official_bodies")
    .select("id, slug, name, kind, description, meeting_cadence, application_instructions")
    .eq("accepting_applications", true)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
});

/** Staff — list all submissions with interests. */
export const listBoardApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertClerkOrHr(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("board_application_submissions")
      .select("*, board_application_interests(id, body_id, is_primary, official_bodies(id,name,slug))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((a: any) => maskBoardApplication(a));
  });

/** Staff — signed URL for cover letter. */
export const getCoverLetterUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ path: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertClerkOrHr(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owner } = await supabaseAdmin
      .from("board_application_submissions").select("id, status").eq("cover_letter_path", data.path).maybeSingle();
    if (!owner) throw new Error("Not found");
    if (!isBoardIdentityRevealed((owner as any).status)) {
      const { data: logged } = await supabaseAdmin.from("identity_reveal_log").select("id")
        .eq("subject_kind", "board_application").eq("subject_id", (owner as any).id).eq("actor_id", context.userId).limit(1);
      if (!logged?.length) throw new Error("Cover letter is hidden during blind review. Use Show identity first.");
    }
    const { data: signed, error } = await supabaseAdmin.storage
      .from("board-applications")
      .createSignedUrl(data.path, 300);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

/** Staff — update status + audit. */
export const decideBoardApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["submitted", "under_review", "shortlisted", "approved", "declined", "withdrawn"]),
      notes: z.string().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertClerkOrHr(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("board_application_submissions")
      .update({
        status: data.status,
        decided_at: new Date().toISOString(),
        decided_by: context.userId,
        decision_notes: data.notes ?? null,
      } as never)
      .eq("id", data.id);
    if (error) throw error;
    await context.supabase.from("board_application_audit").insert({
      submission_id: data.id,
      actor_id: context.userId,
      action: `status:${data.status}`,
      details: data.notes ? { notes: data.notes } : null,
    } as never);
    return { ok: true };
  });

/** Staff — export CSV. */
export const exportBoardApplicationsCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertClerkOrHr(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("board_application_submissions")
      .select("*, board_application_interests(is_primary, official_bodies(name))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as any[];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Submitted", "First", "Last", "Email", "Phone", "Status", "Primary board", "Other boards", "Statement"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const interests = r.board_application_interests ?? [];
      const primary = interests.find((i: any) => i.is_primary)?.official_bodies?.name ?? "";
      const others = interests.filter((i: any) => !i.is_primary).map((i: any) => i.official_bodies?.name).filter(Boolean).join("; ");
      lines.push([r.created_at, r.first_name, r.last_name, r.email, r.phone, r.status, primary, others, r.statement].map(esc).join(","));
    }
    return { csv: lines.join("\n"), filename: `board-applications-${new Date().toISOString().slice(0, 10)}.csv` };
  });

/** Staff — candidate filings list. */
export const listCandidateFilings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertClerkOrHr(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("candidate_filings")
      .select("*, official_seats(seat_label, official_bodies(name))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

/** Staff — update filing status. */
export const updateCandidateFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["received", "verified", "deficient", "withdrawn"]),
      clerk_notes: z.string().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertClerkOrHr(context.supabase, context.userId);
    const patch: Record<string, unknown> = { status: data.status, clerk_notes: data.clerk_notes ?? null };
    if (data.status === "verified") {
      patch.verified_by = context.userId;
      patch.verified_at = new Date().toISOString();
    }
    const { error } = await context.supabase.from("candidate_filings").update(patch as never).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Staff — single application detail with scores + audit. */
export const getBoardApplicationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    if (!(await isClerkOrHr(context.supabase, context.userId))) {
      throw new Error("HR admin or City Clerk only");
    }
    const { data: app, error } = await context.supabase
      .from("board_application_submissions")
      .select("*, board_application_interests(id, body_id, is_primary, official_bodies(id,name,slug))")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!app) throw new Error("Not found");
    const { data: scores } = await context.supabase
      .from("board_application_scores")
      .select("id, body_id, scorer_user_id, score, comments, created_at, updated_at")
      .eq("submission_id", data.id);
    const { data: audit } = await context.supabase
      .from("board_application_audit")
      .select("id, actor_id, action, details, created_at")
      .eq("submission_id", data.id)
      .order("created_at", { ascending: false });
    return { application: maskBoardApplication(app as any), scores: scores ?? [], audit: audit ?? [] };
  });

/** Any signed-in user — upsert their own score for an applicant/body. */
export const scoreBoardApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      submission_id: z.string().uuid(),
      body_id: z.string().uuid(),
      score: z.number().int().min(1).max(5),
      comments: z.string().max(2000).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("board_application_scores")
      .upsert(
        {
          submission_id: data.submission_id,
          body_id: data.body_id,
          scorer_user_id: context.userId,
          score: data.score,
          comments: data.comments ?? null,
        } as never,
        { onConflict: "submission_id,body_id,scorer_user_id" } as never,
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Staff — side-by-side compare for a body. */
export const compareApplicationsForBody = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ body_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertClerkOrHr(context.supabase, context.userId);
    const { data: interests, error } = await context.supabase
      .from("board_application_interests")
      .select("submission_id, is_primary, board_application_submissions(*)")
      .eq("body_id", data.body_id);
    if (error) throw error;
    const submissionIds = (interests ?? [])
      .map((r: any) => r.submission_id)
      .filter(Boolean);
    const { data: scores } = submissionIds.length
      ? await context.supabase
          .from("board_application_scores")
          .select("submission_id, score, comments, scorer_user_id")
          .eq("body_id", data.body_id)
          .in("submission_id", submissionIds)
      : { data: [] as any[] };
    return {
      interests: (interests ?? []).map((r: any) => ({ ...r, board_application_submissions: r.board_application_submissions ? maskBoardApplication(r.board_application_submissions) : null })),
      scores: scores ?? [],
    };
  });

/** Staff — vacant seats for a body (no active/pending term). */
export const listVacantSeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ body_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertClerkOrHr(context.supabase, context.userId);
    const { data: seats, error } = await context.supabase
      .from("official_seats")
      .select("id, seat_label, seat_number, is_chair, term_length_months, official_terms(id, status, end_date)")
      .eq("body_id", data.body_id)
      .order("seat_number", { ascending: true });
    if (error) throw error;
    // Filter: vacant = no term with status active or pending
    const vacant = (seats ?? []).filter((s: any) => {
      const terms = s.official_terms ?? [];
      return !terms.some((t: any) => t.status === "active" || t.status === "pending");
    });
    return vacant.map((s: any) => ({
      id: s.id,
      seat_label: s.seat_label,
      seat_number: s.seat_number,
      is_chair: s.is_chair,
      term_length_months: s.term_length_months,
    }));
  });

/** Staff — appoint an applicant to a seat. Creates official + term, marks approved. */
export const appointApplicantToSeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      submission_id: z.string().uuid(),
      seat_id: z.string().uuid(),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      appointment_type: z.enum(["appointed", "elected", "ex_officio"]).default("appointed"),
      notes: z.string().max(2000).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertClerkOrHr(context.supabase, context.userId);
    // Load applicant
    const { data: app, error: aerr } = await context.supabase
      .from("board_application_submissions")
      .select("id, first_name, last_name, email, phone")
      .eq("id", data.submission_id)
      .maybeSingle();
    if (aerr) throw aerr;
    if (!app) throw new Error("Application not found");
    const appl = app as { id: string; first_name: string; last_name: string; email: string; phone: string | null };

    // Reuse existing official by email if present, else create.
    let officialId: string | null = null;
    if (appl.email) {
      const { data: existing } = await context.supabase
        .from("officials")
        .select("id")
        .eq("email", appl.email)
        .maybeSingle();
      if (existing) officialId = (existing as { id: string }).id;
    }
    if (!officialId) {
      const { data: inserted, error: ierr } = await context.supabase
        .from("officials")
        .insert({
          first_name: appl.first_name,
          last_name: appl.last_name,
          email: appl.email,
          phone: appl.phone,
        } as never)
        .select("id")
        .single();
      if (ierr) throw new Error(ierr.message);
      officialId = (inserted as { id: string }).id;
    }

    // Create term
    const { data: termRow, error: terr } = await context.supabase
      .from("official_terms")
      .insert({
        official_id: officialId,
        seat_id: data.seat_id,
        appointment_type: data.appointment_type,
        start_date: data.start_date,
        end_date: data.end_date ?? null,
        status: "pending",
        notes: data.notes ?? null,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (terr) throw new Error(terr.message);

    // Mark application approved
    await context.supabase
      .from("board_application_submissions")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
        decided_by: context.userId,
        decision_notes: data.notes ?? "Appointed to seat",
      } as never)
      .eq("id", data.submission_id);

    await context.supabase.from("board_application_audit").insert({
      submission_id: data.submission_id,
      actor_id: context.userId,
      action: "appointed",
      details: {
        seat_id: data.seat_id,
        term_id: (termRow as { id: string }).id,
        official_id: officialId,
      },
    } as never);

    return { ok: true, term_id: (termRow as { id: string }).id, official_id: officialId };
  });
/** HR / City Clerk — reveal a board applicant's identity during blind review. Logged. */
export const revealBoardApplicantIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertClerkOrHr(context.supabase, context.userId);
    const { error: logErr } = await context.supabase.from("identity_reveal_log").insert({
      subject_kind: "board_application", subject_id: data.id, actor_id: context.userId, reason: data.reason ?? null,
    } as never);
    if (logErr) throw new Error(logErr.message);
    const { data: app, error } = await context.supabase
      .from("board_application_submissions").select("*").eq("id", data.id).maybeSingle();
    if (error || !app) throw new Error(error?.message ?? "Not found");
    return app as any;
  });
