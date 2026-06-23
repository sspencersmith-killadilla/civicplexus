import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { queryAudit } from "@/lib/compliance.functions";

export const Route = createFileRoute("/_authenticated/audit")({ component: AuditPage });

function AuditPage() {
  const fn = useServerFn(queryAudit);
  const [filters, setFilters] = useState({ from: "", to: "", entity: "", action: "" });
  const { data } = useQuery({ queryKey: ["audit", filters], queryFn: () => fn({ data: { ...filters, limit: 500 } }) });

  function exportCsv() {
    const rows: (string | number)[][] = [["When", "Actor", "Action", "Entity", "Entity ID", "Diff"]];
    (data ?? []).forEach((e) => rows.push([new Date(e.created_at).toISOString(), e.actor_id ?? "", e.action, e.entity, e.entity_id ?? "", JSON.stringify(e.diff ?? {})]));
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "audit-log.csv"; a.click();
  }

  return (
    <AppShell title="Audit Log">
      <Card className="p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div><label className="text-xs text-muted-foreground">From</label><Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
        <div><label className="text-xs text-muted-foreground">To</label><Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
        <div><label className="text-xs text-muted-foreground">Entity</label><Input value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value })} placeholder="grievance, policy, employee…" /></div>
        <div><label className="text-xs text-muted-foreground">Action</label><Input value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} placeholder="file, acknowledge…" /></div>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
      </Card>
      <Card className="divide-y">
        {!data?.length && <div className="p-10 text-center text-muted-foreground">No events match your filters.</div>}
        {data?.map((e) => (
          <div key={e.id} className="p-4 flex justify-between text-sm">
            <div className="min-w-0">
              <p className="font-medium">{e.action} <Badge variant="outline" className="ml-2">{e.entity}</Badge></p>
              <p className="text-xs text-muted-foreground font-mono truncate">{e.entity_id ?? "—"}</p>
              {e.diff && Object.keys(e.diff as Record<string, unknown>).length > 0 && (
                <pre className="mt-1 text-[10px] text-muted-foreground bg-muted/40 p-2 rounded overflow-x-auto max-w-xl">{JSON.stringify(e.diff, null, 2)}</pre>
              )}
            </div>
            <p className="text-xs text-muted-foreground whitespace-nowrap ml-4">{new Date(e.created_at).toLocaleString()}</p>
          </div>
        ))}
      </Card>
    </AppShell>
  );
}