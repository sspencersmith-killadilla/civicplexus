import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { FormRunner, type FormSchema } from "@/components/form-runner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/forms/$key")({
  component: FormDetail,
});

function FormDetail() {
  const { key } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();

  const { data: form } = useQuery({
    queryKey: ["form-def", key],
    queryFn: async () => (await supabase.from("form_definitions").select("*").eq("key", key).order("version", { ascending: false }).limit(1).maybeSingle()).data,
  });

  const { data: emp } = useQuery({
    queryKey: ["my-employee", me?.user.id],
    enabled: !!me?.user.id,
    queryFn: async () => (await supabase.from("employees").select("id,first_name,last_name").eq("user_id", me!.user.id).maybeSingle()).data,
  });

  const submit = useMutation({
    mutationFn: async ({ data, sig }: { data: Record<string, unknown>; sig: { name: string; data: string } | null }) => {
      if (!form) throw new Error("Form not loaded");
      if (!emp) throw new Error("No employee record linked to your account — ask HR to link you.");
      const { data: sub, error } = await supabase.from("form_submissions").insert({
        form_definition_id: form.id, employee_id: emp.id, data, status: "submitted", submitted_at: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      if (sig) {
        const { error: se } = await supabase.from("signatures").insert({
          form_submission_id: sub.id, signer_user_id: me!.user.id, signer_name: sig.name,
          signature_data: sig.data, signature_type: "typed", user_agent: navigator.userAgent,
        });
        if (se) throw se;
      }
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Submitted and signed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!form) return <AppShell title="Form"><p className="text-muted-foreground">Loading…</p></AppShell>;

  return (
    <AppShell title={form.title}>
      <Link to="/forms"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="h-4 w-4 mr-1" /> Forms library</Button></Link>
      {form.description && <p className="text-muted-foreground mb-6 max-w-2xl">{form.description}</p>}
      <FormRunner
        schema={form.schema as unknown as FormSchema}
        requiresSignature={form.requires_signature}
        signerNameDefault={emp ? `${emp.first_name} ${emp.last_name}` : me?.profile?.full_name ?? ""}
        submitting={submit.isPending}
        onSubmit={(data, sig) => submit.mutate({ data, sig })}
      />
    </AppShell>
  );
}