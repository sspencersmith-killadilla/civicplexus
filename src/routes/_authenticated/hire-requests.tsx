import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { submitHireRequest, decideHireRequest } from "@/lib/hire-requests.functions";
import { PROVISIONING_KINDS, DEFAULT_PROVISIONING_KINDS } from "@/lib/provisioning-kinds";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/hire-requests")({ component: HireRequestsPage });

function HireRequestsPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isHr = hasRole(me?.roles, "hr_admin");

  const { data: requests } = useQuery({
    queryKey: ["hire-requests"],
    queryFn: async () => (await supabase.from("hire_requests").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: workerTypes } = useQuery({
    queryKey: ["wt-min"],
    queryFn: async () => (await supabase.from("worker_types").select("id,name,default_provisioning").order("sort_order")).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", job_title: "", department: "", worker_type_id: "", start_date: "", reason: "", notes: "" });
  const [provKinds, setProvKinds] = useState<string[]>(DEFAULT_PROVISIONING_KINDS);

  const submitFn = useServerFn(submitHireRequest);
  const decideFn = useServerFn(decideHireRequest);

  const submit = useMutation({
    mutationFn: async () => submitFn({ data: { ...form, worker_type_id: form.worker_type_id || null, provisioning_kinds: provKinds } }),
    onSuccess: () => { toast.success("Request submitted"); setOpen(false); setForm({ first_name: "", last_name: "", email: "", job_title: "", department: "", worker_type_id: "", start_date: "", reason: "", notes: "" }); setProvKinds(DEFAULT_PROVISIONING_KINDS); qc.invalidateQueries({ queryKey: ["hire-requests"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async (v: { request_id: string; action: "activate" | "reject"; hr_notes?: string }) => decideFn({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["hire-requests"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Hire Requests">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">Supervisors submit requests; HR reviews and activates.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Request new hire</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Request a new hire</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>First name</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
                <div><Label>Last name</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
              </div>
              <div><Label>Personal email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Job title</Label><Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></div>
                <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Worker type</Label>
                  <Select value={form.worker_type_id} onValueChange={(v) => {
                    setForm({ ...form, worker_type_id: v });
                    const wt = workerTypes?.find((w) => w.id === v);
                    const defaults = (wt?.default_provisioning as unknown as string[] | null) ?? null;
                    setProvKinds(defaults && defaults.length ? defaults : DEFAULT_PROVISIONING_KINDS);
                  }}>
                    <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                    <SelectContent>{workerTypes?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Proposed start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              </div>
              <div><Label>Reason</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
              <div><Label>Notes for HR</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="border-t pt-3 space-y-2">
                <Label>IT provisioning to queue on activation</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PROVISIONING_KINDS.map((k) => {
                    const Icon = k.icon;
                    const checked = provKinds.includes(k.key);
                    return (
                      <label key={k.key} className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-accent">
                        <Checkbox checked={checked} onCheckedChange={(v) => setProvKinds((prev) => v === true ? Array.from(new Set([...prev, k.key])) : prev.filter((x) => x !== k.key))} />
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="text-sm">{k.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter><Button disabled={!form.first_name || !form.last_name || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting…" : "Submit"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="divide-y">
        {!requests?.length && <div className="p-10 text-center text-muted-foreground"><UserPlus className="h-8 w-8 mx-auto mb-2 opacity-40" /> No requests yet.</div>}
        {requests?.map((r) => (
          <div key={r.id} className="p-4 flex justify-between items-center gap-3">
            <div className="min-w-0">
              <p className="font-medium">{r.proposed_first_name} {r.proposed_last_name} <span className="text-xs text-muted-foreground">{r.proposed_job_title || "—"} · {r.proposed_department || "—"}</span></p>
              <p className="text-xs text-muted-foreground">{r.proposed_email || "—"} · starts {r.proposed_start_date || "—"}</p>
              {r.reason && <p className="text-xs mt-1 text-muted-foreground italic">"{r.reason}"</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={r.status === "active" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge>
              {isHr && r.status === "drafted" && (
                <>
                  <Button size="sm" onClick={() => decide.mutate({ request_id: r.id, action: "activate" })}>Activate</Button>
                  <Button size="sm" variant="outline" onClick={() => { const n = prompt("Reason for rejection (optional)") ?? undefined; decide.mutate({ request_id: r.id, action: "reject", hr_notes: n }); }}>Reject</Button>
                </>
              )}
            </div>
          </div>
        ))}
      </Card>
    </AppShell>
  );
}