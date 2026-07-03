import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Lookup = z.object({ pin: z.string().min(4).max(8), last_name: z.string().min(1).max(80) });
const Action = z.object({ signup_id: z.string().uuid(), pin: z.string().min(4).max(8), action: z.enum(["in", "out"]) });

export const Route = createFileRoute("/api/public/volunteer-clock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          if (body.op === "lookup") {
            const p = Lookup.parse(body);
            const { data } = await supabaseAdmin
              .from("volunteer_shift_signups")
              .select("id, applicant_first_name, applicant_last_name, shift:volunteer_shifts(id, starts_at, ends_at, location, volunteer_jobs(title))")
              .eq("pin_code", p.pin)
              .ilike("applicant_last_name", p.last_name)
              .eq("status", "approved")
              .maybeSingle();
            if (!data) return Response.json({ ok: false, error: "No match" }, { status: 404 });
            const { data: openEvt } = await supabaseAdmin
              .from("volunteer_clock_events").select("id, clock_in").eq("signup_id", data.id).is("clock_out", null).order("clock_in", { ascending: false }).limit(1).maybeSingle();
            return Response.json({ ok: true, signup: data, open: openEvt });
          }
          if (body.op === "action") {
            const p = Action.parse(body);
            const { data: signup } = await supabaseAdmin.from("volunteer_shift_signups").select("id").eq("id", p.signup_id).eq("pin_code", p.pin).eq("status", "approved").maybeSingle();
            if (!signup) return Response.json({ ok: false, error: "Invalid PIN" }, { status: 401 });
            if (p.action === "in") {
              const { data: existing } = await supabaseAdmin.from("volunteer_clock_events").select("id").eq("signup_id", p.signup_id).is("clock_out", null).maybeSingle();
              if (existing) return Response.json({ ok: false, error: "Already clocked in" }, { status: 400 });
              const { error } = await supabaseAdmin.from("volunteer_clock_events").insert({ signup_id: p.signup_id, method: "self" });
              if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
              return Response.json({ ok: true, message: "Clocked in" });
            }
            const { data: open } = await supabaseAdmin.from("volunteer_clock_events").select("id").eq("signup_id", p.signup_id).is("clock_out", null).order("clock_in", { ascending: false }).limit(1).maybeSingle();
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