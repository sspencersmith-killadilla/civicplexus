import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Check, ChevronRight, ChevronLeft, ExternalLink, Briefcase, FileCheck2, Megaphone, ListChecks } from "lucide-react";
import { JobIcon, IconPicker } from "@/components/icon-picker";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createRequisition, submitRequisitionForApproval, postRequisition, listPositionsForRequisition, listJobRequisitions } from "@/lib/jobs.functions";
import { checkPositionBudget } from "@/lib/budget.functions";

const SAMPLE_TEMPLATE = {
  summary:
    "Under direct supervision, the purpose of the position is to assist library patrons by providing service at various desks, and accurately arrange and shelve reading material. Employees in this classification perform clerical level work. Performs related work as required.",
  essential_functions: [
    "Arranges library material in alphabetical and numerical order.",
    "Shelves and retrieves material from the shelves.",
    "Inspects library shelves for accuracy in shelving.",
    "Assists in searching for lost or misplaced materials.",
    "Processes library card application forms.",
    "Provides service at the various public service desks using the automated library computer system.",
    "Maintains holds shelves, adding and removing titles per requests and reports.",
    "Assists patrons with circulation, directional, and informational questions.",
    "Collects fines and fees.",
    "Assists in training new employees.",
    "Maintains information displays.",
    "Comply with all written City policies and procedures.",
    "Adhere to assigned work schedule as outlined in City and department attendance policies and procedures.",
  ].map((s) => `- ${s}`).join("\n"),
  ksa: [
    "Requires the ability to calculate, compute, summate, and/or tabulate data and/or information.",
    "Requires the ability to provide guidance, assistance, and/or interpretation to others on how to apply procedures and standards to specific situations.",
    "Requires the ability to carry out instructions furnished in written, oral or diagrammatic form.",
    "Requires the ability to perform skilled coordinated movements, such as operating a computer terminal, photocopier, or cash register.",
    "The ability to pass a background and drug screen.",
    "The ability to work in a team environment; contribute as a team member and treat co-workers, subordinates and customers with respect.",
    "Communicate effectively both orally and in writing.",
  ].map((s) => `- ${s}`).join("\n"),
  qualifications:
    "High School Diploma or GED required, supplemented by little or no previous experience or training; or an equivalent combination of education, training, and experience.\n\nAny work related experience resulting in acceptable proficiency levels in the above Minimum Qualifications is an acceptable substitute for the above specified education and experience requirements.",
  physical_demands:
    "Over two-thirds of on-the-job time is spent talking, hearing, standing, reaching and using one's hands.\nBetween one-third and two-thirds of on-the-job time is spent walking, stooping, kneeling, crouching or crawling.\nThe ability to lift and/or exert force up to ten (10) pounds may be required over two-thirds of the time and up to one hundred (100)+ pounds may be required between one-third and two-thirds of the time.",
  supplemental:
    "The above statements describe the general nature and level of work being performed. They are not to be construed as an exhaustive list of all responsibilities, duties, and skills required of the position. Employees holding this position will be required to perform any other job-related duties as requested by management. The job description does not constitute an employment agreement and all requirements are subject to possible modification to reasonably accommodate individuals with disabilities.",
};

export const Route = createFileRoute("/_authenticated/jobs/")({ component: JobsIndex });

