import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export type FormField = {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "date" | "number" | "select" | "boolean" | "textarea";
  required?: boolean;
  sensitive?: boolean;
  options?: { value: string; label: string }[];
};
export type FormSection = { title: string; fields: FormField[] };
export type FormSchema = { sections: FormSection[] };

export function FormRunner({
  schema,
  initial,
  requiresSignature,
  signerNameDefault,
  onSubmit,
  submitting,
  readOnly,
}: {
  schema: FormSchema;
  initial?: Record<string, unknown>;
  requiresSignature: boolean;
  signerNameDefault?: string;
  onSubmit: (data: Record<string, unknown>, sig: { name: string; data: string } | null) => void;
  submitting?: boolean;
  readOnly?: boolean;
}) {
  const [data, setData] = useState<Record<string, unknown>>(initial ?? {});
  const [signerName, setSignerName] = useState(signerNameDefault ?? "");
  const [signed, setSigned] = useState(false);

  const missing = useMemo(() => {
    const out: string[] = [];
    for (const s of schema.sections) for (const f of s.fields) {
      if (f.required && !data[f.key]) out.push(f.label);
    }
    return out;
  }, [schema, data]);

  function set(key: string, v: unknown) { setData((d) => ({ ...d, [key]: v })); }

  function render(f: FormField) {
    const v = (data[f.key] ?? "") as string | number | boolean;
    if (f.type === "textarea") return <Textarea disabled={readOnly} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} />;
    if (f.type === "select") return (
      <Select value={String(v ?? "")} onValueChange={(val) => set(f.key, val)} disabled={readOnly}>
        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>{f.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    );
    if (f.type === "boolean") return <div className="flex items-center h-9"><Switch checked={Boolean(v)} onCheckedChange={(c) => set(f.key, c)} disabled={readOnly} /></div>;
    if (f.type === "number") return <Input type="number" disabled={readOnly} value={v === "" || v == null ? "" : Number(v)} onChange={(e) => set(f.key, e.target.value === "" ? null : Number(e.target.value))} />;
    return <Input type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : f.type === "date" ? "date" : "text"} disabled={readOnly} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} />;
  }

  return (
    <div className="space-y-6">
      {schema.sections.map((s) => (
        <Card key={s.title} className="p-6">
          <h3 className="font-serif text-lg mb-4">{s.title}</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {s.fields.map((f) => (
              <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2 space-y-2" : "space-y-2"}>
                <Label>
                  {f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}
                  {f.sensitive && <span className="text-xs text-muted-foreground ml-2">(encrypted at rest)</span>}
                </Label>
                {render(f)}
              </div>
            ))}
          </div>
        </Card>
      ))}

      {requiresSignature && !readOnly && (
        <Card className="p-6">
          <h3 className="font-serif text-lg mb-1">Electronic signature</h3>
          <p className="text-sm text-muted-foreground mb-4">By typing your name and clicking Sign &amp; Submit, you adopt this signature as your legal electronic signature under the federal E-SIGN Act.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full legal name</Label>
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Jane Q. Citizen" />
            </div>
            <div className="space-y-2">
              <Label>Signature</Label>
              <Input
                value={signed ? signerName : ""}
                readOnly
                placeholder="Click 'Adopt signature' to sign"
                className="font-serif italic text-lg"
              />
              <button type="button" onClick={() => setSigned(true)} disabled={!signerName} className="text-xs text-primary hover:underline disabled:text-muted-foreground">Adopt signature</button>
            </div>
          </div>
        </Card>
      )}

      {!readOnly && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{missing.length ? `Missing: ${missing.slice(0,3).join(", ")}${missing.length>3?"…":""}` : "All required fields complete."}</p>
          <Button
            disabled={submitting || missing.length > 0 || (requiresSignature && (!signed || !signerName))}
            onClick={() => {
              if (missing.length) { toast.error("Fill required fields first"); return; }
              onSubmit(data, requiresSignature ? { name: signerName, data: signerName } : null);
            }}
          >
            {submitting ? "Submitting…" : requiresSignature ? "Sign & submit" : "Submit"}
          </Button>
        </div>
      )}
    </div>
  );
}