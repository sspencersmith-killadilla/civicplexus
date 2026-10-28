import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { FileText, Save, ArrowLeft } from "lucide-react";
import { FormRunner } from "@/components/form-runner";
import {
  listApplicationTemplates, upsertApplicationTemplate,
} from "@/lib/application-templates.functions";

export const Route = createFileRoute("/_authenticated/admin/application-template")({
  component: TemplateAdmin,
  errorComponent: ({ error, reset }) => (
    <AppShell>
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-serif">Template unavailable</h1>
        <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        <Button size="sm" onClick={() => reset()}>Retry</Button>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => <AppShell><div className="p-6">Not found</div></AppShell>,
});

const STARTER_SCHEMA = {
  sections: [
    {
      title: "Personal information",
      fields: [
        { key: "full_name", label: "Full legal name", type: "text", required: true },
        { key: "email", label: "Email", type: "email", required: true },
        { key: "phone", label: "Phone", type: "tel" },
        { key: "address", label: "Address", type: "textarea" },
      ],
    },
    {
      title: "Eligibility",
      fields: [
        { key: "authorized_to_work", label: "Authorized to work in the U.S.", type: "boolean", required: true },
        { key: "age_18_plus", label: "18 years of age or older", type: "boolean", required: true },
      ],
    },
    {
      title: "Experience",
      fields: [
        { key: "years_experience", label: "Years of relevant experience", type: "number" },
        { key: "highest_education", label: "Highest level of education", type: "select", options: [
          { value: "hs", label: "High school / GED" },
          { value: "assoc", label: "Associate" },
          { value: "bach", label: "Bachelor's" },
          { value: "master", label: "Master's" },
          { value: "doc", label: "Doctorate" },
        ] },
      ],
    },
  ],
};

function TemplateAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listApplicationTemplates);
  const saveFn = useServerFn(upsertApplicationTemplate);

  const q = useQuery({ queryKey: ["app-templates"], queryFn: () => listFn() });
  const rows = (q.data ?? []) as any[];
  const active = rows.find((r) => r.is_active) ?? rows[0] ?? null;

  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("Standard application");
  const [schemaText, setSchemaText] = useState(JSON.stringify(STARTER_SCHEMA, null, 2));
  const [isActive, setIsActive] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (active) {
      setId(active.id);
      setName(active.name);
      setSchemaText(JSON.stringify(active.schema ?? { sections: [] }, null, 2));
      setIsActive(!!active.is_active);
    }
  }, [active?.id]);

  let parsedSchema: any = null;
  try { parsedSchema = JSON.parse(schemaText); } catch (e) { /* handled in save */ }

  const save = useMutation({
    mutationFn: async () => {
      let schema: any;
      try { schema = JSON.parse(schemaText); }
      catch (e: any) { setParseError(e.message); throw new Error("Schema JSON is invalid"); }
      setParseError(null);
      return saveFn({ data: { id, name, schema, is_active: isActive } });
    },
    onSuccess: () => { toast.success("Template saved"); qc.invalidateQueries({ queryKey: ["app-templates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Link to="/settings" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Settings
        </Link>
        <div>
          <h1 className="text-2xl font-serif tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6" /> Application template
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            City-wide base application. Every job posting reuses this template; add position-specific questions on the job itself.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Editor</h2>
              <div className="flex items-center gap-2">
                <Label htmlFor="active" className="text-xs">Active</Label>
                <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
            <div>
              <Label>Template name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Schema (JSON)</Label>
              <Textarea
                value={schemaText}
                onChange={(e) => setSchemaText(e.target.value)}
                className="font-mono text-xs min-h-[420px]"
              />
              {parseError && <p className="text-xs text-destructive mt-1">JSON error: {parseError}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                Sections contain fields: <code>text</code>, <code>textarea</code>, <code>email</code>, <code>tel</code>, <code>date</code>, <code>number</code>, <code>select</code>, <code>boolean</code>. Select fields need <code>options: [{"{value, label}"}]</code>.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setId(null); setName("New template"); setSchemaText(JSON.stringify(STARTER_SCHEMA, null, 2)); setIsActive(false); }}>New</Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="h-4 w-4 mr-1" /> {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Live preview</h2>
            {parsedSchema ? (
              <FormRunner
                schema={parsedSchema}
                requiresSignature={false}
                onSubmit={() => toast.message("Preview only — not saved")}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Fix schema JSON to see preview.</p>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}