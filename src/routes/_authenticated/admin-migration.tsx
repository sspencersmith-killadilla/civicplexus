import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { stageMigrationRows, commitMigrationStage, reconciliationReport } from "@/lib/migration.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin-migration")({ component: MigrationPage });

const STAGES = ["worker_types", "positions", "employees", "managers", "comp", "leave_balances", "certifications", "policy_acks"] as const;

type StageName = (typeof STAGES)[number];

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cells: string[] = [];
    let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => row[h] = (cells[i] ?? "").trim());
    return row;
  });
}

function MigrationPage() {
  const qc = useQueryClient();
  const sourcesQ = useQuery({ queryKey: ["migration-sources"], queryFn: async () => (await supabase.from("migration_sources").select("*").order("name")).data ?? [] });
  const jobsQ = useQuery({ queryKey: ["import-jobs"], queryFn: async () => (await supabase.from("import_jobs").select("*").eq("kind", "hris_migration").order("created_at", { ascending: false }).limit(20)).data ?? [] });
  const orgQ = useQuery({ queryKey: ["org-settings"], queryFn: async () => (await supabase.from("org_settings").select("*").maybeSingle()).data });

  const [sourceId, setSourceId] = useState("");
  const [stage, setStage] = useState<StageName>("worker_types");
  const [csvText, setCsvText] = useState("");
  const [keyCol, setKeyCol] = useState("");
  const [jobId, setJobId] = useState<string | undefined>(undefined);

  const stageFn = useMutation({
    mutationFn: useServerFn(stageMigrationRows),
    onSuccess: (r) => { setJobId(r.import_job_id); toast.success(`Staged ${r.staged} rows`); qc.invalidateQueries({ queryKey: ["import-jobs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const commitFn = useMutation({
    mutationFn: useServerFn(commitMigrationStage),
    onSuccess: (r) => toast.success(`Processed ${r.processed} · created ${r.created} · updated ${r.updated} · failed ${r.failed}`),
    onError: (e: Error) => toast.error(e.message),
  });
  const reportFn = useServerFn(reconciliationReport);
  const reportQ = useQuery({ enabled: !!jobId, queryKey: ["recon", jobId], queryFn: () => reportFn({ data: { import_job_id: jobId! } }) });

  const toggleCutover = useMutation({
    mutationFn: async (val: boolean) => {
      if (!orgQ.data) return;
      const { error } = await supabase.from("org_settings").update({ cutover_mode: val }).eq("id", orgQ.data.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cutover mode updated"); qc.invalidateQueries({ queryKey: ["org-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function onStage() {
    const rows = parseCsv(csvText);
    if (!rows.length) return toast.error("CSV empty or invalid");
    if (!keyCol) return toast.error("Pick a key column");
    const payload = rows.map((r) => ({ external_key: r[keyCol] || JSON.stringify(r), payload: r }));
    stageFn.mutate({ data: { import_job_id: jobId, source_id: sourceId || undefined, stage, rows: payload } });
  }

  const headers = (() => {
    const first = csvText.trim().split(/\r?\n/)[0];
    return first ? first.split(",").map((h) => h.trim().replace(/^"|"$/g, "")) : [];
  })();

  return (
    <AppShell title="HRIS Data Migration">
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-lg">Cutover mode</h3>
            <p className="text-xs text-muted-foreground">While on, hire-request creation and onboarding notifications are paused so backfilled employees don't trigger emails.</p>
          </div>
          <Button
            variant={orgQ.data?.cutover_mode ? "destructive" : "outline"}
            onClick={() => toggleCutover.mutate(!orgQ.data?.cutover_mode)}
          >
            {orgQ.data?.cutover_mode ? "Disable cutover" : "Enable cutover"}
          </Button>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-3">
          <h3 className="font-serif text-lg">Stage CSV</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Source</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>{(sourcesQ.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as StageName)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>CSV (first row = header)</Label>
            <Textarea rows={8} className="font-mono text-xs" value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="first_name,last_name,email,job_title&#10;Ada,Lovelace,ada@city.gov,Analyst" />
          </div>
          {headers.length > 0 && (
            <div>
              <Label>Key column</Label>
              <Select value={keyCol} onValueChange={setKeyCol}>
                <SelectTrigger><SelectValue placeholder="Pick the unique-ID column" /></SelectTrigger>
                <SelectContent>{headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={onStage} disabled={stageFn.isPending}>Stage rows</Button>
            <Button variant="outline" disabled={!jobId || commitFn.isPending} onClick={() => commitFn.mutate({ data: { import_job_id: jobId!, stage } })}>
              Commit {stage}
            </Button>
          </div>
          {jobId && <p className="text-xs text-muted-foreground">Job: {jobId}</p>}
        </Card>

        <Card className="p-6">
          <h3 className="font-serif text-lg mb-3">Reconciliation report</h3>
          {!jobId && <p className="text-sm text-muted-foreground">Stage rows to see outcomes.</p>}
          {jobId && (
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground sticky top-0 bg-card">
                  <tr><th className="text-left p-2">Stage</th><th className="text-left p-2">Key</th><th className="text-left p-2">Outcome</th><th className="text-left p-2">Note</th></tr>
                </thead>
                <tbody>
                  {(reportQ.data?.rows ?? []).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.stage}</td>
                      <td className="p-2 font-mono text-xs">{r.external_key}</td>
                      <td className={"p-2 " + (r.outcome === "failed" ? "text-destructive" : r.outcome === "skipped" ? "text-muted-foreground" : "text-primary")}>{r.outcome}</td>
                      <td className="p-2 text-xs text-muted-foreground">{r.outcome_message ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6 mt-6">
        <h3 className="font-serif text-lg mb-3">Recent migration jobs</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="text-left p-2">When</th><th className="text-left p-2">Status</th><th className="text-right p-2">Rows</th><th className="text-right p-2">Inserted</th><th className="text-right p-2">Updated</th><th className="text-right p-2">Skipped</th></tr></thead>
          <tbody>
            {(jobsQ.data ?? []).map((j) => (
              <tr key={j.id} className="border-t cursor-pointer hover:bg-secondary/40" onClick={() => setJobId(j.id)}>
                <td className="p-2">{new Date(j.created_at).toLocaleString()}</td>
                <td className="p-2">{j.status}</td>
                <td className="p-2 text-right">{j.total_rows}</td>
                <td className="p-2 text-right">{j.inserted}</td>
                <td className="p-2 text-right">{j.updated}</td>
                <td className="p-2 text-right">{j.skipped}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}