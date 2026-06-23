import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Download, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { importEmployees, importDependents, importCertifications, importTraining, importEquipment, importPositions } from "@/lib/employee-import.functions";

export const Route = createFileRoute("/_authenticated/employees/import")({
  component: ImportPage,
  validateSearch: (s: Record<string, unknown>) => ({ tab: typeof s.tab === "string" ? s.tab : undefined }),
});

type Spec = {
  key: string; label: string; required: string[]; optional: string[]; example: Record<string, string>;
  fn: ReturnType<typeof useServerFn<typeof importEmployees>> | unknown;
};

const SPECS = {
  employees: { label: "Employees", required: ["first_name","last_name","personal_email"], optional: ["external_id","work_email","phone","department","job_title","worker_type","start_date","status","position_code","manager_external_id"], example: { external_id: "EMP-001", first_name: "Ada", last_name: "Lovelace", personal_email: "ada@example.com", work_email: "ada@city.gov", phone: "555-1212", department: "IT", job_title: "Engineer", worker_type: "Full-time", start_date: "2026-07-01", status: "candidate", position_code: "IT-ENG-1", manager_external_id: "EMP-100" } },
  positions: { label: "Positions", required: ["position_code","title"], optional: ["department","flsa_class","pay_grade","pay_step","budgeted_fte","reports_to_position_code","status","notes"], example: { position_code: "IT-ENG-1", title: "Software Engineer", department: "IT", flsa_class: "exempt", pay_grade: "G12", pay_step: "3", budgeted_fte: "1", reports_to_position_code: "IT-DIR", status: "open", notes: "" } },
  dependents: { label: "Dependents", required: ["employee_email","first_name","last_name","relationship"], optional: ["dob","ssn_last4"], example: { employee_email: "ada@example.com", first_name: "Anna", last_name: "Lovelace", relationship: "child", dob: "2015-04-10", ssn_last4: "1234" } },
  certifications: { label: "Certifications", required: ["employee_email","certification_name"], optional: ["issuer","issued_at","expires_at","notes"], example: { employee_email: "ada@example.com", certification_name: "OSHA 10", issuer: "OSHA", issued_at: "2024-01-15", expires_at: "2029-01-15", notes: "" } },
  training: { label: "Training", required: ["employee_email","course_name"], optional: ["status","due_date","completed_at","score"], example: { employee_email: "ada@example.com", course_name: "Workplace Safety", status: "complete", due_date: "2026-06-01", completed_at: "2026-05-28", score: "92" } },
  equipment: { label: "Equipment", required: ["employee_email","item_name"], optional: ["size","status","issued_at","condition","notes"], example: { employee_email: "ada@example.com", item_name: "Laptop", size: "", status: "issued", issued_at: "2026-07-01", condition: "new", notes: "" } },
} as const;

function toCsv(headers: string[], row: Record<string, string>) {
  const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return headers.join(",") + "\n" + headers.map((h) => esc(row[h] ?? "")).join(",") + "\n";
}

