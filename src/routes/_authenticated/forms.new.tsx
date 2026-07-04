import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { FormSchema } from "@/components/form-runner";
import { FormSchemaEditor, validateSchema, type FormMetadata } from "@/components/form-schema-editor";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/forms/new")({
  component: NewForm,
});

function NewForm() {
  const { data: me } = useCurrentUser();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<FormMetadata>({
    key: "", title: "", description: "", jurisdiction: "federal", version: "1", requires_signature: false,
  });
  const [schema, setSchema] = useState<FormSchema>({ sections: [{ title: "Section 1", fields: [] }] });

  const save = useMutation({
    mutationFn: async () => {
      const errs = validateSchema(meta, schema);
      if (errs.length) throw new Error(errs[0]);
      const { data, error } = await supabase.from("form_definitions").insert({
        key: meta.key, title: meta.title, description: meta.description,
        jurisdiction: meta.jurisdiction, version: meta.version,
        requires_signature: meta.requires_signature,
        schema: schema as never,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => { toast.success("Form created"); navigate({ to: "/forms/$key", params: { key: d.key } }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (me && !me.is_hr_admin) {
    return <AppShell title="New form"><p className="text-muted-foreground">HR access required.</p></AppShell>;
  }

  return (
    <AppShell title="New form">
      <div className="flex items-center justify-between mb-4">
        <Link to="/forms"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Forms library</Button></Link>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Create form</Button>
      </div>
      <FormSchemaEditor meta={meta} setMeta={setMeta} schema={schema} setSchema={setSchema} />
    </AppShell>
  );
}