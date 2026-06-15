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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, ListChecks } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/templates")({
  component: TemplatesPage,
});

type Tpl = { id: string; name: string; description: string | null; worker_type_id: string; is_default: boolean; is_active: boolean };
type WT = { id: string; name: string };

function TemplatesPage() {
  const qc = useQueryClient();
  const { data: workerTypes } = useQuery({
    queryKey: ["wt-min"],
    queryFn: async () => (await supabase.from("worker_types").select("id,name").order("sort_order")).data as WT[] | null,
  });
  const { data: templates } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => (await supabase.from("onboarding_templates").select("*").order("name")).data as Tpl[] | null,
  });
  const counts = useQuery({
    queryKey: ["template-task-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("template_tasks").select("template_id");
      const map: Record<string, number> = {};
      (data ?? []).forEach((r) => { map[r.template_id] = (map[r.template_id] ?? 0) + 1; });
      return map;
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [wt, setWt] = useState<string>("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("onboarding_templates").insert({ name, description: desc, worker_type_id: wt });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template created");
      setOpen(false); setName(""); setDesc(""); setWt("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <AppShell title="Onboarding Templates">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-xl">Templates are the per-worker-type playbooks: forms, training, equipment, and provisioning tasks that fire when an employee starts.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New template</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New template</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
              <div className="space-y-2">
                <Label>Worker type</Label>
                <Select value={wt} onValueChange={setWt}>
                  <SelectTrigger><SelectValue placeholder="Pick a worker type" /></SelectTrigger>
                  <SelectContent>{workerTypes?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!name || !wt || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!templates?.length ? (
        <Card className="p-10 text-center">
          <ListChecks className="h-8 w-8 mx-auto text-muted-foreground" />
          <h3 className="mt-3 font-medium">No templates yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create your first template to start onboarding employees.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const w = workerTypes?.find((x) => x.id === t.worker_type_id);
            return (
              <Card key={t.id} className="p-5">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{w?.name ?? "—"}</div>
                <h3 className="mt-1 font-medium">{t.name}</h3>
                <p className="text-sm text-muted-foreground mt-1 min-h-[2.5rem]">{t.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{counts.data?.[t.id] ?? 0} tasks</span>
                  <Link to="/templates/$id" params={{ id: t.id }}><Button size="sm" variant="outline">Open</Button></Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}