function downloadFile(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function ImportPage() {
  const { tab } = Route.useSearch();
  const initial = tab && tab in SPECS ? tab : "employees";
  return (
    <AppShell title="Bulk Import">
      <Link to="/employees" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4 mr-1" /> Back to employees</Link>
      <Tabs defaultValue={initial} className="w-full">
        <TabsList>
          {Object.entries(SPECS).map(([k, s]) => <TabsTrigger key={k} value={k}>{s.label}</TabsTrigger>)}
        </TabsList>
        {Object.entries(SPECS).map(([k, s]) => (
          <TabsContent key={k} value={k} className="mt-4">
            <ImportPanel specKey={k as keyof typeof SPECS} spec={s} />
          </TabsContent>
        ))}
      </Tabs>
    </AppShell>
  );
}

function ImportPanel({ specKey, spec }: { specKey: keyof typeof SPECS; spec: typeof SPECS[keyof typeof SPECS] }) {
  const headers = useMemo(() => [...spec.required, ...spec.optional], [spec]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fnMap = {
    employees: useServerFn(importEmployees),
    positions: useServerFn(importPositions),
    dependents: useServerFn(importDependents),
    certifications: useServerFn(importCertifications),
    training: useServerFn(importTraining),
    equipment: useServerFn(importEquipment),
  } as const;
  const fn = fnMap[specKey];

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function startImport() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { toast.error("Not signed in"); return; }
    const { data: created, error } = await supabase
      .from("import_jobs")
      .insert({ kind: specKey, status: "queued", total_rows: rows.length, created_by: auth.user.id } as never)
      .select("*").single();
    if (error || !created) { toast.error(error?.message ?? "Could not create job"); return; }
    const j = created as unknown as JobRow;
    setJobId(j.id); setJob(j);
    // Fire-and-forget — progress is observed via the job row
    (fn as (args: { data: { rows: Record<string, string>[]; job_id: string } }) => Promise<unknown>)({ data: { rows, job_id: j.id } })
      .catch(() => { /* errors land in job.error_message */ });

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from("import_jobs").select("*").eq("id", j.id).maybeSingle();
      if (!data) return;
      const row = data as unknown as JobRow;
      setJob(row);
      if (row.status === "completed" || row.status === "failed") {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        const summary = `${row.inserted} inserted, ${row.updated} updated, ${row.skipped} skipped`;
        if (row.status === "failed") toast.error(row.error_message ?? "Import failed");
        else if ((row.errors?.length ?? 0) > 0) toast.warning(`${summary} · ${row.errors.length} errors`);
        else toast.success(summary);
      }
    }, 1500);
  }

  const isRunning = job?.status === "queued" || job?.status === "processing";
  const isDone = job?.status === "completed" || job?.status === "failed";
  const pct = job && job.total_rows > 0 ? Math.min(100, Math.round((job.processed_rows / job.total_rows) * 100)) : 0;

  function onFile(file: File) {
    setJob(null); setJobId(null);
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: (parsed) => {
        const fields = parsed.meta.fields ?? [];
        const missing = spec.required.filter((h) => !fields.includes(h));
        setHeaderErrors(missing.map((m) => `Missing required column: ${m}`));
        setRows(parsed.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v ?? "").toString().trim()]))));
      },
      error: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-serif text-lg">{spec.label}</h3>
            <p className="text-sm text-muted-foreground mt-1">Required: <code className="text-xs">{spec.required.join(", ")}</code></p>
            <p className="text-sm text-muted-foreground">Optional: <code className="text-xs">{spec.optional.join(", ") || "—"}</code></p>
          </div>
          <Button variant="outline" size="sm" onClick={() => downloadFile(`${specKey}-template.csv`, toCsv(headers, spec.example))}>
            <Download className="h-4 w-4 mr-1" /> Template CSV
          </Button>
        </div>
        <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-8 cursor-pointer hover:bg-muted/40">
          <Upload className="h-6 w-6 text-muted-foreground mb-2" />
          <span className="text-sm">Drop CSV here or click to select</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </label>
        {!!headerErrors.length && (
          <div className="mt-3 text-sm text-destructive">
            {headerErrors.map((e) => <p key={e}>{e}</p>)}
          </div>
        )}
        {!!rows.length && !headerErrors.length && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2">{rows.length} row(s) ready. Preview (first 5):</p>
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted"><tr>{headers.map((h) => <th key={h} className="text-left p-2">{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t">{headers.map((h) => <td key={h} className="p-2">{r[h] ?? ""}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
            <Button className="mt-4" onClick={startImport} disabled={isRunning}>{isRunning ? "Importing…" : `Import ${rows.length} row(s)`}</Button>
          </div>
        )}
      </Card>

      {job && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium">
              Job <span className="text-muted-foreground font-mono text-xs">{job.id.slice(0, 8)}</span>
            </h4>
            <span className={
              "text-xs px-2 py-0.5 rounded " +
              (job.status === "completed" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" :
               job.status === "failed" ? "bg-destructive/15 text-destructive" :
               job.status === "processing" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" :
               "bg-muted text-muted-foreground")
            }>{job.status}</span>
          </div>
          {isRunning && (
            <div className="space-y-2 mb-3">
              <Progress value={pct} />
              <p className="text-xs text-muted-foreground">{job.processed_rows} of {job.total_rows} rows · {pct}%</p>
            </div>
          )}
          <p className="text-sm">Inserted: {job.inserted} · Updated: {job.updated} · Skipped: {job.skipped}</p>
          {job.status === "failed" && job.error_message && (
            <p className="text-sm text-destructive mt-2">{job.error_message}</p>
          )}
          {isDone && (job.errors?.length ?? 0) > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-destructive">{job.errors.length} row errors</p>
                <Button size="sm" variant="outline" onClick={() => downloadFile(`${specKey}-errors.csv`, "row,column,message\n" + job.errors.map((e) => `${e.row},${e.column ?? ""},"${e.message.replace(/"/g, '""')}"`).join("\n"))}>
                  <Download className="h-3 w-3 mr-1" /> Download errors
                </Button>
              </div>
              <div className="max-h-64 overflow-y-auto border rounded-md text-xs">
                <table className="w-full">
                  <thead className="bg-muted sticky top-0"><tr><th className="text-left p-2">Row</th><th className="text-left p-2">Column</th><th className="text-left p-2">Message</th></tr></thead>
                  <tbody>{job.errors.map((e, i) => <tr key={i} className="border-t"><td className="p-2">{e.row}</td><td className="p-2">{e.column ?? ""}</td><td className="p-2">{e.message}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

type JobRow = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  total_rows: number;
  processed_rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; column?: string; message: string }[];
  error_message: string | null;
};

// silence unused
void jobId;