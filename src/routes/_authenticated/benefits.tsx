import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, HeartHandshake } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/benefits")({ component: BenefitsPage });

function BenefitsPage() {
  const qc = useQueryClient();
  const { data: emps } = useQuery({ queryKey: ["b-emps"], queryFn: async () => (await supabase.from("employees").select("id,first_name,last_name")).data ?? [] });
  const { data: rows } = useQuery({ queryKey: ["benefits"], queryFn: async () => (await supabase.from("benefits_handoffs").select("*, employees(first_name,last_name)").order("created_at", { ascending: false })).data ?? [] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", carrier: "", plan_type: "medical", enrollment_window_start: "", enrollment_window_end: "" });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("benefits_handoffs").insert({
        employee_id: form.employee_id, carrier: form.carrier, plan_type: form.plan_type,
        enrollment_window_start: form.enrollment_window_start || null, enrollment_window_end: form.enrollment_window_end || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Hand-off recorded"); setOpen(false); qc.invalidateQueries({ queryKey: ["benefits"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => { const { error } = await supabase.from("benefits_handoffs").update({ status }).eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["benefits"] }),
  });

  return (
    <AppShell title="Benefits Hand-off">
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Hand-off</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Benefits Hand-off</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Employee</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{emps?.map((e) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Carrier</Label><Input value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} /></div>
              <div><Label>Plan Type</Label>
                <Select value={form.plan_type} onValueChange={(v) => setForm({ ...form, plan_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["medical", "dental", "vision", "life", "401k", "pension"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Window Start</Label><Input type="date" value={form.enrollment_window_start} onChange={(e) => setForm({ ...form, enrollment_window_start: e.target.value })} /></div>
                <div><Label>Window End</Label><Input type="date" value={form.enrollment_window_end} onChange={(e) => setForm({ ...form, enrollment_window_end: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.employee_id || !form.carrier}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="divide-y">
        {!rows?.length && <div className="p-10 text-center text-muted-foreground"><HeartHandshake className="h-8 w-8 mx-auto mb-2 opacity-40" /> No hand-offs yet.</div>}
        {rows?.map((r) => (
          <div key={r.id} className="p-4 flex justify-between items-center">
            <div>
              <p className="font-medium">{(r.employees as { first_name: string; last_name: string } | null)?.first_name} {(r.employees as { first_name: string; last_name: string } | null)?.last_name} · {r.carrier} ({r.plan_type})</p>
              <p className="text-xs text-muted-foreground">{r.enrollment_window_start ?? "—"} → {r.enrollment_window_end ?? "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{r.status}</Badge>
              <Select value={r.status} onValueChange={(v) => setStatus.mutate({ id: r.id, status: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{["pending", "sent", "enrolled", "declined", "completed"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </Card>
    </AppShell>
  );
}