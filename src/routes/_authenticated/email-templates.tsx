import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Save, Plus, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listEmailTemplates, upsertEmailTemplate, duplicateEmailTemplate, deleteEmailTemplate } from "@/lib/email-templates.functions";

export const Route = createFileRoute("/_authenticated/email-templates")({ component: EmailTemplatesPage });

function EmailTemplatesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listEmailTemplates);
  const save = useServerFn(upsertEmailTemplate);
  const dup = useServerFn(duplicateEmailTemplate);
  const del = useServerFn(deleteEmailTemplate);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ template_key: "", name: "", subject: "", body: "", description: "", active: true, category: "", is_custom: false });
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ template_key: "", name: "", subject: "", body: "", description: "", category: "custom" });

  const q = useQuery({ queryKey: ["email-templates"], queryFn: () => list() });

  useEffect(() => {
    if (!q.data?.length) return;
    if (!selected) setSelected(q.data[0].id);
  }, [q.data, selected]);

  useEffect(() => {
    if (!q.data || !selected) return;
    const t = q.data.find((x) => x.id === selected);
    if (t) setForm({
      template_key: t.template_key, name: t.name, subject: t.subject, body: t.body,
      description: t.description ?? "", active: t.active,
      category: (t.category ?? "") as string, is_custom: !!t.is_custom,
    });
  }, [selected, q.data]);

  const doSave = useMutation({
    mutationFn: () => save({ data: { ...form, description: form.description || null, category: form.category || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); toast.success("Saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doCreate = useMutation({
    mutationFn: () => save({ data: { ...newForm, description: newForm.description || null, category: newForm.category || null, active: true, is_custom: true } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success("Template created");
      setNewOpen(false);
      setNewForm({ template_key: "", name: "", subject: "", body: "", description: "", category: "custom" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doDuplicate = useMutation({
    mutationFn: () => dup({ data: { id: selected!, new_key: `${form.template_key}_copy_${Date.now().toString(36)}` } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); toast.success("Duplicated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const doDelete = useMutation({
    mutationFn: () => del({ data: { id: selected! } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); toast.success("Deleted"); setSelected(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <AppShell title="Email templates">
      <div className="flex items-start justify-between mb-4 gap-4">
        <p className="text-sm text-muted-foreground max-w-3xl">Edit applicant-facing emails. Variables: <code className="text-xs">{`{{first_name}}`}</code>, <code className="text-xs">{`{{job_title}}`}</code>, <code className="text-xs">{`{{org_name}}`}</code>, <code className="text-xs">{`{{portal_url}}`}</code>, <code className="text-xs">{`{{offer_url}}`}</code>, <code className="text-xs">{`{{interview_date}}`}</code>, <code className="text-xs">{`{{interview_location}}`}</code>, <code className="text-xs">{`{{offer_expires}}`}</code>.</p>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New template</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New email template</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Key</Label><Input value={newForm.template_key} onChange={(e) => setNewForm({ ...newForm, template_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="volunteer_welcome" /></div>
                <div><Label>Name</Label><Input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} /></div>
              </div>
              <div><Label>Category</Label><Input value={newForm.category} onChange={(e) => setNewForm({ ...newForm, category: e.target.value })} placeholder="custom / hiring / volunteers…" /></div>
              <div><Label>Subject</Label><Input value={newForm.subject} onChange={(e) => setNewForm({ ...newForm, subject: e.target.value })} /></div>
              <div><Label>Body</Label><Textarea rows={8} value={newForm.body} onChange={(e) => setNewForm({ ...newForm, body: e.target.value })} className="font-mono text-sm" /></div>
              <div><Label>Description</Label><Input value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button onClick={() => doCreate.mutate()} disabled={!newForm.template_key || !newForm.name || !newForm.subject || !newForm.body || doCreate.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid md:grid-cols-[260px_1fr] gap-4">
        <Card className="p-2 divide-y self-start">
          {(q.data ?? []).map((t) => (
            <button key={t.id} className={`w-full text-left p-3 hover:bg-secondary/50 ${selected === t.id ? "bg-secondary" : ""}`} onClick={() => setSelected(t.id)}>
              <div className="font-medium text-sm flex items-center gap-1.5">{t.name} {t.is_custom && <Badge variant="outline" className="text-[9px] px-1 py-0">custom</Badge>}</div>
              <div className="text-xs text-muted-foreground">{t.template_key}</div>
            </button>
          ))}
        </Card>
        <Card className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Key</Label><Input value={form.template_key} onChange={(e) => setForm({ ...form, template_key: e.target.value })} /></div>
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="hiring / volunteers / custom…" /></div>
          <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          <div><Label>Body</Label><Textarea rows={12} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="font-mono text-sm" /></div>
          <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Active</Label></div>
          <div className="flex justify-between items-center gap-2">
            <div className="flex gap-2">
              {selected && <Button variant="outline" size="sm" onClick={() => doDuplicate.mutate()} disabled={doDuplicate.isPending}><Copy className="h-4 w-4 mr-1" /> Duplicate</Button>}
              {selected && form.is_custom && (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm(`Delete "${form.name}"?`)) doDelete.mutate(); }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              )}
            </div>
            <Button onClick={() => doSave.mutate()} disabled={doSave.isPending}><Save className="h-4 w-4 mr-1" /> Save</Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}