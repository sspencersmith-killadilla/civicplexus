import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Check, ChevronRight, ChevronLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createRequisition, submitRequisitionForApproval, postRequisition } from "@/lib/jobs.functions";

export const Route = createFileRoute("/_authenticated/jobs/")({ component: JobsIndex });

function JobsIndex() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const reqsQ = useQuery({
    queryKey: ["job_requisitions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_requisitions" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; title: string; department: string | null; status: string; slug: string | null; posted_at: string | null; internal_only: boolean }>;
    },
  });

  return (
    <AppShell title="Job Requisitions">
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New requisition</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <RequisitionWizard
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["job_requisitions"] });
                setOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-3">
        {(reqsQ.data ?? []).map((r) => (
          <Link key={r.id} to="/jobs/$id" params={{ id: r.id }}>
            <Card className="p-4 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{r.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.department ?? "—"} · {r.internal_only ? "Internal only" : "Public"}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-muted">{r.status}</span>
              </div>
            </Card>
          </Link>
        ))}
        {(reqsQ.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No requisitions yet.</p>}
      </div>
    </AppShell>
  );
}

type WizardStep = 0 | 1 | 2 | 3 | 4;
const STEPS = [
  { key: "details", label: "Details" },
  { key: "draft", label: "Save draft" },
  { key: "approval", label: "Submit for approval" },
  { key: "post", label: "Post publicly" },
  { key: "done", label: "Done" },
] as const;

function RequisitionWizard({ onDone }: { onDone: () => void }) {
  const create = useServerFn(createRequisition);
  const submitApproval = useServerFn(submitRequisitionForApproval);
  const post = useServerFn(postRequisition);

  const [step, setStep] = useState<WizardStep>(0);
  const [form, setForm] = useState({
    title: "",
    department: "",
    location: "",
    employment_type: "full_time",
    summary: "",
    description: "",
    internal_only: false,
  });
  const [reqId, setReqId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [approvalSkipped, setApprovalSkipped] = useState(false);

  const doDraft = useMutation({
    mutationFn: async () => {
      const row = (await create({ data: form })) as { id: string; slug: string | null };
      return row;
    },
    onSuccess: (row) => {
      setReqId(row.id);
      setSlug(row.slug);
      setStep(2);
      toast.success("Draft saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doSubmit = useMutation({
    mutationFn: () => submitApproval({ data: { requisition_id: reqId! } }),
    onSuccess: () => {
      toast.success("Submitted — approvers notified");
      setStep(3);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doPost = useMutation({
    mutationFn: () => post({ data: { requisition_id: reqId! } }),
    onSuccess: () => {
      toast.success("Posted! Now accepting applications");
      setStep(4);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div>
      <DialogHeader>
        <DialogTitle>New job requisition</DialogTitle>
      </DialogHeader>

      {/* Stepper */}
      <ol className="flex items-center gap-2 mt-3 mb-5 text-xs">
        {STEPS.map((s, i) => {
          const active = i === step;
          const complete = i < step;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={
                  "inline-flex items-center justify-center h-6 w-6 rounded-full border " +
                  (complete
                    ? "bg-primary text-primary-foreground border-primary"
                    : active
                    ? "border-primary text-primary"
                    : "border-muted-foreground/30 text-muted-foreground")
                }
              >
                {complete ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={active ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
              {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
            </li>
          );
        })}
      </ol>

      {/* Step 0: Details */}
      {step === 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Fill in the basics. You can refine the description any time from the requisition page.
          </p>
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Patrol Officer" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
            <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          </div>
          <div>
            <Label>Summary (1–2 sentences)</Label>
            <Textarea rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </div>
          <div>
            <Label>Description (markdown ok)</Label>
            <Textarea rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.internal_only} onChange={(e) => setForm({ ...form, internal_only: e.target.checked })} />
            Internal mobility only (hidden from public careers page)
          </label>
          <div className="flex justify-end pt-2">
            <Button disabled={!form.title.trim()} onClick={() => setStep(1)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 1: Save draft */}
      {step === 1 && (
        <div className="space-y-4">
          <Card className="p-4 bg-muted/30">
            <p className="text-sm font-medium">{form.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {form.department || "No department"} · {form.location || "No location"} · {form.internal_only ? "Internal only" : "Public"}
            </p>
            {form.summary && <p className="text-sm mt-3">{form.summary}</p>}
          </Card>
          <p className="text-xs text-muted-foreground">
            Saving creates the requisition in <span className="font-mono">draft</span> status. It will not be visible to applicants until it is posted.
          </p>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(0)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
            <Button disabled={doDraft.isPending} onClick={() => doDraft.mutate()}>
              {doDraft.isPending ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Submit for approval */}
      {step === 2 && (
        <div className="space-y-4">
          <Card className="p-4 bg-muted/30">
            <p className="text-sm">
              <Check className="inline h-4 w-4 text-primary mr-1" /> Draft saved.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Next, submit for approval. This builds a chain (Supervisor → HR Admin) and notifies the first approver. They review on the <span className="font-mono">/approvals</span> page.
            </p>
          </Card>
          <p className="text-xs text-muted-foreground">
            For demos or self-approved reqs, you can skip approval and post directly — your role must allow it.
          </p>
          <div className="flex justify-between pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setApprovalSkipped(true);
                setStep(3);
              }}
            >
              Skip approval
            </Button>
            <Button disabled={doSubmit.isPending} onClick={() => doSubmit.mutate()}>
              {doSubmit.isPending ? "Submitting…" : "Submit for approval"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Post publicly */}
      {step === 3 && (
        <div className="space-y-4">
          <Card className="p-4 bg-muted/30">
            {approvalSkipped ? (
              <p className="text-sm text-muted-foreground">Approval skipped. Posting will work only if your role allows direct posting; otherwise approve the requisition first from <span className="font-mono">/approvals</span>.</p>
            ) : (
              <p className="text-sm">
                <Check className="inline h-4 w-4 text-primary mr-1" /> Submitted. Once all approvers sign off, the requisition is ready to post.
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Posting flips status to <span className="font-mono">posted</span>, stamps <span className="font-mono">posted_at</span>, and makes the listing live on the public careers page.
            </p>
          </Card>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={onDone}>Finish later</Button>
            <Button disabled={doPost.isPending} onClick={() => doPost.mutate()}>
              {doPost.isPending ? "Posting…" : "Post publicly"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 4 && (
        <div className="space-y-4">
          <Card className="p-4 bg-muted/30">
            <p className="text-sm">
              <Check className="inline h-4 w-4 text-primary mr-1" /> Live and accepting applications.
            </p>
            {slug && !form.internal_only && (
              <a
                href={`/careers/${slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm mt-3 text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> View public posting
              </a>
            )}
          </Card>
          <div className="flex justify-end gap-2 pt-2">
            {reqId && (
              <Button variant="outline" asChild>
                <Link to="/jobs/$id" params={{ id: reqId }}>Open requisition</Link>
              </Button>
            )}
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}