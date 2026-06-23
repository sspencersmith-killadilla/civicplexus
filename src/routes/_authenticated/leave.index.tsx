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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { submitLeaveRequest } from "@/lib/leave.functions";

export const Route = createFileRoute("/_authenticated/leave/")({ component: LeavePage });

function LeavePage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isManager = hasRole(me?.roles, "hr_admin") || hasRole(me?.roles, "supervisor") || hasRole(me?.roles, "hiring_manager");
  const submit = useServerFn(submitLeaveRequest);
  const [open, setOpen] = useState(false);

  const empQ = useQuery({
    queryKey: ["me-employee-for-leave", me?.user?.id],
    enabled: !!me?.user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id").eq("user_id", me!.user!.id).maybeSingle();
      return data;
    },
  });

  const plansQ = useQuery({
    queryKey: ["leave-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("leave_plans").select("id, code, name, paid").eq("is_active", true).order("sort_order");
      return (data ?? []) as Array<{ id: string; code: string; name: string; paid: boolean }>;
    },
  });

  const myReqsQ = useQuery({
    queryKey: ["my-leave-reqs", empQ.data?.id],
    enabled: !!empQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("leave_requests")
        .select("id, start_date, end_date, total_hours, status, leave_plans(name)")
        .eq("employee_id", empQ.data!.id).order("created_at", { ascending: false });
      return (data ?? []) as Array<{ id: string; start_date: string; end_date: string; total_hours: number; status: string; leave_plans: { name: string } }>;
    },
  });

  const inboxQ = useQuery({
    queryKey: ["leave-inbox", me?.user?.id],
    enabled: !!me?.user?.id && isManager,
    queryFn: async () => {
      const { data } = await supabase.from("leave_requests")
        .select("id, start_date, end_date, total_hours, status, employees!inner(first_name, last_name, manager_id), leave_plans(name)")
        .eq("status", "submitted").order("created_at", { ascending: false });
      return (data ?? []) as Array<{ id: string; start_date: string; end_date: string; total_hours: number; status: string; employees: { first_name: string; last_name: string; manager_id: string | null }; leave_plans: { name: string } }>;
    },
  });

  const [form, setForm] = useState({ plan_id: "", start_date: "", end_date: "", total_hours: 8, reason: "" });

  const send = useMutation({
    mutationFn: () => submit({ data: {
      employee_id: empQ.data!.id, plan_id: form.plan_id, start_date: form.start_date,
      end_date: form.end_date, total_hours: Number(form.total_hours), reason: form.reason || undefined,
    }}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-leave-reqs"] }); setOpen(false); toast.success("Request submitted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <AppShell title="Leave">
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button disabled={!empQ.data}><Plus className="h-4 w-4 mr-1" /> Request leave</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request leave</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Leave type</Label>
                <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(plansQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} {p.paid ? "" : "(unpaid)"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>End</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div><Label>Total hours</Label><Input type="number" min={0.25} step={0.25} value={form.total_hours} onChange={(e) => setForm({ ...form, total_hours: Number(e.target.value) })} /></div>
              <div><Label>Reason (optional)</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
              <div className="flex justify-end">
                <Button disabled={send.isPending || !form.plan_id || !form.start_date || !form.end_date} onClick={() => send.mutate()}>{send.isPending ? "Submitting…" : "Submit"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isManager && (
        <section className="mb-8">
          <h3 className="font-medium mb-3">Pending approvals</h3>
          <Card className="divide-y">
            {(inboxQ.data ?? []).map((r) => (
              <Link key={r.id} to="/leave/$id" params={{ id: r.id }} className="block p-3 text-sm hover:bg-muted/40">
                <div className="flex justify-between">
                  <div>
                    <span className="font-medium">{r.employees.first_name} {r.employees.last_name}</span>
                    <span className="text-muted-foreground ml-2">{r.leave_plans.name} · {r.start_date} → {r.end_date} · {Number(r.total_hours).toFixed(1)}h</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">{r.status}</span>
                </div>
              </Link>
            ))}
            {(inboxQ.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">Inbox empty.</p>}
          </Card>
        </section>
      )}

      <section>
        <h3 className="font-medium mb-3">My requests</h3>
        <Card className="divide-y">
          {(myReqsQ.data ?? []).map((r) => (
            <Link key={r.id} to="/leave/$id" params={{ id: r.id }} className="block p-3 text-sm hover:bg-muted/40">
              <div className="flex justify-between">
                <div>
                  <span className="font-medium">{r.leave_plans.name}</span>
                  <span className="text-muted-foreground ml-2">{r.start_date} → {r.end_date} · {Number(r.total_hours).toFixed(1)}h</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-muted">{r.status}</span>
              </div>
            </Link>
          ))}
          {(myReqsQ.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">No requests.</p>}
        </Card>
      </section>
    </AppShell>
  );
}