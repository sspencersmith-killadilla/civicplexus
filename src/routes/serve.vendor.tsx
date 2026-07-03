import { createFileRoute, useLoaderData, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { getPublicVendorTemplate } from "@/lib/vendor-templates.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Briefcase, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/serve/vendor")({
  validateSearch: (s: Record<string, unknown>) => z.object({ form: z.string().optional() }).parse(s),
  loader: ({ location }) => getPublicVendorTemplate({ data: { slug: (location.search as { form?: string }).form } }),
  head: () => ({
    meta: [
      { title: "Vendor & contractor registration" },
      { name: "description", content: "Register your business to be considered for city contracts and procurement opportunities." },
    ],
  }),
  component: VendorIntake,
  errorComponent: () => <p className="p-6">Unable to load.</p>,
  notFoundComponent: () => <p className="p-6">Not found.</p>,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Field = { key: string; label: string; type: string; required?: boolean; help?: string; options?: Array<{ value: string; label: string }> };
type Section = { title: string; fields: Field[] };
type Template = { id: string; name: string; slug: string; description: string | null; schema: { sections: Section[] } } | null;

function VendorIntake() {
  const template = useLoaderData({ from: "/serve/vendor" }) as Template;
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function set(k: string, v: string | boolean) { setValues((prev) => ({ ...prev, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // Map known keys to top-level columns for backwards compatibility; store the full response too.
    const legal = (values.legal_name as string) || (values.legal as string) || (values.business_name as string) || "";
    const insert = {
      legal_name: legal || "Untitled",
      dba: (values.dba as string) || null,
      contact_name: (values.contact_name as string) || null,
      contact_email: (values.email as string) || (values.contact_email as string) || null,
      contact_phone: (values.phone as string) || (values.contact_phone as string) || null,
      tax_id: (values.tax_id as string) || null,
      status: "pending",
      notes: (values.services as string) || (values.notes as string) || null,
      form_template_id: template?.id ?? null,
      form_responses: values,
    };
    const { error } = await sb.from("vendors").insert(insert);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md p-8 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600" />
          <h1 className="font-serif text-2xl mt-4">Registration received.</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Procurement will follow up with next steps.
          </p>
        </Card>
      </div>
    );
  }

  const sections = template?.schema?.sections ?? [
    { title: "Business", fields: [
      { key: "legal_name", label: "Legal business name", type: "text", required: true },
      { key: "dba", label: "DBA", type: "text" },
    ]},
    { title: "Contact", fields: [
      { key: "contact_name", label: "Contact name", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel" },
    ]},
    { title: "Services", fields: [{ key: "services", label: "Services offered", type: "textarea" }]},
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-10 flex items-start gap-4">
          <Briefcase className="h-8 w-8 text-primary" />
          <div>
            <h1 className="font-serif text-3xl tracking-tight">{template?.name ?? "Vendor & contractor registration"}</h1>
            <p className="text-muted-foreground mt-2">
              {template?.description ?? "Register your business to be considered for city contracts and procurement opportunities."}
            </p>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-6">
            {sections.map((sec, si) => (
              <div key={si} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{sec.title}</h2>
                <div className="grid grid-cols-2 gap-3">
                  {sec.fields.map((f) => (
                    <div key={f.key} className={f.type === "textarea" ? "col-span-2" : ""}>
                      <Label>{f.label}{f.required ? " *" : ""}</Label>
                      {f.type === "textarea" ? (
                        <Textarea rows={4} required={f.required} value={(values[f.key] as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                      ) : f.type === "boolean" ? (
                        <label className="flex items-center gap-2 text-sm h-10"><input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} /> Yes</label>
                      ) : f.type === "select" ? (
                        <select className="w-full border rounded-md h-10 px-3 bg-background" required={f.required} value={(values[f.key] as string) ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                          <option value="">Select…</option>
                          {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <Input type={f.type === "file" ? "text" : f.type} required={f.required} value={(values[f.key] as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                      )}
                      {f.help && <p className="text-xs text-muted-foreground mt-1">{f.help}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit registration"}</Button>
          </form>
        </Card>
      </main>
    </div>
  );
}