import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, ArrowLeft } from "lucide-react";
import { eeoWorkforceSnapshot } from "@/lib/compliance.functions";

export const Route = createFileRoute("/_authenticated/eeo-snapshot")({ component: EeoSnapshot });

function EeoSnapshot() {
  const fn = useServerFn(eeoWorkforceSnapshot);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const q = useQuery({ queryKey: ["eeo-snap", asOf], queryFn: () => fn({ data: { asOf } }) });

  function exportCsv() {
    const rows: (string | number)[][] = [["Department", "Headcount", "Full-time", "Part-time"]];
    (q.data?.byDepartment ?? []).forEach((r) => rows.push([r.department, r.headcount, r.ft, r.pt]));
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `eeo-snapshot-${asOf}.csv`; a.click();
  }

  return (
    <AppShell title="EEO workforce snapshot">
      <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center mb-3"><ArrowLeft className="h-3 w-3 mr-1" /> Back to reports</Link>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">As of</span>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-44" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-2" /> CSV</Button>
        </div>
        <p className="text-sm mb-4"><span className="text-muted-foreground">Active workforce:</span> <span className="font-serif text-xl">{q.data?.total ?? 0}</span></p>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="text-left p-2">Department</th><th className="text-right p-2">Headcount</th><th className="text-right p-2">Full-time</th><th className="text-right p-2">Part-time</th></tr></thead>
          <tbody>
            {(q.data?.byDepartment ?? []).map((r) => (
              <tr key={r.department} className="border-t"><td className="p-2">{r.department}</td><td className="p-2 text-right">{r.headcount}</td><td className="p-2 text-right">{r.ft}</td><td className="p-2 text-right">{r.pt}</td></tr>
            ))}
            {!q.data?.byDepartment.length && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No active employees on this date.</td></tr>}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}