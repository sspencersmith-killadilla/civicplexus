import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, X, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { applyPaf, decidePafStep, getPafDetail } from "@/lib/paf.functions";
import { listPafLines, castLineVote } from "@/lib/paf-lines.functions";

export const Route = createFileRoute("/_authenticated/paf/$id")({ component: PafDetail });

function PafDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const apply = useServerFn(applyPaf);
  const getDetail = useServerFn(getPafDetail);
  const decideStep = useServerFn(decidePafStep);
  const listLinesFn = useServerFn(listPafLines);
  const castVote = useServerFn(castLineVote);
  const [notes, setNotes] = useState("");
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["paf", id],
    queryFn: () => getDetail({ data: { id } }),
  });
  const linesQ = useQuery({
    queryKey: ["paf-lines", id],
    queryFn: () => listLinesFn({ data: { paf_id: id } }),
  });
  const voteM = useMutation({
    mutationFn: (v: { step_id: string; line_id: string; decision: "approved" | "denied" }) =>
      castVote({ data: { step_id: v.step_id, line_id: v.line_id, decision: v.decision, note: lineNotes[v.line_id] || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["paf-lines", id] }); toast.success("Vote recorded"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const decide = useMutation({
    mutationFn: async ({ stepId, decision }: { stepId: string; decision: "approved" | "denied" }) => {
      await decideStep({ data: { step_id: stepId, decision, notes: notes || null } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["paf", id] }); setNotes(""); toast.success("Decision recorded"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const applyM = useMutation({
    mutationFn: () => apply({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["paf", id] }); toast.success("Changes applied to employee record"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading) return <AppShell title="PAF"><p className="text-muted-foreground">Loading…</p></AppShell>;
  if (!q.data) return <AppShell title="PAF"><p className="text-muted-foreground">Not found.</p></AppShell>;

  const paf = q.data.paf;
  const steps = q.data.steps;
  const audit = q.data.audit;
  const nextStep = steps.find((s) => s.status === "pending" && s.can_decide);
  const lines = linesQ.data?.lines ?? [];
  const votes = linesQ.data?.votes ?? [];
  const voteFor = (stepId: string, lineId: string) =>
    votes.find((v) => v.step_id === stepId && v.line_id === lineId);

  return (
    <AppShell title={paf.paf_number ?? "PAF"}>
      <Link to="/paf" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2 space-y-4">
          <div className="flex justify-between">
            <div>
              <h2 className="font-medium text-lg">{paf.employees.first_name} {paf.employees.last_name}</h2>
              <p className="text-sm text-muted-foreground">{paf.employees.job_title ?? "—"} · {paf.employees.department ?? "—"}</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-muted">{paf.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-xs text-muted-foreground">Action</div>{paf.action_type.replace(/_/g, " ")}</div>
            <div><div className="text-xs text-muted-foreground">Effective</div>{paf.effective_date}</div>
          </div>
          {paf.reason && <div><div className="text-xs text-muted-foreground mb-1">Reason</div><p className="text-sm">{paf.reason}</p></div>}
          {paf.narrative && <div><div className="text-xs text-muted-foreground mb-1">Narrative</div><p className="text-sm whitespace-pre-wrap">{paf.narrative}</p></div>}
          <div>
            <div className="text-xs text-muted-foreground mb-1">After values</div>
            <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(paf.after_values, null, 2)}</pre>
          </div>
          {lines.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">Action lines ({lines.length})</div>
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.id} className="border rounded p-3 text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium capitalize">#{l.ordinal} · {l.action_type.replace(/_/g, " ")}</span>
                        <span className="text-xs text-muted-foreground ml-2">eff. {l.effective_date}</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted">{l.status}</span>
                    </div>
                    {Object.keys(l.after_values ?? {}).length > 0 && (
                      <pre className="text-xs bg-muted/50 rounded p-2 mt-2 overflow-x-auto">{JSON.stringify(l.after_values, null, 2)}</pre>
                    )}
                    {nextStep && (
                      <div className="mt-3 space-y-2">
                        <Textarea rows={1} placeholder="Line note (optional)" value={lineNotes[l.id] ?? ""} onChange={(e) => setLineNotes({ ...lineNotes, [l.id]: e.target.value })} />
                        <div className="flex gap-2 justify-end">
                          {(() => { const v = voteFor(nextStep.id, l.id); return v ? (
                            <span className={"text-xs px-2 py-1 rounded " + (v.decision === "approved" ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive")}>
                              Your vote: {v.decision}
                            </span>
                          ) : null; })()}
                          <Button size="sm" variant="destructive" disabled={voteM.isPending} onClick={() => voteM.mutate({ step_id: nextStep.id, line_id: l.id, decision: "denied" })}><X className="h-3 w-3 mr-1" /> Deny line</Button>
                          <Button size="sm" disabled={voteM.isPending} onClick={() => voteM.mutate({ step_id: nextStep.id, line_id: l.id, decision: "approved" })}><Check className="h-3 w-3 mr-1" /> Approve line</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {paf.status === "approved" && q.data.viewer.is_hr_admin && (
            <Button onClick={() => applyM.mutate()} disabled={applyM.isPending}>
              <PlayCircle className="h-4 w-4 mr-1" /> {applyM.isPending ? "Applying…" : "Apply to employee record"}
            </Button>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-medium mb-3">Approval chain</h3>
          <ol className="space-y-3">
            {steps.map((s) => (
              <li key={s.id} className="text-sm border-l-2 pl-3" style={{ borderColor: s.status === "approved" ? "rgb(16 185 129)" : s.status === "denied" ? "rgb(239 68 68)" : "var(--border)" }}>
                <div className="flex justify-between">
                  <span>Stage {s.stage} · {s.approver_label || s.approver_role}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted">{s.status}</span>
                </div>
                {s.decision_notes && <p className="text-xs text-muted-foreground mt-1">{s.decision_notes}</p>}
              </li>
            ))}
            {steps.length === 0 && <p className="text-xs text-muted-foreground">No approval steps found. Run Repair approval chains from the PAF list.</p>}
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
      <Card className="p-5 mt-4">
        <h3 className="font-medium mb-3">Audit log</h3>
        <ol className="space-y-2">
          {audit.map((a) => (
            <li key={a.id} className="text-sm border-l-2 border-border pl-3">
              <div className="flex justify-between gap-2">
                <span className="capitalize">{a.event_type.replace(/_/g, " ")}{a.from_status && a.to_status ? `: ${a.from_status} → ${a.to_status}` : ""}</span>
                <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
              </div>
              <p className="text-xs text-muted-foreground">by {a.actor_name}</p>
              {a.notes && <p className="text-xs mt-1">{a.notes}</p>}
            </li>
          ))}
          {audit.length === 0 && <p className="text-xs text-muted-foreground">No audit entries yet.</p>}
        </ol>
      </Card>
    </AppShell>
  );
}