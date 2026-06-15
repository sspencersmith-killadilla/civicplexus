import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { FileSignature, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/forms/")({
  component: FormsLibrary,
});

function FormsLibrary() {
  const { data: forms } = useQuery({
    queryKey: ["form-defs"],
    queryFn: async () => (await supabase.from("form_definitions").select("*").order("title")).data,
  });

  return (
    <AppShell title="Forms Library">
      <p className="text-muted-foreground mb-6 max-w-2xl">Reusable form definitions — federal, state, and municipal. Reference these from any onboarding template task; submissions are captured per employee with audit-grade e-signatures.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {forms?.map((f) => (
          <Card key={f.id} className="p-5">
            <div className="flex items-start justify-between">
              <FileSignature className="h-5 w-5 text-primary" />
              <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{f.jurisdiction}</span>
            </div>
            <h3 className="mt-3 font-medium">{f.title}</h3>
            <p className="text-sm text-muted-foreground mt-1 min-h-[2.5rem]">{f.description}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {f.requires_signature && <ShieldCheck className="h-3 w-3" />}
                {f.key} · v{f.version}
              </span>
              <Link to="/forms/$key" params={{ key: f.key }}>
                <Button size="sm" variant="outline">Preview</Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}