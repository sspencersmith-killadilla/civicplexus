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
import { Save } from "lucide-react";
import { toast } from "sonner";
import { listEmailTemplates, upsertEmailTemplate } from "@/lib/email-templates.functions";

export const Route = createFileRoute("/_authenticated/email-templates")({ component: EmailTemplatesPage });

function EmailTemplatesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listEmailTemplates);
  const save = useServerFn(upsertEmailTemplate);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ template_key: "", name: "", subject: "", body: "", description: "", active: true });

  const q = useQuery({ queryKey: ["email-templates"], queryFn: () => list() });

  useEffect(() => {
    if (!q.data?.length) return;
    if (!selected) setSelected(q.data[0].id);
  }, [q.data, selected]);

  useEffect(() => {
    if (!q.data || !selected) return;
    const t = q.data.find((x) => x.id === selected);
    if (t) setForm({ template_key: t.template_key, name: t.name, subject: t.subject, body: t.body, description: t.description ?? "", active: t.active });
  }, [selected, q.data]);

  const doSave = useMutation({
    mutationFn: () => save({ data: { ...form, description: form.description || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); toast.success("Saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <AppShell title="Email templates">
      <p className="text-sm text-muted-foreground mb-4">Edit applicant-facing emails. Variables: <code className="text-xs">{`{{first_name}}`}</code>, <code className="text-xs">{`{{job_title}}`}</code>, <code className="text-xs">{`{{org_name}}`}</code>, <code className="text-xs">{`{{portal_url}}`}</code>, <code className="text-xs">{`{{offer_url}}`}</code>, <code className="text-xs">{`{{interview_date}}`}</code>, <code className="text-xs">{`{{interview_location}}`}</code>, <code className="text-xs">{`{{offer_expires}}`}</code>.</p>
      <div className="grid md:grid-cols-[260px_1fr] gap-4">
        <Card className="p-2 divide-y self-start">
          {(q.data ?? []).map((t) => (
            <button key={t.id} className={`w-full text-left p-3 hover:bg-secondary/50 ${selected === t.id ? "bg-secondary" : ""}`} onClick={() => setSelected(t.id)}>
              <div className="font-medium text-sm">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.template_key}</div>
            </button>
          ))}
        </Card>
        <Card className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Key</Label><Input value={form.template_key} onChange={(e) => setForm({ ...form, template_key: e.target.value })} /></div>
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          <div><Label>Body</Label><Textarea rows={12} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="font-mono text-sm" /></div>
          <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Active</Label></div>
          <div className="flex justify-end"><Button onClick={() => doSave.mutate()} disabled={doSave.isPending}><Save className="h-4 w-4 mr-1" /> Save</Button></div>
        </Card>
      </div>
    </AppShell>
  );
}