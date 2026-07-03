import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, PlayCircle, Sliders, Lock, Bell, Download } from "lucide-react";
import { toast } from "sonner";
import { setCycleStatus, sendCycleReminder } from "@/lib/review-cycles.functions";

export const Route = createFileRoute("/_authenticated/review-cycles/$id/")({ component: CycleDetail });

function CycleDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const setStatus = useServerFn(setCycleStatus);
  const remind = useServerFn(sendCycleReminder);

  const cycleQ = useQuery({
    queryKey: ["review_cycle", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_cycles" as never)
        .select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as unknown as { id: string; name: string; status: string; period_start: string; period_end: string; self_review_due: string | null; manager_review_due: string | null; signoff_due: string | null } | null;
    },
  });

  const partsQ = useQuery({
    queryKey: ["cycle_participants", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_cycle_participants" as never)
        .select("id, status, review_id, employees:employee_id(id, first_name, last_name, department), managers:manager_id(first_name, last_name)")
        .eq("cycle_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; status: string; review_id: string | null; employees: { id: string; first_name: string; last_name: string; department: string | null } | null; managers: { first_name: string; last_name: string } | null }>;
    },
  });

  const transition = useMutation({
    mutationFn: (status: "draft" | "open" | "in_calibration" | "closed") => setStatus({ data: { cycle_id: id, status } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review_cycle", id] }); qc.invalidateQueries({ queryKey: ["cycle_participants", id] }); toast.success("Updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const reminder = useMutation({
    mutationFn: (target: "self_not_submitted" | "manager_not_submitted" | "not_acknowledged") => remind({ data: { cycle_id: id, target } }),
    onSuccess: (r) => toast.success(`Sent ${r.sent} reminder(s)`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  function exportCsv() {
    const rows = partsQ.data ?? [];
    const lines = ["Employee,Department,Manager,Status,ReviewId"];
    for (const p of rows) {
      const e = p.employees;
      const m = p.managers;
      lines.push([
        e ? `${e.first_name} ${e.last_name}` : "",
        e?.department ?? "",
        m ? `${m.first_name} ${m.last_name}` : "",
        p.status,
        p.review_id ?? "",
      ].map((s) => `"${(s ?? "").replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cycle-${id}.csv`;
    a.click();
  }

  const c = cycleQ.data;
  const counts = (partsQ.data ?? []).reduce<Record<string, number>>((acc, p) => { acc[p.status] = (acc[p.status] ?? 0) + 1; return acc; }, {});
  const total = partsQ.data?.length ?? 0;
  const done = (counts.acknowledged ?? 0) + (counts.finalized ?? 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <AppShell title={c?.name ?? "Review cycle"}>
      <Link to="/review-cycles" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-3 w-3 mr-1" /> All cycles</Link>
      {!c ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm text-muted-foreground">Period</p>
                <p className="font-medium">{c.period_start} → {c.period_end}</p>
                <p className="text-xs text-muted-foreground mt-1">Self {c.self_review_due ?? "—"} · Manager {c.manager_review_due ?? "—"} · Sign-off {c.signoff_due ?? "—"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.status === "draft" && <Button size="sm" onClick={() => transition.mutate("open")} disabled={transition.isPending}><PlayCircle className="h-4 w-4 mr-1" /> Open cycle</Button>}
                {c.status === "open" && <Button size="sm" variant="outline" onClick={() => transition.mutate("in_calibration")}><Sliders className="h-4 w-4 mr-1" /> Move to calibration</Button>}
                {c.status === "in_calibration" && <Link to="/review-cycles/$id/calibration" params={{ id }}><Button size="sm" variant="outline"><Sliders className="h-4 w-4 mr-1" /> Calibrate</Button></Link>}
                {(c.status === "open" || c.status === "in_calibration") && <Button size="sm" variant="outline" onClick={() => transition.mutate("closed")}><Lock className="h-4 w-4 mr-1" /> Close cycle</Button>}
                <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Progress</span><span className="font-medium">{done}/{total} ({pct}%)</span></div>
              <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-medium">Participants ({total})</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={reminder.isPending} onClick={() => reminder.mutate("self_not_submitted")}><Bell className="h-3 w-3 mr-1" /> Nudge self</Button>
                <Button size="sm" variant="outline" disabled={reminder.isPending} onClick={() => reminder.mutate("manager_not_submitted")}><Bell className="h-3 w-3 mr-1" /> Nudge managers</Button>
                <Button size="sm" variant="outline" disabled={reminder.isPending} onClick={() => reminder.mutate("not_acknowledged")}><Bell className="h-3 w-3 mr-1" /> Nudge acknowledge</Button>
              </div>
            </div>
            <div className="space-y-1">
              {(partsQ.data ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{p.employees ? `${p.employees.first_name} ${p.employees.last_name}` : "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.employees?.department ?? ""}{p.managers ? ` · mgr ${p.managers.first_name} ${p.managers.last_name}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded bg-muted">{p.status}</span>
                    {p.review_id && <Link to="/reviews/$id" params={{ id: p.review_id }} className="text-xs text-primary hover:underline">Open</Link>}
                  </div>
                </div>
              ))}
              {total === 0 && <p className="text-sm text-muted-foreground py-4">No participants yet. Open the cycle to seed reviews.</p>}
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}