function HiringGuide() {
  const steps = [
    {
      icon: Briefcase,
      title: "1. Define the classification",
      body: "Create or pick a job in Positions — title, department, pay grade. The wizard pulls these defaults so you don't retype them.",
      to: "/positions" as const,
      cta: "Open Positions",
    },
    {
      icon: Plus,
      title: "2. Draft a requisition",
      body: 'Click "New requisition", choose the classification, click "Use template" to autofill summary/duties/KSA, then save the draft.',
    },
    {
      icon: FileCheck2,
      title: "3. Submit for approval",
      body: "Routes through Supervisor → HR Admin. Approvers act from the Approvals inbox. HR Admins can self-approve in demos.",
      to: "/approvals" as const,
      cta: "Open Approvals",
    },
    {
      icon: Megaphone,
      title: "4. Post publicly",
      body: 'Once approved, click "Post publicly" — status flips to posted and the listing appears on the public careers page.',
      to: "/careers" as const,
      cta: "View careers page",
      external: true,
    },
    {
      icon: ListChecks,
      title: "5. Review applicants",
      body: "Open the requisition to triage applicants, run AI screening, and move candidates through the pipeline.",
    },
  ];
  return (
    <Card className="p-4 mb-4 bg-muted/20">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">From new position → posted job</p>
          <p className="text-xs text-muted-foreground">Five steps to take a classification all the way to a live posting.</p>
        </div>
      </div>
      <ol className="grid md:grid-cols-5 gap-3 mt-3">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="rounded border bg-background p-3">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium leading-tight">{s.title}</p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{s.body}</p>
              {s.to && s.cta && (
                s.external ? (
                  <a href={s.to} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-2">
                    {s.cta} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <Link to={s.to} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-2">
                    {s.cta} <ChevronRight className="h-3 w-3" />
                  </Link>
                )
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function JobsIndex() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const listReqs = useServerFn(listJobRequisitions);

  const reqsQ = useQuery({
    queryKey: ["job_requisitions"],
    queryFn: () => listReqs({ data: undefined as never }),
  });

  return (
    <AppShell title="Job Requisitions">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <a
          href="/careers"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> View public careers page
        </a>
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
      <HiringGuide />
      <div className="grid gap-3">
        {(reqsQ.data ?? []).map((r) => (
          <Card key={r.id} className="p-4 hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between gap-3">
              <Link to="/jobs/$id" params={{ id: r.id }} className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <JobIcon name={r.icon} className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{r.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.department ?? "—"} · {r.internal_only ? "Internal only" : "Public"}</p>
                </div>
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                <IconPicker
                  value={r.icon}
                  onChange={async (name) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { error } = await (supabase as any).from("job_requisitions").update({ icon: name }).eq("id", r.id);
                    if (error) toast.error(error.message);
                    else { toast.success("Icon updated"); qc.invalidateQueries({ queryKey: ["job_requisitions"] }); }
                  }}
                />
                <span className="text-xs px-2 py-1 rounded bg-muted">{r.status}</span>
              </div>
            </div>
          </Card>
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
  const listPositions = useServerFn(listPositionsForRequisition);
  const checkBudget = useServerFn(checkPositionBudget);

  const positionsQ = useQuery({
    queryKey: ["positions_for_req"],
    queryFn: () => listPositions(),
  });

  const [step, setStep] = useState<WizardStep>(0);
  const [form, setForm] = useState({
    position_id: "" as string,
    title: "",
    department: "",
    location: "",
    employment_type: "full_time",
    summary: "",
    essential_functions: "",
    ksa: "",
    qualifications: "",
    physical_demands: "",
    supplemental: "",
    benefits: "",
    internal_only: false,
  });
  const [reqId, setReqId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [approvalSkipped, setApprovalSkipped] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [budgetOverride, setBudgetOverride] = useState(false);

  const budgetQ = useQuery({
    queryKey: ["req-budget", form.department],
    queryFn: () => checkBudget({ data: { department: form.department, additional_fte: 1 } }),
    enabled: step === 1 && !!form.department.trim(),
  });

  const doDraft = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        department: form.department || null,
        position_id: form.position_id || null,
        location: form.location || null,
        employment_type: form.employment_type || null,
        summary: form.summary || null,
        // Stitch essential functions into `description` for back-compat
        description: form.essential_functions || null,
        // Stitch KSA + qualifications into `requirements`
        requirements: [
          form.ksa ? `## Knowledge, Skills, Abilities & Behaviors\n${form.ksa}` : "",
          form.qualifications ? `## Required Qualifications\n${form.qualifications}` : "",
        ].filter(Boolean).join("\n\n") || null,
        benefits: form.benefits || null,
        internal_only: form.internal_only,
        posting_sections: {
          essential_functions: form.essential_functions || null,
          ksa: form.ksa || null,
          qualifications: form.qualifications || null,
          physical_demands: form.physical_demands || null,
          supplemental: form.supplemental || null,
        },
      };
      const row = (await create({ data: payload })) as { id: string; slug: string | null };
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
    onSuccess: (res) => {
      const r = res as { skipped?: boolean; reason?: string };
      if (r.skipped) {
        setApprovalSkipped(true);
        setApprovalNotice(
          "No approvers configured for your account (no supervisor link or HR admin found). You can post directly if your role allows it.",
        );
        toast.message("Approval skipped — no approvers configured");
      } else {
        toast.success("Submitted — approvers notified");
      }
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
            Start from an existing job classification (recommended) — title, department, and worker type auto-fill. You can edit anything after.
          </p>
          <div>
            <Label>Job classification</Label>
            <select
              className="w-full border rounded h-9 px-2 bg-background text-sm"
              value={form.position_id}
              onChange={(e) => {
                const pid = e.target.value;
                const pos = (positionsQ.data ?? []).find((p) => p.id === pid) as any;
                setForm({
                  ...form,
                  position_id: pid,
                  title: pos?.title ?? form.title,
                  department: pos?.department ?? form.department,
                  summary: pos?.default_summary ?? form.summary,
                  essential_functions: pos?.default_essential_functions ?? form.essential_functions,
                  ksa: pos?.default_ksa ?? form.ksa,
                  qualifications: pos?.default_qualifications ?? form.qualifications,
                  physical_demands: pos?.default_physical_demands ?? form.physical_demands,
                  supplemental: pos?.default_supplemental ?? form.supplemental,
                  benefits: pos?.default_benefits ?? form.benefits,
                });
                if (pos && (pos.default_summary || pos.default_essential_functions || pos.default_qualifications)) {
                  toast.message("Pre-filled from position defaults", { description: "Edit any field for this posting." });
                }
              }}
            >
              <option value="">— Custom (no classification) —</option>
              {(positionsQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}{p.department ? ` · ${p.department}` : ""}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">Manage classifications under Positions.</p>
          </div>
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Patrol Officer" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
            <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Employment type</Label>
              <select
                className="w-full border rounded h-9 px-2 bg-background text-sm"
                value={form.employment_type}
                onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
              >
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="temporary">Temporary</option>
                <option value="seasonal">Seasonal</option>
                <option value="contract">Contract</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm pb-2">
                <input type="checkbox" checked={form.internal_only} onChange={(e) => setForm({ ...form, internal_only: e.target.checked })} />
                Internal mobility only
              </label>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Position summary</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() =>
                  setForm({
                    ...form,
                    summary: form.summary || SAMPLE_TEMPLATE.summary,
                    essential_functions: form.essential_functions || SAMPLE_TEMPLATE.essential_functions,
                    ksa: form.ksa || SAMPLE_TEMPLATE.ksa,
                    qualifications: form.qualifications || SAMPLE_TEMPLATE.qualifications,
                    physical_demands: form.physical_demands || SAMPLE_TEMPLATE.physical_demands,
                    supplemental: form.supplemental || SAMPLE_TEMPLATE.supplemental,
                  })
                }
              >
                Use template
              </Button>
            </div>
            <Textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="1–2 sentence position overview" />
          </div>
          <div>
            <Label>Essential functions</Label>
            <Textarea rows={6} value={form.essential_functions} onChange={(e) => setForm({ ...form, essential_functions: e.target.value })} placeholder="- Arranges material…\n- Shelves and retrieves…" />
          </div>
          <div>
            <Label>Knowledge, skills, abilities &amp; behaviors</Label>
            <Textarea rows={5} value={form.ksa} onChange={(e) => setForm({ ...form, ksa: e.target.value })} />
          </div>
          <div>
            <Label>Required qualifications</Label>
            <Textarea rows={4} value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} />
          </div>
          <div>
            <Label>Physical demands</Label>
            <Textarea rows={3} value={form.physical_demands} onChange={(e) => setForm({ ...form, physical_demands: e.target.value })} />
          </div>
          <div>
            <Label>Supplemental</Label>
            <Textarea rows={3} value={form.supplemental} onChange={(e) => setForm({ ...form, supplemental: e.target.value })} />
          </div>
          <div>
            <Label>Benefits (optional)</Label>
            <Textarea rows={3} value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} />
          </div>
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
          {form.department && budgetQ.data && (
            <Card className={"p-3 text-xs " + (budgetQ.data.would_exceed ? "border-destructive/40 bg-destructive/5" : "")}>
              <p className="font-medium">FY{budgetQ.data.fiscal_year} budget — {budgetQ.data.department}</p>
              <p className="text-muted-foreground mt-1">
                Budgeted {budgetQ.data.budgeted_fte ?? "—"} FTE · Used {budgetQ.data.used_fte ?? 0} · Requesting {budgetQ.data.requested_fte ?? 1} · Remaining {budgetQ.data.remaining_fte ?? "—"}
              </p>
              {budgetQ.data.would_exceed && (
                <label className="flex items-center gap-2 mt-2 text-destructive">
                  <input type="checkbox" checked={budgetOverride} onChange={(e) => setBudgetOverride(e.target.checked)} />
                  This requisition exceeds budgeted FTE — proceed with HR override
                </label>
              )}
            </Card>
          )}
          <p className="text-xs text-muted-foreground">
            Saving creates the requisition in <span className="font-mono">draft</span> status. It will not be visible to applicants until it is posted.
          </p>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(0)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
            <Button disabled={doDraft.isPending || (budgetQ.data?.would_exceed && !budgetOverride)} onClick={() => doDraft.mutate()}>
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
              <p className="text-sm text-muted-foreground">
                {approvalNotice ?? "Approval skipped."} Posting will work only if your role allows direct posting; otherwise approve the requisition first from <span className="font-mono">/approvals</span>.
              </p>
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