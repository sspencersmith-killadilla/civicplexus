import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ClipboardList, Plus, ArrowLeft, Trash2 } from "lucide-react";
import {
  listOfficialOnboardingTemplates, upsertOnboardingTemplate,
  upsertOnboardingTemplateTask, deleteOnboardingTemplateTask,
} from "@/lib/official-onboarding.functions";
import { listBodies } from "@/lib/officials.functions";

export const Route = createFileRoute("/_authenticated/admin-officials/onboarding-templates")({
  component: OnboardingTemplatesPage,
});

const CATEGORIES = ["oath","bond","ethics","disclosure","training","policy","provisioning","orientation","other"] as const;
const ASSIGNEES = ["official","clerk","chair","hr","it","automated"] as const;
const SIGNALS = ["none","oath_signed","bond_filed","ethics_ack","coi_filed","toma_complete","pia_complete","photo_consent"] as const;

function OnboardingTemplatesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOfficialOnboardingTemplates);
  const bodiesFn = useServerFn(listBodies);
  const q = useQuery({ queryKey: ["oo-templates"], queryFn: () => listFn() });
  const bodiesQ = useQuery({ queryKey: ["officials-bodies"], queryFn: () => bodiesFn() });
  const [selected, setSelected] = useState<string | null>(null);

  const templates = (q.data?.templates ?? []) as any[];
  const tasks = (q.data?.tasks ?? []) as any[];
  const active = templates.find((t) => t.id === selected) ?? templates[0] ?? null;
  const activeTasks = active ? tasks.filter((t) => t.template_id === active.id) : [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["oo-templates"] });

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-serif tracking-tight flex items-center gap-2">
              <ClipboardList className="h-6 w-6" /> Onboarding templates
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Doc packet checklists that seed automatically when a new term is created.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin-officials"><Button size="sm" variant="outline"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
            <TemplateDialog bodies={(bodiesQ.data ?? []) as any[]} onSaved={invalidate} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
          <Card className="p-2">
            {q.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
            <ul>
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelected(t.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted ${active?.id === t.id ? "bg-muted" : ""}`}
                  >
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{t.official_bodies?.name ?? "Any body"}</span>
                      <span>· {t.appointment_type ?? "any"}</span>
                      {t.is_default && <Badge variant="outline" className="text-[10px]">default</Badge>}
                      {!t.is_active && <Badge variant="outline" className="text-[10px]">inactive</Badge>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {active ? (
            <div className="space-y-3">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="font-medium">{active.name}</h2>
                    <p className="text-xs text-muted-foreground">{active.description}</p>
                  </div>
                  <TemplateDialog template={active} bodies={(bodiesQ.data ?? []) as any[]} onSaved={invalidate} />
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">Tasks ({activeTasks.length})</h3>
                  <TaskDialog templateId={active.id} nextSort={(activeTasks.at(-1)?.sort_order ?? 0) + 10} onSaved={invalidate} />
                </div>
                {activeTasks.length === 0 && (
                  <p className="text-xs text-muted-foreground">No tasks yet.</p>
                )}
                <ul className="space-y-1">
                  {activeTasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-xs border-b last:border-b-0 py-1.5">
                      <span className="w-8 text-muted-foreground">{t.sort_order}</span>
                      <span className="flex-1">{t.title}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{t.category}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{t.assignee}</Badge>
                      <span className="text-muted-foreground">
                        {t.days_offset >= 0 ? "+" : ""}{t.days_offset}d
                      </span>
                      {!t.is_required && <Badge variant="outline" className="text-[10px]">optional</Badge>}
                      {t.completion_signal !== "none" && <Badge variant="secondary" className="text-[10px]">{t.completion_signal}</Badge>}
                      <TaskDialog templateId={active.id} task={t} nextSort={t.sort_order} onSaved={invalidate} />
                      <DeleteTaskButton id={t.id} onDone={invalidate} />
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : (
            <Card className="p-6"><p className="text-sm text-muted-foreground">Select or create a template.</p></Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function TemplateDialog({ template, bodies, onSaved }: { template?: any; bodies: any[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(template ?? {
    name: "", description: "", body_id: null, appointment_type: null, is_default: false, is_active: true,
  });
  const fn = useServerFn(upsertOnboardingTemplate);
  const m = useMutation({
    mutationFn: () => fn({ data: {
      id: template?.id,
      name: form.name,
      description: form.description || null,
      body_id: form.body_id || null,
      appointment_type: form.appointment_type || null,
      is_default: !!form.is_default,
      is_active: form.is_active !== false,
    } }),
    onSuccess: () => { toast.success("Template saved"); setOpen(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={template ? "ghost" : "default"}>
          {template ? "Edit" : <><Plus className="h-4 w-4 mr-1" /> Template</>}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Description</Label><Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Body (optional)</Label>
              <Select value={form.body_id ?? "__any"} onValueChange={(v) => setForm({ ...form, body_id: v === "__any" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">Any body</SelectItem>
                  {bodies.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Appointment</Label>
              <Select value={form.appointment_type ?? "__any"} onValueChange={(v) => setForm({ ...form, appointment_type: v === "__any" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">Any</SelectItem>
                  <SelectItem value="elected">Elected</SelectItem>
                  <SelectItem value="appointed">Appointed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} /> Default</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active !== false} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /> Active</label>
          </div>
        </div>
        <DialogFooter><Button onClick={() => m.mutate()} disabled={m.isPending || !form.name}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskDialog({ templateId, task, nextSort, onSaved }: { templateId: string; task?: any; nextSort: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(task ?? {
    title: "", description: "", category: "other", assignee: "official",
    is_required: true, days_offset: 0, sort_order: nextSort, completion_signal: "none",
  });
  const fn = useServerFn(upsertOnboardingTemplateTask);
  const m = useMutation({
    mutationFn: () => fn({ data: {
      id: task?.id,
      template_id: templateId,
      title: form.title,
      description: form.description || null,
      category: form.category,
      assignee: form.assignee,
      is_required: !!form.is_required,
      days_offset: Number(form.days_offset),
      sort_order: Number(form.sort_order),
      completion_signal: form.completion_signal,
    } as any }),
    onSuccess: () => { toast.success("Task saved"); setOpen(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={task ? "ghost" : "outline"}>
          {task ? "Edit" : <><Plus className="h-4 w-4 mr-1" /> Task</>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Description</Label><Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Assignee</Label>
              <Select value={form.assignee} onValueChange={(v) => setForm({ ...form, assignee: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ASSIGNEES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Days from start</Label><Input type="number" value={form.days_offset} onChange={(e) => setForm({ ...form, days_offset: e.target.value })} /></div>
            <div><Label>Sort</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><Switch checked={!!form.is_required} onCheckedChange={(v) => setForm({ ...form, is_required: v })} /> Required</label></div>
          </div>
          <div><Label>Completion signal</Label>
            <Select value={form.completion_signal} onValueChange={(v) => setForm({ ...form, completion_signal: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SIGNALS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Writes back to the term (oath date/administrator, bond doc) or opens a disclosure when marked complete.
            </p>
          </div>
        </div>
        <DialogFooter><Button onClick={() => m.mutate()} disabled={m.isPending || !form.title}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTaskButton({ id, onDone }: { id: string; onDone: () => void }) {
  const fn = useServerFn(deleteOnboardingTemplateTask);
  const m = useMutation({
    mutationFn: () => fn({ data: { id } }),
    onSuccess: () => { toast.success("Task deleted"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { if (confirm("Delete task?")) m.mutate(); }} disabled={m.isPending}>
      <Trash2 className="h-3 w-3" />
    </Button>
  );
}