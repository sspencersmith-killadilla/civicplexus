import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertCanManage(supabase: {
  rpc: (fn: string) => Promise<{ data: unknown }>;
}) {
  const { data } = await supabase.rpc("can_manage_officials_self" as never);
  if (!data) throw new Error("Not authorized to manage officials");
}

// Instead of a new RPC, guard client-side by reading role: hr_admin OR city_clerk.
async function assertRole(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["hr_admin", "city_clerk"]);
  if (!data || data.length === 0) throw new Error("HR admin or City Clerk only");
}

/** List every body (auth-only; public roster uses officialsPublic). */
export const listBodies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("official_bodies")
      .select("*, official_seats(*)")
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  });

/** Full detail for one body: seats + current active terms + officials. */
export const getBody = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ body_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const [{ data: body, error: bErr }, { data: seats }, { data: terms }] = await Promise.all([
      context.supabase.from("official_bodies").select("*").eq("id", data.body_id).maybeSingle(),
      context.supabase.from("official_seats").select("*").eq("body_id", data.body_id).order("seat_number"),
      context.supabase
        .from("official_terms")
        .select("*, officials(*), official_seats!inner(id, body_id, seat_label, seat_number, is_chair)")
        .eq("official_seats.body_id", data.body_id)
        .order("start_date", { ascending: false }),
    ]);
    if (bErr) throw bErr;
    return { body, seats: seats ?? [], terms: terms ?? [] };
  });

/** Create / update a body (clerk or HR). */
export const upsertBody = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      slug: z.string().min(2),
      name: z.string().min(2),
      kind: z.enum(["council", "board", "commission", "authority", "committee"]),
      description: z.string().nullable().optional(),
      comp_model: z.enum(["unpaid", "fixed_stipend", "per_meeting", "mixed"]),
      fixed_stipend_amount: z.number().nullable().optional(),
      fixed_stipend_period: z.enum(["monthly", "annual", "per_pay_period"]).nullable().optional(),
      per_meeting_amount: z.number().nullable().optional(),
      chair_bonus_amount: z.number().nullable().optional(),
      per_diem_amount: z.number().nullable().optional(),
      pay_absent: z.boolean().optional(),
      meeting_cadence: z.string().nullable().optional(),
      roster_public: z.boolean(),
      sort_order: z.number().int().default(100),
      accepting_applications: z.boolean().optional(),
      application_instructions: z.string().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("official_bodies").update(rest as never).eq("id", id);
      if (error) throw error;
      return { id };
    }
    const { data: row, error } = await context.supabase
      .from("official_bodies")
      .insert(rest as never)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return { id: (row as { id: string }).id };
  });

/** Create / update a seat. */
export const upsertSeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      body_id: z.string().uuid(),
      seat_label: z.string().min(1),
      seat_number: z.number().int().nullable().optional(),
      is_chair: z.boolean().default(false),
      is_ex_officio: z.boolean().default(false),
      term_length_months: z.number().int().nullable().optional(),
      appointing_authority: z.string().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("official_seats").update(rest as never).eq("id", id);
      if (error) throw error;
      return { id };
    }
    const { data: row, error } = await context.supabase
      .from("official_seats")
      .insert(rest as never)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return { id: (row as { id: string }).id };
  });

/** Upsert an official record. */
export const upsertOfficial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      first_name: z.string().min(1),
      last_name: z.string().min(1),
      preferred_name: z.string().nullable().optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().nullable().optional(),
      bio: z.string().nullable().optional(),
      publish_contact: z.boolean().default(false),
      publish_photo: z.boolean().default(false),
      publish_bio: z.boolean().default(true),
      employee_id: z.string().uuid().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("officials").update(rest as never).eq("id", id);
      if (error) throw error;
      return { id };
    }
    const { data: row, error } = await context.supabase
      .from("officials")
      .insert(rest as never)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return { id: (row as { id: string }).id };
  });

/** Create a new term (starts in `pending` status). */
export const createTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      official_id: z.string().uuid(),
      seat_id: z.string().uuid(),
      appointment_type: z.enum(["elected", "appointed", "ex_officio"]),
      start_date: z.string(),
      end_date: z.string().nullable().optional(),
      appointing_authority: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("official_terms")
      .insert({ ...data, status: "pending", created_by: context.userId } as never)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return { id: (row as { id: string }).id };
  });

/** Swear in — flips pending → active and stamps oath timestamp. */
export const swearIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      term_id: z.string().uuid(),
      oath_signed_at: z.string().optional(),
      bond_amount: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("official_terms")
      .update({
        status: "active",
        oath_signed_at: data.oath_signed_at ?? new Date().toISOString(),
        oath_administered_by: context.userId,
        bond_amount: data.bond_amount ?? null,
        notes: data.notes ?? null,
      } as never)
      .eq("id", data.term_id);
    if (error) throw error;
    return { ok: true };
  });

