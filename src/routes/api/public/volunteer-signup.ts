import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  shift_id: z.string().uuid(),
  first_name: z.string().min(1).max(80),
  last_name: z.string().min(1).max(80),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  message: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute("/api/public/volunteer-signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = Body.parse(await request.json());
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("volunteer_shift_signups").insert({
            shift_id: body.shift_id,
            applicant_first_name: body.first_name,
            applicant_last_name: body.last_name,
            applicant_email: body.email ?? null,
            applicant_phone: body.phone ?? null,
            message: body.message ?? null,
            status: "pending",
          });
          if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
          return Response.json({ ok: true });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "Bad request" }, { status: 400 });
        }
      },
    },
  },
});