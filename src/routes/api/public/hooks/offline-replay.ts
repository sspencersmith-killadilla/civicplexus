import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Public dispatcher invoked by the service worker's Background Sync handler
// to replay queued actions when the originating tab is closed. Each request
// carries the user's Supabase access token; we verify it and execute the
// action against the same RPCs the in-app server functions use, so RLS
// and audit logging behave identically.

const Body = z.object({
  kind: z.enum([
    "clock_in",
    "clock_out",
    "submit_leave",
    "decide_leave",
    "decide_paf",
  ]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/offline-replay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ")
          ? auth.slice(7).trim()
          : "";
        if (!token) return json({ error: "Missing bearer token" }, 401);

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch (err) {
          return json({ error: "Invalid body", detail: String(err) }, 400);
        }

        const url = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
        const pubKey =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !pubKey) return json({ error: "Server misconfigured" }, 500);

        // User-scoped client: RLS applies as the calling user.
        const sb = createClient(url, pubKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });

        const { data: userRes, error: uErr } = await sb.auth.getUser(token);
        if (uErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
        const userId = userRes.user.id;

        try {
          switch (body.kind) {
            case "clock_in": {
              const note = (body.payload.note as string | undefined) ?? null;
              const { data, error } = await sb.rpc("clock_in" as never, { _note: note } as never);
              if (error) throw new Error(error.message);
              return json({ ok: true, id: String(data ?? "") });
            }
            case "clock_out": {
              const note = (body.payload.note as string | undefined) ?? null;
              const { data, error } = await sb.rpc("clock_out" as never, { _note: note } as never);
              if (error) throw new Error(error.message);
              return json({ ok: true, id: String(data ?? "") });
            }
            case "submit_leave": {
              const p = body.payload as Record<string, unknown>;
              const { data, error } = await sb
                .from("leave_requests")
                .insert({
                  employee_id: p.employee_id,
                  plan_id: p.plan_id,
                  start_date: p.start_date,
                  end_date: p.end_date,
                  total_hours: p.total_hours,
                  is_intermittent: p.is_intermittent ?? false,
                  reason: p.reason ?? null,
                  fmla_case_id: p.fmla_case_id ?? null,
                  status: "submitted",
                  submitted_by: userId,
                } as never)
                .select("id")
                .single();
              if (error || !data) throw new Error(error?.message ?? "Insert failed");
              return json({ ok: true, id: (data as { id: string }).id });
            }
            case "decide_leave": {
              const p = body.payload as { id: string; decision: string; notes?: string };
              const { error } = await sb
                .from("leave_requests")
                .update({
                  status: p.decision,
                  decided_by: userId,
                  decided_at: new Date().toISOString(),
                  decision_notes: p.notes ?? null,
                } as never)
                .eq("id", p.id);
              if (error) throw new Error(error.message);
              return json({ ok: true });
            }
            case "decide_paf": {
              const p = body.payload as { step_id: string; decision: string; notes?: string };
              const { error } = await sb.rpc("decide_paf_step" as never, {
                _step_id: p.step_id,
                _decision: p.decision,
                _notes: p.notes ?? null,
              } as never);
              if (error) throw new Error(error.message);
              return json({ ok: true });
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return json({ error: message }, 422);
        }
      },
    },
  },
});