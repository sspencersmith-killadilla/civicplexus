import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Briefcase, MapPin, Lock, CheckCircle2, AlertTriangle, XCircle, EyeOff, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { applyInternally } from "@/lib/jobs.functions";
import { buildInternalResume, evaluateInternalEligibility, type InternalResume } from "@/lib/internal-apply.functions";

export const Route = createFileRoute("/_authenticated/internal-careers")({ component: InternalCareers });

function InternalCareers() {
  const qc = useQueryClient();
  const apply = useServerFn(applyInternally);

  const q = useQuery({
    queryKey: ["internal_careers"],
    queryFn: async () => {
      const { data } = await supabase.from("job_requisitions" as never)
        .select("id, title, department, location, employment_type, summary, internal_only, slug")
        .eq("status", "posted").order("posted_at", { ascending: false });
      return (data ?? []) as Array<{ id: string; title: string; department: string | null; location: string | null; employment_type: string | null; summary: string | null; internal_only: boolean; slug: string | null }>;
    },
  });

  return (
    <AppShell title="Internal Careers">
      <p className="text-sm text-muted-foreground mb-6">Browse open roles and apply to grow within the organization. Your resume is auto-built from your HR record — you just need to add a short cover letter.</p>
      <div className="grid gap-3">
        {(q.data ?? []).map((r) => (
          <InternalRow key={r.id} req={r} onApply={(payload) => apply({ data: { requisition_id: r.id, ...payload } })
            .then(() => { qc.invalidateQueries(); toast.success("Application submitted"); })
            .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"))} />
        ))}
        {(q.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No open roles right now.</p>}
      </div>
    </AppShell>
  );
}

type ApplyPayload = {
  cover_letter: string;
  notify_current_manager: boolean;
  confidential_until_finalist: boolean;
  resume_snapshot: InternalResume;
  supplemental_answers: Record<string, unknown>;
};

function InternalRow({ req, onApply }: {
  req: { id: string; title: string; department: string | null; location: string | null; summary: string | null; internal_only: boolean; slug: string | null };
  onApply: (payload: ApplyPayload) => void;
}) {
  const [open, setOpen] = useState(false);
  const eligibilityFn = useServerFn(evaluateInternalEligibility);
  const eligQ = useQuery({
    queryKey: ["internal-eligibility", req.id],
    queryFn: () => eligibilityFn({ data: { requisition_id: req.id } }),
  });
  const summary = eligQ.data;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium flex items-center gap-2 flex-wrap">
            {req.title}
            {req.internal_only && <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 flex items-center gap-1"><Lock className="h-3 w-3" />Internal only</span>}
          </h3>
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {req.department && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{req.department}</span>}
            {req.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{req.location}</span>}
          </div>
          {req.summary && <p className="text-sm mt-2">{req.summary}</p>}
          {summary && (summary.passes.length + summary.warnings.length + summary.blockers.length > 0) && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {summary.passes.slice(0, 3).map((p, i) => <span key={`p${i}`} className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{p}</span>)}
              {summary.warnings.slice(0, 3).map((p, i) => <span key={`w${i}`} className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-800 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{p}</span>)}
              {summary.blockers.map((p, i) => <span key={`b${i}`} className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" />{p}</span>)}
            </div>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm">Apply internally</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Apply to {req.title}</DialogTitle></DialogHeader>
            <ApplyForm reqId={req.id} onSubmit={(payload) => { onApply(payload); setOpen(false); }} />
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

function ApplyForm({ reqId, onSubmit }: { reqId: string; onSubmit: (p: ApplyPayload) => void }) {
  const buildFn = useServerFn(buildInternalResume);
  const resumeQ = useQuery({ queryKey: ["internal-resume", reqId], queryFn: () => buildFn({ data: {} }) });
  const suppQ = useQuery({
    queryKey: ["supp-questions", reqId],
    queryFn: async () => {
      const { data } = await supabase.from("job_supplemental_questions").select("id, key, label, type, options, required, sort_order").eq("requisition_id", reqId).order("sort_order");
      return (data ?? []) as Array<{ id: string; key: string; label: string; type: string; options: unknown; required: boolean; sort_order: number }>;
    },
  });

  const [cover, setCover] = useState("");
  const [notify, setNotify] = useState(true);
  const [confidential, setConfidential] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [resume, setResume] = useState<InternalResume | null>(null);
  const [showResume, setShowResume] = useState(false);

  useEffect(() => { if (resumeQ.data && !resume) setResume(resumeQ.data); }, [resumeQ.data, resume]);

  const supervisorName = resume?.header.supervisor_name;
  const chars = cover.trim().length;
  const coverValid = chars >= 100 && chars <= 1500;

  function toggle(sectionKey: keyof InternalResume) {
    if (!resume) return;
    const sec = resume[sectionKey] as unknown as { included: boolean };
    setResume({ ...resume, [sectionKey]: { ...(resume[sectionKey] as object), included: !sec.included } } as InternalResume);
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Your auto-built resume</div>
        <button type="button" onClick={() => setShowResume((s) => !s)} className="text-sm text-primary hover:underline flex items-center gap-1">
          {showResume ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Preview & choose sections to include
        </button>
        {showResume && resume && (
          <div className="mt-2 border rounded p-3 bg-muted/30 space-y-3 text-sm">
            <div>
              <div className="font-medium">{resume.header.name}</div>
              <div className="text-xs text-muted-foreground">
                {resume.header.job_title ?? "—"}{resume.header.department ? ` · ${resume.header.department}` : ""}
                {resume.header.tenure_years !== null ? ` · ${resume.header.tenure_years}y tenure` : ""}
              </div>
            </div>
            {([
              ["current_role", "Current role"],
              ["work_history", "Personnel actions & work history"],
              ["certifications", "Certifications"],
              ["training", "Completed training"],
              ["performance", "Performance reviews"],
              ["accomplishments", "Completed goals"],
            ] as Array<[keyof InternalResume, string]>).map(([key, label]) => {
              const sec = resume[key] as unknown as ResumeSectionAny;
              const count = sec.items?.length ?? 0;
              return (
                <label key={String(key)} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={sec.included} onChange={() => toggle(key)} disabled={count === 0} />
                  <span className={count === 0 ? "text-muted-foreground" : ""}>{label} <span className="text-muted-foreground">({count})</span></span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Why this role? <span className="text-destructive">*</span></label>
        <Textarea rows={6} placeholder="What draws you to this role? What would you bring? Any relevant experience not already in your record?" value={cover} onChange={(e) => setCover(e.target.value)} />
        <p className={`text-xs mt-1 ${coverValid ? "text-muted-foreground" : "text-amber-700"}`}>{chars}/1500 — aim for 100–1500 characters</p>
      </div>

      {(suppQ.data ?? []).length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Additional questions</div>
          {suppQ.data!.map((q) => (
            <div key={q.id}>
              <label className="text-sm">{q.label}{q.required && <span className="text-destructive"> *</span>}</label>
              <Textarea rows={2} value={String(answers[q.key] ?? "")} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t pt-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={confidential} onChange={(e) => { setConfidential(e.target.checked); if (e.target.checked) setNotify(false); }} />
          <span>
            <span className="flex items-center gap-1 font-medium"><EyeOff className="h-3 w-3" /> Keep confidential until I'm a finalist</span>
            <span className="text-xs text-muted-foreground block">HR sees your application immediately; your current supervisor is only notified if you reach the interview/finalist stage.</span>
          </span>
        </label>
        {!confidential && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>Notify my current supervisor{supervisorName ? ` (${supervisorName})` : ""}</span>
          </label>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          disabled={!coverValid || !resume}
          onClick={() => resume && onSubmit({
            cover_letter: cover,
            notify_current_manager: notify,
            confidential_until_finalist: confidential,
            resume_snapshot: resume,
            supplemental_answers: answers,
          })}
        >Submit application</Button>
      </div>
    </div>
  );
}

type ResumeSectionAny = { included: boolean; items: unknown[] };