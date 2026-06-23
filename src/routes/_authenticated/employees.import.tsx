import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; errors: { row: number; column?: string; message: string }[] } | null>(null);

  const fnMap = {
    employees: useServerFn(importEmployees),
    positions: useServerFn(importPositions),
    dependents: useServerFn(importDependents),
    certifications: useServerFn(importCertifications),
    training: useServerFn(importTraining),
    equipment: useServerFn(importEquipment),
  } as const;
  const fn = fnMap[specKey];

  const run = useMutation({
    mutationFn: async () => {
      const res = await (fn as (args: { data: { rows: Record<string, string>[] } }) => Promise<typeof result>)({ data: { rows } });
      return res;
    },
    onSuccess: (r) => {
      setResult(r);
      const summary = `${r?.inserted ?? 0} inserted, ${r?.updated ?? 0} updated, ${r?.skipped ?? 0} skipped`;
      if ((r?.errors?.length ?? 0) > 0) toast.warning(summary + ` · ${r?.errors.length} errors`); else toast.success(summary);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onFile(file: File) {
    setResult(null);
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
            <Button className="mt-4" onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Importing…" : `Import ${rows.length} row(s)`}</Button>
          </div>
        )}
      </Card>

      {result && (
        <Card className="p-5">
          <h4 className="font-medium mb-2">Result</h4>
          <p className="text-sm">Inserted: {result.inserted} · Updated: {result.updated} · Skipped: {result.skipped}</p>
          {!!result.errors.length && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-destructive">{result.errors.length} errors</p>
                <Button size="sm" variant="outline" onClick={() => downloadFile(`${specKey}-errors.csv`, "row,column,message\n" + result.errors.map((e) => `${e.row},${e.column ?? ""},"${e.message.replace(/"/g, '""')}"`).join("\n"))}>
                  <Download className="h-3 w-3 mr-1" /> Download errors
                </Button>
              </div>
              <div className="max-h-64 overflow-y-auto border rounded-md text-xs">
                <table className="w-full">
                  <thead className="bg-muted sticky top-0"><tr><th className="text-left p-2">Row</th><th className="text-left p-2">Column</th><th className="text-left p-2">Message</th></tr></thead>
                  <tbody>{result.errors.map((e, i) => <tr key={i} className="border-t"><td className="p-2">{e.row}</td><td className="p-2">{e.column ?? ""}</td><td className="p-2">{e.message}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}