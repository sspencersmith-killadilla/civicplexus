import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assemblePayPeriod, signOffPayrollRun, generatePayrollFile, signedPayrollFileUrl } from "@/lib/payroll.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/payroll/$id")({ component: PayrollPeriod });

function PayrollPeriod() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const periodQ = useQuery({ queryKey: ["pay-period", id], queryFn: async () => (await supabase.from("pay_periods").select("*, pay_groups(name)").eq("id", id).maybeSingle()).data });
  const profilesQ = useQuery({ queryKey: ["payroll-profiles"], queryFn: async () => (await supabase.from("payroll_export_profiles").select("*").eq("is_active", true)).data ?? [] });
  const runsQ = useQuery({ queryKey: ["payroll-runs", id], queryFn: async () => (await supabase.from("payroll_runs").select("*, payroll_export_profiles(name, bureau)").eq("pay_period_id", id).order("created_at", { ascending: false })).data ?? [] });

  const [profileId, setProfileId] = useState("");

  const assemble = useMutation({
    mutationFn: useServerFn(assemblePayPeriod),
    onSuccess: () => { toast.success("Period assembled"); qc.invalidateQueries({ queryKey: ["payroll-runs", id] }); qc.invalidateQueries({ queryKey: ["pay-period", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const signOff = useMutation({
    mutationFn: useServerFn(signOffPayrollRun),
    onSuccess: () => { toast.success("Signed off"); qc.invalidateQueries({ queryKey: ["payroll-runs", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const generate = useMutation({
    mutationFn: useServerFn(generatePayrollFile),
    onSuccess: () => { toast.success("File generated"); qc.invalidateQueries({ queryKey: ["payroll-runs", id] }); qc.invalidateQueries({ queryKey: ["pay-period", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dlFn = useServerFn(signedPayrollFileUrl);
  async function download(runId: string) {
    try {
      const { url } = await dlFn({ data: { run_id: runId } });
      window.open(url, "_blank");
    } catch (e) { toast.error((e as Error).message); }
  }

  const period = periodQ.data;
  const activeRun = (runsQ.data ?? []).find((r) => r.status !== "superseded");

  return (
    <AppShell title={period ? `${(period as { pay_groups?: { name: string } | null }).pay_groups?.name ?? "Pay period"} · ${period.period_start} → ${period.period_end}` : "Pay period"}>
      <Card className="p-6 mb-6">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <p className="text-xs uppercase text-muted-foreground mb-1">Export profile</p>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue placeholder="Pick a payroll bureau" /></SelectTrigger>
              <SelectContent>{(profilesQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button disabled={!profileId || assemble.isPending} onClick={() => assemble.mutate({ data: { pay_period_id: id, profile_id: profileId } })}>
            Assemble period
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Assembling pulls current comp records and approved leave, builds the per-employee grid, and locks the period for sign-off. Two-person rule: the preparer cannot sign off their own run.</p>
      </Card>

      <Card className="p-6">
        <h3 className="font-serif text-lg mb-3">Runs</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr><th className="text-left p-2">Profile</th><th className="text-right p-2">Headcount</th><th className="text-right p-2">Hours</th><th className="text-right p-2">Gross</th><th className="text-left p-2">Status</th><th /></tr>
          </thead>
          <tbody>
            {(runsQ.data ?? []).map((r) => (
              <tr key={r.id} className={r.status === "superseded" ? "border-t text-muted-foreground line-through" : "border-t"}>
                <td className="p-2">{(r as { payroll_export_profiles?: { name: string } | null }).payroll_export_profiles?.name}</td>
                <td className="p-2 text-right">{r.headcount}</td>
                <td className="p-2 text-right">{Number(r.total_hours).toLocaleString()}</td>
                <td className="p-2 text-right">${Number(r.total_gross).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="p-2"><span className="text-xs px-2 py-0.5 rounded bg-secondary">{r.status}</span></td>
                <td className="p-2 text-right space-x-2">
                  {r.status === "awaiting_signoff" && <Button size="sm" variant="outline" onClick={() => signOff.mutate({ data: { run_id: r.id } })}>Sign off</Button>}
                  {r.status === "signed_off" && <Button size="sm" onClick={() => generate.mutate({ data: { run_id: r.id } })}>Generate file</Button>}
                  {r.status === "released" && <Button size="sm" variant="outline" onClick={() => download(r.id)}>Download</Button>}
                </td>
              </tr>
            ))}
            {(runsQ.data?.length ?? 0) === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No runs yet. Pick a profile above and assemble.</td></tr>}
          </tbody>
        </table>
      </Card>

      {activeRun && activeRun.status !== "superseded" && <RunLines runId={activeRun.id} />}
    </AppShell>
  );
}

function RunLines({ runId }: { runId: string }) {
  const q = useQuery({
    queryKey: ["run-lines", runId],
    queryFn: async () => (await supabase.from("payroll_run_lines").select("*, employees(first_name, last_name)").eq("run_id", runId).order("created_at")).data ?? [],
  });
  return (
    <Card className="p-6 mt-6">
      <h3 className="font-serif text-lg mb-3">Employee detail</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr><th className="text-left p-2">Employee</th><th className="text-right p-2">Reg</th><th className="text-right p-2">OT</th><th className="text-right p-2">PTO</th><th className="text-right p-2">Sick</th><th className="text-right p-2">FMLA</th><th className="text-right p-2">Rate</th><th className="text-right p-2">Gross</th><th className="text-left p-2">Warnings</th></tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((l) => {
              const emp = (l as { employees: { first_name: string; last_name: string } | null }).employees;
              return (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{emp?.first_name} {emp?.last_name}</td>
                  <td className="p-2 text-right">{l.regular_hours}</td>
                  <td className="p-2 text-right">{l.overtime_hours}</td>
                  <td className="p-2 text-right">{l.pto_hours}</td>
                  <td className="p-2 text-right">{l.sick_hours}</td>
                  <td className="p-2 text-right">{l.fmla_hours}</td>
                  <td className="p-2 text-right">{l.hourly_rate ? `$${Number(l.hourly_rate).toFixed(2)}` : "—"}</td>
                  <td className="p-2 text-right">${Number(l.gross_pay).toFixed(2)}</td>
                  <td className="p-2 text-amber-600 text-xs">{(l.warnings ?? []).join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}