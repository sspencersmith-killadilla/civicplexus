import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ScrollText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/policies/")({ component: PoliciesPage });

function PoliciesPage() {
  const qc = useQueryClient();
  const { data: policies } = useQuery({ queryKey: ["policies"], queryFn: async () => (await supabase.from("policies").select("*").order("created_at", { ascending: false })).data ?? [] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body_md: "", requires_reack_months: "" });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("policies").insert({ title: form.title, body_md: form.body_md, requires_reack_months: form.requires_reack_months ? Number(form.requires_reack_months) : null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Policy drafted"); setOpen(false); setForm({ title: "", body_md: "", requires_reack_months: "" }); qc.invalidateQueries({ queryKey: ["policies"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const publish = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("policies").update({ published: true }).eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Published"); qc.invalidateQueries({ queryKey: ["policies"] }); },
  });

  return (
    <AppShell title="Policies">
      <div className="flex justify-between mb-4">
        <p className="text-sm text-muted-foreground">Publish policies and trigger acknowledgment campaigns.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Policy</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New Policy</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Body (Markdown)</Label><Textarea rows={10} value={form.body_md} onChange={(e) => setForm({ ...form, body_md: e.target.value })} /></div>
              <div><Label>Re-acknowledge every (months, optional)</Label><Input type="number" value={form.requires_reack_months} onChange={(e) => setForm({ ...form, requires_reack_months: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.title || !form.body_md}>Create draft</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="divide-y">
        {!policies?.length && <div className="p-10 text-center text-muted-foreground"><ScrollText className="h-8 w-8 mx-auto mb-2 opacity-40" /> No policies yet.</div>}
        {policies?.map((p) => (
          <div key={p.id} className="p-4 flex justify-between items-center">
            <div>
              <p className="font-medium">{p.title} <span className="text-xs text-muted-foreground">v{p.version}</span></p>
              <p className="text-xs text-muted-foreground">Effective {p.effective_date} {p.requires_reack_months ? `re-ack every ${p.requires_reack_months}mo` : "one-time"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={p.published ? "default" : "outline"}>{p.published ? "Published" : "Draft"}</Badge>
              {!p.published && <Button size="sm" onClick={() => publish.mutate(p.id)}>Publish</Button>}
              <Button size="sm" variant="outline" asChild><Link to="/policies/$id" params={{ id: p.id }}>View</Link></Button>
            </div>
          </div>
        ))}
      </Card>
    </AppShell>
  );
}