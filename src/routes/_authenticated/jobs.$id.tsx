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
import { ArrowLeft, ExternalLink, CalendarClock, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { submitRequisitionForApproval, postRequisition, closeRequisition, transitionApplicationStatus, scheduleInterview, convertApplicationToHire } from "@/lib/jobs.functions";

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
      return data as never as { id: string; title: string; status: string; slug: string | null; internal_only: boolean; department: string | null; description: string | null; summary: string | null };
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
  const [iv, setIv] = useState({ scheduled_at: "", interviewer_emails: "", location: "", duration_minutes: 45, stage: "first_round" as const });
  const [openIv, setOpenIv] = useState(false);
  const [openHire, setOpenHire] = useState(false);
  const [hire, setHire] = useState({ worker_type_id: "", start_date: "" });

  const wtsQ = useQuery({
    queryKey: ["worker_types_pick"],
    queryFn: async () => {
      const { data } = await supabase.from("worker_types").select("id, name").order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    enabled: openHire,
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
        </div>
      </div>
    </Card>
  );
}