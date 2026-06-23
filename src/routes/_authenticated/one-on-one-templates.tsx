import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Plus, Trash2, Pencil, Copy, Star } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/one-on-one-templates")({
  component: OneOnOneTemplatesAdmin,
});

type TemplateRow = {
  id: string;
  title: string;
  description: string | null;
  manager_prompts: string[];
  employee_prompts: string[];
  agenda_prompts: string[];
  is_default: boolean;
  is_active: boolean;
  updated_at: string;
};

type EditorState = {
  id: string | null;
  title: string;
  description: string;
  manager_prompts: string[];
  employee_prompts: string[];
  is_default: boolean;
  is_active: boolean;
};

const EMPTY_EDITOR: EditorState = {
  id: null,
  title: "",
  description: "",
  manager_prompts: [""],
  employee_prompts: [""],
  is_default: false,
  is_active: true,
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") as string[] : [];
}

function OneOnOneTemplatesAdmin() {
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const isAdmin = hasRole(me?.roles, "hr_admin");

  const templatesQ = useQuery({
    queryKey: ["one_on_one_templates_admin"],
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from("one_on_one_templates")
        .select("*")
        .order("is_default", { ascending: false })
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        manager_prompts: asStringArray((r as { manager_prompts?: unknown }).manager_prompts),
        employee_prompts: asStringArray((r as { employee_prompts?: unknown }).employee_prompts),
        agenda_prompts: asStringArray(r.agenda_prompts),
        is_default: r.is_default,
        is_active: r.is_active,
        updated_at: r.updated_at,
      }));
    },
    enabled: !!isAdmin,
  });

  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);

  const openNew = () => { setEditor(EMPTY_EDITOR); setOpen(true); };
  const openEdit = (t: TemplateRow) => {
    setEditor({
      id: t.id,
      title: t.title,
      description: t.description ?? "",
      manager_prompts: t.manager_prompts.length ? t.manager_prompts : [""],
      employee_prompts: t.employee_prompts.length ? t.employee_prompts : [""],
      is_default: t.is_default,
      is_active: t.is_active,
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!editor.title.trim()) throw new Error("Title is required");
      const manager_prompts = editor.manager_prompts.map((s) => s.trim()).filter(Boolean);
      const employee_prompts = editor.employee_prompts.map((s) => s.trim()).filter(Boolean);
      if (manager_prompts.length === 0 && employee_prompts.length === 0) {
        throw new Error("Add at least one prompt for manager or employee");
      }
      const payload = {
        title: editor.title.trim(),
        description: editor.description.trim() || null,
        manager_prompts,
        employee_prompts,
        agenda_prompts: manager_prompts.length ? manager_prompts : employee_prompts,
        is_default: editor.is_default,
        is_active: editor.is_active,
      };
      if (editor.id) {
        const { error } = await supabase.from("one_on_one_templates").update(payload).eq("id", editor.id);
        if (error) throw error;
        if (editor.is_default) {
          await supabase.from("one_on_one_templates").update({ is_default: false }).neq("id", editor.id);
        }
      } else {
        const { data, error } = await supabase.from("one_on_one_templates").insert(payload).select("id").single();
        if (error) throw error;
        if (editor.is_default && data) {
          await supabase.from("one_on_one_templates").update({ is_default: false }).neq("id", data.id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Template saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["one_on_one_templates_admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("one_on_one_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Template deleted"); qc.invalidateQueries({ queryKey: ["one_on_one_templates_admin"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (t: TemplateRow) => {
      const { error } = await supabase.from("one_on_one_templates").insert({
        title: `${t.title} (copy)`,
        description: t.description,
        manager_prompts: t.manager_prompts,
        employee_prompts: t.employee_prompts,
        agenda_prompts: t.agenda_prompts,
        is_default: false,
        is_active: t.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Template duplicated"); qc.invalidateQueries({ queryKey: ["one_on_one_templates_admin"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("one_on_one_templates").update({ is_default: false }).neq("id", id);
      const { error } = await supabase.from("one_on_one_templates").update({ is_default: true, is_active: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Default updated"); qc.invalidateQueries({ queryKey: ["one_on_one_templates_admin"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("one_on_one_templates").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["one_on_one_templates_admin"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (meLoading) {
    return <AppShell title="1-on-1 Templates"><p className="text-muted-foreground">Loading…</p></AppShell>;
  }
  if (!isAdmin) {
    return (
      <AppShell title="1-on-1 Templates">
        <Card className="p-6">
          <h3 className="font-medium mb-1">Access denied</h3>
          <p className="text-sm text-muted-foreground">Only HR administrators can manage 1-on-1 templates.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="1-on-1 Templates">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Create and edit the agenda templates used for 1-on-1s. Managers and employees can be shown different prompts.</p>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New template</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Title</th>
              <th className="text-left px-4 py-2">Prompts (mgr / emp)</th>
              <th className="text-left px-4 py-2">Default</th>
              <th className="text-left px-4 py-2">Active</th>
              <th className="text-left px-4 py-2">Updated</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(templatesQ.data ?? []).map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-4 py-3 align-top">
                  <div className="font-medium">{t.title}</div>
                  {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                </td>
                <td className="px-4 py-3 align-top text-muted-foreground">{t.manager_prompts.length} / {t.employee_prompts.length}</td>
                <td className="px-4 py-3 align-top">{t.is_default ? <Badge>Default</Badge> : <Button size="sm" variant="ghost" onClick={() => setDefault.mutate(t.id)}><Star className="h-3 w-3 mr-1" /> Set</Button>}</td>
                <td className="px-4 py-3 align-top"><Switch checked={t.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: t.id, active: v })} /></td>
                <td className="px-4 py-3 align-top text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 align-top">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => duplicate.mutate(t)}><Copy className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${t.title}"? Existing 1-on-1s using it will keep their copies of the prompts.`)) del.mutate(t.id); }}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {(templatesQ.data?.length ?? 0) === 0 && !templatesQ.isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No templates yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editor.id ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} placeholder="e.g. Weekly 1-on-1" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} placeholder="When and why this template is used." />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <PromptList
                label="Manager prompts"
                helper="Shown to the manager during the meeting."
                items={editor.manager_prompts}
                onChange={(items) => setEditor({ ...editor, manager_prompts: items })}
              />
              <PromptList
                label="Employee prompts"
                helper="Shown to the employee during the meeting."
                items={editor.employee_prompts}
                onChange={(items) => setEditor({ ...editor, employee_prompts: items })}
              />
            </div>
            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex items-center gap-3"><Switch checked={editor.is_active} onCheckedChange={(v) => setEditor({ ...editor, is_active: v })} /><Label className="!m-0">Active</Label></div>
              <div className="flex items-center gap-3"><Switch checked={editor.is_default} onCheckedChange={(v) => setEditor({ ...editor, is_default: v })} /><Label className="!m-0">Set as default</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function PromptList({ label, helper, items, onChange }: { label: string; helper: string; items: string[]; onChange: (items: string[]) => void }) {
  const update = (i: number, v: string) => { const next = [...items]; next[i] = v; onChange(next); };
  const remove = (i: number) => { const next = items.filter((_, idx) => idx !== i); onChange(next.length ? next : [""]); };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div><Label>{label}</Label><p className="text-xs text-muted-foreground">{helper}</p></div>
      <div className="space-y-2">
        {items.map((val, i) => (
          <div key={i} className="flex items-start gap-1">
            <Textarea rows={2} value={val} onChange={(e) => update(i, e.target.value)} placeholder={`Prompt ${i + 1}`} className="flex-1" />
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => move(i, 1)} disabled={i === items.length - 1}><ArrowDown className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => remove(i)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={() => onChange([...items, ""])}><Plus className="h-3 w-3 mr-1" /> Add prompt</Button>
    </div>
  );
}

// Suppress unused import warning from earlier scaffolding
void useEffect;