/** End a term (expiration / resignation / removal). */
export const endTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      term_id: z.string().uuid(),
      status: z.enum(["expired", "resigned", "removed"]),
      ended_reason: z.string().nullable().optional(),
      end_date: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("official_terms")
      .update({
        status: data.status,
        ended_at: new Date().toISOString(),
        ended_reason: data.ended_reason ?? null,
        end_date: data.end_date ?? new Date().toISOString().slice(0, 10),
      } as never)
      .eq("id", data.term_id);
    if (error) throw error;
    return { ok: true };
  });

/** Term-expiration dashboard: active terms ending within N days. */
export const upcomingExpirations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ days: z.number().int().default(90) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + data.days);
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("official_terms")
      .select("id, start_date, end_date, status, officials(first_name,last_name), official_seats(seat_label, official_bodies(name,slug))")
      .eq("status", "active")
      .not("end_date", "is", null)
      .gte("end_date", today)
      .lte("end_date", cutoff.toISOString().slice(0, 10))
      .order("end_date");
    if (error) throw error;
    return rows ?? [];
  });

/** Archive: terms whose end_date is in the past, or whose status is ended (expired/resigned/removed). */
export const listExpiredTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      search: z.string().optional().default(""),
      body_id: z.string().uuid().nullable().optional(),
      status: z.enum(["any", "expired", "resigned", "removed", "active_past_end"]).optional().default("any"),
      from: z.string().nullable().optional(),
      to: z.string().nullable().optional(),
      limit: z.number().int().min(1).max(500).optional().default(200),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    let q = context.supabase
      .from("official_terms")
      .select("id, start_date, end_date, status, ended_reason, appointment_type, officials(first_name,last_name), official_seats(seat_label, body_id, official_bodies(id,name,slug))")
      .not("end_date", "is", null)
      .lt("end_date", today)
      .order("end_date", { ascending: false })
      .limit(data.limit);

    if (data.status === "expired" || data.status === "resigned" || data.status === "removed") {
      q = q.eq("status", data.status);
    } else if (data.status === "active_past_end") {
      q = q.eq("status", "active");
    }
    if (data.from) q = q.gte("end_date", data.from);
    if (data.to) q = q.lte("end_date", data.to);

    const { data: rows, error } = await q;
    if (error) throw error;
    let out = rows ?? [];
    if (data.body_id) {
      out = out.filter((r: any) => r.official_seats?.body_id === data.body_id);
    }
    if (data.search.trim()) {
      const s = data.search.trim().toLowerCase();
      out = out.filter((r: any) => {
        const name = `${r.officials?.first_name ?? ""} ${r.officials?.last_name ?? ""}`.toLowerCase();
        const body = (r.official_seats?.official_bodies?.name ?? "").toLowerCase();
        const seat = (r.official_seats?.seat_label ?? "").toLowerCase();
        return name.includes(s) || body.includes(s) || seat.includes(s);
      });
    }
    return out;
  });

/** Create a signed upload URL for an official photo (clerk/HR only). */
export const createOfficialPhotoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      official_id: z.string().uuid(),
      content_type: z.string().regex(/^image\/(png|jpe?g|webp)$/),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = data.content_type === "image/png" ? "png" : data.content_type === "image/webp" ? "webp" : "jpg";
    const path = `photos/${data.official_id}/${Date.now()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("official-photos")
      .createSignedUploadUrl(path);
    if (error) throw error;
    return { path, signed_url: signed.signedUrl, token: signed.token };
  });

/** Persist storage path on the official after upload. */
export const confirmOfficialPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ official_id: z.string().uuid(), path: z.string().min(3) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("officials")
      .update({ photo_path: data.path } as never)
      .eq("id", data.official_id);
    if (error) throw error;
    return { ok: true };
  });

// Silence unused import warning; keeping helper for future extension.
void assertCanManage;

/** Generate stipend/per-diem reimbursements from meeting attendance for a body & date range. */
export const generateMeetingReimbursements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      body_id: z.string().uuid(),
      from: z.string(),
      to: z.string(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "generate_meeting_reimbursements" as never,
      { p_body_id: data.body_id, p_from: data.from, p_to: data.to } as never,
    );
    if (error) throw error;
    const r = (Array.isArray(rows) ? rows[0] : rows) as { created: number; skipped: number } | null;
    return { created: r?.created ?? 0, skipped: r?.skipped ?? 0 };
  });