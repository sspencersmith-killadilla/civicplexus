import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hr-finance")({ component: HrFinancePage });

type BudgetRow = {
  department: string | null;
  total_positions: number | null;
  budgeted_fte: number | null;
  filled_count: number | null;
  vacant_count: number | null;
};

function HrFinancePage() {
  const headcountQ = useQuery({
    queryKey: ["position_headcount"],
    queryFn: async () => {
      const { data, error } = await supabase.from("position_headcount").select("*").order("department");
      if (error) throw error;
      return (data ?? []) as BudgetRow[];
    },
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
    const budget = Number(r.budgeted_fte ?? 0);
    return filled > budget;
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
