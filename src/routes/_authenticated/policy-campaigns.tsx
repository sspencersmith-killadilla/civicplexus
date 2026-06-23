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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { createPolicyCampaign, closePolicyCampaign, campaignStats } from "@/lib/policy-campaigns.functions";

export const Route = createFileRoute("/_authenticated/policy-campaigns")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const createFn = useServerFn(createPolicyCampaign);
  const closeFn = useServerFn(closePolicyCampaign);
  const statsFn = useServerFn(campaignStats);

  const { data: campaigns } = useQuery({
    queryKey: ["policy-campaigns"],
    queryFn: async () => (await supabase.from("policy_campaigns").select("*,policies(title)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: policies } = useQuery({ queryKey: ["pub-policies"], queryFn: async () => (await supabase.from("policies").select("id,title").eq("published", true)).data ?? [] });
  const { data: depts } = useQuery({
    queryKey: ["dept-list"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("department").not("department", "is", null);
      return Array.from(new Set((data ?? []).map((e) => e.department as string).filter(Boolean))).sort();
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ policy_id: "", name: "", due_date: "", departments: [] as string[] });
  const [statsId, setStatsId] = useState<string | null>(null);
  const statsQ = useQuery({ queryKey: ["camp-stats", statsId], queryFn: () => statsFn({ data: { id: statsId! } }), enabled: !!statsId });

  const create = useMutation({
    mutationFn: () => createFn({ data: { policy_id: form.policy_id, name: form.name, due_date: form.due_date || null, departments: form.departments.length ? form.departments : undefined } }),
    onSuccess: (r) => { toast.success(`Launched — ${r.assigned} assigned`); setOpen(false); setForm({ policy_id: "", name: "", due_date: "", departments: [] }); qc.invalidateQueries({ queryKey: ["policy-campaigns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const close = useMutation({
    mutationFn: (id: string) => closeFn({ data: { id } }),
    onSuccess: () => { toast.success("Campaign closed"); qc.invalidateQueries({ queryKey: ["policy-campaigns"] }); },
  });

  return (
    <AppShell title="Policy acknowledgment campaigns">
      <div className="flex justify-between mb-4">
        <p className="text-sm text-muted-foreground">Drive acknowledgment of a published policy across a department or worker type.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Launch campaign</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Launch acknowledgment campaign</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Policy</Label>
                <Select value={form.policy_id} onValueChange={(v) => setForm({ ...form, policy_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select published policy" /></SelectTrigger>
                  <SelectContent>{(policies ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Campaign name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Q2 2026 code of conduct re-ack" /></div>
              <div><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
              <div>
                <Label>Departments (leave empty for everyone active)</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(depts ?? []).map((d) => {
                    const on = form.departments.includes(d);
                    return (
                      <button type="button" key={d}
                        className={`px-2 py-1 text-xs rounded border ${on ? "bg-primary text-primary-foreground" : "bg-background"}`}
                        onClick={() => setForm({ ...form, departments: on ? form.departments.filter((x) => x !== d) : [...form.departments, d] })}>{d}</button>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.policy_id || !form.name || create.isPending}>Launch</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {(campaigns ?? []).map((c) => (
          <Card key={c.id} className="p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium flex items-center gap-2"><Megaphone className="h-4 w-4 text-muted-foreground" /> {c.name}</p>
              <p className="text-sm text-muted-foreground">{(c.policies as { title: string } | null)?.title ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.due_date ? `Due ${c.due_date}` : "No due date"} · <Badge variant="outline">{c.status}</Badge></p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setStatsId(c.id)}>Progress</Button>
              {c.status === "active" && <Button size="sm" variant="ghost" onClick={() => close.mutate(c.id)}>Close</Button>}
              <Link to="/policies/$id" params={{ id: c.policy_id }}><Button size="sm" variant="ghost">View policy</Button></Link>
            </div>
          </Card>
        ))}
        {(campaigns?.length ?? 0) === 0 && <Card className="p-10 text-center text-muted-foreground">No campaigns yet.</Card>}
      </div>

      <Dialog open={!!statsId} onOpenChange={(v) => !v && setStatsId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Campaign progress</DialogTitle></DialogHeader>
          {statsQ.data && (
            <div className="space-y-3">
              <div className="flex gap-6 text-sm">
                <div><span className="text-muted-foreground">Assigned: </span><span className="font-serif text-xl">{statsQ.data.total}</span></div>
                <div><span className="text-muted-foreground">Complete: </span><span className="font-serif text-xl">{statsQ.data.complete}</span></div>
                <div><span className="text-muted-foreground">Pending: </span><span className="font-serif text-xl">{statsQ.data.pending}</span></div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground"><tr><th className="text-left p-2">Employee</th><th className="text-left p-2">Department</th><th className="text-left p-2">Status</th></tr></thead>
                  <tbody>
                    {statsQ.data.rows.map((r) => {
                      const e = r.employees as { first_name: string; last_name: string; department: string | null } | null;
                      return <tr key={r.employee_id} className="border-t"><td className="p-2">{e?.first_name} {e?.last_name}</td><td className="p-2 text-muted-foreground">{e?.department ?? "—"}</td><td className="p-2"><Badge variant={r.status === "complete" ? "default" : "outline"}>{r.status}</Badge></td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}