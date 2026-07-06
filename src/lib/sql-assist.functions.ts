import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireHrAdmin } from "@/lib/role-check.server";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { resolveModelFor } from "@/lib/ai-settings.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

const Input = z.object({
  mode: z.enum(["draft", "explain", "fix"]),
  prompt: z.string().max(4000).optional(),
  sql: z.string().max(20_000).optional(),
  error: z.string().max(4000).optional(),
});

function extractSql(text: string): string {
  const fence = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  return text.trim();
}

export const sqlAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<{ sql?: string; explanation?: string }> => {
    await requireHrAdmin(context.supabase, context.userId);
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const model = await resolveModelFor("sql_helper", context.supabase, "openai/gpt-5.5");
    const gateway = createLovableAiGatewayProvider(key);

    const { data: schema } = await (context.supabase as any).rpc("get_report_schema");
    const compactSchema = (schema?.tables ?? [])
      .map((t: any) => `${t.table_name}(${t.columns.map((c: any) => c.name).join(", ")})`)
      .join("\n");

    const system = `You are a Postgres SQL assistant for an HR/civic-services app. The database has these public tables:\n${compactSchema}\n\nRules:\n- Only produce read-only SELECT/WITH queries.\n- Never write DDL/DML.\n- Prefer LIMIT to avoid huge scans.\n- Return one clean SQL block for draft/fix mode, no commentary.\n- For explain mode return plain-English prose, no SQL fences.`;

    let user = "";
    if (data.mode === "draft") user = `Draft a query for: ${data.prompt ?? ""}`;
    else if (data.mode === "explain") user = `Explain what this query does in plain English:\n\n${data.sql}`;
    else user = `Fix this SQL. Error was:\n${data.error ?? "(no error text)"}\n\nSQL:\n${data.sql}`;

    const out = await generateText({
      model: (gateway as any)(model),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (data.mode === "explain") return { explanation: out.text.trim() };
    return { sql: extractSql(out.text) };
  });