import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Plus, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { submitPaf } from "@/lib/paf.functions";

export const Route = createFileRoute("/_authenticated/offboarding")({ component: OffboardingPage });

function OffboardingPage() {
  const qc = useQueryClient();
  const submit = useServerFn(submitPaf);
  const { data: emps } = useQuery({ queryKey: ["off-emps"], queryFn: async () => (await supabase.from("employees").select("*").in("status", ["active", "on_leave", "offboarded"]).order("last_name")).data ?? [] });

  // In-flight separation PAFs (pending/approved but not yet applied)
  const { data: pafs } = useQuery({
    queryKey: ["off-pafs"],
    queryFn: async () => (await supabase.from("personnel_actions")
      .select("id, paf_number, status, effective_date, reason, employee_id, employees(first_name,last_name)")
      .eq("action_type", "separation")
      .in("status", ["pending_approval","approved","applied"])
      .order("created_at", { ascending: false }).limit(100)).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", separation_date: "", separation_reason: "voluntary", rehire_eligible: true, notes: "" });

  const separate = useMutation({
    mutationFn: () => submit({ data: {
      employee_id: form.employee_id,
      action_type: "separation",
      effective_date: form.separation_date || new Date().toISOString().slice(0, 10),
      reason: `Separation: ${form.separation_reason}`,
      narrative: form.notes || undefined,
      after_values: {
        separation_date: form.separation_date || new Date().toISOString().slice(0, 10),
        separation_reason: form.separation_reason,
        rehire_eligible: form.rehire_eligible,
      },
    }}),
    onSuccess: (r) => {
      toast.success(`Submitted ${r.paf_number} for approval`);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["off-pafs"] });
      qc.invalidateQueries({ queryKey: ["off-emps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rehire = useMutation({
    mutationFn: (id: string) => submit({ data: {
      employee_id: id,
      action_type: "rehire",
      effective_date: new Date().toISOString().slice(0, 10),
      reason: "Rehire",
      after_values: { status: "active" },
    }}),
    onSuccess: (r) => { toast.success(`Rehire PAF ${r.paf_number} submitted`); qc.invalidateQueries({ queryKey: ["off-emps"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const offboarded = emps?.filter((e) => e.status === "offboarded") ?? [];
  const active = emps?.filter((e) => e.status === "active" || e.status === "on_leave") ?? [];
  const inFlight = (pafs ?? []).filter((p) => p.status !== "applied");
  const completed = (pafs ?? []).filter((p) => p.status === "applied");

  return (
    <AppShell title="Offboarding & Rehire">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground max-w-2xl">Starting offboarding creates a separation PAF that routes through supervisor → HR. When HR applies it, the employee is marked offboarded and a standard checklist (equipment, IT, COBRA, final pay, TMRS) is seeded.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Start Offboarding</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Initiate Separation</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Employee</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{active.map((e) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Separation Date</Label><Input type="date" value={form.separation_date} onChange={(e) => setForm({ ...form, separation_date: e.target.value })} /></div>
              <div><Label>Reason</Label>
                <Select value={form.separation_reason} onValueChange={(v) => setForm({ ...form, separation_reason: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["voluntary", "involuntary", "retirement", "end_of_term", "deceased"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Notes (optional)</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Last day, transition plan…" />
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.rehire_eligible} onChange={(e) => setForm({ ...form, rehire_eligible: e.target.checked })} /> Eligible for rehire</label>
            </div>
            <DialogFooter><Button onClick={() => separate.mutate()} disabled={!form.employee_id || !form.separation_date || separate.isPending}>{separate.isPending ? "Submitting…" : "Submit for approval"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6">
        <section>
          <h3 className="text-sm font-medium mb-2">In-flight separations</h3>
          <Card className="divide-y">
            {inFlight.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">None pending.</div>}
            {inFlight.map((p) => (
              <Link key={p.id} to="/paf/$id" params={{ id: p.id }} className="block p-3 hover:bg-muted/40">
                <div className="flex justify-between items-center">
                  <div className="text-sm">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{p.paf_number}</span>
                    <span className="font-medium">{p.employees?.first_name} {p.employees?.last_name}</span>
                    <span className="text-muted-foreground ml-2">eff. {p.effective_date}</span>
                  </div>
                  <Badge variant={p.status === "approved" ? "default" : "secondary"}>{p.status.replace(/_/g, " ")}</Badge>
                </div>
              </Link>
            ))}
          </Card>
        </section>

        <section>
          <h3 className="text-sm font-medium mb-2">Offboarded employees</h3>
          <Card className="divide-y">
            {!offboarded.length && <div className="p-10 text-center text-muted-foreground"><DoorOpen className="h-8 w-8 mx-auto mb-2 opacity-40" /> No offboardings yet.</div>}
            {offboarded.map((e) => (
              <div key={e.id} className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-medium">{e.first_name} {e.last_name}</p>
                  <p className="text-xs text-muted-foreground">Separated {e.separation_date} · {e.separation_reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  {e.rehire_eligible && <Badge variant="secondary">Rehire eligible</Badge>}
                  {e.rehire_eligible && <Button size="sm" variant="outline" disabled={rehire.isPending} onClick={() => rehire.mutate(e.id)}>Rehire</Button>}
                </div>
              </div>
            ))}
          </Card>
        </section>

        {completed.length > 0 && (
          <section>
            <h3 className="text-sm font-medium mb-2">Recently applied</h3>
            <Card className="divide-y">
              {completed.slice(0, 10).map((p) => (
                <Link key={p.id} to="/paf/$id" params={{ id: p.id }} className="block p-3 text-sm hover:bg-muted/40">
                  <span className="font-mono text-xs text-muted-foreground mr-2">{p.paf_number}</span>
                  {p.employees?.first_name} {p.employees?.last_name} · {p.effective_date}
                </Link>
              ))}
            </Card>
          </section>
        )}
      </div>
    </AppShell>
  );
}