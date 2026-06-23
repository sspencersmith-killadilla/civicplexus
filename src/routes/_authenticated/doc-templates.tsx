import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, FileStack, Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/doc-templates")({
  head: () => ({ meta: [{ title: "Document Templates — CivicPlexus" }] }),
  component: DocTemplatesPage,
});

type Tpl = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  org_name: string | null;
  org_address: string | null;
  brand_primary: string;
  brand_accent: string;
  header_font: string;
  body_font: string;
  cover_style: "minimal" | "banner" | "full";
  section_order: string[];
  footer_text: string | null;
  include_toc: boolean;
  include_signature_block: boolean;
  is_default: boolean;
};

const SECTION_KEYS = [
  { key: "forms", label: "Forms" },
  { key: "policies", label: "Policies" },
  { key: "courses", label: "Training & Certifications" },
] as const;

const FONT_OPTIONS = [
  "Georgia, serif",
  "Cambria, serif",
  "Palatino, serif",
  "Arial, sans-serif",
  "Helvetica, sans-serif",
  "Calibri, sans-serif",
  "Trebuchet MS, sans-serif",
];

const emptyTpl: Omit<Tpl, "id"> = {
  name: "",
  description: "",
  logo_url: "",
  org_name: "",
  org_address: "",
  brand_primary: "#1E2761",
  brand_accent: "#CADCFC",
  header_font: "Georgia, serif",
  body_font: "Georgia, serif",
  cover_style: "banner",
  section_order: ["forms", "policies", "courses"],
  footer_text: "",
  include_toc: true,
  include_signature_block: true,
  is_default: false,
};

function DocTemplatesPage() {
  const qc = useQueryClient();
  const { data: templates } = useQuery({
    queryKey: ["doc-templates"],
    queryFn: async () => (await supabase.from("doc_templates").select("*").order("name")).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [form, setForm] = useState<Omit<Tpl, "id">>(emptyTpl);

  function startCreate() { setEditing(null); setForm(emptyTpl); setOpen(true); }
  function startEdit(t: Tpl) {
    setEditing(t);
    setForm({
      ...t,
      description: t.description ?? "",
      logo_url: t.logo_url ?? "",
      org_name: t.org_name ?? "",
      org_address: t.org_address ?? "",
      footer_text: t.footer_text ?? "",
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        description: form.description || null,
        logo_url: form.logo_url || null,
        org_name: form.org_name || null,
        org_address: form.org_address || null,
        footer_text: form.footer_text || null,
      };
      if (form.is_default) {
        await supabase.from("doc_templates").update({ is_default: false }).neq("id", editing?.id ?? "00000000-0000-0000-0000-000000000000");
      }
      if (editing) {
        const { error } = await supabase.from("doc_templates").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("doc_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Template saved"); setOpen(false); qc.invalidateQueries({ queryKey: ["doc-templates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("doc_templates").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Template deleted"); qc.invalidateQueries({ queryKey: ["doc-templates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function moveSection(idx: number, dir: -1 | 1) {
    const next = [...form.section_order];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setForm({ ...form, section_order: next });
  }

  return (
    <AppShell title="Document Templates">
      <div className="flex items-start justify-between mb-6 gap-4">
        <p className="text-sm text-muted-foreground max-w-2xl">Define reusable letterhead, branding, and section layouts. Pick a template when generating an onboarding packet.</p>
        <Button onClick={startCreate}><Plus className="h-4 w-4 mr-2" /> New Template</Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {!templates?.length && (
          <Card className="col-span-full p-10 text-center text-muted-foreground">
            <FileStack className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No templates yet. Create one to brand your packets.
          </Card>
        )}
        {(templates as Tpl[] | undefined)?.map((t) => (
          <Card key={t.id} className="overflow-hidden">
            <div className="h-12 flex items-center px-4" style={{ background: t.brand_primary, color: "#fff", fontFamily: t.header_font }}>
              {t.logo_url && <img src={t.logo_url} alt="" className="h-8 mr-3 bg-white/90 rounded p-0.5" />}
              <span className="font-medium tracking-tight">{t.org_name || "Your Organization"}</span>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{t.name}</h3>
                  {t.is_default && <Badge variant="secondary"><Star className="h-3 w-3 mr-1" /> Default</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this template?")) del.mutate(t.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
              <div className="flex flex-wrap gap-1 text-xs">
                <Badge variant="outline">{t.cover_style} cover</Badge>
                {t.include_toc && <Badge variant="outline">TOC</Badge>}
                {t.include_signature_block && <Badge variant="outline">Signatures</Badge>}
                <Badge variant="outline">{t.section_order.join(" → ")}</Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="flex items-end gap-2"><Checkbox checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: !!v })} /><Label className="mb-2.5">Set as default</Label></div>
            </div>
            <div><Label>Description</Label><Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

            <div className="pt-2 border-t">
              <h4 className="font-medium text-sm mb-2">Letterhead</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Organization name</Label><Input value={form.org_name ?? ""} onChange={(e) => setForm({ ...form, org_name: e.target.value })} /></div>
                <div><Label>Logo URL</Label><Input value={form.logo_url ?? ""} placeholder="https://…" onChange={(e) => setForm({ ...form, logo_url: e.target.value })} /></div>
              </div>
              <div className="mt-3"><Label>Address / contact line</Label><Textarea rows={2} value={form.org_address ?? ""} onChange={(e) => setForm({ ...form, org_address: e.target.value })} /></div>
            </div>

            <div className="pt-2 border-t">
              <h4 className="font-medium text-sm mb-2">Branding</h4>
              <div className="grid grid-cols-4 gap-3">
                <div><Label>Primary</Label><Input type="color" value={form.brand_primary} onChange={(e) => setForm({ ...form, brand_primary: e.target.value })} /></div>
                <div><Label>Accent</Label><Input type="color" value={form.brand_accent} onChange={(e) => setForm({ ...form, brand_accent: e.target.value })} /></div>
                <div>
                  <Label>Header font</Label>
                  <Select value={form.header_font} onValueChange={(v) => setForm({ ...form, header_font: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FONT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f.split(",")[0]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Body font</Label>
                  <Select value={form.body_font} onValueChange={(v) => setForm({ ...form, body_font: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FONT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f.split(",")[0]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t">
              <h4 className="font-medium text-sm mb-2">Layout</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cover style</Label>
                  <Select value={form.cover_style} onValueChange={(v: Tpl["cover_style"]) => setForm({ ...form, cover_style: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal — title only</SelectItem>
                      <SelectItem value="banner">Banner — colored header band</SelectItem>
                      <SelectItem value="full">Full — full-bleed cover page</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2 justify-end">
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.include_toc} onCheckedChange={(v) => setForm({ ...form, include_toc: !!v })} /> Include table of contents</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.include_signature_block} onCheckedChange={(v) => setForm({ ...form, include_signature_block: !!v })} /> Add signature line per policy</label>
                </div>
              </div>
              <div className="mt-3">
                <Label>Section order</Label>
                <div className="mt-1 space-y-1">
                  {form.section_order.map((key, i) => (
                    <div key={key} className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1">
                      <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
                      <span className="flex-1 text-sm">{SECTION_KEYS.find((s) => s.key === key)?.label ?? key}</span>
                      <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => moveSection(i, -1)}>↑</Button>
                      <Button size="sm" variant="ghost" disabled={i === form.section_order.length - 1} onClick={() => moveSection(i, 1)}>↓</Button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3"><Label>Footer text</Label><Input value={form.footer_text ?? ""} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!form.name}>{editing ? "Save" : "Create template"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}