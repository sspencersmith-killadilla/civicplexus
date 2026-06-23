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
import { submitPaf } from "@/lib/paf.functions";

export const Route = createFileRoute("/_authenticated/paf/")({ component: PafIndex });

const ACTIONS = [
  "hire","rehire","transfer","promotion","demotion","reclassification",
  "pay_change","status_change","leave_start","leave_return","separation","position_change","other",
] as const;

function PafIndex() {
  const qc = useQueryClient();
  const submit = useServerFn(submitPaf);
  const [open, setOpen] = useState(false);

  const listQ = useQuery({
    queryKey: ["pafs"],
    queryFn: async () => {
      const { data } = await supabase.from("personnel_actions")
        .select("id, paf_number, action_type, effective_date, status, employees(first_name, last_name)")
        .order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as Array<{ id: string; paf_number: string; action_type: string; effective_date: string; status: string; employees: { first_name: string; last_name: string } }>;
    },
  });

  const empsQ = useQuery({
    queryKey: ["emps-min"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id, first_name, last_name, job_title").order("last_name").limit(500);
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string; job_title: string | null }>;
    },
  });

  const [form, setForm] = useState({
    employee_id: "", action_type: "pay_change" as typeof ACTIONS[number], effective_date: "",
    reason: "", narrative: "", after_json: "{}",
  });

  const send = useMutation({
    mutationFn: () => {
      let after: Record<string, unknown> = {};
      try { after = JSON.parse(form.after_json || "{}"); } catch { throw new Error("Invalid JSON in After values"); }
      return submit({ data: {
        employee_id: form.employee_id, action_type: form.action_type, effective_date: form.effective_date,
        reason: form.reason || undefined, narrative: form.narrative || undefined, after_values: after,
      }});
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["pafs"] }); setOpen(false); toast.success(`Submitted ${r.paf_number}`); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <AppShell title="Personnel Action Forms">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground max-w-2xl">PAFs route through supervisor → HR approval, then HR applies the change to the employee record.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New PAF</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>New personnel action</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Employee</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(empsQ.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.last_name}, {e.first_name} · {e.job_title ?? "—"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Action type</Label>
                  <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v as typeof ACTIONS[number] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Effective date</Label><Input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} /></div>
              </div>
              <div><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. promotion to Sr. Engineer" /></div>
              <div><Label>Narrative</Label><Textarea rows={3} value={form.narrative} onChange={(e) => setForm({ ...form, narrative: e.target.value })} /></div>
              <div>
                <Label>After values (JSON — fields to update on approval)</Label>
                <Textarea rows={4} value={form.after_json} onChange={(e) => setForm({ ...form, after_json: e.target.value })}
                  placeholder='{"job_title":"Sr. Engineer","department":"IT"}' className="font-mono text-xs" />
                <p className="text-xs text-muted-foreground mt-1">Allowed keys: job_title, department, status, position_id, manager_id, start_date, work_email</p>
              </div>
              <div className="flex justify-end">
                <Button disabled={send.isPending || !form.employee_id || !form.effective_date} onClick={() => send.mutate()}>
                  {send.isPending ? "Submitting…" : "Submit for approval"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="divide-y">
        {(listQ.data ?? []).map((p) => (
          <Link key={p.id} to="/paf/$id" params={{ id: p.id }} className="block p-3 hover:bg-muted/40 text-sm">
            <div className="flex justify-between">
              <div>
                <span className="font-mono text-xs text-muted-foreground mr-2">{p.paf_number}</span>
                <span className="font-medium">{p.employees?.first_name} {p.employees?.last_name}</span>
                <span className="text-muted-foreground ml-2">{p.action_type.replace(/_/g, " ")} · eff. {p.effective_date}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-muted">{p.status}</span>
            </div>
          </Link>
        ))}
        {(listQ.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">No PAFs yet.</p>}
      </Card>
    </AppShell>
  );
}