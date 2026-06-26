import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr-finance")({ component: HrFinancePage });

type BudgetRow = {
  department: string | null;
  total_positions: number | null;
  budgeted_fte: number | null;
  filled_count: number | null;
  vacant_count: number | null;
};

function HrFinancePage() {
  const qc = useQueryClient();
  const currentFy = new Date().getMonth() + 1 >= 10 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  const [fy, setFy] = useState(currentFy);

  const headcountQ = useQuery({
    queryKey: ["position_headcount"],
    queryFn: async () => {
      const { data, error } = await supabase.from("position_headcount").select("*").order("department");
      if (error) throw error;
      return (data ?? []) as BudgetRow[];
    },
  });
  const budgetsQ = useQuery({
    queryKey: ["position_budgets", fy],
    queryFn: async () => {
      const { data, error } = await supabase.from("position_budgets").select("*").eq("fiscal_year", fy);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [form, setForm] = useState({ department: "", budgeted_fte: "", budgeted_amount: "", notes: "" });
  const upsert = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("position_budgets").upsert({
        department: form.department,
        fiscal_year: fy,
        budgeted_fte: Number(form.budgeted_fte || 0),
        budgeted_amount: form.budgeted_amount ? Number(form.budgeted_amount) : null,
        notes: form.notes || null,
      } as never, { onConflict: "department,fiscal_year" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Budget saved");
      setForm({ department: "", budgeted_fte: "", budgeted_amount: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["position_budgets", fy] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = headcountQ.data ?? [];

  const totals = rows.reduce(
    (acc, r) => {
      acc.positions += r.total_positions ?? 0;
      acc.fte += Number(r.budgeted_fte ?? 0);
      acc.filled += r.filled_count ?? 0;
      acc.vacant += r.vacant_count ?? 0;
      return acc;
    },
    { positions: 0, fte: 0, filled: 0, vacant: 0 },
  );

  const overBudgetDepts = rows.filter((r) => {
    const filled = r.filled_count ?? 0;
    const dept = r.department ?? "";
    const budgetRow = (budgetsQ.data ?? []).find((b: { department: string }) => b.department === dept);
    const budget = budgetRow ? Number(budgetRow.budgeted_fte) : Number(r.budgeted_fte ?? 0);
    return budget > 0 && filled > budget;
  });

  return (
    <AppShell title="HR / Finance — Position Budgets">
      <p className="text-sm text-muted-foreground mb-6">
        Budgeted FTE vs filled headcount by department. Overbudget departments are flagged for review before new requisitions are approved.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Budgeted FTE" value={totals.fte.toFixed(2)} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Filled" value={totals.filled.toString()} icon={<TrendingUp className="h-4 w-4" />} accent="good" />
        <StatCard label="Vacant" value={totals.vacant.toString()} icon={<TrendingDown className="h-4 w-4" />} accent="warn" />
        <StatCard label="Over-budget departments" value={overBudgetDepts.length.toString()} icon={<AlertTriangle className="h-4 w-4" />} accent={overBudgetDepts.length > 0 ? "bad" : undefined} />
      </div>

      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium">FY {fy} Position budgets</h3>
            <p className="text-xs text-muted-foreground">Fiscal year cap per department. Requisitions are blocked when departmental headcount would exceed budgeted FTE.</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">FY</Label>
            <Input type="number" value={fy} onChange={(e) => setFy(Number(e.target.value))} className="w-24" />
            <Dialog>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add budget</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>FY {fy} budget</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Police" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Budgeted FTE</Label><Input type="number" step="0.25" value={form.budgeted_fte} onChange={(e) => setForm({ ...form, budgeted_fte: e.target.value })} /></div>
                    <div><Label>Budgeted $</Label><Input type="number" value={form.budgeted_amount} onChange={(e) => setForm({ ...form, budgeted_amount: e.target.value })} /></div>
                  </div>
                  <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                </div>
                <DialogFooter><Button disabled={!form.department || !form.budgeted_fte || upsert.isPending} onClick={() => upsert.mutate()}><Save className="h-4 w-4 mr-1" />Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Department</TableHead><TableHead className="text-right">Budgeted FTE</TableHead><TableHead className="text-right">Budgeted $</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
          <TableBody>
            {(budgetsQ.data ?? []).map((b: any) => (
              <TableRow key={b.id}><TableCell className="font-medium">{b.department}</TableCell><TableCell className="text-right">{Number(b.budgeted_fte).toFixed(2)}</TableCell><TableCell className="text-right">{b.budgeted_amount ? `$${Number(b.budgeted_amount).toLocaleString()}` : "—"}</TableCell><TableCell className="text-xs">{b.notes ?? ""}</TableCell></TableRow>
            ))}
            {(budgetsQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No budgets set for FY {fy}.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      {overBudgetDepts.length > 0 && (
        <Card className="p-4 mb-6 border-amber-500/30 bg-amber-500/5">
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Over-budget departments
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            These departments have more filled positions than budgeted FTE. Consider freezing requisitions or adjusting budgets.
          </p>
          <div className="flex flex-wrap gap-2">
            {overBudgetDepts.map((d) => (
              <Badge key={d.department ?? "_"} variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                {d.department ?? "Unassigned"}: {d.filled_count} filled / {Number(d.budgeted_fte ?? 0).toFixed(2)} budgeted
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-medium mb-3">Department budget summary</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Positions</TableHead>
              <TableHead className="text-right">Budgeted FTE</TableHead>
              <TableHead className="text-right">Filled</TableHead>
              <TableHead className="text-right">Vacant</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const filled = r.filled_count ?? 0;
              const budget = Number(r.budgeted_fte ?? 0);
              const variance = filled - budget;
              const over = filled > budget;
              return (
                <TableRow key={r.department ?? "_"}>
                  <TableCell className="font-medium">{r.department ?? <span className="text-muted-foreground">— unassigned —</span>}</TableCell>
                  <TableCell className="text-right">{r.total_positions ?? 0}</TableCell>
                  <TableCell className="text-right">{budget.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{filled}</TableCell>
                  <TableCell className="text-right">{r.vacant_count ?? 0}</TableCell>
                  <TableCell className={`text-right ${over ? "text-amber-600 font-medium" : ""}`}>
                    {variance > 0 ? `+${variance.toFixed(2)}` : variance.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {over ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                        <AlertTriangle className="h-3 w-3" /> Over budget
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Within budget</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  No position data yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "good" | "warn" | "bad";
}) {
  const color =
    accent === "good"
      ? "text-emerald-600"
      : accent === "warn"
      ? "text-amber-600"
      : accent === "bad"
      ? "text-red-600"
      : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
    </Card>
  );
}
