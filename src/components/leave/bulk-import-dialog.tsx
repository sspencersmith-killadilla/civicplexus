import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  external_id: string | null;
  work_email: string | null;
};
type Plan = { id: string; code: string; name: string; default_opening_balance_hours: number };

type RowResult = { row: number; ok: boolean; message: string };

const ENROLL_HEADERS = ["employee_external_id", "work_email", "plan_code", "effective_from", "effective_to", "opening_balance_hours"] as const;
const SEED_HEADERS = ["employee_external_id", "work_email", "plan_code", "mode", "hours"] as const;

function downloadCsv(name: string, headers: readonly string[], sample: string[][]) {
  const rows = [headers.join(","), ...sample.map((r) => r.join(","))].join("\n");
  const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// Minimal CSV parser: supports quoted fields with embedded commas/newlines and "" escapes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let field = ""; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function findEmployee(emps: Employee[], row: Record<string, string>): Employee | null {
  const ext = (row.employee_external_id || "").trim();
  const email = (row.work_email || "").trim().toLowerCase();
  if (ext) {
    const e = emps.find((x) => (x.external_id ?? "").trim().toLowerCase() === ext.toLowerCase());
    if (e) return e;
  }
  if (email) {
    const e = emps.find((x) => (x.work_email ?? "").trim().toLowerCase() === email);
    if (e) return e;
  }
  return null;
}

