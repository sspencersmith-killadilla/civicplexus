import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { getEvidenceSignedUrl } from "@/lib/training.functions";
import { Download, Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/transcript/$employeeId")({ component: Transcript });

function Transcript() {
  const { employeeId } = Route.useParams();
  const sign = useServerFn(getEvidenceSignedUrl);

  const empQ = useQuery({
    queryKey: ["transcript-emp", employeeId],
    queryFn: async () => (await supabase.from("employees").select("first_name,last_name,job_title,department,start_date").eq("id", employeeId).maybeSingle()).data,
  });

  const trQ = useQuery({
    queryKey: ["transcript-training", employeeId],
    queryFn: async () => (await supabase
      .from("employee_training")
      .select("id,status,due_date,completed_at,score,evidence_path,courses(name,provider,compliance_framework)")
      .eq("employee_id", employeeId)
      .order("completed_at", { ascending: false, nullsFirst: false })).data ?? [],
  });

  const certQ = useQuery({
    queryKey: ["transcript-certs", employeeId],
    queryFn: async () => (await supabase
      .from("employee_certifications")
      .select("id,issued_at,expires_at,certifications(name,issuer)")
      .eq("employee_id", employeeId)
      .order("issued_at", { ascending: false })).data ?? [],
  });

  async function openEvidence(path: string) {
    try {
      const { url } = await sign({ data: { path } });
      window.open(url, "_blank", "noopener");
    } catch (e) { console.error(e); }
  }

  return (
    <AppShell title="Training Transcript">
      <div className="flex justify-between mb-4 print:hidden">
        <Link to="/employees"><Button variant="outline" size="sm">← Back</Button></Link>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
      </div>
      <Card className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-serif tracking-tight">{empQ.data?.first_name} {empQ.data?.last_name}</h2>
          <p className="text-sm text-muted-foreground">{empQ.data?.job_title ?? "—"} · {empQ.data?.department ?? "—"} · started {empQ.data?.start_date ?? "—"}</p>
        </div>

        <section>
          <h3 className="font-medium mb-2">Active certifications</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground text-xs uppercase">
              <tr><th className="py-1">Certification</th><th>Issuer</th><th>Issued</th><th>Expires</th></tr>
            </thead>
            <tbody>
              {(certQ.data ?? []).map((c) => {
                const r = c as { id: string; issued_at: string | null; expires_at: string | null; certifications: { name: string; issuer: string | null } | null };
                return <tr key={r.id} className="border-t"><td className="py-1.5">{r.certifications?.name}</td><td>{r.certifications?.issuer ?? "—"}</td><td>{r.issued_at ?? "—"}</td><td>{r.expires_at ?? "—"}</td></tr>;
              })}
              {!(certQ.data ?? []).length && <tr><td colSpan={4} className="py-3 text-muted-foreground">None on file.</td></tr>}
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="font-medium mb-2">Training history</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground text-xs uppercase">
              <tr><th className="py-1">Course</th><th>Provider</th><th>Framework</th><th>Due</th><th>Completed</th><th>Score</th><th>Status</th><th className="print:hidden">Evidence</th></tr>
            </thead>
            <tbody>
              {(trQ.data ?? []).map((t) => {
                const r = t as { id: string; status: string; due_date: string | null; completed_at: string | null; score: number | null; evidence_path: string | null; courses: { name: string; provider: string | null; compliance_framework: string | null } | null };
                return (
                  <tr key={r.id} className="border-t">
                    <td className="py-1.5">{r.courses?.name}</td>
                    <td>{r.courses?.provider ?? "—"}</td>
                    <td>{r.courses?.compliance_framework ?? "—"}</td>
                    <td>{r.due_date ?? "—"}</td>
                    <td>{r.completed_at ? r.completed_at.slice(0, 10) : "—"}</td>
                    <td>{r.score ?? "—"}</td>
                    <td>{r.status}</td>
                    <td className="print:hidden">
                      {r.evidence_path ? (
                        <Button size="sm" variant="ghost" onClick={() => openEvidence(r.evidence_path!)}><Download className="h-3.5 w-3.5 mr-1" /> View</Button>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
              {!(trQ.data ?? []).length && <tr><td colSpan={8} className="py-3 text-muted-foreground">No training on record.</td></tr>}
            </tbody>
          </table>
        </section>
      </Card>
    </AppShell>
  );
}