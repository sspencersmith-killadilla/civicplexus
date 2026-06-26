import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { decideApprovalStep } from "@/lib/jobs.functions";
import { decidePafStep, getApprovalInbox } from "@/lib/paf.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/approvals")({ component: ApprovalsInbox });

function ApprovalsInbox() {
  const qc = useQueryClient();
  const decide = useServerFn(decideApprovalStep);
  const getInbox = useServerFn(getApprovalInbox);
  const decidePaf = useServerFn(decidePafStep);

  const q = useQuery({
    queryKey: ["my-approvals"],
    queryFn: () => getInbox(),
  });

  const handlePaf = async (stepId: string, decision: "approved"|"denied", notes?: string) => {
    await decidePaf({ data: { step_id: stepId, decision, notes: notes ?? null } });
  };

  return (
    <AppShell title="Approvals">
      <div className="grid gap-3 max-w-3xl">
        {(q.data ?? []).map((s) => {
          const isPaf = (s.approval_chains?.kind ?? "").startsWith("paf_");
          return (
            <ApprovalRow
              key={s.id}
              step={s}
              onDecide={(d, notes) => {
                const p = isPaf
                  ? handlePaf(s.id, d === "approved" ? "approved" : "denied", notes)
                  : decide({ data: { step_id: s.id, decision: d, notes } });
                return Promise.resolve(p)
                  .then(() => { qc.invalidateQueries({ queryKey: ["my-approvals"] }); toast.success("Decision recorded"); })
                  .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"));
              }}
            />
          );
        })}
        {(q.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No pending approvals.</p>}
      </div>
    </AppShell>
  );
}

function ApprovalRow({ step, onDecide }: {
  step: {
    id: string; stage: number; approver_label: string | null; approver_role: string | null;
    approval_chains: { kind: string | null; entity_type: string | null; entity_id: string | null } | null;
    paf: { id: string; paf_number: string | null; action_type: string } | null;
  };
  onDecide: (d: "approved" | "rejected", notes?: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const isPaf = (step.approval_chains?.kind ?? "").startsWith("paf_");
  const paf = step.paf;
  const label = step.approver_label || step.approver_role || "Approver";
  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="font-medium capitalize">{label.replace(/_/g, " ")} approval needed (stage {step.stage})</p>
        {isPaf && paf
          ? <p className="text-xs text-muted-foreground">
              <Link to="/paf/$id" params={{ id: paf.id }} className="underline">PAF {paf.paf_number ?? paf.id.slice(0, 8)}</Link> · {paf.action_type.replace(/_/g, " ")}
            </p>
          : <p className="text-xs text-muted-foreground capitalize">{step.approval_chains?.entity_type?.replace("_", " ")} · {step.approval_chains?.entity_id?.slice(0, 8)}…</p>
        }
      </div>
      <Textarea rows={2} placeholder="Decision notes (optional)" value={notes} onChange={(e)=>setNotes(e.target.value)} />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => onDecide("rejected", notes)}>Reject</Button>
        <Button size="sm" onClick={() => onDecide("approved", notes)}>Approve</Button>
      </div>
    </Card>
  );
}