export function BulkImportDialog({
  open, onOpenChange, employees, plans, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employees: Employee[];
  plans: Plan[];
  onDone: () => void;
}) {
  const enrollRef = useRef<HTMLInputElement>(null);
  const seedRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<RowResult[]>([]);
  const [busy, setBusy] = useState(false);

  const planByCode = useMemo(() => {
    const m = new Map<string, Plan>();
    for (const p of plans) m.set(p.code.toLowerCase(), p);
    return m;
  }, [plans]);

  async function handleEnrollFile(file: File) {
    setBusy(true); setResults([]);
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) { setBusy(false); toast.error("CSV has no data rows"); return; }
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const out: RowResult[] = [];
    for (let i = 1; i < rows.length; i++) {
      const raw = rows[i];
      const rec: Record<string, string> = {};
      headers.forEach((h, idx) => { rec[h] = (raw[idx] ?? "").trim(); });
      const rowNum = i + 1;
      const emp = findEmployee(employees, rec);
      if (!emp) { out.push({ row: rowNum, ok: false, message: "Employee not found (external_id or work_email)" }); continue; }
      const plan = planByCode.get((rec.plan_code || "").toLowerCase());
      if (!plan) { out.push({ row: rowNum, ok: false, message: `Unknown plan_code "${rec.plan_code}"` }); continue; }
      const effective_from = rec.effective_from || new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effective_from)) {
        out.push({ row: rowNum, ok: false, message: "effective_from must be YYYY-MM-DD" }); continue;
      }
      const effective_to = rec.effective_to ? rec.effective_to : null;
      if (effective_to && !/^\d{4}-\d{2}-\d{2}$/.test(effective_to)) {
        out.push({ row: rowNum, ok: false, message: "effective_to must be YYYY-MM-DD" }); continue;
      }
      const opening = rec.opening_balance_hours === "" || rec.opening_balance_hours == null
        ? plan.default_opening_balance_hours
        : Number(rec.opening_balance_hours);
      if (!Number.isFinite(opening)) { out.push({ row: rowNum, ok: false, message: "opening_balance_hours is not numeric" }); continue; }
      const { error } = await supabase.from("employee_leave_enrollments").insert({
        employee_id: emp.id, plan_id: plan.id,
        effective_from, effective_to, opening_balance_hours: opening,
      });
      if (error) out.push({ row: rowNum, ok: false, message: error.message });
      else out.push({ row: rowNum, ok: true, message: `Enrolled ${emp.first_name} ${emp.last_name} in ${plan.code}` });
    }
    setResults(out); setBusy(false);
    const okCount = out.filter((r) => r.ok).length;
    toast[okCount === out.length ? "success" : "message"](`${okCount}/${out.length} rows applied`);
    if (okCount > 0) onDone();
  }

  async function handleSeedFile(file: File) {
    setBusy(true); setResults([]);
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) { setBusy(false); toast.error("CSV has no data rows"); return; }
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const out: RowResult[] = [];
    for (let i = 1; i < rows.length; i++) {
      const raw = rows[i];
      const rec: Record<string, string> = {};
      headers.forEach((h, idx) => { rec[h] = (raw[idx] ?? "").trim(); });
      const rowNum = i + 1;
      const emp = findEmployee(employees, rec);
      if (!emp) { out.push({ row: rowNum, ok: false, message: "Employee not found" }); continue; }
      const plan = planByCode.get((rec.plan_code || "").toLowerCase());
      if (!plan) { out.push({ row: rowNum, ok: false, message: `Unknown plan_code "${rec.plan_code}"` }); continue; }
      const mode = (rec.mode || "add").toLowerCase();
      if (mode !== "add" && mode !== "set") { out.push({ row: rowNum, ok: false, message: "mode must be 'add' or 'set'" }); continue; }
      const hours = Number(rec.hours);
      if (!Number.isFinite(hours)) { out.push({ row: rowNum, ok: false, message: "hours is not numeric" }); continue; }

      const { data: existing, error: readErr } = await supabase
        .from("leave_balances")
        .select("id, accrued_hours, used_hours, pending_hours")
        .eq("employee_id", emp.id).eq("plan_id", plan.id).maybeSingle();
      if (readErr) { out.push({ row: rowNum, ok: false, message: readErr.message }); continue; }

      const used = Number(existing?.used_hours ?? 0);
      const pending = Number(existing?.pending_hours ?? 0);
      const currentAccrued = Number(existing?.accrued_hours ?? 0);
      const nextAccrued = mode === "set" ? hours + used + pending : currentAccrued + hours;
      const nextBalance = nextAccrued - used - pending;

      if (existing) {
        const { error } = await supabase.from("leave_balances")
          .update({ accrued_hours: nextAccrued, balance_hours: nextBalance } as never)
          .eq("id", existing.id);
        if (error) { out.push({ row: rowNum, ok: false, message: error.message }); continue; }
      } else {
        const { error } = await supabase.from("leave_balances").insert({
          employee_id: emp.id, plan_id: plan.id,
          accrued_hours: nextAccrued, used_hours: 0, pending_hours: 0, balance_hours: nextBalance,
        } as never);
        if (error) { out.push({ row: rowNum, ok: false, message: error.message }); continue; }
      }
      out.push({ row: rowNum, ok: true, message: `${mode === "set" ? "Set" : "Adjusted"} ${plan.code} for ${emp.first_name} ${emp.last_name}` });
    }
    setResults(out); setBusy(false);
    const okCount = out.filter((r) => r.ok).length;
    toast[okCount === out.length ? "success" : "message"](`${okCount}/${out.length} rows applied`);
    if (okCount > 0) onDone();
  }

  const samplePlanCode = plans[0]?.code ?? "PTO";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bulk import (CSV)</DialogTitle></DialogHeader>
        <Tabs defaultValue="enroll">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="enroll">Enrollments</TabsTrigger>
            <TabsTrigger value="seed">Balances</TabsTrigger>
          </TabsList>

          <TabsContent value="enroll" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Columns: <code>employee_external_id</code> or <code>work_email</code>, <code>plan_code</code>,
              <code> effective_from</code> (YYYY-MM-DD), optional <code>effective_to</code>, optional{" "}
              <code>opening_balance_hours</code> (defaults to plan default).
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => downloadCsv(
                "leave-enrollments-template.csv",
                ENROLL_HEADERS,
                [["EMP001", "", samplePlanCode, "2026-01-01", "", "40"],
                 ["", "employee@example.com", samplePlanCode, "2026-01-15", "", ""]],
              )}>
                <Download className="h-4 w-4 mr-1" /> Download template
              </Button>
              <input ref={enrollRef} type="file" accept=".csv,text/csv" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEnrollFile(f); e.currentTarget.value = ""; }} />
              <Button size="sm" onClick={() => enrollRef.current?.click()} disabled={busy}>
                <Upload className="h-4 w-4 mr-1" /> {busy ? "Importing…" : "Upload CSV"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="seed" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Columns: <code>employee_external_id</code> or <code>work_email</code>, <code>plan_code</code>,
              <code> mode</code> (<code>add</code> or <code>set</code>), <code>hours</code>.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => downloadCsv(
                "leave-balances-template.csv",
                SEED_HEADERS,
                [["EMP001", "", samplePlanCode, "set", "40"],
                 ["", "employee@example.com", samplePlanCode, "add", "8"]],
              )}>
                <Download className="h-4 w-4 mr-1" /> Download template
              </Button>
              <input ref={seedRef} type="file" accept=".csv,text/csv" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSeedFile(f); e.currentTarget.value = ""; }} />
              <Button size="sm" onClick={() => seedRef.current?.click()} disabled={busy}>
                <Upload className="h-4 w-4 mr-1" /> {busy ? "Importing…" : "Upload CSV"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {results.length > 0 && (
          <Card className="max-h-64 overflow-y-auto divide-y text-xs mt-2">
            {results.map((r) => (
              <div key={r.row} className={`p-2 ${r.ok ? "" : "bg-destructive/10"}`}>
                <span className="font-mono">Row {r.row}:</span>{" "}
                <span className={r.ok ? "text-muted-foreground" : "text-destructive"}>{r.message}</span>
              </div>
            ))}
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}