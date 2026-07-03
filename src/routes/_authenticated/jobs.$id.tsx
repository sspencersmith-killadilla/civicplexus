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
import { ArrowLeft, ExternalLink, CalendarClock, UserPlus, FileSignature, Send, Link2, Sparkles, FileText, Check, Pencil, X, Upload, FileDown, Trash2, Video } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { submitRequisitionForApproval, postRequisition, closeRequisition, transitionApplicationStatus, scheduleInterview, convertApplicationToHire, getJobRequisitionForStaff, getRequisitionApprovalForStaff, listWorkerTypesForHiring, listOneWayInterviewKitsForHiring, resolveInterviewersByEmail } from "@/lib/jobs.functions";
import { createOffer } from "@/lib/offers.functions";
import { mintCandidatePortalToken, postRecruiterMessage } from "@/lib/candidate-portal.functions";
import { sendTemplatedToApplicant } from "@/lib/email-templates.functions";
import { screenApplication, recordScreenDecision } from "@/lib/applicant-ai.functions";
import { createInterviewInvitation } from "@/lib/interview-invitations.functions";
import { listApplicationsForRequisition } from "@/lib/applications.functions";
import { listSupplementalQuestions, saveSupplementalQuestions } from "@/lib/application-templates.functions";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/jobs/$id")({ component: JobDetail });

const APP_STATUSES = ["new","screening","interview","offer","hired","rejected","withdrawn"] as const;

