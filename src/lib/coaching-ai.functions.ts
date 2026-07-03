import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, generateObject } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";

function gateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

/** Summarize the shared notes of a 1-on-1 session. */
export const summarizeOneOnOne = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ session_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: session, error: sErr } = await context.supabase
      .from("one_on_ones")
      .select("id, title, scheduled_at, summary")
      .eq("id", data.session_id)
      .maybeSingle();
    if (sErr || !session) throw new Error("Session not found or no access");

    const { data: agenda, error: aErr } = await context.supabase
      .from("one_on_one_agenda_notes")
      .select("agenda_index, agenda_prompt, content")
      .eq("session_id", data.session_id)
      .order("agenda_index", { ascending: true });
    if (aErr) throw aErr;

    const combined = ((agenda ?? []) as Array<{ agenda_prompt: string | null; content: string }>)
      .filter((a) => a.content?.trim())
      .map((a) => `Q: ${a.agenda_prompt ?? ""}\nNotes: ${a.content}`)
      .join("\n\n");
    if (!combined.trim()) throw new Error("No agenda notes to summarize yet");

    const prompt = `You are an executive coach helping a manager process a 1-on-1 meeting.
Summarize the following agenda-item notes into:
1. Key themes (2-4 bullets)
2. Wins and progress
3. Blockers / concerns
4. Coaching focus for next session

Keep it crisp, professional, and action-oriented. Use markdown bullets.

Meeting: ${session.title ?? "Untitled 1-on-1"}
Notes:
${combined}`;

    const { text } = await generateText({ model: gateway()(MODEL), prompt });

    await context.supabase
      .from("one_on_ones")
      .update({ ai_summary: text, ai_generated_at: new Date().toISOString() })
      .eq("id", data.session_id);

    await context.supabase.rpc("record_audit_event" as never, {
      _action: "ai_summarize", _entity: "one_on_one", _entity_id: data.session_id,
      _diff: { model: MODEL },
    } as never);

    return { summary: text };
  });

/** Extract action items from shared notes, insert them as rows. */
export const extractOneOnOneActionItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    session_id: z.string().uuid(),
    agenda_index: z.number().int().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("one_on_one_agenda_notes")
      .select("agenda_index, agenda_prompt, content")
      .eq("session_id", data.session_id);
    if (typeof data.agenda_index === "number") q = q.eq("agenda_index", data.agenda_index);
    const { data: notes, error } = await q;
    if (error) throw error;
    const combined = ((notes ?? []) as Array<{ agenda_prompt: string | null; content: string }>)
      .filter((n) => n.content?.trim())
      .map((n) => `Q: ${n.agenda_prompt ?? ""}\nNotes: ${n.content}`)
      .join("\n\n");
    if (!combined.trim()) throw new Error("No agenda notes to scan");

    const prompt = `Scan the following 1-on-1 meeting notes and extract concrete action items / commitments.
If there are no clear action items, return an empty array.

Notes:
${combined}`;

    let items: Array<{ text: string; due_date?: string | null; assignee?: string | null }> = [];
    try {
      const { object } = await generateObject({
        model: gateway()(MODEL),
        schema: z.object({
          items: z.array(z.object({
            text: z.string(),
            due_date: z.string().nullable().optional(),
            assignee: z.enum(["manager", "employee", "other"]).nullable().optional(),
          })),
        }),
        prompt,
      });
      items = object.items ?? [];
    } catch {
      // Fallback: try free-text + JSON extraction in case structured output is unsupported.
      const { text } = await generateText({ model: gateway()(MODEL), prompt: `${prompt}\n\nReturn ONLY a JSON array like [{"text":"...","due_date":"YYYY-MM-DD or null","assignee":"manager|employee|other or null"}].` });
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try { items = JSON.parse(match[0]); } catch { items = []; }
      }
    }
    if (!Array.isArray(items) || items.length === 0) return { inserted: 0, items: [] };

    const rows = items
      .filter((i) => i?.text && typeof i.text === "string")
      .map((i) => ({
        session_id: data.session_id,
        text: i.text.slice(0, 500),
        due_date: i.due_date && /^\d{4}-\d{2}-\d{2}$/.test(i.due_date) ? i.due_date : null,
        assignee_label: i.assignee ?? null,
        created_by: context.userId,
      }));
    if (!rows.length) return { inserted: 0, items: [] };

    const { error: insErr } = await context.supabase.from("one_on_one_action_items").insert(rows);
    if (insErr) throw insErr;

    await context.supabase.rpc("record_audit_event" as never, {
      _action: "ai_extract_actions", _entity: "one_on_one", _entity_id: data.session_id,
      _diff: { count: rows.length },
    } as never);

    return { inserted: rows.length, items: rows };
  });

/** Roll up cascade responses into a themed summary. HR-only. */
export const summarizeCascade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ cascade_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "hr_admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Only HR admins can summarize cascades");

    const { data: responses, error } = await context.supabase
      .from("cascade_responses")
      .select("manager_name, department, team_feedback")
      .eq("cascade_id", data.cascade_id);
    if (error) throw error;
    if (!responses?.length) throw new Error("No responses to summarize");

    const combined = responses
      .map((r) => `[Department: ${r.department ?? "Unspecified"}] ${r.manager_name ?? "Manager"}: ${r.team_feedback}`)
      .join("\n\n");

    const prompt = `You are summarizing team feedback gathered from supervisors across a municipal organization.
Group themes by department where possible. Output markdown with:
- Top recurring themes
- Department-specific concerns
- Suggested follow-up actions for leadership

Feedback:
${combined}`;

    const { text } = await generateText({ model: gateway()(MODEL), prompt });

    await context.supabase
      .from("cascades")
      .update({ ai_summary: text, ai_generated_at: new Date().toISOString() })
      .eq("id", data.cascade_id);

    await context.supabase.rpc("record_audit_event" as never, {
      _action: "ai_summarize", _entity: "cascade", _entity_id: data.cascade_id,
      _diff: { responses: responses.length },
    } as never);

    return { summary: text };
  });