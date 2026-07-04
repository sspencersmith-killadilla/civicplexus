import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormRunner, type FormSchema, type FormField, type FormSection } from "@/components/form-runner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

export type FormMetadata = {
  key: string;
  title: string;
  description: string;
  jurisdiction: string;
  version: string;
  requires_signature: boolean;
};

const FIELD_TYPES: FormField["type"][] = ["text", "email", "tel", "date", "number", "select", "boolean", "textarea"];
const JURISDICTIONS = ["federal", "state", "local", "other"];

export function validateSchema(meta: FormMetadata, schema: FormSchema): string[] {
  const errs: string[] = [];
  if (!/^[a-z0-9_-]+$/.test(meta.key)) errs.push("Key must be lowercase letters, numbers, dashes or underscores.");
  if (!meta.title.trim()) errs.push("Title is required.");
  if (!meta.jurisdiction.trim()) errs.push("Jurisdiction is required.");
  if (!meta.version.trim()) errs.push("Version is required.");
  if (!schema.sections.length) errs.push("Add at least one section.");
  const fieldKeys = new Set<string>();
  schema.sections.forEach((s, si) => {
    if (!s.title.trim()) errs.push(`Section ${si + 1} needs a title.`);
    if (!s.fields.length) errs.push(`Section "${s.title || si + 1}" needs at least one field.`);
    s.fields.forEach((f, fi) => {
      if (!f.key.trim()) errs.push(`Section ${si + 1} field ${fi + 1}: key required.`);
      else if (!/^[a-zA-Z0-9_]+$/.test(f.key)) errs.push(`Field key "${f.key}" must be alphanumeric/underscore.`);
      else if (fieldKeys.has(f.key)) errs.push(`Duplicate field key "${f.key}".`);
      else fieldKeys.add(f.key);
      if (!f.label.trim()) errs.push(`Field "${f.key || fi + 1}" needs a label.`);
      if (f.type === "select" && !(f.options && f.options.length)) errs.push(`Select field "${f.key}" needs at least one option.`);
    });
  });
  return errs;
}

