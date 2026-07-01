import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const fetchAll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).in("role", ["hr_admin", "city_clerk"]);
    if (!allowed || allowed.length === 0) throw new Error("HR admin or City Clerk only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bodies } = await supabaseAdmin.from("official_bodies").select("id, name, kind, comp_model, roster_public, meeting_cadence").order("sort_order");
    const bodyIds = (bodies ?? []).map((b: any) => b.id);
    const { data: terms } = bodyIds.length
      ? await supabaseAdmin.from("official_terms").select("id, status, start_date, end_date, appointment_type, appointing_authority, oath_taken_at, official_seats!inner(seat_label, is_chair, body_id), officials(first_name, last_name, preferred_name, email, phone)").in("official_seats.body_id", bodyIds).order("start_date", { ascending: false })
      : { data: [] };
    const termIds = (terms ?? []).map((t: any) => t.id);
    const { data: discs } = termIds.length
      ? await supabaseAdmin.from("official_disclosures").select("term_id, kind, cycle_year, status, due_date").in("term_id", termIds)
      : { data: [] };
    return { bodies: bodies ?? [], terms: terms ?? [], discs: discs ?? [] };
  });

export const Route = createFileRoute("/_authenticated/admin-officials/print")({ component: ClerkPrint });

function ClerkPrint() {
  const fn = useServerFn(fetchAll);
  const q = useQuery({ queryKey: ["clerk-roster-print"], queryFn: () => fn() });
  useEffect(() => { if (q.data) setTimeout(() => window.print(), 400); }, [q.data]);
  if (q.isLoading) return <div className="p-8">Loading…</div>;
  if (q.error) return <div className="p-8 text-red-600">{(q.error as Error).message}</div>;
  const { bodies, terms, discs } = q.data!;
  const discByTerm = new Map<string, string[]>();
  for (const d of discs as any[]) {
    const label = `${d.kind}${d.cycle_year ? " " + d.cycle_year : ""}: ${d.status}${d.due_date ? " (due " + d.due_date + ")" : ""}`;
    discByTerm.set(d.term_id, [...(discByTerm.get(d.term_id) ?? []), label]);
  }
  return (
    <div className="max-w-5xl mx-auto p-8 bg-white text-black print:p-0">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-xl font-semibold">Clerk roster — printable</h1>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print / Save as PDF</Button>
      </div>
      <h1 className="hidden print:block text-2xl font-serif mb-1">Governance roster (internal)</h1>
      <p className="hidden print:block text-xs text-gray-600 mb-6">Confidential · Generated {new Date().toLocaleDateString()}</p>
      {(bodies as any[]).map((b) => {
        const rows = (terms as any[]).filter((t) => t.official_seats?.body_id === b.id);
        return (
          <section key={b.id} className="mb-6 break-inside-avoid">
            <h2 className="text-lg font-semibold border-b pb-1">
              {b.name} <span className="text-xs uppercase tracking-wider text-gray-500">{b.kind} · {b.comp_model} · {b.roster_public ? "public" : "internal"}</span>
            </h2>
            <table className="w-full text-xs mt-2 border-collapse">
              <thead><tr className="text-left text-gray-600"><th className="py-1 pr-2">Seat</th><th className="py-1 pr-2">Member</th><th className="py-1 pr-2">Status</th><th className="py-1 pr-2">Term</th><th className="py-1 pr-2">Oath</th><th className="py-1 pr-2">Disclosures</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="py-1 text-gray-500 italic">No terms recorded.</td></tr>}
                {rows.map((t: any) => {
                  const o = t.officials; const s = t.official_seats;
                  const name = o?.preferred_name || `${o?.first_name ?? ""} ${o?.last_name ?? ""}`.trim();
                  return (
                    <tr key={t.id} className="border-t align-top">
                      <td className="py-1 pr-2">{s?.seat_label}{s?.is_chair ? " · Chair" : ""}</td>
                      <td className="py-1 pr-2">{name}<div className="text-[10px] text-gray-500">{o?.email ?? ""}</div></td>
                      <td className="py-1 pr-2">{t.status}</td>
                      <td className="py-1 pr-2">{t.start_date} – {t.end_date ?? "present"}</td>
                      <td className="py-1 pr-2">{t.oath_taken_at ? new Date(t.oath_taken_at).toLocaleDateString() : "—"}</td>
                      <td className="py-1 pr-2">{(discByTerm.get(t.id) ?? []).join("; ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
