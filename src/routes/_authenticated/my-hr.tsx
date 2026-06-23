import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { completeTraining } from "@/lib/training.functions";
import { toast } from "sonner";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, GraduationCap, ScrollText, ShieldAlert, Plus, FileText } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/my-hr")({ component: MyHR });

function MyHR() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const completeFn = useServerFn(completeTraining);
  const [completeFor, setCompleteFor] = useState<{ id: string; name: string; employee_id: string } | null>(null);
  const [completeForm, setCompleteForm] = useState<{ score: string; notes: string; file: File | null }>({ score: "", notes: "", file: null });
  const complete = useMutation({
    mutationFn: async () => {
      if (!completeFor) throw new Error("No assignment");
      let evidence_path: string | undefined;
      if (completeForm.file) {
        const ext = completeForm.file.name.split(".").pop() ?? "bin";
        const path = `${completeFor.employee_id}/${completeFor.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("training-evidence").upload(path, completeForm.file, { upsert: false });
        if (upErr) throw new Error(upErr.message);
        evidence_path = path;
      }
      const score = completeForm.score === "" ? undefined : Number(completeForm.score);
      return completeFn({ data: { training_id: completeFor.id, score, notes: completeForm.notes || undefined, evidence_path } });
    },
    onSuccess: (res: { status: string }) => {
      toast.success(res.status === "failed" ? "Recorded — score below passing" : "Marked complete");
      setCompleteFor(null); setCompleteForm({ score: "", notes: "", file: null });
      qc.invalidateQueries({ queryKey: ["my-training"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const empQ = useQuery({
    queryKey: ["me-employee", me?.user?.id],
    enabled: !!me?.user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("employees")
        .select("id, first_name, last_name, job_title, department, start_date, status")
        .eq("user_id", me!.user!.id).maybeSingle();
      return data;
    },
  });

  const balancesQ = useQuery({
    queryKey: ["my-balances", empQ.data?.id],
    enabled: !!empQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("leave_balances")
        .select("balance_hours, pending_hours, accrued_hours, used_hours, leave_plans(name, code, paid)")
        .eq("employee_id", empQ.data!.id);
      return (data ?? []) as Array<{ balance_hours: number; pending_hours: number; accrued_hours: number; used_hours: number; leave_plans: { name: string; code: string; paid: boolean } }>;
    },
  });

  const reqsQ = useQuery({
    queryKey: ["my-leave-requests", empQ.data?.id],
    enabled: !!empQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("leave_requests")
        .select("id, start_date, end_date, total_hours, status, leave_plans(name)")
        .eq("employee_id", empQ.data!.id)
        .order("start_date", { ascending: false }).limit(10);
      return (data ?? []) as Array<{ id: string; start_date: string; end_date: string; total_hours: number; status: string; leave_plans: { name: string } }>;
    },
  });

  const trainingQ = useQuery({
    queryKey: ["my-training", empQ.data?.id],
    enabled: !!empQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("employee_training")
        .select("id, status, due_date, courses(name)")
        .eq("employee_id", empQ.data!.id).neq("status", "complete").order("due_date", { ascending: true }).limit(5);
      return (data ?? []) as Array<{ id: string; status: string; due_date: string | null; courses: { name: string } }>;
    },
  });

  const acksQ = useQuery({
    queryKey: ["my-acks", me?.user?.id],
    enabled: !!me?.user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("policies")
        .select("id, title")
        .order("updated_at", { ascending: false }).limit(5);
      return (data ?? []) as Array<{ id: string; title: string }>;
    },
  });

  return (
    <AppShell title="My HR">
      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="text-lg font-medium">Welcome{empQ.data ? `, ${empQ.data.first_name}` : ""}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {empQ.data ? `${empQ.data.job_title ?? "—"} · ${empQ.data.department ?? "—"}` : "Loading your profile…"}
          </p>
        </Card>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Leave balances</h3>
            <Link to="/leave"><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Request leave</Button></Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(balancesQ.data ?? []).map((b, i) => (
              <Card key={i} className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{b.leave_plans.name}</div>
                <div className="text-2xl font-semibold mt-1">{Number(b.balance_hours).toFixed(1)}h</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {Number(b.pending_hours) > 0 && <span>{Number(b.pending_hours).toFixed(1)}h pending · </span>}
                  {Number(b.used_hours).toFixed(1)}h used YTD
                </div>
              </Card>
            ))}
            {(balancesQ.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No leave plans yet. Ask HR to enroll you.</p>
            )}
          </div>
        </section>

        <section>
          <h3 className="font-medium mb-3 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Recent leave requests</h3>
          <Card className="divide-y">
            {(reqsQ.data ?? []).map((r) => (
              <Link key={r.id} to="/leave/$id" params={{ id: r.id }} className="block p-3 hover:bg-muted/40">
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="font-medium">{r.leave_plans.name}</span>
                    <span className="text-muted-foreground ml-2">{r.start_date} → {r.end_date} · {Number(r.total_hours).toFixed(1)}h</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted">{r.status}</span>
                </div>
              </Link>
            ))}
            {(reqsQ.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">No requests yet.</p>}
          </Card>
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h3 className="font-medium mb-3 flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" /> Training due</h3>
            <Card className="divide-y">
              {(trainingQ.data ?? []).map((t) => {
                const overdue = t.due_date && new Date(t.due_date) < new Date();
                return (
                  <div key={t.id} className="p-3 text-sm flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate">{t.courses.name}</p>
                      <p className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                        {t.due_date ? `Due ${t.due_date}` : "No due date"} · {t.status}{overdue ? " · overdue" : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { setCompleteFor({ id: t.id, name: t.courses.name, employee_id: empQ.data!.id }); setCompleteForm({ score: "", notes: "", file: null }); }}>
                      Mark complete
                    </Button>
                  </div>
                );
              })}
              {(trainingQ.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">All current.</p>}
            </Card>
          </section>
          <section>
            <h3 className="font-medium mb-3 flex items-center gap-2"><ScrollText className="h-4 w-4 text-primary" /> Policies to review</h3>
            <Card className="divide-y">
              {(acksQ.data ?? []).map((p) => (
                <Link key={p.id} to="/policies/$id" params={{ id: p.id }} className="block p-3 text-sm hover:bg-muted/40">{p.title}</Link>
              ))}
              {(acksQ.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">No policies.</p>}
            </Card>
          </section>
        </div>

        <section>
          <h3 className="font-medium mb-3 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /> Quick links</h3>
          <div className="flex flex-wrap gap-2">
            <Link to="/grievances"><Button size="sm" variant="outline">File a grievance</Button></Link>
            <Link to="/policies"><Button size="sm" variant="outline">All policies</Button></Link>
            <Link to="/documents"><Button size="sm" variant="outline">My documents</Button></Link>
            <Link to="/internal-careers"><Button size="sm" variant="outline">Internal jobs</Button></Link>
            {empQ.data?.id && (
              <Link to="/transcript/$employeeId" params={{ employeeId: empQ.data.id }}>
                <Button size="sm" variant="outline"><FileText className="h-4 w-4 mr-1" /> My transcript</Button>
              </Link>
            )}
          </div>
        </section>
      </div>

      <Dialog open={!!completeFor} onOpenChange={(o) => !o && setCompleteFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark complete: {completeFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Score (optional)</Label><Input type="number" min={0} max={100} value={completeForm.score} onChange={(e) => setCompleteForm({ ...completeForm, score: e.target.value })} placeholder="0–100" /></div>
            <div><Label>Notes</Label><Textarea rows={2} value={completeForm.notes} onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })} /></div>
            <div>
              <Label>Proof of completion (optional)</Label>
              <Input type="file" accept="application/pdf,image/*" onChange={(e) => setCompleteForm({ ...completeForm, file: e.target.files?.[0] ?? null })} />
              <p className="text-xs text-muted-foreground mt-1">PDF or image. Visible to HR and your supervisor.</p>
            </div>
          </div>
          <DialogFooter><Button onClick={() => complete.mutate()} disabled={complete.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}