import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertHrAdmin(ctx: { supabase: ReturnType<typeof requireSupabaseAuth>["_"] extends never ? never : any; userId: string }) {
  const { data, error } = await (ctx.supabase as any).rpc("has_role", { _user_id: ctx.userId, _role: "hr_admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only HR admins can use SQL reports");
}

export const runReportSql = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sql: string; limit?: number }) =>
    z.object({ sql: z.string().min(1).max(50_000), limit: z.number().int().min(1).max(10_000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context as any);
    const { data: result, error } = await (context.supabase as any).rpc("run_report_sql", {
      _sql: data.sql,
      _limit: data.limit ?? 1000,
    });
    if (error) throw new Error(error.message);
    return result as { rows: Record<string, unknown>[]; row_count: number; duration_ms: number; limit_applied: number; truncated: boolean };
  });

export const getReportSchema = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHrAdmin(context as any);
    const { data, error } = await (context.supabase as any).rpc("get_report_schema");
    if (error) throw new Error(error.message);
    return data as {
      tables: { table_name: string; columns: { name: string; type: string; nullable: boolean }[] }[];
      foreign_keys: { table: string; column: string; references_table: string; references_column: string }[];
    };
  });

export const listSavedReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHrAdmin(context as any);
    const [{ data: reports, error: rErr }, { data: favs, error: fErr }] = await Promise.all([
      (context.supabase as any).from("saved_reports").select("*").order("updated_at", { ascending: false }),
      (context.supabase as any).from("report_favorites").select("report_id").eq("user_id", context.userId),
    ]);
    if (rErr) throw new Error(rErr.message);
    if (fErr) throw new Error(fErr.message);
    const favSet = new Set((favs ?? []).map((r: { report_id: string }) => r.report_id));
    return (reports ?? []).map((r: Record<string, unknown>) => ({ ...r, is_favorite: favSet.has(r.id as string) }));
  });

export const saveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    name: string;
    description?: string;
    sql: string;
    builder_state?: Record<string, unknown> | null;
    is_shared?: boolean;
    tags?: string[];
  }) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      sql: z.string().min(1).max(50_000),
      builder_state: z.record(z.unknown()).nullable().optional(),
      is_shared: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context as any);
    const payload = {
      name: data.name,
      description: data.description ?? null,
      sql: data.sql,
      builder_state: data.builder_state ?? null,
      is_shared: data.is_shared ?? false,
      tags: data.tags ?? [],
    };
    if (data.id) {
      const { data: row, error } = await (context.supabase as any)
        .from("saved_reports").update(payload).eq("id", data.id).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await (context.supabase as any)
      .from("saved_reports").insert({ ...payload, created_by: context.userId }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSavedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context as any);
    const { error } = await (context.supabase as any).from("saved_reports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleFavoriteReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { report_id: string; on: boolean }) =>
    z.object({ report_id: z.string().uuid(), on: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context as any);
    if (data.on) {
      const { error } = await (context.supabase as any).from("report_favorites")
        .upsert({ user_id: context.userId, report_id: data.report_id });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await (context.supabase as any).from("report_favorites")
        .delete().eq("user_id", context.userId).eq("report_id", data.report_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const listReportQueryLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHrAdmin(context as any);
    const { data, error } = await (context.supabase as any)
      .from("report_query_log").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });