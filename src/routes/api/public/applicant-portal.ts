import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const SignIn = z.object({ op: z.literal("signin"), last_name: z.string().trim().min(1).max(80), pin: z.string().trim().min(4).max(8) });
const SignOut = z.object({ op: z.literal("signout") });
const Me = z.object({ op: z.literal("me") });
const Cancel = z.object({ op: z.literal("cancel"), signup_id: z.string().uuid() });
const Contact = z.object({
  op: z.literal("contact"),
  signup_id: z.string().uuid(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});
const Clock = z.object({ op: z.literal("clock"), signup_id: z.string().uuid(), action: z.enum(["in", "out"]) });

const Body = z.discriminatedUnion("op", [SignIn, SignOut, Me, Cancel, Contact, Clock]);

type SessionRow = {
  id: string; applicant_first_name: string; applicant_last_name: string;
  applicant_email: string | null; applicant_phone: string | null; status: string; pin_code: string | null;
  shift: { id: string; starts_at: string; ends_at: string; location: string | null; volunteer_jobs: { title: string } | null } | null;
};

async function fetchSignups(admin: any, identity: { last_name: string; email: string | null; signup_id: string }) {
  let q = admin
    .from("volunteer_shift_signups")
    .select("id, applicant_first_name, applicant_last_name, applicant_email, applicant_phone, status, pin_code, shift:volunteer_shifts(id, starts_at, ends_at, location, volunteer_jobs(title))")
    .ilike("applicant_last_name", identity.last_name)
    .order("created_at", { ascending: false });
  if (identity.email) q = q.eq("applicant_email", identity.email);
  const { data } = await q;
  let rows = (data ?? []) as SessionRow[];
  // If we filtered by email, also include the anchoring signup (in case email was later cleared).
  if (identity.email && !rows.some((r) => r.id === identity.signup_id)) {
    const { data: anchor } = await admin
      .from("volunteer_shift_signups")
      .select("id, applicant_first_name, applicant_last_name, applicant_email, applicant_phone, status, pin_code, shift:volunteer_shifts(id, starts_at, ends_at, location, volunteer_jobs(title))")
      .eq("id", identity.signup_id).maybeSingle();
    if (anchor) rows = [anchor as SessionRow, ...rows];
  }
  // Strip the PIN from the outbound payload.
  return rows.map((r) => ({ ...r, pin_code: undefined }));
}

export const Route = createFileRoute("/api/public/applicant-portal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.json();
          const body = Body.parse(raw);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { getApplicantSession, readApplicantIdentity } = await import("@/lib/applicant-session.server");

          if (body.op === "signin") {
            const { data: match } = await supabaseAdmin
              .from("volunteer_shift_signups")
              .select("id, applicant_last_name, applicant_email")
              .eq("pin_code", body.pin)
              .ilike("applicant_last_name", body.last_name)
              .eq("status", "approved")
              .limit(1)
              .maybeSingle();
            if (!match) return Response.json({ ok: false, error: "No matching approved signup. Ask your coordinator to confirm your PIN." }, { status: 401 });
            const session = await getApplicantSession();
            await session.update({
              signup_id: match.id,
              last_name: (match.applicant_last_name ?? body.last_name).toLowerCase(),
              email: match.applicant_email ?? null,
            });
            return Response.json({ ok: true });
          }

          if (body.op === "signout") {
            const session = await getApplicantSession();
            await session.clear();
            return Response.json({ ok: true });
          }

          // All remaining ops require a session.
          const identity = await readApplicantIdentity();
          if (!identity) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });

          if (body.op === "me") {
            const rows = await fetchSignups(supabaseAdmin, identity);
            const { data: openEvents } = await supabaseAdmin
              .from("volunteer_clock_events")
              .select("id, signup_id, clock_in")
              .in("signup_id", rows.map((r) => r.id))
              .is("clock_out", null);
            return Response.json({ ok: true, identity: { last_name: identity.last_name, email: identity.email }, signups: rows, open_events: openEvents ?? [] });
          }

          // For write ops, always re-verify that the target row belongs to this session.
          const rows = await fetchSignups(supabaseAdmin, identity);
          const target = rows.find((r) => r.id === body.signup_id);
          if (!target) return Response.json({ ok: false, error: "Not your shift" }, { status: 403 });

          if (body.op === "cancel") {
            if (target.status !== "pending" && target.status !== "approved") {
              return Response.json({ ok: false, error: "This shift can no longer be cancelled." }, { status: 400 });
            }
            const { error } = await supabaseAdmin
              .from("volunteer_shift_signups")
              .update({ status: "cancelled" })
              .eq("id", body.signup_id);
            if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
            return Response.json({ ok: true });
          }

          if (body.op === "contact") {
            const patch: { applicant_email?: string | null; applicant_phone?: string | null } = {};
            if (body.email !== undefined) patch.applicant_email = body.email ?? null;
            if (body.phone !== undefined) patch.applicant_phone = body.phone ?? null;
            if (Object.keys(patch).length === 0) return Response.json({ ok: true });
            const { error } = await supabaseAdmin.from("volunteer_shift_signups").update(patch).eq("id", body.signup_id);
            if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
            // Refresh the session's email so future queries still find this applicant's rows.
            if (body.email !== undefined) {
              const session = await getApplicantSession();
              await session.update({ ...identity, email: body.email ?? null });
            }
            return Response.json({ ok: true });
          }

          if (body.op === "clock") {
            if (target.status !== "approved") return Response.json({ ok: false, error: "Shift not approved" }, { status: 400 });
            if (body.action === "in") {
              const { data: existing } = await supabaseAdmin.from("volunteer_clock_events").select("id").eq("signup_id", body.signup_id).is("clock_out", null).maybeSingle();
              if (existing) return Response.json({ ok: false, error: "Already clocked in" }, { status: 400 });
              const { error } = await supabaseAdmin.from("volunteer_clock_events").insert({ signup_id: body.signup_id, method: "self" });
              if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
              return Response.json({ ok: true, message: "Clocked in" });
            }
            const { data: open } = await supabaseAdmin.from("volunteer_clock_events").select("id").eq("signup_id", body.signup_id).is("clock_out", null).order("clock_in", { ascending: false }).limit(1).maybeSingle();
            if (!open) return Response.json({ ok: false, error: "Not clocked in" }, { status: 400 });
            const { error } = await supabaseAdmin.from("volunteer_clock_events").update({ clock_out: new Date().toISOString() }).eq("id", open.id);
            if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
            return Response.json({ ok: true, message: "Clocked out" });
          }

          return Response.json({ ok: false, error: "Unknown op" }, { status: 400 });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "Bad request" }, { status: 400 });
        }
      },
    },
  },
});