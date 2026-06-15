import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, ListChecks, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Stat({ label, value, icon: Icon }: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-serif tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { data: me } = useCurrentUser();

  const { data: stats } = useQuery({
    queryKey: ["dash-stats"],
    queryFn: async () => {
      const [emp, wt, tpl, pre] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true }),
        supabase.from("worker_types").select("id", { count: "exact", head: true }),
        supabase.from("onboarding_templates").select("id", { count: "exact", head: true }),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "preboarding"),
      ]);
      return {
        employees: emp.count ?? 0,
        worker_types: wt.count ?? 0,
        templates: tpl.count ?? 0,
        preboarding: pre.count ?? 0,
      };
    },
  });

  const isHR = hasRole(me?.roles, "hr_admin");

  return (
    <AppShell title={`Welcome, ${me?.profile?.full_name?.split(" ")[0] ?? ""}`}>
      <p className="text-muted-foreground mb-6">
        {isHR ? "Here's the state of onboarding across the municipality." : "Your onboarding overview."}
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Employees" value={stats?.employees ?? "—"} icon={Users} />
        <Stat label="In pre-boarding" value={stats?.preboarding ?? "—"} icon={Clock} />
        <Stat label="Worker types" value={stats?.worker_types ?? "—"} icon={Briefcase} />
        <Stat label="Templates" value={stats?.templates ?? "—"} icon={ListChecks} />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="font-serif">Getting started</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Review the seeded <strong>Worker Types</strong> and tweak them for your municipality.</p>
          <p>2. Build an <strong>Onboarding Template</strong> for each worker type, with tasks for forms, equipment, training, and provisioning.</p>
          <p>3. Create your first <strong>Employee</strong> and start a pre-boarding instance.</p>
        </CardContent>
      </Card>
    </AppShell>
  );
}