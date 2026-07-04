import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { FormSchema } from "@/components/form-runner";
import { FormSchemaEditor, validateSchema, type FormMetadata } from "@/components/form-schema-editor";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/forms/$key/edit")({
  component: EditForm,
});

function EditForm() {
  const { key } = Route.useParams();
  const { data: me } = useCurrentUser();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<FormMetadata | null>(null);
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [asNewVersion, setAsNewVersion] = useState(false);
  const [originalId, setOriginalId] = useState<string | null>(null);

  const { data: form } = useQuery({
    queryKey: ["form-def-edit", key],
    queryFn: async () => (await supabase.from("form_definitions").select("*").eq("key", key).order("version", { ascending: false }).limit(1).maybeSingle()).data,
  });

  useEffect(() => {
    if (form && !meta) {
      setOriginalId(form.id);
      setMeta({
        key: form.key, title: form.title, description: form.description ?? "",
        jurisdiction: form.jurisdiction ?? "federal", version: String(form.version),
        requires_signature: form.requires_signature,
      });
      setSchema(form.schema as unknown as FormSchema);
    }
  }, [form, meta]);

  const save = useMutation({
    mutationFn: async () => {
      if (!meta || !schema || !originalId) throw new Error("Not loaded");
      const errs = validateSchema(meta, schema);
      if (errs.length) throw new Error(errs[0]);
      if (asNewVersion) {
        const nextV = String((parseInt(String(form?.version ?? "1"), 10) || 1) + 1);
        const { data, error } = await supabase.from("form_definitions").insert({
          key: meta.key, title: meta.title, description: meta.description,
          jurisdiction: meta.jurisdiction, version: nextV,
          requires_signature: meta.requires_signature, schema: schema as never,
        }).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("form_definitions").update({
        title: meta.title, description: meta.description,
        jurisdiction: meta.jurisdiction, version: meta.version,
        requires_signature: meta.requires_signature, schema: schema as never,
      }).eq("id", originalId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => { toast.success("Saved"); navigate({ to: "/forms/$key", params: { key: d.key } }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (me && !me.is_hr_admin) {
    return <AppShell title="Edit form"><p className="text-muted-foreground">HR access required.</p></AppShell>;
  }
  if (!meta || !schema) return <AppShell title="Edit form"><p className="text-muted-foreground">Loading…</p></AppShell>;

  return (
    <AppShell title={`Edit: ${meta.title}`}>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <Link to="/forms"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Forms library</Button></Link>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={asNewVersion} onCheckedChange={setAsNewVersion} />
            <Label className="cursor-pointer">Save as new version</Label>
          </label>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </div>
      </div>
      <FormSchemaEditor meta={meta} setMeta={setMeta} schema={schema} setSchema={setSchema} keyLocked />
    </AppShell>
  );
}