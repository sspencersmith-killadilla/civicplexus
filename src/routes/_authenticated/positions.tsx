import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Briefcase, Upload } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/positions")({
  component: PositionsPage,
});

type Position = {
  id: string;
  title: string;
  position_code: string | null;
  department: string | null;
  worker_type_id: string | null;
  flsa_class: string | null;
  pay_grade: string | null;
  pay_step: string | null;
  budgeted_fte: number;
  reports_to_position_id: string | null;
  status: string;
  notes: string | null;
};

type Headcount = {
  department: string | null;
  total_positions: number | null;
  budgeted_fte: number | null;
  filled_count: number | null;
  vacant_count: number | null;
};

function PositionsPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isHR = hasRole(me?.roles, "hr_admin");

  const positionsQ = useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .order("department", { ascending: true })
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Position[];
    },
  });

  const headcountQ = useQuery({
    queryKey: ["position_headcount"],
    queryFn: async () => {
      const { data, error } = await supabase.from("position_headcount").select("*");
      if (error) throw error;
      return (data ?? []) as Headcount[];
    },
  });

  const workerTypesQ = useQuery({
    queryKey: ["worker_types_select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("worker_types").select("id,name").order("sort_order");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const filledByPos = useQuery({
    queryKey: ["positions_filled_counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("position_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((row: { position_id: string | null }) => {
        if (row.position_id) counts[row.position_id] = (counts[row.position_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);

  const save = useMutation({
    mutationFn: async (form: Partial<Position>) => {
      if (editing) {
        const { error } = await supabase.from("positions").update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("positions").insert(form as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["position_headcount"] });
      toast.success(editing ? "Position updated" : "Position created");
      setOpen(false);
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["position_headcount"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const totals = useMemo(() => {
    const rows = headcountQ.data ?? [];
    return rows.reduce(
      (acc, r) => {
        acc.total += r.total_positions ?? 0;
        acc.fte += Number(r.budgeted_fte ?? 0);
        acc.filled += r.filled_count ?? 0;
        acc.vacant += r.vacant_count ?? 0;
        return acc;
      },
      { total: 0, fte: 0, filled: 0, vacant: 0 },
    );
  }, [headcountQ.data]);

  return (
    <AppShell title="Positions">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-2xl">
          The position catalog tracks every budgeted job — filled or vacant — separate from the people in them. Used for org charts, vacancy reports, and headcount-vs-budget.
        </p>
        {isHR && (
          <div className="flex items-center gap-2">
            <Link to="/employees/import" search={{ tab: "positions" } as never}>
              <Button variant="outline"><Upload className="h-4 w-4 mr-2" /> Bulk import</Button>
            </Link>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New position</Button>
            </DialogTrigger>
            <PositionDialog
              editing={editing}
              positions={positionsQ.data ?? []}
              workerTypes={workerTypesQ.data ?? []}
              onSubmit={(f) => save.mutate(f)}
              saving={save.isPending}
            />
            </Dialog>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total positions" value={totals.total} />
        <StatCard label="Budgeted FTE" value={totals.fte.toFixed(2)} />
        <StatCard label="Filled" value={totals.filled} />
        <StatCard label="Vacant" value={totals.vacant} accent={totals.vacant > 0} />
      </div>

      <Card className="p-4 mb-6">
        <h3 className="font-medium mb-3 flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /> Headcount by department</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Positions</TableHead>
              <TableHead className="text-right">Budgeted FTE</TableHead>
              <TableHead className="text-right">Filled</TableHead>
              <TableHead className="text-right">Vacant</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(headcountQ.data ?? []).map((r, i) => (
              <TableRow key={`${r.department ?? "_"}-${i}`}>
                <TableCell>{r.department ?? <span className="text-muted-foreground">— unassigned —</span>}</TableCell>
                <TableCell className="text-right">{r.total_positions ?? 0}</TableCell>
                <TableCell className="text-right">{Number(r.budgeted_fte ?? 0).toFixed(2)}</TableCell>
                <TableCell className="text-right">{r.filled_count ?? 0}</TableCell>
                <TableCell className="text-right">{r.vacant_count ?? 0}</TableCell>
              </TableRow>
            ))}
            {(!headcountQ.data || headcountQ.data.length === 0) && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No positions yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium mb-3">All positions</h3>
        {positionsQ.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>FLSA</TableHead>
                <TableHead>Grade/Step</TableHead>
                <TableHead className="text-right">FTE</TableHead>
                <TableHead className="text-right">Filled</TableHead>
                <TableHead>Status</TableHead>
                {isHR && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(positionsQ.data ?? []).map((p) => {
                const filled = filledByPos.data?.[p.id] ?? 0;
                const isVacant = p.status === "open" && filled === 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell className="text-muted-foreground">{p.position_code ?? "—"}</TableCell>
                    <TableCell>{p.department ?? "—"}</TableCell>
                    <TableCell>{p.flsa_class ?? "—"}</TableCell>
                    <TableCell>{p.pay_grade ? `${p.pay_grade}${p.pay_step ? `/${p.pay_step}` : ""}` : "—"}</TableCell>
                    <TableCell className="text-right">{Number(p.budgeted_fte).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{filled}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded ${isVacant ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : p.status === "filled" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                        {isVacant ? "vacant" : p.status}
                      </span>
                    </TableCell>
                    {isHR && (
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete ${p.title}?`)) remove.mutate(p.id); }}><Trash2 className="h-3 w-3" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {(positionsQ.data?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={isHR ? 9 : 8} className="text-center text-muted-foreground py-6">No positions yet. {isHR && "Click \u201cNew position\u201d to add one."}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </AppShell>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
    </Card>
  );
}

function PositionDialog({
  editing,
  positions,
  workerTypes,
  onSubmit,
  saving,
}: {
  editing: Position | null;
  positions: Position[];
  workerTypes: { id: string; name: string }[];
  onSubmit: (f: Partial<Position>) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [code, setCode] = useState(editing?.position_code ?? "");
  const [department, setDepartment] = useState(editing?.department ?? "");
  const [workerTypeId, setWorkerTypeId] = useState<string | undefined>(editing?.worker_type_id ?? undefined);
  const [flsa, setFlsa] = useState<string | undefined>(editing?.flsa_class ?? undefined);
  const [grade, setGrade] = useState(editing?.pay_grade ?? "");
  const [step, setStep] = useState(editing?.pay_step ?? "");
  const [fte, setFte] = useState<number>(editing?.budgeted_fte ?? 1);
  const [reportsTo, setReportsTo] = useState<string | undefined>(editing?.reports_to_position_id ?? undefined);
  const [status, setStatus] = useState(editing?.status ?? "open");
  const [notes, setNotes] = useState(editing?.notes ?? "");

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Edit position" : "New position"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 col-span-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Maintenance Worker II" /></div>
        <div className="space-y-2"><Label>Position code</Label><Input value={code ?? ""} onChange={(e) => setCode(e.target.value)} placeholder="PW-MW2-001" /></div>
        <div className="space-y-2"><Label>Department</Label><Input value={department ?? ""} onChange={(e) => setDepartment(e.target.value)} placeholder="Public Works" /></div>
        <div className="space-y-2">
          <Label>Worker type</Label>
          <Select value={workerTypeId} onValueChange={setWorkerTypeId}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {workerTypes.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>FLSA class</Label>
          <Select value={flsa} onValueChange={setFlsa}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="exempt">Exempt</SelectItem>
              <SelectItem value="non_exempt">Non-exempt</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Pay grade</Label><Input value={grade ?? ""} onChange={(e) => setGrade(e.target.value)} placeholder="G12" /></div>
        <div className="space-y-2"><Label>Pay step</Label><Input value={step ?? ""} onChange={(e) => setStep(e.target.value)} placeholder="3" /></div>
        <div className="space-y-2"><Label>Budgeted FTE</Label><Input type="number" step="0.25" min="0" value={fte} onChange={(e) => setFte(Number(e.target.value))} /></div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="filled">Filled</SelectItem>
              <SelectItem value="frozen">Frozen</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 col-span-2">
          <Label>Reports to</Label>
          <Select value={reportsTo} onValueChange={(v) => setReportsTo(v === "__none__" ? undefined : v)}>
            <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— none —</SelectItem>
              {positions.filter((p) => p.id !== editing?.id).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.title}{p.department ? ` · ${p.department}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 col-span-2"><Label>Notes</Label><Textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
      </div>
      <DialogFooter>
        <Button
          disabled={saving || !title}
          onClick={() =>
            onSubmit({
              title,
              position_code: code || null,
              department: department || null,
              worker_type_id: workerTypeId ?? null,
              flsa_class: flsa ?? null,
              pay_grade: grade || null,
              pay_step: step || null,
              budgeted_fte: fte,
              reports_to_position_id: reportsTo ?? null,
              status,
              notes: notes || null,
            })
          }
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}