import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
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
      const { data: steps } = await supabase.from("approval_steps" as never)
        .select("*, approval_chains:chain_id(id, entity_type, entity_id, status)")
        .eq("approver_id", me.user.id).eq("status", "pending").order("created_at");
      return ((steps ?? []) as Array<{ id: string; stage: number; approver_label: string; approval_chains: { entity_type: string; entity_id: string } }>);
    },
    enabled: !!me?.user.id,
  });

  return (
    <AppShell title="Approvals">
      <div className="grid gap-3 max-w-3xl">
        {(q.data ?? []).map((s) => <ApprovalRow key={s.id} step={s} onDecide={(d, notes) => decide({ data: { step_id: s.id, decision: d, notes } })
          .then(() => { qc.invalidateQueries({ queryKey: ["my-approvals", me?.user.id] }); toast.success("Decision recorded"); })
          .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"))} />)}
        {(q.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No pending approvals.</p>}
      </div>
    </AppShell>
  );
}

function ApprovalRow({ step, onDecide }: {
  step: { id: string; approver_label: string; approval_chains: { entity_type: string; entity_id: string } };
  onDecide: (d: "approved" | "rejected", notes?: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const entity = step.approval_chains;
  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="font-medium">{step.approver_label} approval needed</p>
        <p className="text-xs text-muted-foreground capitalize">{entity.entity_type.replace("_", " ")} · {entity.entity_id.slice(0, 8)}…</p>
      </div>
      <Textarea rows={2} placeholder="Decision notes (optional)" value={notes} onChange={(e)=>setNotes(e.target.value)} />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => onDecide("rejected", notes)}>Reject</Button>
        <Button size="sm" onClick={() => onDecide("approved", notes)}>Approve</Button>
      </div>
    </Card>
  );
}