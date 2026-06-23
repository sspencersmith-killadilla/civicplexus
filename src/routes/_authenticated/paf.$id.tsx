import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, X, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { applyPaf } from "@/lib/paf.functions";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/paf/$id")({ component: PafDetail });

function PafDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const apply = useServerFn(applyPaf);
  const { data: me } = useCurrentUser();
  const isHR = hasRole(me?.roles, "hr_admin");
  const [notes, setNotes] = useState("");

  const q = useQuery({
    queryKey: ["paf", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personnel_actions")
        .select("*, employees(first_name, last_name, job_title, department)")
        .eq("id", id).single();
      if (error) throw error;
      return data as never as { id: string; paf_number: string; action_type: string; effective_date: string; status: string; reason: string | null; narrative: string | null; before_values: Record<string, unknown>; after_values: Record<string, unknown>; approval_chain_id: string | null; employees: { first_name: string; last_name: string; job_title: string | null; department: string | null } };
    },
  });

  const stepsQ = useQuery({
    queryKey: ["paf-steps", q.data?.approval_chain_id],
    enabled: !!q.data?.approval_chain_id,
    queryFn: async () => {
      const { data } = await supabase.from("approval_steps")
        .select("id, stage, approver_role, status, decided_at, decision_notes")
        .eq("chain_id", q.data!.approval_chain_id!).order("stage");
      return (data ?? []) as Array<{ id: string; stage: number; approver_role: string | null; status: string; decided_at: string | null; decision_notes: string | null }>;
    },
  });

  const decide = useMutation({
    mutationFn: async ({ stepId, decision }: { stepId: string; decision: "approved" | "denied" }) => {
      const { error } = await supabase.rpc("decide_paf_step" as never, { _step_id: stepId, _decision: decision, _notes: notes || null } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["paf", id] }); qc.invalidateQueries({ queryKey: ["paf-steps"] }); setNotes(""); toast.success("Decision recorded"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const applyM = useMutation({
    mutationFn: () => apply({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["paf", id] }); toast.success("Changes applied to employee record"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading) return <AppShell title="PAF"><p className="text-muted-foreground">Loading…</p></AppShell>;
  if (!q.data) return <AppShell title="PAF"><p className="text-muted-foreground">Not found.</p></AppShell>;

  const nextStep = stepsQ.data?.find((s) => s.status === "pending");

  return (
    <AppShell title={q.data.paf_number}>
      <Link to="/paf" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2 space-y-4">
          <div className="flex justify-between">
            <div>
              <h2 className="font-medium text-lg">{q.data.employees.first_name} {q.data.employees.last_name}</h2>
              <p className="text-sm text-muted-foreground">{q.data.employees.job_title ?? "—"} · {q.data.employees.department ?? "—"}</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-muted">{q.data.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-xs text-muted-foreground">Action</div>{q.data.action_type.replace(/_/g, " ")}</div>
            <div><div className="text-xs text-muted-foreground">Effective</div>{q.data.effective_date}</div>
          </div>
          {q.data.reason && <div><div className="text-xs text-muted-foreground mb-1">Reason</div><p className="text-sm">{q.data.reason}</p></div>}
          {q.data.narrative && <div><div className="text-xs text-muted-foreground mb-1">Narrative</div><p className="text-sm whitespace-pre-wrap">{q.data.narrative}</p></div>}
          <div>
            <div className="text-xs text-muted-foreground mb-1">After values</div>
            <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(q.data.after_values, null, 2)}</pre>
          </div>
          {q.data.status === "approved" && isHR && (
            <Button onClick={() => applyM.mutate()} disabled={applyM.isPending}>
              <PlayCircle className="h-4 w-4 mr-1" /> {applyM.isPending ? "Applying…" : "Apply to employee record"}
            </Button>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-medium mb-3">Approval chain</h3>
          <ol className="space-y-3">
            {(stepsQ.data ?? []).map((s) => (
              <li key={s.id} className="text-sm border-l-2 pl-3" style={{ borderColor: s.status === "approved" ? "rgb(16 185 129)" : s.status === "denied" ? "rgb(239 68 68)" : "var(--border)" }}>
                <div className="flex justify-between">
                  <span>Stage {s.stage} · {s.approver_role}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted">{s.status}</span>
                </div>
                {s.decision_notes && <p className="text-xs text-muted-foreground mt-1">{s.decision_notes}</p>}
              </li>
            ))}
          </ol>
          {nextStep && (
            <div className="mt-4 pt-4 border-t space-y-2">
              <Textarea placeholder="Decision notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="destructive" onClick={() => decide.mutate({ stepId: nextStep.id, decision: "denied" })} disabled={decide.isPending}><X className="h-3 w-3 mr-1" /> Deny</Button>
                <Button size="sm" onClick={() => decide.mutate({ stepId: nextStep.id, decision: "approved" })} disabled={decide.isPending}><Check className="h-3 w-3 mr-1" /> Approve</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}