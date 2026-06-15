import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, FileText, FileSignature } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/preboarding")({
  component: PreboardingPage,
});

function PreboardingPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();

  const { data: emp } = useQuery({
    queryKey: ["my-employee", me?.user.id],
    enabled: !!me?.user.id,
    queryFn: async () => (await supabase.from("employees").select("*").eq("user_id", me!.user.id).maybeSingle()).data,
  });

  const { data: instance } = useQuery({
    queryKey: ["my-instance", emp?.id],
    enabled: !!emp?.id,
    queryFn: async () => (await supabase.from("onboarding_instances").select("*").eq("employee_id", emp!.id).order("started_at", { ascending: false }).limit(1).maybeSingle()).data,
  });

  const { data: tasks } = useQuery({
    queryKey: ["my-tasks", instance?.id],
    enabled: !!instance?.id,
    queryFn: async () => (await supabase.from("task_instances").select("*").eq("onboarding_instance_id", instance!.id).order("sort_order")).data,
  });

  const toggle = useMutation({
    mutationFn: async (t: { id: string; status: string }) => {
      const next = t.status === "complete" ? "pending" : "complete";
      const { error } = await supabase.from("task_instances").update({
        status: next, completed_at: next === "complete" ? new Date().toISOString() : null,
      }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-tasks", instance?.id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!emp) {
    return (
      <AppShell title="My Onboarding">
        <Card className="p-10 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
          <h3 className="mt-3 font-medium">No onboarding record yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Your HR team will create your record. Once they do, your pre-boarding tasks will appear here.</p>
        </Card>
      </AppShell>
    );
  }

  const done = tasks?.filter((t) => t.status === "complete").length ?? 0;
  const total = tasks?.length ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <AppShell title="My Onboarding">
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl">Welcome, {emp.first_name}</h2>
            <p className="text-sm text-muted-foreground mt-1">{emp.job_title} {emp.department && `· ${emp.department}`} {emp.start_date && `· starts ${emp.start_date}`}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-serif">{pct}%</div>
            <div className="text-xs text-muted-foreground">{done} of {total} tasks</div>
          </div>
        </div>
        <div className="mt-4 h-2 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      {!tasks?.length ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">No tasks assigned yet.</Card>
      ) : (
        <Card className="divide-y">
          {tasks.map((t) => {
            const complete = t.status === "complete";
            return (
              <button key={t.id} onClick={() => toggle.mutate({ id: t.id, status: t.status })} className="w-full text-left p-4 flex items-start gap-4 hover:bg-secondary/40 transition-colors">
                {complete ? <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" /> : <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={complete ? "line-through text-muted-foreground" : "font-medium"}>{t.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{t.category}</span>
                    {!t.is_required && <span className="text-xs px-2 py-0.5 rounded border">optional</span>}
                  </div>
                  {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                  {t.category === "forms" && t.form_definition_key && (
                    <Link to="/forms/$key" params={{ key: t.form_definition_key }} className="inline-block mt-2">
                      <Button size="sm" variant="outline"><FileSignature className="h-3 w-3 mr-1" /> Open form</Button>
                    </Link>
                  )}
                </div>
              </button>
            );
          })}
        </Card>
      )}
    </AppShell>
  );
}