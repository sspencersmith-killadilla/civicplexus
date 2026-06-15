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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/templates/$id")({
  component: TemplateDetailPage,
});

const CATS = ["forms", "compliance", "equipment", "training", "provisioning", "policy", "introduction", "other"] as const;
const ASSIGNEES = ["employee", "manager", "hr", "it", "facilities", "payroll", "automated"] as const;

function TemplateDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: tpl } = useQuery({
    queryKey: ["template", id],
    queryFn: async () => (await supabase.from("onboarding_templates").select("*").eq("id", id).single()).data,
  });
  const { data: tasks } = useQuery({
    queryKey: ["template-tasks", id],
    queryFn: async () => (await supabase.from("template_tasks").select("*").eq("template_id", id).order("sort_order")).data,
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]>("forms");
  const [assignee, setAssignee] = useState<(typeof ASSIGNEES)[number]>("employee");
  const [required, setRequired] = useState(true);
  const [offset, setOffset] = useState(0);

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("template_tasks").insert({
        template_id: id, title, description: desc, category: cat, assignee, is_required: required,
        days_offset: offset, sort_order: (tasks?.length ?? 0) * 10 + 10,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["template-tasks", id] });
      toast.success("Task added"); setOpen(false);
      setTitle(""); setDesc(""); setCat("forms"); setAssignee("employee"); setRequired(true); setOffset(0);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (tid: string) => {
      const { error } = await supabase.from("template_tasks").delete().eq("id", tid);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["template-tasks", id] }); toast.success("Removed"); },
  });

  return (
    <AppShell title={tpl?.name ?? "Template"}>
      <Link to="/templates"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="h-4 w-4 mr-1" /> All templates</Button></Link>
      {tpl?.description && <p className="text-muted-foreground mb-6 max-w-2xl">{tpl.description}</p>}

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-xl">Tasks</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" /> Add task</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Complete I-9 form" /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={cat} onValueChange={(v) => setCat(v as never)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assignee</Label>
                  <Select value={assignee} onValueChange={(v) => setAssignee(v as never)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Days from start (− = before)</Label><Input type="number" value={offset} onChange={(e) => setOffset(Number(e.target.value))} /></div>
                <div className="space-y-2"><Label>Required</Label><div className="flex items-center h-9"><Switch checked={required} onCheckedChange={setRequired} /></div></div>
              </div>
            </div>
            <DialogFooter><Button disabled={!title || add.isPending} onClick={() => add.mutate()}>{add.isPending ? "Adding…" : "Add task"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="divide-y">
        {!tasks?.length && <div className="p-6 text-sm text-muted-foreground text-center">No tasks yet. Add one to start building this template.</div>}
        {tasks?.map((t) => (
          <div key={t.id} className="p-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{t.title}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{t.category}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{t.assignee}</span>
                {!t.is_required && <span className="text-xs px-2 py-0.5 rounded border">optional</span>}
                <span className="text-xs text-muted-foreground">day {t.days_offset >= 0 ? `+${t.days_offset}` : t.days_offset}</span>
              </div>
              {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </Card>
    </AppShell>
  );
}