import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers: string[], rows: (unknown[])[]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

/** Public roster CSV — only publicly-visible bodies and members. */
export const exportPublicRosterCsv = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: bodies, error: bErr } = await supabaseAdmin
    .from("official_bodies")
    .select("id, name, kind, meeting_cadence")
    .eq("roster_public", true)
    .order("sort_order");
  if (bErr) throw bErr;
  const bodyIds = (bodies ?? []).map((b: any) => b.id);
  const { data: terms, error: tErr } = bodyIds.length
    ? await supabaseAdmin
        .from("official_terms")
        .select("start_date, end_date, appointment_type, official_seats!inner(seat_label, is_chair, body_id), officials(first_name, last_name, preferred_name, email, phone, publish_contact)")
        .eq("status", "active")
        .in("official_seats.body_id", bodyIds)
    : { data: [], error: null };
  if (tErr) throw tErr;

  const rows: unknown[][] = [];
  for (const b of bodies ?? []) {
    const members = (terms ?? []).filter((t: any) => t.official_seats?.body_id === b.id);
    if (members.length === 0) {
      rows.push([b.name, b.kind, b.meeting_cadence ?? "", "", "", "", "", "", "", ""]);
      continue;
    }
    for (const t of members as any[]) {
      const o = t.officials; const s = t.official_seats;
      const name = o?.preferred_name || `${o?.first_name ?? ""} ${o?.last_name ?? ""}`.trim();
      rows.push([
        b.name, b.kind, b.meeting_cadence ?? "",
        s?.seat_label ?? "", s?.is_chair ? "Yes" : "",
        name, t.appointment_type ?? "", t.start_date ?? "", t.end_date ?? "",
        o?.publish_contact ? (o.email ?? o.phone ?? "") : "",
      ]);
    }
  }
  const csv = toCsv(
    ["Body", "Kind", "Meets", "Seat", "Chair", "Member", "Appointment", "Term start", "Term end", "Contact (public)"],
    rows,
  );
  return { csv, filename: `public-roster-${new Date().toISOString().slice(0, 10)}.csv` };
});

/** Clerk-only roster CSV — every body/seat, all terms, and latest disclosure status per term. */
export const exportClerkRosterCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ include_history: z.boolean().default(false) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["hr_admin", "city_clerk"]);
    if (!allowed || allowed.length === 0) throw new Error("HR admin or City Clerk only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bodies, error: bErr } = await supabaseAdmin
      .from("official_bodies")
      .select("id, name, kind, comp_model, meeting_cadence, roster_public")
      .order("sort_order");
    if (bErr) throw bErr;

    const bodyIds = (bodies ?? []).map((b: any) => b.id);
    const { data: terms, error: tErr } = bodyIds.length
      ? await supabaseAdmin
          .from("official_terms")
          .select("id, status, start_date, end_date, appointment_type, appointing_authority, oath_taken_at, official_seats!inner(seat_label, seat_number, is_chair, body_id, appointing_authority), officials(first_name, last_name, preferred_name, email, phone)")
          .in("official_seats.body_id", bodyIds)
          .order("start_date", { ascending: false })
      : { data: [], error: null };
    if (tErr) throw tErr;

    const termIds = (terms ?? []).map((t: any) => t.id);
    const { data: discs } = termIds.length
      ? await supabaseAdmin
          .from("official_disclosures")
          .select("term_id, kind, cycle_year, status, due_date, submitted_at")
          .in("term_id", termIds)
      : { data: [] };
    const discByTerm = new Map<string, string>();
    for (const d of (discs ?? []) as any[]) {
      const label = `${d.kind}${d.cycle_year ? ` ${d.cycle_year}` : ""}: ${d.status}${d.due_date ? ` (due ${d.due_date})` : ""}`;
      discByTerm.set(d.term_id, discByTerm.has(d.term_id) ? `${discByTerm.get(d.term_id)}; ${label}` : label);
    }

    const rows: unknown[][] = [];
    for (const b of bodies ?? []) {
      const bTerms = (terms ?? []).filter((t: any) => t.official_seats?.body_id === b.id);
      const filtered = data.include_history ? bTerms : bTerms.filter((t: any) => t.status === "active" || t.status === "pending");
      for (const t of filtered as any[]) {
        const o = t.officials; const s = t.official_seats;
        const name = o?.preferred_name || `${o?.first_name ?? ""} ${o?.last_name ?? ""}`.trim();
        rows.push([
          b.name, b.kind, b.comp_model, b.roster_public ? "public" : "internal",
          `${s?.seat_label ?? ""}${s?.seat_number != null ? ` #${s.seat_number}` : ""}`,
          s?.is_chair ? "Yes" : "",
          name, o?.email ?? "", o?.phone ?? "",
          t.appointment_type ?? "", t.appointing_authority ?? s?.appointing_authority ?? "",
          t.status, t.start_date ?? "", t.end_date ?? "", t.oath_taken_at ?? "",
          discByTerm.get(t.id) ?? "",
        ]);
      }
    }
    const csv = toCsv(
      ["Body","Kind","Comp model","Visibility","Seat","Chair","Member","Email","Phone","Appointment","Appointing authority","Term status","Term start","Term end","Oath taken","Disclosures"],
      rows,
    );
    return { csv, filename: `clerk-roster-${new Date().toISOString().slice(0, 10)}.csv` };
  });
