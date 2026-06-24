import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { decideApprovalStep } from "@/lib/jobs.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/approvals")({ component: ApprovalsInbox });

function ApprovalsInbox() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const decide = useServerFn(decideApprovalStep);

  const q = useQuery({
    queryKey: ["my-approvals", me?.user.id],
    queryFn: async () => {
      if (!me?.user.id) return [];
      const roles = me.roles ?? [];
      const orFilter = [
        `approver_id.eq.${me.user.id}`,
        ...(roles.length ? [`approver_role.in.(${roles.join(",")})`] : []),
      ].join(",");
      const { data: steps } = await supabase.from("approval_steps")
        .select("id, stage, approver_label, approver_role, approver_id, status, approval_chains:chain_id(id, kind, entity_type, entity_id, status), personnel_actions:chain_id(id, paf_number, action_type, employee_id)")
        .eq("status", "pending")
        .or(orFilter)
        .order("created_at");
      return (steps ?? []) as Array<{
        id: string; stage: number; approver_label: string | null; approver_role: string | null;
        approval_chains: { id: string; kind: string | null; entity_type: string | null; entity_id: string | null };
        personnel_actions: Array<{ id: string; paf_number: string; action_type: string; employee_id: string }>;
      }>;
    },
    enabled: !!me?.user.id,
  });

  const handlePaf = async (stepId: string, decision: "approved"|"denied", notes?: string) => {
    const { error } = await supabase.rpc("decide_paf_step" as never, { _step_id: stepId, _decision: decision, _notes: notes ?? null } as never);
    if (error) throw error;
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
                  .then(() => { qc.invalidateQueries({ queryKey: ["my-approvals", me?.user.id] }); toast.success("Decision recorded"); })
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
    approval_chains: { kind: string | null; entity_type: string | null; entity_id: string | null };
    personnel_actions: Array<{ id: string; paf_number: string; action_type: string }>;
  };
  onDecide: (d: "approved" | "rejected", notes?: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const isPaf = (step.approval_chains?.kind ?? "").startsWith("paf_");
  const paf = step.personnel_actions?.[0];
  const label = step.approver_label || step.approver_role || "Approver";
  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="font-medium capitalize">{label.replace(/_/g, " ")} approval needed (stage {step.stage})</p>
        {isPaf && paf
          ? <p className="text-xs text-muted-foreground">
              <Link to="/paf/$id" params={{ id: paf.id }} className="underline">PAF {paf.paf_number}</Link> · {paf.action_type.replace(/_/g, " ")}
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