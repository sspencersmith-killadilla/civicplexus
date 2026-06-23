import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, X } from "lucide-react";
import { toast } from "sonner";
import { decideLeaveRequest } from "@/lib/leave.functions";

export const Route = createFileRoute("/_authenticated/leave/$id")({ component: LeaveDetail });

function LeaveDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const decide = useServerFn(decideLeaveRequest);
  const [notes, setNotes] = useState("");

  const q = useQuery({
    queryKey: ["leave-req", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leave_requests")
        .select("*, employees(first_name, last_name, job_title, department), leave_plans(name, paid, code)")
        .eq("id", id).single();
      if (error) throw error;
      return data as never as { id: string; status: string; start_date: string; end_date: string; total_hours: number; reason: string | null; decision_notes: string | null; employees: { first_name: string; last_name: string; job_title: string | null; department: string | null }; leave_plans: { name: string; paid: boolean; code: string } };
    },
  });

  const act = useMutation({
    mutationFn: (decision: "approved" | "denied" | "cancelled") => decide({ data: { id, decision, notes: notes || undefined } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-req", id] }); qc.invalidateQueries({ queryKey: ["leave-inbox"] }); toast.success("Updated"); setNotes(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading) return <AppShell title="Leave request"><p className="text-muted-foreground">Loading…</p></AppShell>;
  if (!q.data) return <AppShell title="Leave request"><p className="text-muted-foreground">Not found.</p></AppShell>;

  const isPending = q.data.status === "submitted";

  return (
    <AppShell title={`Leave: ${q.data.employees.first_name} ${q.data.employees.last_name}`}>
      <Link to="/leave" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
      <Card className="p-5 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="font-medium text-lg">{q.data.leave_plans.name}</h2>
            <p className="text-sm text-muted-foreground">{q.data.employees.job_title ?? "—"} · {q.data.employees.department ?? "—"}</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-muted">{q.data.status}</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><div className="text-xs text-muted-foreground">Start</div>{q.data.start_date}</div>
          <div><div className="text-xs text-muted-foreground">End</div>{q.data.end_date}</div>
          <div><div className="text-xs text-muted-foreground">Hours</div>{Number(q.data.total_hours).toFixed(2)}</div>
        </div>
        {q.data.reason && <div><div className="text-xs text-muted-foreground mb-1">Reason</div><p className="text-sm whitespace-pre-wrap">{q.data.reason}</p></div>}
        {q.data.decision_notes && <div><div className="text-xs text-muted-foreground mb-1">Decision notes</div><p className="text-sm whitespace-pre-wrap">{q.data.decision_notes}</p></div>}

        {isPending && (
          <div className="border-t pt-4 space-y-2">
            <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => act.mutate("cancelled")} disabled={act.isPending}>Cancel request</Button>
              <Button variant="destructive" onClick={() => act.mutate("denied")} disabled={act.isPending}><X className="h-4 w-4 mr-1" /> Deny</Button>
              <Button onClick={() => act.mutate("approved")} disabled={act.isPending}><Check className="h-4 w-4 mr-1" /> Approve</Button>
            </div>
          </div>
        )}
      </Card>
    </AppShell>
  );
}