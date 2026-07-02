import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertClerkOrHr(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["hr_admin", "city_clerk"]);
  if (!data || data.length === 0) throw new Error("HR admin or City Clerk only");
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
    return data ?? [];
  });

/** Staff — signed URL for cover letter. */
export const getCoverLetterUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ path: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertClerkOrHr(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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