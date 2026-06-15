import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

function ReportsPage() {
  const { data: emps } = useQuery({ queryKey: ["rep-emps"], queryFn: async () => (await supabase.from("employees").select("id,status,start_date,worker_type_id,created_at")).data ?? [] });
  const { data: tasks } = useQuery({ queryKey: ["rep-tasks"], queryFn: async () => (await supabase.from("task_instances").select("id,status,due_date")).data ?? [] });
  const { data: docs } = useQuery({ queryKey: ["rep-docs"], queryFn: async () => (await supabase.from("documents").select("id,category")).data ?? [] });

  const total = emps?.length ?? 0;
  const active = emps?.filter((e) => e.status === "active").length ?? 0;
  const preboarding = emps?.filter((e) => e.status === "preboarding").length ?? 0;
  const overdue = tasks?.filter((t) => t.status !== "complete" && t.due_date && new Date(t.due_date) < new Date()).length ?? 0;
  const i9 = docs?.filter((d) => d.category === "i9").length ?? 0;
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
      <div className="flex justify-end mb-4">
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
    </AppShell>
  );
}