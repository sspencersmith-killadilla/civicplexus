import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  application_id: z.string().uuid(),
  gender: z.string().max(40).optional(),
  race_ethnicity: z.string().max(80).optional(),
  veteran_status: z.string().max(80).optional(),
  disability_status: z.string().max(80).optional(),
  declined: z.boolean().optional(),
});

export const Route = createFileRoute("/api/public/job-applications/self-id")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Verify application exists; otherwise reject to prevent random inserts
        const { data: app } = await supabaseAdmin.from("job_applications").select("id").eq("id", parsed.data.application_id).maybeSingle();
        if (!app) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
        const { error } = await supabaseAdmin.from("application_self_id").upsert({
          application_id: parsed.data.application_id,
          gender: parsed.data.gender || null,
          race_ethnicity: parsed.data.race_ethnicity || null,
          veteran_status: parsed.data.veteran_status || null,
          disability_status: parsed.data.disability_status || null,
          declined: parsed.data.declined ?? false,
        }, { onConflict: "application_id" });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});