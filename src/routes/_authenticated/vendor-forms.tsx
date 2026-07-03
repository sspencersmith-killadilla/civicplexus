import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listVendorTemplates, upsertVendorTemplate, deleteVendorTemplate } from "@/lib/vendor-templates.functions";

export const Route = createFileRoute("/_authenticated/vendor-forms")({
  component: VendorFormsAdmin,
});

type FieldType = "text" | "email" | "tel" | "date" | "number" | "select" | "boolean" | "textarea" | "file";
type Field = { key: string; label: string; type: FieldType; required?: boolean; help?: string; options?: Array<{ value: string; label: string }> };
type Section = { title: string; fields: Field[] };
type Schema = { sections: Section[] };
type Template = { id: string; name: string; slug: string; description: string | null; category: string | null; schema: Schema; is_active: boolean; is_default: boolean };

const STARTER: Schema = {
  sections: [
    { title: "Business", fields: [
      { key: "legal_name", label: "Legal business name", type: "text", required: true },
      { key: "dba", label: "DBA", type: "text" },
      { key: "tax_id", label: "Tax ID / EIN", type: "text", required: true },
    ]},
    { title: "Contact", fields: [
      { key: "contact_name", label: "Contact name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "phone", label: "Phone", type: "tel" },
    ]},
    { title: "Services", fields: [
      { key: "services", label: "Services offered", type: "textarea", required: true },
    ]},
  ],
};

function VendorFormsAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(listVendorTemplates);
  const upsert = useServerFn(upsertVendorTemplate);
  const del = useServerFn(deleteVendorTemplate);
  const { data } = useQuery({ queryKey: ["vendor-templates"], queryFn: () => list() });
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: (t: Partial<Template>) => upsert({ data: {
      id: editing?.id ?? null, name: t.name!, description: t.description ?? null, category: t.category ?? null,
      schema: t.schema!, is_active: t.is_active ?? true, is_default: t.is_default ?? false,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendor-templates"] }); toast.success("Saved"); setOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-templates"] }),
  });

  return (
    <AppShell title="Vendor application forms">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Build custom vendor and contractor application forms. Set one as default for <code>/serve/vendor</code>,
          or link directly to <code>/serve/vendor?form=slug</code>.
        </p>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New form</Button></DialogTrigger>
          <FormBuilder editing={editing} onSubmit={(t) => save.mutate(t)} saving={save.isPending} />
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {((data ?? []) as unknown as Template[]).map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{t.name}</h3>
                <p className="text-xs text-muted-foreground">/serve/vendor?form={t.slug}</p>
              </div>
              <div className="flex gap-1">
                {t.is_default && <Badge>default</Badge>}
                <Badge variant="outline">{t.is_active ? "active" : "inactive"}</Badge>
              </div>
            </div>
            {t.description && <p className="text-sm text-muted-foreground mt-2">{t.description}</p>}
            <p className="text-xs text-muted-foreground mt-2">
              {t.schema.sections.reduce((n, s) => n + s.fields.length, 0)} fields · {t.schema.sections.length} sections
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setEditing(t); setOpen(true); }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => confirm("Delete?") && remove.mutate(t.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </Card>
        ))}
        {(data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No templates yet. Create one to customize the vendor application.</p>}
      </div>
    </AppShell>
  );
}

function FormBuilder({ editing, onSubmit, saving }: { editing: Template | null; onSubmit: (t: Partial<Template>) => void; saving: boolean }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [active, setActive] = useState(editing?.is_active ?? true);
  const [isDefault, setIsDefault] = useState(editing?.is_default ?? false);
  const [schema, setSchema] = useState<Schema>(editing?.schema ?? STARTER);

  function updateField(si: number, fi: number, patch: Partial<Field>) {
    const s = structuredClone(schema); s.sections[si].fields[fi] = { ...s.sections[si].fields[fi], ...patch }; setSchema(s);
  }
  function addField(si: number) {
    const s = structuredClone(schema); s.sections[si].fields.push({ key: `field_${Date.now()}`, label: "New field", type: "text" }); setSchema(s);
  }
  function removeField(si: number, fi: number) { const s = structuredClone(schema); s.sections[si].fields.splice(fi, 1); setSchema(s); }
  function addSection() { setSchema({ sections: [...schema.sections, { title: "New section", fields: [] }] }); }
  function removeSection(si: number) { const s = structuredClone(schema); s.sections.splice(si, 1); setSchema(s); }

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{editing ? "Edit form" : "New vendor form"}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Category</Label><Input value={category ?? ""} onChange={(e) => setCategory(e.target.value)} placeholder="Construction, IT, Events…" /></div>
        </div>
        <div><Label>Description</Label><Textarea rows={2} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Default form</label>
        </div>

        <div className="space-y-3">
          {schema.sections.map((sec, si) => (
            <Card key={si} className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Input className="font-medium" value={sec.title} onChange={(e) => { const s = structuredClone(schema); s.sections[si].title = e.target.value; setSchema(s); }} />
                <Button size="sm" variant="ghost" onClick={() => removeSection(si)}><Trash2 className="h-3 w-3" /></Button>
              </div>
              <div className="space-y-2">
                {sec.fields.map((f, fi) => (
                  <div key={fi} className="grid grid-cols-12 gap-2 items-center">
                    <Input className="col-span-3" placeholder="key" value={f.key} onChange={(e) => updateField(si, fi, { key: e.target.value })} />
                    <Input className="col-span-4" placeholder="Label" value={f.label} onChange={(e) => updateField(si, fi, { label: e.target.value })} />
                    <select className="col-span-2 border rounded-md h-9 px-2 bg-background text-sm" value={f.type} onChange={(e) => updateField(si, fi, { type: e.target.value as FieldType })}>
                      {["text","email","tel","date","number","select","boolean","textarea","file"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <label className="col-span-2 text-xs flex items-center gap-1"><input type="checkbox" checked={!!f.required} onChange={(e) => updateField(si, fi, { required: e.target.checked })} /> Required</label>
                    <Button size="sm" variant="ghost" className="col-span-1" onClick={() => removeField(si, fi)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => addField(si)}><Plus className="h-3 w-3 mr-1" /> Add field</Button>
              </div>
            </Card>
          ))}
          <Button size="sm" variant="outline" onClick={addSection}><Plus className="h-3 w-3 mr-1" /> Add section</Button>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={saving || !name} onClick={() => onSubmit({ name, description, category, schema, is_active: active, is_default: isDefault })}>
          {saving ? "Saving…" : "Save form"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}