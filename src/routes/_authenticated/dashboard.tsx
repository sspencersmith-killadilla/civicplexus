import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, ListChecks, Clock, FileSignature, FolderLock, Server, ClipboardCheck, AlertTriangle, MessagesSquare, Target, HelpCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

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
  const uid = me?.user.id;

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

  // Manager panel: only for users with direct reports
  const teamQ = useQuery({
    enabled: !!uid,
    queryKey: ["manager-team", uid],
    queryFn: async () => {
      const { data: meEmp } = await supabase.from("employees").select("id").eq("user_id", uid!).maybeSingle();
      if (!meEmp) return null;
      const myEmpId = (meEmp as { id: string }).id;
      const { data: reports } = await supabase.from("employees").select("id, first_name, last_name").eq("manager_id", myEmpId);
      if (!reports?.length) return null;
      const ids = reports.map((r) => r.id);
      const [reviews, goals, sessions] = await Promise.all([
        supabase.from("performance_reviews").select("id, status, employee_id").in("employee_id", ids).neq("status", "finalized"),
        supabase.from("goals").select("id, status, owner_employee_id, title").in("owner_employee_id", ids).in("status", ["at_risk", "active"]),
        supabase.from("one_on_ones").select("id, employee_id, scheduled_at").in("employee_id", ids).order("scheduled_at", { ascending: false }),
      ]);
      const cutoff = Date.now() - 30 * 86400000;
      const lastByEmp = new Map<string, number>();
      for (const s of (sessions.data ?? []) as Array<{ employee_id: string; scheduled_at: string | null }>) {
        if (!s.scheduled_at) continue;
        const t = new Date(s.scheduled_at).getTime();
        if (!lastByEmp.has(s.employee_id) || (lastByEmp.get(s.employee_id) ?? 0) < t) lastByEmp.set(s.employee_id, t);
      }
      const overdueOneOnOnes = reports.filter((r) => (lastByEmp.get(r.id) ?? 0) < cutoff);
      const atRiskGoals = (goals.data ?? []).filter((g) => g.status === "at_risk");
      const pendingReviews = reviews.data ?? [];
      return { reports, overdueOneOnOnes, atRiskGoals, pendingReviews };
    },
  });
  const team = teamQ.data;

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

      {team && (
        <Card className="mt-8">
          <CardHeader><CardTitle className="font-serif">My team — Performance</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/reviews" className="border rounded p-3 hover:bg-secondary/40">
              <ClipboardCheck className="h-4 w-4 text-primary mb-2" />
              <p className="text-2xl font-serif">{team.pendingReviews.length}</p>
              <p className="text-xs text-muted-foreground">Open reviews</p>
            </Link>
            <Link to="/goals" className="border rounded p-3 hover:bg-secondary/40">
              <AlertTriangle className="h-4 w-4 text-amber-600 mb-2" />
              <p className="text-2xl font-serif">{team.atRiskGoals.length}</p>
              <p className="text-xs text-muted-foreground">Goals at risk</p>
            </Link>
            <Link to="/one-on-ones" className="border rounded p-3 hover:bg-secondary/40">
              <MessagesSquare className="h-4 w-4 text-primary mb-2" />
              <p className="text-2xl font-serif">{team.overdueOneOnOnes.length}</p>
              <p className="text-xs text-muted-foreground">Overdue 1:1s (&gt;30 days)</p>
            </Link>
            <Link to="/employees" className="border rounded p-3 hover:bg-secondary/40">
              <Target className="h-4 w-4 text-primary mb-2" />
              <p className="text-2xl font-serif">{team.reports.length}</p>
              <p className="text-xs text-muted-foreground">Direct reports</p>
            </Link>
          </CardContent>
        </Card>
      )}

      {isHR && (
        <div className="mt-8 grid sm:grid-cols-3 gap-4">
          <FeatureCard to="/forms" helpAnchor="forms-library" icon={FileSignature} title="Forms Library" desc="I-9, W-4, direct deposit, emergency contact — versioned and signable." />
          <FeatureCard to="/documents" helpAnchor="document-vault" icon={FolderLock} title="Document Vault" desc="Encrypted private storage with signed-URL access for IDs and certs." />
          <FeatureCard to="/provisioning" helpAnchor="it-provisioning" icon={Server} title="IT Provisioning" desc="Kanban for accounts, badges, equipment — ready to wire to Entra/Okta." />
        </div>
      )}
    </AppShell>
  );
}

function FeatureCard({ to, helpAnchor, icon: Icon, title, desc }: { to: string; helpAnchor: string; icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <Card className="p-5 hover:bg-secondary/40 transition-colors h-full relative group">
      <Link to={to} className="block">
        <Icon className="h-5 w-5 text-primary" />
        <h3 className="mt-3 font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{desc}</p>
      </Link>
      <Link
        to="/help"
        hash={helpAnchor}
        aria-label={`Help for ${title}`}
        title="Read the manual section"
        className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10 transition"
      >
        <HelpCircle className="h-4 w-4" />
      </Link>
    </Card>
  );
}