function getErrorMessage(error: unknown, fallback = "Failed") {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code]
      .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
      .map(String);
    if (parts.length) return parts.join(" — ");
    try {
      return JSON.stringify(o);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function JobDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const submitForApproval = useServerFn(submitRequisitionForApproval);
  const post = useServerFn(postRequisition);
  const close = useServerFn(closeRequisition);
  const getReq = useServerFn(getJobRequisitionForStaff);
  const getApproval = useServerFn(getRequisitionApprovalForStaff);
  const screen = useServerFn(screenApplication);
  const decide = useServerFn(recordScreenDecision);
  const listApps = useServerFn(listApplicationsForRequisition);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  const reqQ = useQuery({
    queryKey: ["job_requisition", id],
    queryFn: () => getReq({ data: { id } }) as Promise<{ id: string; title: string; status: string; slug: string | null; internal_only: boolean; department: string | null; description: string | null; summary: string | null; brochure_url: string | null }>,
  });

  const appsQ = useQuery({
    queryKey: ["job_applications", id],
    queryFn: () => listApps({ data: { requisition_id: id } }),
  });

  const chainQ = useQuery({
    queryKey: ["approval_chain", id],
    queryFn: () => getApproval({ data: { requisition_id: id } }),
  });

  const sub = useMutation({ mutationFn: () => submitForApproval({ data: { requisition_id: id } }),
    onSuccess: () => { qc.invalidateQueries(); toast.success("Submitted for approval"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const pst = useMutation({ mutationFn: () => post({ data: { requisition_id: id } }),
    onSuccess: () => { qc.invalidateQueries(); toast.success("Posted!"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const cls = useMutation({ mutationFn: () => close({ data: { requisition_id: id } }),
    onSuccess: () => { qc.invalidateQueries(); toast.success("Closed"); },
  });

  if (reqQ.isLoading || !reqQ.data) return <AppShell title="Requisition"><p>Loading…</p></AppShell>;
  const r = reqQ.data;

  const apps = appsQ.data ?? [];
  const allSelected = apps.length > 0 && apps.every(a => selected.has(a.id));
  const toggleOne = (appId: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(appId)) next.delete(appId); else next.add(appId);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(apps.map(a => a.id)));

  const runBulk = async (label: string, fn: (appId: string) => Promise<unknown>) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkRunning(true);
    let ok = 0;
    const failures: string[] = [];
    for (const appId of ids) {
      try { await fn(appId); ok++; }
      catch (e) { failures.push(getErrorMessage(e)); }
    }
    setBulkRunning(false);
    qc.invalidateQueries();
    if (failures.length) {
      toast.error(`${label}: ${ok} done, ${failures.length} failed`, { description: failures[0]?.slice(0, 200) });
    } else {
      toast.success(`${label}: ${ok} done`);
    }
  };

  const bulkGenerate = () => runBulk("AI screening queued", (appId) => screen({ data: { application_id: appId } }));
  const bulkDecideQueued = async (decision: "accepted" | "rejected") => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkRunning(true);
    const { data: pending } = await supabase
      .from("ai_suggestions" as never)
      .select("id, application_id")
      .in("application_id", ids)
      .eq("kind", "application_screen")
      .is("decision", null);
    const rows = (pending ?? []) as Array<{ id: string; application_id: string }>;
    let ok = 0, fail = 0;
    for (const row of rows) {
      try { await decide({ data: { suggestion_id: row.id, decision } }); ok++; } catch { fail++; }
    }
    setBulkRunning(false);
    qc.invalidateQueries();
    toast[fail ? "warning" : "success"](`${decision === "accepted" ? "Accepted" : "Dismissed"} ${ok} queued${fail ? `, ${fail} failed` : ""}`);
  };

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
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="supplementals">Supplemental questions</TabsTrigger>
        </TabsList>
        <TabsContent value="apps" className="space-y-3">
          {apps.length > 0 && (
            <Card className="p-3 flex items-center justify-between flex-wrap gap-3 bg-muted/30">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                {selected.size > 0 ? `${selected.size} selected` : "Select all applicants"}
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="default" disabled={!selected.size || bulkRunning} onClick={bulkGenerate}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  {bulkRunning ? "Working…" : `Generate AI screening (${selected.size})`}
                </Button>
                <Button size="sm" variant="outline" disabled={!selected.size || bulkRunning} onClick={() => bulkDecideQueued("accepted")}>
                  <Check className="h-3 w-3 mr-1" />Accept queued
                </Button>
                <Button size="sm" variant="ghost" disabled={!selected.size || bulkRunning} onClick={() => bulkDecideQueued("rejected")}>
                  <X className="h-3 w-3 mr-1" />Dismiss queued
                </Button>
                {selected.size > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                )}
              </div>
            </Card>
          )}
          {selected.size > 0 && (
            <p className="text-xs text-muted-foreground px-1">
              Bulk AI runs draft a suggestion per applicant and queue it for your accept / edit / dismiss review below. Nothing is sent to candidates automatically.
            </p>
          )}
          {apps.map((a) => (
            <ApplicantRow key={a.id} app={a} requisitionId={id} selected={selected.has(a.id)} onToggle={() => toggleOne(a.id)} />
          ))}
          {apps.length === 0 && <p className="text-sm text-muted-foreground">No applications yet.</p>}
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
        <TabsContent value="details">
          <Card className="p-4 space-y-3">
            {r.summary && <p className="text-sm">{r.summary}</p>}
            {r.description && <pre className="text-sm whitespace-pre-wrap font-sans">{r.description}</pre>}
          </Card>
          <BrochurePanel requisitionId={r.id} currentUrl={r.brochure_url} />
        </TabsContent>
        <TabsContent value="supplementals">
          <SupplementalQuestionsEditor requisitionId={id} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ApplicantRow({ app, requisitionId, selected, onToggle }: { app: { id: string; applicant_name: string; email: string; status: string; is_internal: boolean; rating: number | null }; requisitionId: string; selected: boolean; onToggle: () => void }) {
  const qc = useQueryClient();
  const change = useServerFn(transitionApplicationStatus);
  const sched = useServerFn(scheduleInterview);
  const convert = useServerFn(convertApplicationToHire);
  const listWorkerTypes = useServerFn(listWorkerTypesForHiring);
  const listKits = useServerFn(listOneWayInterviewKitsForHiring);
  const resolveInterviewers = useServerFn(resolveInterviewersByEmail);
  const draftOffer = useServerFn(createOffer);
  const mintPortal = useServerFn(mintCandidatePortalToken);
  const sendMsg = useServerFn(postRecruiterMessage);
  const sendEmail = useServerFn(sendTemplatedToApplicant);
  const mintAsync = useServerFn(createInterviewInvitation);
  const [iv, setIv] = useState({ scheduled_at: "", interviewer_emails: "", location: "", duration_minutes: 45, stage: "first_round" as const, use_inapp_room: true });
  const [openIv, setOpenIv] = useState(false);
  const [openAsync, setOpenAsync] = useState(false);
  const [asyncForm, setAsyncForm] = useState({ kit_id: "", days_valid: 14, delivery: "copy" as "copy" | "email" });
  const [openHire, setOpenHire] = useState(false);
  const [openOffer, setOpenOffer] = useState(false);
  const [openMsg, setOpenMsg] = useState(false);
  const [msg, setMsg] = useState("");
  const [offer, setOffer] = useState({ worker_type_id: "", salary: "", start_date: "", expires_at: "" });
  const [hire, setHire] = useState({ worker_type_id: "", start_date: "" });

  const wtsQ = useQuery({
    queryKey: ["worker_types_pick"],
    queryFn: () => listWorkerTypes({ data: undefined as never }),
    enabled: openHire || openOffer,
  });

  const kitsQ = useQuery({
    queryKey: ["interview_kits_oneway_pick"],
    queryFn: () => listKits({ data: undefined as never }),
    enabled: openAsync,
  });

  const doAsync = useMutation({
    mutationFn: () => mintAsync({ data: { application_id: app.id, kit_id: asyncForm.kit_id, days_valid: asyncForm.days_valid } }),
    onSuccess: async (r: { url: string; expires_at: string }) => {
      await navigator.clipboard?.writeText(r.url).catch(() => {});
      if (asyncForm.delivery === "email") {
        toast.success("Link copied — sending email to candidate…");
        sendEmail({ data: { application_id: app.id, template_key: "async_interview_invitation", extra_vars: { interview_url: r.url, expires_at: new Date(r.expires_at).toLocaleDateString() } } })
          .then(() => toast.success("Email sent"))
          .catch(() => toast.error("Email failed — share the copied link manually"));
      } else {
        toast.success("Invitation link copied to clipboard — share it with the candidate");
      }
      setOpenAsync(false);
      set.mutate("interview");
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const set = useMutation({
    mutationFn: (status: typeof APP_STATUSES[number]) => change({ data: { application_id: app.id, status } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job_applications", requisitionId] }); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const doSched = useMutation({
    mutationFn: async () => {
      // resolve emails to user ids
      const emails = iv.interviewer_emails.split(",").map((s) => s.trim()).filter(Boolean);
      const ids = await resolveInterviewers({ data: { emails } });
      if (!ids.length) throw new Error("Could not resolve interviewer emails to users");
      return sched({ data: {
        application_id: app.id, scheduled_at: new Date(iv.scheduled_at).toISOString(),
        duration_minutes: iv.duration_minutes, stage: iv.stage,
        location: iv.use_inapp_room ? undefined : (iv.location || undefined),
        interviewer_ids: ids, use_inapp_room: iv.use_inapp_room,
      }});
    },
    onSuccess: () => { qc.invalidateQueries(); setOpenIv(false); toast.success("Interview scheduled"); set.mutate("interview"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const doHire = useMutation({
    mutationFn: () => convert({ data: { application_id: app.id, worker_type_id: hire.worker_type_id, start_date: hire.start_date } }),
    onSuccess: () => { setOpenHire(false); toast.success("Hire request created — awaiting approvals"); set.mutate("offer"); },
    onError: (e) => toast.error(getErrorMessage(e)),
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
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const doPortal = useMutation({
    mutationFn: () => mintPortal({ data: { application_id: app.id, days_valid: 60 } }),
    onSuccess: (r) => { navigator.clipboard?.writeText(r.url).catch(() => {}); toast.success("Portal link copied"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const doMsg = useMutation({
    mutationFn: () => sendMsg({ data: { application_id: app.id, body: msg } }),
    onSuccess: () => { setMsg(""); setOpenMsg(false); toast.success("Message posted"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const doReject = useMutation({
    mutationFn: async () => { await sendEmail({ data: { application_id: app.id, template_key: "rejection" } }); await change({ data: { application_id: app.id, status: "rejected" } }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job_applications", requisitionId] }); toast.success("Rejection email sent"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-1" aria-label={`Select ${app.applicant_name}`} />
          <div>
            <h4 className="font-medium">{app.applicant_name} {app.is_internal && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">Internal</span>}</h4>
            <p className="text-xs text-muted-foreground">{app.email}</p>
          </div>
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
                <div className="rounded border p-3 bg-muted/30 space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={iv.use_inapp_room} onChange={(e)=>setIv({...iv, use_inapp_room: e.target.checked})} />
                    Use built-in video room (LiveKit)
                  </label>
                  <p className="text-xs text-muted-foreground">The room URL is generated automatically after scheduling and emailed to the candidate. Panelists can join from the Interviews page.</p>
                </div>
                {!iv.use_inapp_room && (
                  <div><Label>Location / video link</Label><Input placeholder="Zoom / Meet / Teams URL or physical address" value={iv.location} onChange={(e)=>setIv({...iv, location: e.target.value})} /></div>
                )}
                <div><Label>Interviewer work emails (comma-separated)</Label><Textarea rows={2} value={iv.interviewer_emails} onChange={(e)=>setIv({...iv, interviewer_emails: e.target.value})} /></div>
                <div className="flex justify-end"><Button onClick={()=>doSched.mutate()} disabled={!iv.scheduled_at || !iv.interviewer_emails || doSched.isPending}>{doSched.isPending ? "Scheduling…" : "Schedule"}</Button></div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={openAsync} onOpenChange={setOpenAsync}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Video className="h-3 w-3 mr-1" />Async invite</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Send async interview invitation</DialogTitle></DialogHeader>
              <p className="text-xs text-muted-foreground mb-3">Mints a one-time candidate link to a one-way interview kit. Candidate records their answers; two takes allowed but Take 2 becomes final.</p>
              <div className="space-y-3">
                <div>
                  <Label>Interview kit</Label>
                  <Select value={asyncForm.kit_id} onValueChange={(v)=>setAsyncForm({...asyncForm, kit_id: v})}>
                    <SelectTrigger><SelectValue placeholder={(kitsQ.data ?? []).length ? "Pick a one-way kit…" : "No active one-way kits — create one first"} /></SelectTrigger>
                    <SelectContent>{(kitsQ.data ?? []).map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {!(kitsQ.data ?? []).length && !kitsQ.isLoading && (
                    <p className="text-xs text-muted-foreground mt-1">Build kits in <Link to="/interview-kits" className="underline">Interview Kits</Link>.</p>
                  )}
                </div>
                <div>
                  <Label>Link valid for (days)</Label>
                  <Input type="number" min={1} max={60} value={asyncForm.days_valid} onChange={(e)=>setAsyncForm({...asyncForm, days_valid: parseInt(e.target.value) || 14})} />
                </div>
                <div>
                  <Label>Delivery</Label>
                  <Select value={asyncForm.delivery} onValueChange={(v)=>setAsyncForm({...asyncForm, delivery: v as "copy" | "email"})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="copy">Copy link to clipboard (share manually)</SelectItem>
                      <SelectItem value="email">Copy link and email candidate</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Email requires a configured email provider; copy-link always works.</p>
                </div>
                <div className="flex justify-end">
                  <Button disabled={!asyncForm.kit_id || doAsync.isPending} onClick={()=>doAsync.mutate()}>{doAsync.isPending ? "Working…" : asyncForm.delivery === "email" ? "Send invitation" : "Generate & copy link"}</Button>
                </div>
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
          {app.status !== "rejected" && app.status !== "hired" && (
            <Button size="sm" variant="ghost" onClick={() => doReject.mutate()} disabled={doReject.isPending}>Reject + email</Button>
          )}
        </div>
      </div>
      <AiScreeningPanel applicationId={app.id} requisitionId={requisitionId} />
    </Card>
  );
}

type ScreenSuggestion = {
  id: string;
  payload: {
    fit_score: number;
    strengths: string[];
    gaps: string[];
    suggested_status: "advance" | "interview" | "reject" | "hold";
    suggested_rejection_reason?: string | null;
    rationale: string;
  };
  model: string | null;
  decision: "accepted" | "edited" | "rejected" | null;
  decision_diff: Record<string, { from: unknown; to: unknown }> | null;
  decided_at: string | null;
  created_at: string;
};

function AiScreeningPanel({ applicationId, requisitionId }: { applicationId: string; requisitionId: string }) {
  const qc = useQueryClient();
  const screen = useServerFn(screenApplication);
  const decide = useServerFn(recordScreenDecision);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState<ScreenSuggestion["payload"] | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);

  const suggestionQ = useQuery({
    queryKey: ["ai_screen", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_suggestions" as never)
        .select("id, payload, model, decision, decision_diff, decided_at, created_at")
        .eq("application_id", applicationId)
        .eq("kind", "application_screen")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ScreenSuggestion | null;
    },
  });

  const parseQ = useQuery({
    queryKey: ["ai_parse", applicationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("application_ai_parse" as never)
        .select("parsed, model, created_at")
        .eq("application_id", applicationId)
        .maybeSingle();
      return data as { parsed: { resume_text?: string; pages?: number; truncated?: boolean }; model: string | null; created_at: string } | null;
    },
    enabled: resumeOpen,
  });

  const generate = useMutation({
    mutationFn: () => screen({ data: { application_id: applicationId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai_screen", applicationId] }); toast.success("AI screening drafted — review and decide"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const accept = useMutation({
    mutationFn: () => decide({ data: { suggestion_id: suggestionQ.data!.id, decision: "accepted" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai_screen", applicationId] }); qc.invalidateQueries({ queryKey: ["job_applications", requisitionId] }); toast.success("Accepted"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: () => decide({ data: { suggestion_id: suggestionQ.data!.id, decision: "rejected" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai_screen", applicationId] }); toast.success("Suggestion dismissed"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const saveEdit = useMutation({
    mutationFn: () => decide({ data: { suggestion_id: suggestionQ.data!.id, decision: "edited", edited_payload: edited! } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai_screen", applicationId] }); setEditing(false); toast.success("Saved your edits"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (suggestionQ.isLoading) return null;
  const s = suggestionQ.data;

  const startEdit = () => { if (s) { setEdited(s.payload); setEditing(true); } };

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI screening</span>
          <span className="text-xs text-muted-foreground">Suggestions only — a human always decides.</span>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={resumeOpen} onOpenChange={setResumeOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost"><FileText className="h-3 w-3 mr-1" />Parsed resume</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Parsed resume text</DialogTitle></DialogHeader>
              {parseQ.data?.parsed?.resume_text ? (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    Extractor: {parseQ.data.model ?? "?"} · {parseQ.data.parsed.pages ?? 0} pages
                    {parseQ.data.parsed.truncated ? " · truncated" : ""}
                  </p>
                  <pre className="text-xs whitespace-pre-wrap font-sans max-h-[60vh] overflow-auto border rounded p-3 bg-muted/30">{parseQ.data.parsed.resume_text}</pre>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No parsed resume text on file (the candidate may not have uploaded a PDF).</p>
              )}
            </DialogContent>
          </Dialog>
          <Button size="sm" variant={s ? "ghost" : "outline"} onClick={() => generate.mutate()} disabled={generate.isPending}>
            <Sparkles className="h-3 w-3 mr-1" />
            {generate.isPending ? "Generating…" : s ? "Re-run" : "Generate AI screening"}
          </Button>
        </div>
      </div>

      {!s && !generate.isPending && (
        <p className="text-xs text-muted-foreground mt-3">No AI screening yet. Click Generate to draft fit score, strengths, gaps, and a suggested next step for your review.</p>
      )}

      {s && !editing && (
        <div className="mt-3 space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold">{s.payload.fit_score}</span>
                <span className="text-xs text-muted-foreground">/ 100 fit</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary capitalize">Suggested: {s.payload.suggested_status}</span>
              {s.decision && (
                <span className={`text-xs px-2 py-0.5 rounded ${s.decision === "accepted" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : s.decision === "edited" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>
                  {s.decision === "accepted" ? "Accepted" : s.decision === "edited" ? "Edited" : "Dismissed"}
                  {s.decided_at ? ` · ${formatDistanceToNow(new Date(s.decided_at), { addSuffix: true })}` : ""}
                </span>
              )}
            </div>
            {!s.decision && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="default" onClick={() => accept.mutate()} disabled={accept.isPending}><Check className="h-3 w-3 mr-1" />Accept</Button>
                <Button size="sm" variant="outline" onClick={startEdit}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => reject.mutate()} disabled={reject.isPending}><X className="h-3 w-3 mr-1" />Dismiss</Button>
              </div>
            )}
            {s.decision && (
              <Button size="sm" variant="ghost" onClick={startEdit}><Pencil className="h-3 w-3 mr-1" />Revise</Button>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Strengths</p>
              <ul className="list-disc pl-5 space-y-0.5">{s.payload.strengths.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Gaps</p>
              <ul className="list-disc pl-5 space-y-0.5">{s.payload.gaps.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          </div>
          <p className="text-sm"><span className="text-xs font-medium uppercase text-muted-foreground">Rationale</span><br />{s.payload.rationale}</p>
          {s.payload.suggested_status === "reject" && s.payload.suggested_rejection_reason && (
            <p className="text-xs text-muted-foreground"><span className="font-medium">Suggested reason:</span> {s.payload.suggested_rejection_reason}</p>
          )}
          <p className="text-[10px] text-muted-foreground">Model: {s.model ?? "?"} · drafted {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}{s.decision_diff && Object.keys(s.decision_diff).length ? ` · reviewer edited ${Object.keys(s.decision_diff).join(", ")}` : ""}</p>
        </div>
      )}

      {s && editing && edited && (
        <div className="mt-3 space-y-3 rounded-lg border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Edit the AI's draft before recording your decision. Your changes are logged alongside the original.</p>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fit score (0-100)</Label>
              <Input type="number" min={0} max={100} value={edited.fit_score} onChange={(e) => setEdited({ ...edited, fit_score: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} />
            </div>
            <div>
              <Label className="text-xs">Suggested next step</Label>
              <Select value={edited.suggested_status} onValueChange={(v) => setEdited({ ...edited, suggested_status: v as ScreenSuggestion["payload"]["suggested_status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Advance to screening</SelectItem>
                  <SelectItem value="interview">Schedule interview</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="reject">Reject</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Strengths (one per line)</Label>
            <Textarea rows={3} value={edited.strengths.join("\n")} onChange={(e) => setEdited({ ...edited, strengths: e.target.value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 8) })} />
          </div>
          <div>
            <Label className="text-xs">Gaps (one per line)</Label>
            <Textarea rows={3} value={edited.gaps.join("\n")} onChange={(e) => setEdited({ ...edited, gaps: e.target.value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 8) })} />
          </div>
          <div>
            <Label className="text-xs">Rationale</Label>
            <Textarea rows={4} value={edited.rationale} onChange={(e) => setEdited({ ...edited, rationale: e.target.value.slice(0, 2000) })} />
          </div>
          {edited.suggested_status === "reject" && (
            <div>
              <Label className="text-xs">Suggested rejection reason</Label>
              <Input value={edited.suggested_rejection_reason ?? ""} onChange={(e) => setEdited({ ...edited, suggested_rejection_reason: e.target.value.slice(0, 500) })} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEdited(null); }}>Cancel</Button>
            <Button size="sm" onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>{saveEdit.isPending ? "Saving…" : "Save as my decision"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
function BrochurePanel({ requisitionId, currentUrl }: { requisitionId: string; currentUrl: string | null }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["req_detail", requisitionId] });

  async function loadSigned() {
    if (!currentUrl) return;
    const { data } = await supabase.storage.from("careers-brochures").createSignedUrl(currentUrl, 3600);
    setSigned(data?.signedUrl ?? null);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { toast.error("Please upload a PDF file."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("PDF must be 10MB or smaller."); return; }
    setBusy(true);
    try {
      const path = `req-${requisitionId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("careers-brochures").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase.from("job_requisitions").update({ brochure_url: path } as never).eq("id", requisitionId);
      if (updErr) throw updErr;
      if (currentUrl) await supabase.storage.from("careers-brochures").remove([currentUrl]);
      toast.success("Brochure uploaded");
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Upload failed"));
    } finally { setBusy(false); e.target.value = ""; }
  }

  async function onRemove() {
    if (!currentUrl) return;
    setBusy(true);
    try {
      await supabase.storage.from("careers-brochures").remove([currentUrl]);
      const { error } = await supabase.from("job_requisitions").update({ brochure_url: null } as never).eq("id", requisitionId);
      if (error) throw error;
      toast.success("Brochure removed");
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Remove failed"));
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-4 mt-4 space-y-3">
      <div>
        <h3 className="font-medium">Position brochure (PDF)</h3>
        <p className="text-xs text-muted-foreground">Optional. Shown on the public job posting as a download link.</p>
      </div>
      {currentUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadSigned}>
            <FileDown className="h-4 w-4 mr-1" /> {signed ? "Refresh link" : "Preview"}
          </Button>
          {signed && (
            <a href={signed} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">Open preview</a>
          )}
          <span className="text-xs text-muted-foreground truncate max-w-[280px]">{currentUrl}</span>
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
            <Trash2 className="h-4 w-4 mr-1" /> Remove
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No brochure uploaded.</p>
      )}
      <div>
        <Label htmlFor="brochure-upload" className="inline-flex items-center gap-2 cursor-pointer">
          <span className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" /> {currentUrl ? "Replace brochure" : "Upload brochure"}
          </span>
        </Label>
        <input id="brochure-upload" type="file" accept="application/pdf" className="hidden" disabled={busy} onChange={onUpload} />
      </div>
    </Card>
  );
}

type Draft = {
  id: string | null;
  key: string;
  label: string;
  type: "text" | "textarea" | "email" | "tel" | "date" | "number" | "select" | "boolean";
  options: { value: string; label: string }[] | null;
  required: boolean;
};

function SupplementalQuestionsEditor({ requisitionId }: { requisitionId: string }) {
  const listFn = useServerFn(listSupplementalQuestions);
  const saveFn = useServerFn(saveSupplementalQuestions);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["supplementals", requisitionId],
    queryFn: () => listFn({ data: { requisition_id: requisitionId } }),
  });
  const [drafts, setDrafts] = useState<Draft[] | null>(null);

  const rows = drafts ?? (q.data ?? []).map((r: any) => ({
    id: r.id, key: r.key, label: r.label, type: r.type,
    options: r.options ?? null, required: !!r.required,
  })) as Draft[];

  function update(idx: number, patch: Partial<Draft>) {
    const next = rows.map((r, i) => i === idx ? { ...r, ...patch } : r);
    setDrafts(next);
  }
  function add() {
    setDrafts([...rows, { id: null, key: `q${rows.length + 1}`, label: "New question", type: "text", options: null, required: false }]);
  }
  function remove(idx: number) {
    setDrafts(rows.filter((_, i) => i !== idx));
  }

  const save = useMutation({
    mutationFn: () => saveFn({ data: {
      requisition_id: requisitionId,
      questions: rows.map((r, idx) => ({
        id: r.id ?? null, key: r.key, label: r.label, type: r.type,
        options: r.type === "select" ? (r.options ?? []) : null,
        required: r.required, sort_order: idx,
      })),
    } }),
    onSuccess: () => {
      toast.success("Supplemental questions saved");
      setDrafts(null);
      qc.invalidateQueries({ queryKey: ["supplementals", requisitionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Supplemental questions</h3>
          <p className="text-xs text-muted-foreground">Extra questions shown after the base application. Required ones block submission until answered.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={add}>Add question</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || drafts === null}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {q.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {rows.length === 0 && !q.isLoading && (
        <p className="text-xs text-muted-foreground">No supplemental questions yet.</p>
      )}
      <ul className="space-y-3">
        {rows.map((r, idx) => (
          <li key={r.id ?? `new-${idx}`} className="border rounded p-3 space-y-2">
            <div className="grid md:grid-cols-[1fr_1fr_160px_auto] gap-2 items-end">
              <div>
                <Label className="text-xs">Key</Label>
                <Input value={r.key} onChange={(e) => update(idx, { key: e.target.value.replace(/[^a-z0-9_]/gi, "_") })} />
              </div>
              <div>
                <Label className="text-xs">Label</Label>
                <Input value={r.label} onChange={(e) => update(idx, { label: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={r.type} onValueChange={(v) => update(idx, { type: v as Draft["type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["text","textarea","email","tel","date","number","select","boolean"] as const).map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch checked={r.required} onCheckedChange={(v) => update(idx, { required: v })} />
                <Label className="text-xs">Required</Label>
              </div>
            </div>
            {r.type === "select" && (
              <div>
                <Label className="text-xs">Options (one per line, format: value|label)</Label>
                <Textarea
                  rows={3}
                  value={(r.options ?? []).map((o) => `${o.value}|${o.label}`).join("\n")}
                  onChange={(e) => update(idx, {
                    options: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
                      const [value, ...rest] = line.split("|");
                      const label = rest.join("|").trim() || value;
                      return { value: value.trim(), label };
                    }),
                  })}
                />
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => remove(idx)}>
                <Trash2 className="h-3 w-3 mr-1" /> Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
