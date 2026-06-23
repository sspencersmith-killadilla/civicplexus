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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ExternalLink, CalendarClock, UserPlus, FileSignature, Send, Link2 } from "lucide-react";
import { toast } from "sonner";
import { submitRequisitionForApproval, postRequisition, closeRequisition, transitionApplicationStatus, scheduleInterview, convertApplicationToHire } from "@/lib/jobs.functions";
import { createOffer } from "@/lib/offers.functions";
import { mintCandidatePortalToken, postRecruiterMessage } from "@/lib/candidate-portal.functions";
import { sendTemplatedToApplicant } from "@/lib/email-templates.functions";
import { parseApplicationResume, scoreApplicationAgainstRubric, saveRequisitionRubric, decideSuggestion } from "@/lib/applicant-ai.functions";
import { Sparkles, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/jobs/$id")({ component: JobDetail });

const APP_STATUSES = ["new","screening","interview","offer","hired","rejected","withdrawn"] as const;

function JobDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const submitForApproval = useServerFn(submitRequisitionForApproval);
  const post = useServerFn(postRequisition);
  const close = useServerFn(closeRequisition);

  const reqQ = useQuery({
    queryKey: ["job_requisition", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_requisitions" as never).select("*").eq("id", id).single();
      if (error) throw error;
      return data as never as { id: string; title: string; status: string; slug: string | null; internal_only: boolean; department: string | null; description: string | null; summary: string | null; ai_rubric: { required_skills?: string[]; preferred_skills?: string[]; must_have_certifications?: string[]; min_years_experience?: number | null; notes?: string } | null };
    },
  });

  const appsQ = useQuery({
    queryKey: ["job_applications", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_applications" as never).select("*").eq("requisition_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; applicant_name: string; email: string; status: string; is_internal: boolean; rating: number | null; created_at: string }>;
    },
  });

  const chainQ = useQuery({
    queryKey: ["approval_chain", id],
    queryFn: async () => {
      const { data: chain } = await supabase.from("approval_chains" as never).select("*").eq("entity_type", "requisition").eq("entity_id", id).maybeSingle();
      const c = chain as { id: string; status: string; current_stage: number } | null;
      if (!c) return { chain: null, steps: [] };
      const { data: steps } = await supabase.from("approval_steps" as never).select("*").eq("chain_id", c.id).order("stage");
      return { chain: c, steps: (steps ?? []) as Array<{ id: string; stage: number; approver_label: string; status: string; decision_notes: string | null }> };
    },
  });

  const sub = useMutation({ mutationFn: () => submitForApproval({ data: { requisition_id: id } }),
    onSuccess: () => { qc.invalidateQueries(); toast.success("Submitted for approval"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const pst = useMutation({ mutationFn: () => post({ data: { requisition_id: id } }),
    onSuccess: () => { qc.invalidateQueries(); toast.success("Posted!"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const cls = useMutation({ mutationFn: () => close({ data: { requisition_id: id } }),
    onSuccess: () => { qc.invalidateQueries(); toast.success("Closed"); },
  });

  if (reqQ.isLoading || !reqQ.data) return <AppShell title="Requisition"><p>Loading…</p></AppShell>;
  const r = reqQ.data;

  return (
    <AppShell title={r.title}>
      <Link to="/jobs" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3 w-3 mr-1" /> All requisitions
      </Link>

      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{r.department ?? "—"} · {r.internal_only ? "Internal mobility only" : "Public"}</p>
            <p className="text-sm mt-1">Status: <span className="font-medium">{r.status}</span></p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {r.status === "draft" && <Button size="sm" onClick={() => sub.mutate()} disabled={sub.isPending}>Submit for approval</Button>}
            {r.status === "approved" && <Button size="sm" onClick={() => pst.mutate()}>Post publicly</Button>}
            {r.status === "posted" && r.slug && !r.internal_only && (
              <Button size="sm" variant="outline" asChild>
                <a href={`/careers/${r.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 mr-1" /> View posting</a>
              </Button>
            )}
            {["posted","approved"].includes(r.status) && <Button size="sm" variant="outline" onClick={() => cls.mutate()}>Close</Button>}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="apps">
        <TabsList>
          <TabsTrigger value="apps">Applications ({appsQ.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="approval">Approval</TabsTrigger>
          <TabsTrigger value="rubric">AI rubric</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="apps" className="space-y-3">
          {(appsQ.data ?? []).map((a) => (
            <ApplicantRow key={a.id} app={a} requisitionId={id} />
          ))}
          {(appsQ.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No applications yet.</p>}
        </TabsContent>
        <TabsContent value="approval">
          {!chainQ.data?.chain ? (
            <p className="text-sm text-muted-foreground">No approval chain yet. Submit for approval to start.</p>
          ) : (
            <Card className="p-4">
              <p className="text-sm mb-3">Chain status: <span className="font-medium">{chainQ.data.chain.status}</span></p>
              <ol className="space-y-2">
                {chainQ.data.steps.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm border rounded p-2">
                    <span>Stage {s.stage} — {s.approver_label}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted">{s.status}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="rubric">
          <RubricEditor requisitionId={id} initial={r.ai_rubric ?? {}} />
        </TabsContent>
        <TabsContent value="details">
          <Card className="p-4 space-y-3">
            {r.summary && <p className="text-sm">{r.summary}</p>}
            {r.description && <pre className="text-sm whitespace-pre-wrap font-sans">{r.description}</pre>}
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ApplicantRow({ app, requisitionId }: { app: { id: string; applicant_name: string; email: string; status: string; is_internal: boolean; rating: number | null }; requisitionId: string }) {
  const qc = useQueryClient();
  const change = useServerFn(transitionApplicationStatus);
  const sched = useServerFn(scheduleInterview);
  const convert = useServerFn(convertApplicationToHire);
  const draftOffer = useServerFn(createOffer);
  const mintPortal = useServerFn(mintCandidatePortalToken);
  const sendMsg = useServerFn(postRecruiterMessage);
  const sendEmail = useServerFn(sendTemplatedToApplicant);
  const parseFn = useServerFn(parseApplicationResume);
  const scoreFn = useServerFn(scoreApplicationAgainstRubric);
  const decideFn = useServerFn(decideSuggestion);
  const [aiOpen, setAiOpen] = useState(false);
  const [parsed, setParsed] = useState<null | { years_experience: number | null; skills: string[]; certifications: string[]; prior_titles: string[]; summary: string }>(null);
  const [score, setScore] = useState<null | { overall: number; confidence: string; dimensions: Array<{ label: string; score: number | null; evidence: string; insufficient_evidence: boolean }>; missing_must_haves: string[]; caveats: string[] }>(null);
  const [scoreSuggestionId, setScoreSuggestionId] = useState<string | null>(null);
  const doParse = useMutation({
    mutationFn: () => parseFn({ data: { application_id: app.id } }),
    onSuccess: (r) => { setParsed(r.parsed as never); toast.success("Parsed (redacted before AI saw it)"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const doScore = useMutation({
    mutationFn: () => scoreFn({ data: { application_id: app.id } }),
    onSuccess: (r) => { setScore(r.score as never); setScoreSuggestionId(r.suggestion_id); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const [iv, setIv] = useState({ scheduled_at: "", interviewer_emails: "", location: "", duration_minutes: 45, stage: "first_round" as const });
  const [openIv, setOpenIv] = useState(false);
  const [openHire, setOpenHire] = useState(false);
  const [openOffer, setOpenOffer] = useState(false);
  const [openMsg, setOpenMsg] = useState(false);
  const [msg, setMsg] = useState("");
  const [offer, setOffer] = useState({ worker_type_id: "", salary: "", start_date: "", expires_at: "" });
  const [hire, setHire] = useState({ worker_type_id: "", start_date: "" });

  const wtsQ = useQuery({
    queryKey: ["worker_types_pick"],
    queryFn: async () => {
      const { data } = await supabase.from("worker_types").select("id, name").order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    enabled: openHire || openOffer,
  });

  const set = useMutation({
    mutationFn: (status: typeof APP_STATUSES[number]) => change({ data: { application_id: app.id, status } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job_applications", requisitionId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doSched = useMutation({
    mutationFn: async () => {
      // resolve emails to user ids
      const emails = iv.interviewer_emails.split(",").map((s) => s.trim()).filter(Boolean);
      const { data: emps } = await supabase.from("employees").select("user_id, work_email, personal_email").or(emails.length ? emails.map(e => `work_email.eq.${e},personal_email.eq.${e}`).join(",") : "");
      const ids = ((emps ?? []) as Array<{ user_id: string | null }>).map(e => e.user_id).filter((u): u is string => !!u);
      if (!ids.length) throw new Error("Could not resolve interviewer emails to users");
      return sched({ data: {
        application_id: app.id, scheduled_at: new Date(iv.scheduled_at).toISOString(),
        duration_minutes: iv.duration_minutes, stage: iv.stage,
        location: iv.location || undefined, interviewer_ids: ids,
      }});
    },
    onSuccess: () => { qc.invalidateQueries(); setOpenIv(false); toast.success("Interview scheduled"); set.mutate("interview"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doHire = useMutation({
    mutationFn: () => convert({ data: { application_id: app.id, worker_type_id: hire.worker_type_id, start_date: hire.start_date } }),
    onSuccess: () => { setOpenHire(false); toast.success("Hire request created — awaiting approvals"); set.mutate("offer"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doOffer = useMutation({
    mutationFn: () => draftOffer({ data: {
      application_id: app.id,
      worker_type_id: offer.worker_type_id,
      salary: offer.salary ? Number(offer.salary) : undefined,
      start_date: offer.start_date || undefined,
      expires_at: offer.expires_at ? new Date(offer.expires_at).toISOString() : undefined,
    } }),
    onSuccess: () => { setOpenOffer(false); toast.success("Offer drafted — release it from the Offers page"); set.mutate("offer"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doPortal = useMutation({
    mutationFn: () => mintPortal({ data: { application_id: app.id, days_valid: 60 } }),
    onSuccess: (r) => { navigator.clipboard?.writeText(r.url).catch(() => {}); toast.success("Portal link copied"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doMsg = useMutation({
    mutationFn: () => sendMsg({ data: { application_id: app.id, body: msg } }),
    onSuccess: () => { setMsg(""); setOpenMsg(false); toast.success("Message posted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doReject = useMutation({
    mutationFn: async () => { await sendEmail({ data: { application_id: app.id, template_key: "rejection" } }); await change({ data: { application_id: app.id, status: "rejected" } }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job_applications", requisitionId] }); toast.success("Rejection email sent"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="font-medium">{app.applicant_name} {app.is_internal && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">Internal</span>}</h4>
          <p className="text-xs text-muted-foreground">{app.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={app.status} onValueChange={(v) => set.mutate(v as typeof APP_STATUSES[number])}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{APP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Dialog open={openIv} onOpenChange={setOpenIv}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><CalendarClock className="h-3 w-3 mr-1" />Schedule</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Schedule interview</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>When</Label><Input type="datetime-local" value={iv.scheduled_at} onChange={(e)=>setIv({...iv, scheduled_at: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Duration (min)</Label><Input type="number" value={iv.duration_minutes} onChange={(e)=>setIv({...iv, duration_minutes: parseInt(e.target.value) || 45})} /></div>
                  <div><Label>Stage</Label><Select value={iv.stage} onValueChange={(v)=>setIv({...iv, stage: v as typeof iv.stage})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone_screen">Phone screen</SelectItem>
                      <SelectItem value="first_round">First round</SelectItem>
                      <SelectItem value="panel">Panel</SelectItem>
                      <SelectItem value="final">Final</SelectItem>
                    </SelectContent>
                  </Select></div>
                </div>
                <div><Label>Location / video link</Label><Input value={iv.location} onChange={(e)=>setIv({...iv, location: e.target.value})} /></div>
                <div><Label>Interviewer work emails (comma-separated)</Label><Textarea rows={2} value={iv.interviewer_emails} onChange={(e)=>setIv({...iv, interviewer_emails: e.target.value})} /></div>
                <div className="flex justify-end"><Button onClick={()=>doSched.mutate()} disabled={!iv.scheduled_at || !iv.interviewer_emails || doSched.isPending}>{doSched.isPending ? "Scheduling…" : "Schedule"}</Button></div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={openHire} onOpenChange={setOpenHire}>
            <DialogTrigger asChild><Button size="sm"><UserPlus className="h-3 w-3 mr-1" />Make hire request</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Make hire request</DialogTitle></DialogHeader>
              <p className="text-xs text-muted-foreground mb-3">This creates a hire request that must flow through Supervisor → HR approval.</p>
              <div className="space-y-3">
                <div><Label>Worker type</Label><Select value={hire.worker_type_id} onValueChange={(v)=>setHire({...hire, worker_type_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Pick worker type…" /></SelectTrigger>
                  <SelectContent>{(wtsQ.data ?? []).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select></div>
                <div><Label>Start date</Label><Input type="date" value={hire.start_date} onChange={(e)=>setHire({...hire, start_date: e.target.value})} /></div>
                <div className="flex justify-end"><Button disabled={!hire.worker_type_id || !hire.start_date || doHire.isPending} onClick={()=>doHire.mutate()}>{doHire.isPending ? "Creating…" : "Create hire request"}</Button></div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={openOffer} onOpenChange={setOpenOffer}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><FileSignature className="h-3 w-3 mr-1" />Offer</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Draft offer</DialogTitle></DialogHeader>
              <p className="text-xs text-muted-foreground mb-3">Drafts a tokenized offer. Release it from the Offers page to email the candidate.</p>
              <div className="space-y-3">
                <div><Label>Worker type</Label><Select value={offer.worker_type_id} onValueChange={(v)=>setOffer({...offer, worker_type_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Pick worker type…" /></SelectTrigger>
                  <SelectContent>{(wtsQ.data ?? []).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Annual salary</Label><Input type="number" value={offer.salary} onChange={(e)=>setOffer({...offer, salary: e.target.value})} /></div>
                  <div><Label>Start date</Label><Input type="date" value={offer.start_date} onChange={(e)=>setOffer({...offer, start_date: e.target.value})} /></div>
                </div>
                <div><Label>Offer expires</Label><Input type="datetime-local" value={offer.expires_at} onChange={(e)=>setOffer({...offer, expires_at: e.target.value})} /></div>
                <div className="flex justify-end"><Button disabled={!offer.worker_type_id || doOffer.isPending} onClick={()=>doOffer.mutate()}>{doOffer.isPending ? "Drafting…" : "Draft offer"}</Button></div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={openMsg} onOpenChange={setOpenMsg}>
            <DialogTrigger asChild><Button size="sm" variant="ghost"><Send className="h-3 w-3 mr-1" />Message</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Message candidate</DialogTitle></DialogHeader>
              <Textarea rows={4} value={msg} onChange={(e)=>setMsg(e.target.value)} placeholder="Type your message…" />
              <div className="flex justify-end mt-3"><Button disabled={!msg.trim() || doMsg.isPending} onClick={()=>doMsg.mutate()}>Send</Button></div>
              <p className="text-xs text-muted-foreground mt-2">Message appears in the candidate's portal. Share their portal link first.</p>
            </DialogContent>
          </Dialog>

          <Button size="sm" variant="ghost" onClick={() => doPortal.mutate()} disabled={doPortal.isPending}><Link2 className="h-3 w-3 mr-1" />Portal link</Button>
          <Button size="sm" variant="ghost" onClick={() => setAiOpen((v) => !v)}><Sparkles className="h-3 w-3 mr-1" />AI review</Button>
          {app.status !== "rejected" && app.status !== "hired" && (
            <Button size="sm" variant="ghost" onClick={() => doReject.mutate()} disabled={doReject.isPending}>Reject + email</Button>
          )}
        </div>
      </div>
      {aiOpen && (
        <div className="mt-4 rounded border bg-muted/30 p-3 space-y-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> AI is advisory only. Resume text is redacted (email, phone, address, years, name-blind) before any model sees it. You are the decider — every AI suggestion is logged with your accept / override action.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => doParse.mutate()} disabled={doParse.isPending}>{doParse.isPending ? "Parsing…" : "1. Parse application"}</Button>
            <Button size="sm" variant="outline" onClick={() => doScore.mutate()} disabled={doScore.isPending}>{doScore.isPending ? "Scoring…" : "2. Score vs rubric"}</Button>
          </div>
          {parsed && (
            <div className="text-sm space-y-1">
              <p><span className="font-medium">Years experience:</span> {parsed.years_experience ?? "—"}</p>
              {!!parsed.skills.length && <p><span className="font-medium">Skills:</span> {parsed.skills.join(", ")}</p>}
              {!!parsed.certifications.length && <p><span className="font-medium">Certifications:</span> {parsed.certifications.join(", ")}</p>}
              {!!parsed.prior_titles.length && <p><span className="font-medium">Prior titles:</span> {parsed.prior_titles.join(", ")}</p>}
              {parsed.summary && <p className="text-muted-foreground italic">{parsed.summary}</p>}
            </div>
          )}
          {score && (
            <div className="text-sm space-y-2">
              <p><span className="font-medium">Overall fit:</span> {score.overall}/100 · confidence {score.confidence}</p>
              {!!score.missing_must_haves.length && <p className="text-destructive">Missing must-haves: {score.missing_must_haves.join(", ")}</p>}
              <ul className="space-y-1">
                {score.dimensions.map((d, i) => (
                  <li key={i} className="border-l-2 border-muted pl-2">
                    <span className="font-medium">{d.label}:</span> {d.insufficient_evidence ? <em>insufficient evidence</em> : `${d.score}/100`}
                    <div className="text-xs text-muted-foreground">"{d.evidence}"</div>
                  </li>
                ))}
              </ul>
              {!!score.caveats.length && <p className="text-xs text-muted-foreground">Caveats: {score.caveats.join("; ")}</p>}
              {scoreSuggestionId && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => { decideFn({ data: { suggestion_id: scoreSuggestionId, decision: "accepted" } }); toast.success("Acknowledged"); }}>Acknowledge</Button>
                  <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt("Why are you overriding the AI score?") ?? ""; if (reason.trim()) { decideFn({ data: { suggestion_id: scoreSuggestionId, decision: "rejected", reason } }); toast.success("Override logged"); } }}>Override</Button>
                </div>
              )}
            </div>
          )}
          {!parsed && !score && <p className="text-xs text-muted-foreground">Parse first, then score against the requisition's rubric (set rubric in the AI rubric tab).</p>}
        </div>
      )}
    </Card>
  );
}

function RubricEditor({ requisitionId, initial }: { requisitionId: string; initial: { required_skills?: string[]; preferred_skills?: string[]; must_have_certifications?: string[]; min_years_experience?: number | null; notes?: string } }) {
  const qc = useQueryClient();
  const save = useServerFn(saveRequisitionRubric);
  const [req, setReq] = useState((initial.required_skills ?? []).join(", "));
  const [pref, setPref] = useState((initial.preferred_skills ?? []).join(", "));
  const [certs, setCerts] = useState((initial.must_have_certifications ?? []).join(", "));
  const [years, setYears] = useState(initial.min_years_experience ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const doSave = useMutation({
    mutationFn: () => save({ data: { requisition_id: requisitionId, rubric: {
      required_skills: req.split(",").map(s=>s.trim()).filter(Boolean),
      preferred_skills: pref.split(",").map(s=>s.trim()).filter(Boolean),
      must_have_certifications: certs.split(",").map(s=>s.trim()).filter(Boolean),
      min_years_experience: years === "" ? null : Number(years),
      notes: notes || undefined,
    } } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job_requisition", requisitionId] }); toast.success("Rubric saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-medium">AI scoring rubric</h3>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><ShieldAlert className="h-3 w-3" /> The rubric defines what AI may evaluate against. Keep entries job-related and bona fide. Never list demographic or "culture fit" criteria.</p>
      </div>
      <div><Label>Required skills (comma-separated)</Label><Input value={req} onChange={(e)=>setReq(e.target.value)} placeholder="e.g. CDL Class B, GIS, Crew leadership" /></div>
      <div><Label>Preferred skills</Label><Input value={pref} onChange={(e)=>setPref(e.target.value)} /></div>
      <div><Label>Must-have certifications</Label><Input value={certs} onChange={(e)=>setCerts(e.target.value)} placeholder="e.g. TCOLE Basic Peace Officer" /></div>
      <div><Label>Minimum years of relevant experience</Label><Input type="number" value={years as never} onChange={(e)=>setYears(e.target.value === "" ? "" : Number(e.target.value))} /></div>
      <div><Label>Notes for the AI scorer</Label><Textarea rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="What 'looks like' a strong applicant for this role?" /></div>
      <div className="flex justify-end"><Button onClick={()=>doSave.mutate()} disabled={doSave.isPending}>{doSave.isPending ? "Saving…" : "Save rubric"}</Button></div>
    </Card>
  );
}