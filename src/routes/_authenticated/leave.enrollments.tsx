import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ShieldAlert, History } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/leave/enrollments")({
  validateSearch: (s: Record<string, unknown>) => ({
    employee: typeof s.employee === "string" ? s.employee : undefined,
    add: s.add === 1 || s.add === "1" ? 1 : undefined,
    seed: s.seed === 1 || s.seed === "1" ? 1 : undefined,
  }),
  component: LeaveEnrollmentsPage,
});

type Plan = {
  id: string;
  code: string;
  name: string;
  paid: boolean;
  worker_type_id: string | null;
  auto_enroll: boolean;
  default_opening_balance_hours: number;
  is_active: boolean;
};

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  department: string | null;
  worker_type_id: string | null;
};

type Enrollment = {
  id: string;
  employee_id: string;
  plan_id: string;
  effective_from: string;
  effective_to: string | null;
  opening_balance_hours: number;
  leave_plans: { name: string; code: string; paid: boolean } | null;
};

function LeaveEnrollmentsPage() {
  const { data: me } = useCurrentUser();
  const isHr = hasRole(me?.roles, "hr_admin");
  const qc = useQueryClient();
  const urlSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  const [empId, setEmpId] = useState<string>(urlSearch.employee ?? "");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [planDefaultsOpen, setPlanDefaultsOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);

  const employeesQ = useQuery({
    queryKey: ["hr-employees-for-leave"],
    enabled: isHr,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, department, worker_type_id")
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  const plansQ = useQuery({
    queryKey: ["leave-plans-hr"],
    enabled: isHr,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_plans")
        .select("id, code, name, paid, worker_type_id, auto_enroll, default_opening_balance_hours, is_active")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
  });

  const workerTypesQ = useQuery({
    queryKey: ["worker-types-leave"],
    enabled: isHr,
    queryFn: async () => {
      const { data, error } = await supabase.from("worker_types").select("id, name").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const enrollmentsQ = useQuery({
    queryKey: ["enrollments-for-emp", empId],
    enabled: isHr && !!empId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_leave_enrollments")
        .select("id, employee_id, plan_id, effective_from, effective_to, opening_balance_hours, leave_plans(name, code, paid)")
        .eq("employee_id", empId)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Enrollment[];
    },
  });

  const filteredEmps = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = employeesQ.data ?? [];
    if (!q) return rows.slice(0, 200);
    return rows.filter((e) => `${e.first_name} ${e.last_name} ${e.department ?? ""}`.toLowerCase().includes(q)).slice(0, 200);
  }, [employeesQ.data, search]);

  const [form, setForm] = useState({ plan_id: "", opening_balance_hours: 0, effective_from: new Date().toISOString().slice(0, 10), effective_to: "" });
  const [seedForm, setSeedForm] = useState({ plan_id: "", delta_hours: 0, mode: "add" as "add" | "set" });

  // Prefill from ?employee= and auto-open the requested dialog once, then strip
  // the flags so re-navigation to the page doesn't keep re-opening it.
  useEffect(() => {
    if (!isHr) return;
    if (!urlSearch.employee && !urlSearch.add && !urlSearch.seed) return;
    if (urlSearch.employee && urlSearch.employee !== empId) setEmpId(urlSearch.employee);
    if (urlSearch.add) setAddOpen(true);
    if (urlSearch.seed) setSeedOpen(true);
    if (urlSearch.add || urlSearch.seed) {
      navigate({
        search: { employee: urlSearch.employee ?? empId, add: undefined, seed: undefined },
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch.employee, urlSearch.add, urlSearch.seed, isHr]);

  const addEnrollment = useMutation({
    mutationFn: async () => {
      if (!empId || !form.plan_id) throw new Error("Employee and plan are required");
      const { error } = await supabase.from("employee_leave_enrollments").insert({
        employee_id: empId,
        plan_id: form.plan_id,
        opening_balance_hours: Number(form.opening_balance_hours) || 0,
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enrollment added");
      setAddOpen(false);
      setForm({ plan_id: "", opening_balance_hours: 0, effective_from: new Date().toISOString().slice(0, 10), effective_to: "" });
      qc.invalidateQueries({ queryKey: ["enrollments-for-emp", empId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const endEnrollment = useMutation({
    mutationFn: async (id: string) => {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("employee_leave_enrollments").update({ effective_to: today }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["enrollments-for-emp", empId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEnrollment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_leave_enrollments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Enrollment removed"); qc.invalidateQueries({ queryKey: ["enrollments-for-emp", empId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePlanDefaults = useMutation({
    mutationFn: async (p: { id: string; auto_enroll: boolean; default_opening_balance_hours: number; worker_type_id: string | null }) => {
      const { error } = await supabase.from("leave_plans").update({
        auto_enroll: p.auto_enroll,
        default_opening_balance_hours: p.default_opening_balance_hours,
        worker_type_id: p.worker_type_id,
      } as never).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plan updated"); qc.invalidateQueries({ queryKey: ["leave-plans-hr"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const backSeed = useMutation({
    mutationFn: async () => {
      if (!empId || !seedForm.plan_id) throw new Error("Employee and plan are required");
      const delta = Number(seedForm.delta_hours);
      if (!Number.isFinite(delta)) throw new Error("Hours must be a number");

      const { data: existing, error: readErr } = await supabase
        .from("leave_balances")
        .select("id, accrued_hours, used_hours, pending_hours")
        .eq("employee_id", empId)
        .eq("plan_id", seedForm.plan_id)
        .maybeSingle();
      if (readErr) throw readErr;

      const used = Number(existing?.used_hours ?? 0);
      const pending = Number(existing?.pending_hours ?? 0);
      const currentAccrued = Number(existing?.accrued_hours ?? 0);
      const nextAccrued = seedForm.mode === "set" ? delta + used + pending : currentAccrued + delta;
      const nextBalance = nextAccrued - used - pending;

      if (existing) {
        const { error } = await supabase
          .from("leave_balances")
          .update({ accrued_hours: nextAccrued, balance_hours: nextBalance } as never)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leave_balances").insert({
          employee_id: empId,
          plan_id: seedForm.plan_id,
          accrued_hours: nextAccrued,
          used_hours: 0,
          pending_hours: 0,
          balance_hours: nextBalance,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Balance updated");
      setSeedOpen(false);
      setSeedForm({ plan_id: "", delta_hours: 0, mode: "add" });
      qc.invalidateQueries({ queryKey: ["enrollments-for-emp", empId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!me) return <AppShell title="Leave Enrollments"><Card className="p-6">Loading…</Card></AppShell>;
  if (!isHr) {
    return (
      <AppShell title="Leave Enrollments">
        <Card className="p-8 text-center text-muted-foreground">
          <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-40" />
          HR admins only.
        </Card>
      </AppShell>
    );
  }

  const selectedEmp = employeesQ.data?.find((e) => e.id === empId) ?? null;
  const availablePlans = (plansQ.data ?? []).filter((p) => p.is_active);

  return (
    <AppShell title="Leave Enrollments">
      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm">Employees</h3>
            <Button size="sm" variant="outline" onClick={() => setPlanDefaultsOpen(true)}>Plan defaults</Button>
          </div>
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="mt-2 max-h-[70vh] overflow-y-auto divide-y">
            {filteredEmps.map((e) => (
              <button key={e.id} onClick={() => setEmpId(e.id)}
                className={`w-full text-left px-2 py-2 text-sm hover:bg-muted/50 ${empId === e.id ? "bg-muted" : ""}`}>
                <div className="font-medium">{e.last_name}, {e.first_name}</div>
                <div className="text-xs text-muted-foreground">{e.department ?? "—"}</div>
              </button>
            ))}
            {filteredEmps.length === 0 && <p className="p-3 text-xs text-muted-foreground">No employees.</p>}
          </div>
        </Card>

        <div>
          {!selectedEmp && (
            <Card className="p-10 text-center text-muted-foreground">
              Select an employee to manage their leave enrollments.
            </Card>
          )}

          {selectedEmp && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold">{selectedEmp.first_name} {selectedEmp.last_name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedEmp.department ?? "—"} · Worker type: {workerTypesQ.data?.find((w) => w.id === selectedEmp.worker_type_id)?.name ?? "unset"}
                  </p>
                </div>
                <div className="flex gap-2">
                <Dialog open={seedOpen} onOpenChange={setSeedOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><History className="h-4 w-4 mr-1" /> Back-seed balance</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Back-seed leave balance</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Adjusts the running balance for a plan the employee is already enrolled in — for migrations, corrections, or manual grants.
                      </p>
                      <div>
                        <Label>Plan</Label>
                        <Select value={seedForm.plan_id} onValueChange={(v) => setSeedForm({ ...seedForm, plan_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            {(enrollmentsQ.data ?? []).map((r) => (
                              <SelectItem key={r.plan_id} value={r.plan_id}>{r.leave_plans?.name ?? r.plan_id}</SelectItem>
                            ))}
                            {(enrollmentsQ.data?.length ?? 0) === 0 && availablePlans.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Mode</Label>
                        <Select value={seedForm.mode} onValueChange={(v) => setSeedForm({ ...seedForm, mode: v as "add" | "set" })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="add">Add / subtract hours</SelectItem>
                            <SelectItem value="set">Set current balance to…</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{seedForm.mode === "set" ? "New balance (hours)" : "Adjustment (hours, negative to deduct)"}</Label>
                        <Input type="number" step="0.25" value={seedForm.delta_hours}
                          onChange={(e) => setSeedForm({ ...seedForm, delta_hours: Number(e.target.value) })} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => backSeed.mutate()}
                        disabled={!seedForm.plan_id || backSeed.isPending}>
                        {backSeed.isPending ? "Saving…" : "Apply"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add enrollment</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Enroll in leave plan</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Plan</Label>
                        <Select value={form.plan_id} onValueChange={(v) => {
                          const p = availablePlans.find((x) => x.id === v);
                          setForm({ ...form, plan_id: v, opening_balance_hours: p?.default_opening_balance_hours ?? 0 });
                        }}>
                          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            {availablePlans.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} {p.paid ? "" : "(unpaid)"}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Opening balance (hours)</Label>
                        <Input type="number" step="0.25" value={form.opening_balance_hours}
                          onChange={(e) => setForm({ ...form, opening_balance_hours: Number(e.target.value) })} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Effective from</Label>
                          <Input type="date" value={form.effective_from}
                            onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
                        </div>
                        <div>
                          <Label>Effective to (optional)</Label>
                          <Input type="date" value={form.effective_to}
                            onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => addEnrollment.mutate()}
                        disabled={!form.plan_id || !form.effective_from || addEnrollment.isPending}>
                        {addEnrollment.isPending ? "Saving…" : "Save"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                </div>
              </div>

              <Card className="divide-y">
                {(enrollmentsQ.data ?? []).map((r) => {
                  const active = !r.effective_to || r.effective_to >= new Date().toISOString().slice(0, 10);
                  return (
                    <div key={r.id} className="p-3 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium">{r.leave_plans?.name ?? r.plan_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.effective_from} → {r.effective_to ?? "—"} · Opening {Number(r.opening_balance_hours).toFixed(2)}h
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={active ? "default" : "outline"}>{active ? "active" : "ended"}</Badge>
                        {active && (
                          <Button size="sm" variant="outline" onClick={() => endEnrollment.mutate(r.id)}>End today</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => removeEnrollment.mutate(r.id)}>Delete</Button>
                      </div>
                    </div>
                  );
                })}
                {(enrollmentsQ.data?.length ?? 0) === 0 && (
                  <p className="p-6 text-sm text-muted-foreground text-center">No enrollments yet.</p>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      <Dialog open={planDefaultsOpen} onOpenChange={setPlanDefaultsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Auto-enrollment defaults</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-2">
            New hires are automatically enrolled in every active plan flagged "auto-enroll" whose worker type matches theirs (or applies to all worker types). Opening balance comes from the plan default.
          </p>
          <div className="divide-y max-h-[60vh] overflow-y-auto">
            {(plansQ.data ?? []).map((p) => (
              <div key={p.id} className="py-3 grid grid-cols-[1fr_auto_auto_auto] items-end gap-3">
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.code} {p.is_active ? "" : "(inactive)"}</div>
                </div>
                <div>
                  <Label className="text-xs">Worker type</Label>
                  <Select value={p.worker_type_id ?? "__all"} onValueChange={(v) => updatePlanDefaults.mutate({
                    id: p.id, auto_enroll: p.auto_enroll,
                    default_opening_balance_hours: p.default_opening_balance_hours,
                    worker_type_id: v === "__all" ? null : v,
                  })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All worker types</SelectItem>
                      {(workerTypesQ.data ?? []).map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Opening hrs</Label>
                  <Input type="number" step="0.25" className="w-24" defaultValue={p.default_opening_balance_hours}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== p.default_opening_balance_hours) {
                        updatePlanDefaults.mutate({
                          id: p.id, auto_enroll: p.auto_enroll,
                          default_opening_balance_hours: v, worker_type_id: p.worker_type_id,
                        });
                      }
                    }} />
                </div>
                <div className="pb-1">
                  <Button size="sm" variant={p.auto_enroll ? "default" : "outline"}
                    onClick={() => updatePlanDefaults.mutate({
                      id: p.id, auto_enroll: !p.auto_enroll,
                      default_opening_balance_hours: p.default_opening_balance_hours,
                      worker_type_id: p.worker_type_id,
                    })}>
                    {p.auto_enroll ? "Auto-enroll: on" : "Auto-enroll: off"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}