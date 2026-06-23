import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createCompCycle, openCompCycle } from "@/lib/comp-cycles.functions";

export const Route = createFileRoute("/_authenticated/comp-cycles/")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const createFn = useServerFn(createCompCycle);
  const openFn = useServerFn(openCompCycle);
  const { data: cycles } = useQuery({ queryKey: ["comp-cycles"], queryFn: async () => (await supabase.from("comp_cycles").select("*").order("created_at", { ascending: false })).data ?? [] });

  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", period_start: today, period_end: today, effective_date: today, budget_pct: "3" });
  const create = useMutation({
    mutationFn: () => createFn({ data: { ...form, budget_pct: Number(form.budget_pct) } }),
    onSuccess: () => { toast.success("Cycle created"); setOpen(false); qc.invalidateQueries({ queryKey: ["comp-cycles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const openMut = useMutation({
    mutationFn: (id: string) => openFn({ data: { id } }),
    onSuccess: () => { toast.success("Cycle opened — participants seeded"); qc.invalidateQueries({ queryKey: ["comp-cycles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Compensation cycles">
      <div className="flex justify-between mb-4">
        <p className="text-sm text-muted-foreground">Run merit, bonus, and promotion decisions for the org.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New cycle</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New comp cycle</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="2026 Mid-year merit" /></div>
              <div><Label>Period start</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
              <div><Label>Period end</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
              <div><Label>Effective date</Label><Input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} /></div>
              <div><Label>Budget %</Label><Input type="number" step="0.1" value={form.budget_pct} onChange={(e) => setForm({ ...form, budget_pct: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {(cycles ?? []).map((c) => (
          <Card key={c.id} className="p-4 flex items-start justify-between">
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.period_start} → {c.period_end} · effective {c.effective_date} · {c.budget_pct}% budget</p>
              <Badge variant="outline" className="mt-2">{c.status}</Badge>
            </div>
            <div className="flex gap-2">
              {c.status === "draft" && <Button size="sm" onClick={() => openMut.mutate(c.id)}>Open cycle</Button>}
              <Link to="/comp-cycles/$id" params={{ id: c.id }}><Button size="sm" variant="outline">Open</Button></Link>
            </div>
          </Card>
        ))}
        {(cycles?.length ?? 0) === 0 && <Card className="p-10 text-center text-muted-foreground">No cycles yet.</Card>}
      </div>
    </AppShell>
  );
}