export function FormSchemaEditor({
  meta,
  setMeta,
  schema,
  setSchema,
  keyLocked,
}: {
  meta: FormMetadata;
  setMeta: (m: FormMetadata) => void;
  schema: FormSchema;
  setSchema: (s: FormSchema) => void;
  keyLocked?: boolean;
}) {
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(schema, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  function updateSection(i: number, patch: Partial<FormSection>) {
    const next = { ...schema, sections: schema.sections.map((s, idx) => idx === i ? { ...s, ...patch } : s) };
    setSchema(next);
  }
  function moveSection(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= schema.sections.length) return;
    const arr = [...schema.sections];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setSchema({ ...schema, sections: arr });
  }
  function addSection() {
    setSchema({ ...schema, sections: [...schema.sections, { title: "New Section", fields: [] }] });
  }
  function deleteSection(i: number) {
    setSchema({ ...schema, sections: schema.sections.filter((_, idx) => idx !== i) });
  }
  function addField(si: number) {
    const s = schema.sections[si];
    updateSection(si, { fields: [...s.fields, { key: `field_${s.fields.length + 1}`, label: "New Field", type: "text" }] });
  }
  function updateField(si: number, fi: number, patch: Partial<FormField>) {
    const s = schema.sections[si];
    updateSection(si, { fields: s.fields.map((f, idx) => idx === fi ? { ...f, ...patch } : f) });
  }
  function moveField(si: number, fi: number, dir: -1 | 1) {
    const s = schema.sections[si];
    const j = fi + dir;
    if (j < 0 || j >= s.fields.length) return;
    const arr = [...s.fields];
    [arr[fi], arr[j]] = [arr[j], arr[fi]];
    updateSection(si, { fields: arr });
  }
  function deleteField(si: number, fi: number) {
    const s = schema.sections[si];
    updateSection(si, { fields: s.fields.filter((_, idx) => idx !== fi) });
  }

  function toggleJson(next: boolean) {
    if (next) {
      setJsonText(JSON.stringify(schema, null, 2));
      setJsonError(null);
      setJsonMode(true);
      return;
    }
    try {
      const parsed = JSON.parse(jsonText) as FormSchema;
      if (!parsed || !Array.isArray(parsed.sections)) throw new Error("Schema must have a sections array.");
      setSchema(parsed);
      setJsonMode(false);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  const previewSchema = useMemo(() => schema, [schema]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card className="p-5 space-y-4">
          <h3 className="font-medium">Metadata</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Key</Label>
              <Input value={meta.key} disabled={keyLocked}
                onChange={(e) => setMeta({ ...meta, key: e.target.value.toLowerCase() })}
                placeholder="w4_federal" />
            </div>
            <div>
              <Label>Version</Label>
              <Input value={meta.version}
                onChange={(e) => setMeta({ ...meta, version: e.target.value })}
                placeholder="1" />
            </div>
            <div className="sm:col-span-2">
              <Label>Title</Label>
              <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            </div>
            <div>
              <Label>Jurisdiction</Label>
              <Select value={meta.jurisdiction} onValueChange={(v) => setMeta({ ...meta, jurisdiction: v })}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{JURISDICTIONS.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3">
              <Switch checked={meta.requires_signature} onCheckedChange={(v) => setMeta({ ...meta, requires_signature: v })} />
              <Label>Requires signature</Label>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Schema</h3>
            <div className="flex items-center gap-2">
              <Label className="text-xs">JSON</Label>
              <Switch checked={jsonMode} onCheckedChange={toggleJson} />
            </div>
          </div>

          {jsonMode ? (
            <div className="space-y-2">
              <Textarea rows={20} className="font-mono text-xs" value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
              {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
              <p className="text-xs text-muted-foreground">Toggle JSON off to apply changes.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {schema.sections.map((s, si) => (
                <div key={si} className="border rounded p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Input value={s.title} onChange={(e) => updateSection(si, { title: e.target.value })} placeholder="Section title" />
                    <Button variant="ghost" size="icon" onClick={() => moveSection(si, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => moveSection(si, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteSection(si)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="space-y-2">
                    {s.fields.map((f, fi) => (
                      <div key={fi} className="border rounded p-2 space-y-2 bg-muted/30">
                        <div className="grid sm:grid-cols-[1fr_1fr_150px_auto] gap-2 items-center">
                          <Input placeholder="key" value={f.key} onChange={(e) => updateField(si, fi, { key: e.target.value })} />
                          <Input placeholder="Label" value={f.label} onChange={(e) => updateField(si, fi, { label: e.target.value })} />
                          <Select value={f.type} onValueChange={(v) => updateField(si, fi, { type: v as FormField["type"] })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                          </Select>
                          <div className="flex">
                            <Button variant="ghost" size="icon" onClick={() => moveField(si, fi, -1)}><ArrowUp className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => moveField(si, fi, 1)}><ArrowDown className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteField(si, fi)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <label className="flex items-center gap-2"><Switch checked={!!f.required} onCheckedChange={(v) => updateField(si, fi, { required: v })} /> Required</label>
                          <label className="flex items-center gap-2"><Switch checked={!!f.sensitive} onCheckedChange={(v) => updateField(si, fi, { sensitive: v })} /> Sensitive</label>
                        </div>
                        {f.type === "select" && (
                          <Textarea
                            className="font-mono text-xs"
                            rows={3}
                            placeholder={"value,Label\nyes,Yes\nno,No"}
                            value={(f.options ?? []).map((o) => `${o.value},${o.label}`).join("\n")}
                            onChange={(e) => {
                              const options = e.target.value.split("\n").map((line) => {
                                const [value, ...rest] = line.split(",");
                                return { value: (value ?? "").trim(), label: rest.join(",").trim() || (value ?? "").trim() };
                              }).filter((o) => o.value);
                              updateField(si, fi, { options });
                            }}
                          />
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => addField(si)}><Plus className="h-4 w-4 mr-1" /> Add field</Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={addSection}><Plus className="h-4 w-4 mr-1" /> Add section</Button>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">Live preview</h3>
        <Card className="p-5">
          {previewSchema.sections.length ? (
            <FormRunner
              schema={previewSchema}
              requiresSignature={meta.requires_signature}
              readOnly
              onSubmit={() => {}}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Add a section to see a preview.</p>
          )}
        </Card>
      </div>
    </div>
  );
}