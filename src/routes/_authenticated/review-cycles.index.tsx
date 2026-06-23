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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Calendar, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createReviewCycle } from "@/lib/review-cycles.functions";

export const Route = createFileRoute("/_authenticated/review-cycles/")({ component: ReviewCyclesIndex });

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-primary/15 text-primary",
  in_calibration: "bg-amber-500/15 text-amber-700",
  closed: "bg-secondary text-secondary-foreground",
};

function ReviewCyclesIndex() {
  const qc = useQueryClient();
  const create = useServerFn(createReviewCycle);
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ name: "", period_start: "", period_end: today, self_review_due: "", manager_review_due: "", signoff_due: "", departments: "" });

  const q = useQuery({
    queryKey: ["review_cycles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_cycles" as never)
        .select("id, name, period_start, period_end, status, kickoff_at, self_review_due, manager_review_due, signoff_due, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; name: string; period_start: string; period_end: string; status: string; self_review_due: string | null; manager_review_due: string | null; signoff_due: string | null }>;
    },
  });

  const m = useMutation({
    mutationFn: () => create({ data: {
      name: form.name,
      period_start: form.period_start,
      period_end: form.period_end,
      self_review_due: form.self_review_due || null,
      manager_review_due: form.manager_review_due || null,
      signoff_due: form.signoff_due || null,
      departments: form.departments ? form.departments.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review_cycles"] }); toast.success("Cycle created"); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <AppShell title="Review Cycles">
      <div className="flex items-center justify-between mb-4">
        <p className="text-muted-foreground max-w-2xl">Open a cycle to seed performance reviews for every eligible employee and notify managers + reports automatically.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New cycle</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New review cycle</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="2026 Annual Reviews" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Period start</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Period end</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Self due</Label><Input type="date" value={form.self_review_due} onChange={(e) => setForm({ ...form, self_review_due: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Manager due</Label><Input type="date" value={form.manager_review_due} onChange={(e) => setForm({ ...form, manager_review_due: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Sign-off due</Label><Input type="date" value={form.signoff_due} onChange={(e) => setForm({ ...form, signoff_due: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Departments (optional, comma-separated)</Label><Input value={form.departments} onChange={(e) => setForm({ ...form, departments: e.target.value })} placeholder="Public Works, Finance" /></div>
            </div>
            <DialogFooter><Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Creating…" : "Create draft"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {(q.data ?? []).map((c) => (
          <Card key={c.id} className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> {c.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.period_start} → {c.period_end}{c.signoff_due ? ` · sign-off ${c.signoff_due}` : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded ${statusColor[c.status] ?? "bg-muted"}`}>{c.status}</span>
              <Link to="/review-cycles/$id" params={{ id: c.id }}>
                <Button size="sm" variant="outline"><ExternalLink className="h-3 w-3 mr-1" /> Open</Button>
              </Link>
            </div>
          </Card>
        ))}
        {(q.data?.length ?? 0) === 0 && <Card className="p-10 text-center text-sm text-muted-foreground">No cycles yet.</Card>}
      </div>
    </AppShell>
  );
}