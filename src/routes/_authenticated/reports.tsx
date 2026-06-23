import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Download } from "lucide-react";
import { timeToFill, sourceOfHire, applicantFlowLog } from "@/lib/recruiting-reports.functions";
import { Link } from "@tanstack/react-router";
import { offerStats } from "@/lib/offers.functions";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

function ReportsPage() {
  const { data: emps } = useQuery({ queryKey: ["rep-emps"], queryFn: async () => (await supabase.from("employees").select("id,status,start_date,worker_type_id,created_at")).data ?? [] });
  const { data: tasks } = useQuery({ queryKey: ["rep-tasks"], queryFn: async () => (await supabase.from("task_instances").select("id,status,due_date")).data ?? [] });
  const { data: docs } = useQuery({ queryKey: ["rep-docs"], queryFn: async () => (await supabase.from("documents").select("id,kind")).data ?? [] });

  const total = emps?.length ?? 0;
  const active = emps?.filter((e) => e.status === "active").length ?? 0;
  const preboarding = emps?.filter((e) => e.status === "preboarding").length ?? 0;
  const overdue = tasks?.filter((t) => t.status !== "complete" && t.due_date && new Date(t.due_date) < new Date()).length ?? 0;
  const i9 = docs?.filter((d) => d.kind === "i9").length ?? 0;
  const i9Pct = total ? Math.round((i9 / total) * 100) : 0;

  // weekly onboardings
  const byWeek: Record<string, number> = {};
  emps?.forEach((e) => {
    const d = new Date(e.created_at); d.setDate(d.getDate() - d.getDay());
    const k = d.toISOString().slice(0, 10);
    byWeek[k] = (byWeek[k] ?? 0) + 1;
  });
  const chartData = Object.entries(byWeek).sort().slice(-8).map(([week, count]) => ({ week: week.slice(5), count }));

  function exportCsv() {
    const rows = [["Metric", "Value"], ["Total employees", total], ["Active", active], ["Preboarding", preboarding], ["Overdue tasks", overdue], ["I-9 compliance %", i9Pct]];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "kyberna-report.csv"; a.click();
  }

  return (
    <AppShell title="Reports & Compliance">
      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        <Link to="/eeo-snapshot" className="px-3 py-1.5 rounded-md border hover:bg-accent">EEO workforce snapshot</Link>
        <Link to="/flsa-audit" className="px-3 py-1.5 rounded-md border hover:bg-accent">FLSA audit</Link>
        <Link to="/policy-campaigns" className="px-3 py-1.5 rounded-md border hover:bg-accent">Policy ack campaigns</Link>
        <Link to="/audit" className="px-3 py-1.5 rounded-md border hover:bg-accent">Audit log</Link>
      </div>
      <Tabs defaultValue="ops">
        <TabsList>
          <TabsTrigger value="ops">Operations</TabsTrigger>
          <TabsTrigger value="recruiting">Recruiting</TabsTrigger>
          <TabsTrigger value="eeo">EEO-4</TabsTrigger>
        </TabsList>

        <TabsContent value="ops" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
          </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          ["Total Employees", total],
          ["Active", active],
          ["Preboarding", preboarding],
          ["Overdue Tasks", overdue],
          ["I-9 Compliance", `${i9Pct}%`],
        ].map(([label, val]) => (
          <Card key={label as string} className="p-4">
            <p className="text-xs uppercase text-muted-foreground tracking-wide">{label}</p>
            <p className="text-3xl font-serif mt-1">{val}</p>
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <h3 className="font-serif text-lg mb-4">Onboardings by Week</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="week" /><YAxis allowDecimals={false} /><Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
        </TabsContent>

        <TabsContent value="recruiting" className="mt-4"><RecruitingTab /></TabsContent>
        <TabsContent value="eeo" className="mt-4"><EeoTab /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

function RecruitingTab() {
  const ttf = useServerFn(timeToFill);
  const soh = useServerFn(sourceOfHire);
  const os = useServerFn(offerStats);
  const ttfQ = useQuery({ queryKey: ["rep-ttf"], queryFn: () => ttf() });
  const sohQ = useQuery({ queryKey: ["rep-soh"], queryFn: () => soh() });
  const osQ = useQuery({ queryKey: ["rep-offer-stats"], queryFn: () => os() });

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg">Time to fill (days)</h3>
          <Button size="sm" variant="outline" onClick={() => downloadCsv("time-to-fill.csv", [["Title","Department","Days","Status"], ...(ttfQ.data ?? []).map(r => [r.title, r.department ?? "", r.days, r.status])])}><Download className="h-3 w-3 mr-1" /> CSV</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="text-left p-2">Title</th><th className="text-left p-2">Department</th><th className="text-right p-2">Days</th></tr></thead>
          <tbody>{(ttfQ.data ?? []).map(r => (<tr key={r.id} className="border-t"><td className="p-2">{r.title}</td><td className="p-2 text-muted-foreground">{r.department ?? "—"}</td><td className="p-2 text-right">{r.days}</td></tr>))}
            {(ttfQ.data?.length ?? 0) === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">No filled requisitions yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg">Source of hire</h3>
          <Button size="sm" variant="outline" onClick={() => downloadCsv("source-of-hire.csv", [["Source","Applied","Hired"], ...(sohQ.data ?? []).map(r => [r.source, r.applied, r.hired])])}><Download className="h-3 w-3 mr-1" /> CSV</Button>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sohQ.data ?? []}>
              <XAxis dataKey="source" /><YAxis allowDecimals={false} /><Tooltip />
              <Bar dataKey="applied" fill="hsl(var(--muted-foreground))" />
              <Bar dataKey="hired" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-serif text-lg mb-3">Offers</h3>
        <div className="grid grid-cols-3 gap-4">
          <div><p className="text-xs uppercase text-muted-foreground">Total</p><p className="text-3xl font-serif">{osQ.data?.total ?? 0}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">Accepted</p><p className="text-3xl font-serif">{osQ.data?.accepted ?? 0}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">Acceptance rate</p><p className="text-3xl font-serif">{Math.round((osQ.data?.acceptance_rate ?? 0) * 100)}%</p></div>
        </div>
        {osQ.data && Object.keys(osQ.data.decline_reasons).length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">Decline reasons</h4>
            <ul className="text-sm space-y-1">{Object.entries(osQ.data.decline_reasons).map(([k, v]) => <li key={k} className="flex justify-between border-t py-1"><span>{k}</span><span className="text-muted-foreground">{v}</span></li>)}</ul>
          </div>
        )}
      </Card>
    </div>
  );
}

function EeoTab() {
  const fn = useServerFn(applicantFlowLog);
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const [range, setRange] = useState({ from: yearAgo, to: today });
  const q = useQuery({ queryKey: ["rep-eeo", range], queryFn: () => fn({ data: { from: range.from, to: range.to } }) });

  const rows = q.data ?? [];
  const agg: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const dept = r.job_applications?.job_requisitions?.department ?? "Unspecified";
    agg[dept] ??= {};
    const k = r.declined ? "Declined to self-identify" : (r.race_ethnicity ?? "Unknown");
    agg[dept][k] = (agg[dept][k] ?? 0) + 1;
  }

  function exportEeo() {
    const out: (string | number)[][] = [["Department", "Race/Ethnicity", "Applicants"]];
    Object.entries(agg).forEach(([d, m]) => Object.entries(m).forEach(([k, v]) => out.push([d, k, v])));
    downloadCsv("eeo-4-applicant-flow.csv", out);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">EEO-4 applicant flow — aggregate only; individual self-identification is never displayed.</p>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="border rounded px-2 py-1 bg-background" />
            <span>to</span>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="border rounded px-2 py-1 bg-background" />
          </div>
          <Button size="sm" variant="outline" onClick={exportEeo}><Download className="h-3 w-3 mr-1" /> Export</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="text-left p-2">Department</th><th className="text-left p-2">Self-id</th><th className="text-right p-2">Applicants</th></tr></thead>
          <tbody>
            {Object.entries(agg).map(([dept, m]) => Object.entries(m).map(([k, v]) => (
              <tr key={dept + k} className="border-t"><td className="p-2">{dept}</td><td className="p-2 text-muted-foreground">{k}</td><td className="p-2 text-right">{v}</td></tr>
            )))}
            {rows.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No self-identification data in range.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}