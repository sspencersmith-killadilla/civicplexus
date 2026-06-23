import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, GraduationCap, ScrollText, ShieldAlert, Plus } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/my-hr")({ component: MyHR });

function MyHR() {
  const { data: me } = useCurrentUser();

  const empQ = useQuery({
    queryKey: ["me-employee", me?.user?.id],
    enabled: !!me?.user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("employees")
        .select("id, first_name, last_name, job_title, department, start_date, status")
        .eq("user_id", me!.user!.id).maybeSingle();
      return data;
    },
  });

  const balancesQ = useQuery({
    queryKey: ["my-balances", empQ.data?.id],
    enabled: !!empQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("leave_balances")
        .select("balance_hours, pending_hours, accrued_hours, used_hours, leave_plans(name, code, paid)")
        .eq("employee_id", empQ.data!.id);
      return (data ?? []) as Array<{ balance_hours: number; pending_hours: number; accrued_hours: number; used_hours: number; leave_plans: { name: string; code: string; paid: boolean } }>;
    },
  });

  const reqsQ = useQuery({
    queryKey: ["my-leave-requests", empQ.data?.id],
    enabled: !!empQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("leave_requests")
        .select("id, start_date, end_date, total_hours, status, leave_plans(name)")
        .eq("employee_id", empQ.data!.id)
        .order("start_date", { ascending: false }).limit(10);
      return (data ?? []) as Array<{ id: string; start_date: string; end_date: string; total_hours: number; status: string; leave_plans: { name: string } }>;
    },
  });

  const trainingQ = useQuery({
    queryKey: ["my-training", empQ.data?.id],
    enabled: !!empQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("employee_training")
        .select("id, status, due_date, courses(name)")
        .eq("employee_id", empQ.data!.id).neq("status", "complete").order("due_date", { ascending: true }).limit(5);
      return (data ?? []) as Array<{ id: string; status: string; due_date: string | null; courses: { name: string } }>;
    },
  });

  const acksQ = useQuery({
    queryKey: ["my-acks", me?.user?.id],
    enabled: !!me?.user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("policies")
        .select("id, title")
        .order("updated_at", { ascending: false }).limit(5);
      return (data ?? []) as Array<{ id: string; title: string }>;
    },
  });

  return (
    <AppShell title="My HR">
      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="text-lg font-medium">Welcome{empQ.data ? `, ${empQ.data.first_name}` : ""}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {empQ.data ? `${empQ.data.job_title ?? "—"} · ${empQ.data.department ?? "—"}` : "Loading your profile…"}
          </p>
        </Card>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Leave balances</h3>
            <Link to="/leave"><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Request leave</Button></Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(balancesQ.data ?? []).map((b, i) => (
              <Card key={i} className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{b.leave_plans.name}</div>
                <div className="text-2xl font-semibold mt-1">{Number(b.balance_hours).toFixed(1)}h</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {Number(b.pending_hours) > 0 && <span>{Number(b.pending_hours).toFixed(1)}h pending · </span>}
                  {Number(b.used_hours).toFixed(1)}h used YTD
                </div>
              </Card>
            ))}
            {(balancesQ.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No leave plans yet. Ask HR to enroll you.</p>
            )}
          </div>
        </section>

        <section>
          <h3 className="font-medium mb-3 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Recent leave requests</h3>
          <Card className="divide-y">
            {(reqsQ.data ?? []).map((r) => (
              <Link key={r.id} to="/leave/$id" params={{ id: r.id }} className="block p-3 hover:bg-muted/40">
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="font-medium">{r.leave_plans.name}</span>
                    <span className="text-muted-foreground ml-2">{r.start_date} → {r.end_date} · {Number(r.total_hours).toFixed(1)}h</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted">{r.status}</span>
                </div>
              </Link>
            ))}
            {(reqsQ.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">No requests yet.</p>}
          </Card>
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h3 className="font-medium mb-3 flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" /> Training due</h3>
            <Card className="divide-y">
              {(trainingQ.data ?? []).map((t) => (
                <div key={t.id} className="p-3 text-sm flex justify-between">
                  <span>{t.courses.name}</span>
                  <span className="text-muted-foreground text-xs">{t.due_date ?? "no due date"} · {t.status}</span>
                </div>
              ))}
              {(trainingQ.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">All current.</p>}
            </Card>
          </section>
          <section>
            <h3 className="font-medium mb-3 flex items-center gap-2"><ScrollText className="h-4 w-4 text-primary" /> Policies to review</h3>
            <Card className="divide-y">
              {(acksQ.data ?? []).map((p) => (
                <Link key={p.id} to="/policies/$id" params={{ id: p.id }} className="block p-3 text-sm hover:bg-muted/40">{p.title}</Link>
              ))}
              {(acksQ.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">No policies.</p>}
            </Card>
          </section>
        </div>

        <section>
          <h3 className="font-medium mb-3 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /> Quick links</h3>
          <div className="flex flex-wrap gap-2">
            <Link to="/grievances"><Button size="sm" variant="outline">File a grievance</Button></Link>
            <Link to="/policies"><Button size="sm" variant="outline">All policies</Button></Link>
            <Link to="/documents"><Button size="sm" variant="outline">My documents</Button></Link>
            <Link to="/internal-careers"><Button size="sm" variant="outline">Internal jobs</Button></Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}