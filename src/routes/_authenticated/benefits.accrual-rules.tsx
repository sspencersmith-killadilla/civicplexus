import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, ShieldAlert, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { runMonthlyAccruals } from "@/lib/leave.functions";

export const Route = createFileRoute("/_authenticated/benefits/accrual-rules")({
  component: AccrualRulesPage,
});

type Plan = { id: string; code: string; name: string; is_active: boolean };
type WorkerType = { id: string; name: string };
type Rule = {
  id: string;
  plan_id: string;
  worker_type_id: string | null;
  min_months_service: number;
  max_months_service: number | null;
  accrual_hours: number;
  frequency: "per_pay_period" | "monthly" | "annually";
  max_balance_hours: number | null;
  is_active: boolean;
  notes: string | null;
};

const FREQS = [
  { v: "monthly", label: "Monthly" },
  { v: "per_pay_period", label: "Per pay period (~biweekly)" },
  { v: "annually", label: "Annually" },
] as const;

function AccrualRulesPage() {
  const { data: me } = useCurrentUser();
  const isHr = hasRole(me?.roles, "hr_admin");
  const qc = useQueryClient();
  const runNow = useServerFn(runMonthlyAccruals);

  const [planFilter, setPlanFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);

  const plansQ = useQuery({
    queryKey: ["accrual-plans"],
    enabled: isHr,
    queryFn: async () => {
      const { data, error } = await supabase.from("leave_plans")
        .select("id, code, name, is_active").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const workerTypesQ = useQuery({
    queryKey: ["accrual-worker-types"],
    enabled: isHr,
    queryFn: async () => {
      const { data, error } = await supabase.from("worker_types")
        .select("id, name").order("sort_order");
      if (error) throw error;
      return (data ?? []) as WorkerType[];
    },
  });

  const rulesQ = useQuery({
    queryKey: ["accrual-rules", planFilter],
    enabled: isHr,
    queryFn: async () => {
      let q = supabase.from("leave_accrual_rules")
        .select("id, plan_id, worker_type_id, min_months_service, max_months_service, accrual_hours, frequency, max_balance_hours, is_active, notes")
        .order("plan_id").order("worker_type_id", { nullsFirst: true }).order("min_months_service");
      if (planFilter !== "all") q = q.eq("plan_id", planFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Rule[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (r: Partial<Rule> & { plan_id: string }) => {
      const payload = {
        plan_id: r.plan_id,
        worker_type_id: r.worker_type_id ?? null,
        min_months_service: Number(r.min_months_service ?? 0),
        max_months_service: r.max_months_service === null || r.max_months_service === undefined ? null : Number(r.max_months_service),
        accrual_hours: Number(r.accrual_hours ?? 0),
        frequency: r.frequency ?? "monthly",
        max_balance_hours: r.max_balance_hours === null || r.max_balance_hours === undefined ? null : Number(r.max_balance_hours),
        is_active: r.is_active ?? true,
        notes: r.notes ?? null,
      };
      if (r.id) {
        const { error } = await supabase.from("leave_accrual_rules").update(payload as never).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leave_accrual_rules").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Rule saved");
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["accrual-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leave_accrual_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accrual-rules"] }); toast.success("Rule deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const runNowM = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (r) => toast.success(`Accrual complete — updated ${r.updated}, skipped ${r.skipped_not_due + r.skipped_no_rule}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const planName = useMemo(() => {
    const m = new Map((plansQ.data ?? []).map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? id;
  }, [plansQ.data]);
  const workerName = useMemo(() => {
    const m = new Map((workerTypesQ.data ?? []).map((w) => [w.id, w.name]));
    return (id: string | null) => (id ? m.get(id) ?? id : "All worker types");
  }, [workerTypesQ.data]);

  if (!me) return <AppShell title="Accrual Rules"><Card className="p-6">Loading…</Card></AppShell>;
  if (!isHr) {
    return (
      <AppShell title="Accrual Rules">
        <Card className="p-8 text-center text-muted-foreground">
          <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-40" /> HR admins only.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Leave Accrual Rules">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link to="/benefits"><Button size="sm" variant="ghost"><ArrowLeft className="h-4 w-4 mr-1" /> Benefits</Button></Link>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All leave plans</SelectItem>
              {(plansQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => runNowM.mutate()} disabled={runNowM.isPending}>
            <Play className="h-4 w-4 mr-1" /> {runNowM.isPending ? "Running…" : "Run accruals now"}
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add rule</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing?.id ? "Edit rule" : "New accrual rule"}</DialogTitle></DialogHeader>
              <RuleForm
                initial={editing}
                plans={plansQ.data ?? []}
                workerTypes={workerTypesQ.data ?? []}
                onSubmit={(v) => upsert.mutate({ ...v, id: editing?.id })}
                saving={upsert.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        The monthly cron matches each active enrollment to the best rule for its plan by worker type and length of service (longer tenure wins over "all worker types"; higher service-months tier wins over lower). Balances are updated once per period based on the rule's frequency.
      </p>

      <Card className="divide-y">
        {(rulesQ.data ?? []).map((r) => (
          <div key={r.id} className="p-3 flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium">{planName(r.plan_id)}</div>
              <div className="text-xs text-muted-foreground">
                {workerName(r.worker_type_id)} · {r.min_months_service}
                {r.max_months_service !== null ? `–${r.max_months_service}` : "+"} months of service
              </div>
              <div className="text-xs mt-1">
                <Badge variant="secondary" className="mr-2">{r.accrual_hours}h / {r.frequency.replace("_", " ")}</Badge>
                {r.max_balance_hours !== null && <Badge variant="outline" className="mr-2">cap {r.max_balance_hours}h</Badge>}
                {!r.is_active && <Badge variant="outline">inactive</Badge>}
              </div>
              {r.notes && <div className="text-xs text-muted-foreground mt-1">{r.notes}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => { setEditing(r); setOpen(true); }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => del.mutate(r.id)}>Delete</Button>
            </div>
          </div>
        ))}
        {(rulesQ.data?.length ?? 0) === 0 && <p className="p-6 text-center text-muted-foreground text-sm">No rules yet.</p>}
      </Card>
    </AppShell>
  );
}

function RuleForm({
  initial, plans, workerTypes, onSubmit, saving,
}: {
  initial: Rule | null;
  plans: Plan[];
  workerTypes: WorkerType[];
  onSubmit: (v: Partial<Rule> & { plan_id: string }) => void;
  saving: boolean;
}) {
  const [v, setV] = useState<Partial<Rule>>(initial ?? {
    plan_id: plans[0]?.id,
    worker_type_id: null,
    min_months_service: 0,
    max_months_service: null,
    accrual_hours: 8,
    frequency: "monthly",
    max_balance_hours: null,
    is_active: true,
    notes: null,
  });
  return (
    <div className="space-y-3">
      <div>
        <Label>Leave plan</Label>
        <Select value={v.plan_id ?? ""} onValueChange={(x) => setV({ ...v, plan_id: x })}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Worker type</Label>
        <Select value={v.worker_type_id ?? "__all"} onValueChange={(x) => setV({ ...v, worker_type_id: x === "__all" ? null : x })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All worker types</SelectItem>
            {workerTypes.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Min months of service</Label>
          <Input type="number" min={0} value={v.min_months_service ?? 0}
            onChange={(e) => setV({ ...v, min_months_service: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Max months (optional)</Label>
          <Input type="number" min={1} value={v.max_months_service ?? ""}
            onChange={(e) => setV({ ...v, max_months_service: e.target.value === "" ? null : Number(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Accrual hours per period</Label>
          <Input type="number" step="0.25" min={0} value={v.accrual_hours ?? 0}
            onChange={(e) => setV({ ...v, accrual_hours: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Frequency</Label>
          <Select value={v.frequency ?? "monthly"} onValueChange={(x) => setV({ ...v, frequency: x as Rule["frequency"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{FREQS.map((f) => <SelectItem key={f.v} value={f.v}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Max balance cap (optional, hours)</Label>
        <Input type="number" step="0.25" min={0} value={v.max_balance_hours ?? ""}
          onChange={(e) => setV({ ...v, max_balance_hours: e.target.value === "" ? null : Number(e.target.value) })} />
      </div>
      <div>
        <Label>Notes</Label>
        <Input value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value || null })} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.is_active ?? true} onChange={(e) => setV({ ...v, is_active: e.target.checked })} />
        Active
      </label>
      <DialogFooter>
        <Button disabled={!v.plan_id || saving} onClick={() => onSubmit(v as Partial<Rule> & { plan_id: string })}>
          {saving ? "Saving…" : "Save rule"}
        </Button>
      </DialogFooter>
    </div>
  );
}