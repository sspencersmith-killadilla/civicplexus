import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireHrAdmin } from "@/lib/role-check.server";

type ColumnMapEntry = { key: string; label: string; format?: string };

function fmtDate(v: unknown, format?: string) {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  if (format === "MM/DD/YYYY") return `${mm}/${dd}/${yyyy}`;
  return d.toISOString().slice(0, 10);
}

function csvEscape(v: unknown) {
  if (v == null) return "";
  const s = String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const previewPayrollExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { profile_id?: string; template_id?: string; pay_run_id: string }) =>
    z.object({
      profile_id: z.string().uuid().optional(),
      template_id: z.string().uuid().optional(),
      pay_run_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "hr_admin" });
    if (!ok) throw new Error("HR admin only");

    let columnMap: ColumnMapEntry[] = [];
    let earningsCodes: Record<string, string> = {};
    let delim = ",";

    if (data.template_id) {
      const { data: tpl } = await context.supabase.from("payroll_export_templates").select("*").eq("id", data.template_id).single();
      if (tpl) {
        columnMap = (tpl.column_map ?? []) as ColumnMapEntry[];
        earningsCodes = (tpl.earnings_codes ?? {}) as Record<string, string>;
        delim = tpl.delimiter ?? ",";
      }
    } else if (data.profile_id) {
      const { data: prof } = await context.supabase.from("payroll_export_profiles").select("*").eq("id", data.profile_id).single();
      if (prof) {
        const cm = prof.column_map as unknown;
        if (Array.isArray(cm)) columnMap = cm as ColumnMapEntry[];
        else if (cm && typeof cm === "object") columnMap = Object.entries(cm as Record<string, string>).map(([k, v]) => ({ key: k, label: v }));
        earningsCodes = (prof.earnings_codes ?? {}) as Record<string, string>;
      }
    }
    if (!columnMap.length) throw new Error("No column map configured");

    const { data: lines, error } = await context.supabase
      .from("payroll_run_lines").select("*").eq("run_id", data.pay_run_id);
    if (error) throw new Error(error.message);

    const rows = (lines ?? []).map((ln: Record<string, unknown>) => {
      const out: Record<string, string> = {};
      for (const col of columnMap) {
        let raw = ln[col.key];
        if (col.key === "pay_code" || col.key === "earnings_code" || col.key === "earning_code") {
          const k = String(ln.pay_type ?? ln.earnings_kind ?? "regular");
          raw = earningsCodes[k] ?? k.toUpperCase();
        }
        if (col.format && col.key.includes("date")) raw = fmtDate(raw, col.format);
        out[col.label] = String(raw ?? "");
      }
      return out;
    });

    const header = columnMap.map((c) => csvEscape(c.label)).join(delim);
    const body = rows.map((r) => columnMap.map((c) => csvEscape(r[c.label])).join(delim)).join("\n");
    const csv = header + "\n" + body;

    return { row_count: rows.length, preview: rows.slice(0, 25), csv: csv.slice(0, 12000) };
  });
