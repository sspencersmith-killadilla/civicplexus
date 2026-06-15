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
import { Plus, DoorOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/offboarding")({ component: OffboardingPage });

function OffboardingPage() {
  const qc = useQueryClient();
  const { data: emps } = useQuery({ queryKey: ["off-emps"], queryFn: async () => (await supabase.from("employees").select("*").in("status", ["active", "offboarded"]).order("last_name")).data ?? [] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", separation_date: "", separation_reason: "voluntary", rehire_eligible: true });

  const separate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employees").update({
        status: "offboarded", separation_date: form.separation_date || new Date().toISOString().slice(0, 10),
        separation_reason: form.separation_reason, rehire_eligible: form.rehire_eligible,
      }).eq("id", form.employee_id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Offboarding initiated"); setOpen(false); qc.invalidateQueries({ queryKey: ["off-emps"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rehire = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("employees").update({ status: "active", separation_date: null, separation_reason: null }).eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Marked active"); qc.invalidateQueries({ queryKey: ["off-emps"] }); },
  });

  const offboarded = emps?.filter((e) => e.status === "offboarded") ?? [];
  const active = emps?.filter((e) => e.status === "active") ?? [];

  return (
    <AppShell title="Offboarding & Rehire">
      <div className="flex justify-end mb-4">
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
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.rehire_eligible} onChange={(e) => setForm({ ...form, rehire_eligible: e.target.checked })} /> Eligible for rehire</label>
            </div>
            <DialogFooter><Button onClick={() => separate.mutate()} disabled={!form.employee_id}>Initiate</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="divide-y">
        {!offboarded.length && <div className="p-10 text-center text-muted-foreground"><DoorOpen className="h-8 w-8 mx-auto mb-2 opacity-40" /> No offboardings.</div>}
        {offboarded.map((e) => (
          <div key={e.id} className="p-4 flex justify-between items-center">
            <div>
              <p className="font-medium">{e.first_name} {e.last_name}</p>
              <p className="text-xs text-muted-foreground">Separated {e.separation_date} {e.separation_reason}</p>
            </div>
            <div className="flex items-center gap-2">
              {e.rehire_eligible && <Badge variant="secondary">Rehire eligible</Badge>}
              {e.rehire_eligible && <Button size="sm" variant="outline" onClick={() => rehire.mutate(e.id)}>Rehire</Button>}
            </div>
          </div>
        ))}
      </Card>
    </AppShell>
  );
}