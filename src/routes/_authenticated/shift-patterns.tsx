import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2, Calendar as CalIcon, UserPlus2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModuleGate } from "@/components/module-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import {
  listShiftCatalog, upsertShiftType, deleteShiftType, upsertSchedulePattern,
  assignEmployeePattern, setEmployeeWorkPeriod,
} from "@/lib/timekeeping.functions";

export const Route = createFileRoute("/_authenticated/shift-patterns")({ component: Page });

type Shift = {
  id: string; name: string; code: string | null; color: string;
  is_off: boolean; total_paid_hours: number; description?: string | null;
};
type Segment = {
  id: string; shift_type_id: string; segment_order: number;
  start_time: string; end_time: string; crosses_midnight: boolean;
  paid: boolean; unpaid_meal_min: number;
};
type Pattern = {
  id: string; name: string; description: string | null;
  cycle_length_days: number; category: string | null; is_preset: boolean;
};
type PDay = { id: string; pattern_id: string; day_index: number; shift_type_id: string | null; is_off: boolean };

function Page() {
  const { data: me } = useCurrentUser();
  if (!hasRole(me?.roles, "hr_admin")) {
    return (
      <AppShell><div className="p-6 text-sm text-muted-foreground">HR admins only.</div></AppShell>
    );
  }
  return (
    <AppShell>
      <ModuleGate>
        <div className="space-y-6">
          <header>
            <h1 className="font-serif text-3xl">Shift patterns</h1>
            <p className="text-sm text-muted-foreground">
              Build custom shifts and rotating cycles for fire, police, EMS, and any other non-standard schedules. Assign patterns and FLSA 207(k) work periods to employees.
            </p>
          </header>
          <Tabs defaultValue="patterns">
            <TabsList>
              <TabsTrigger value="patterns">Rotations</TabsTrigger>
              <TabsTrigger value="shifts">Shift types</TabsTrigger>
              <TabsTrigger value="assign">Assign employees</TabsTrigger>
            </TabsList>
            <TabsContent value="patterns" className="mt-4"><PatternsPanel /></TabsContent>
            <TabsContent value="shifts" className="mt-4"><ShiftsPanel /></TabsContent>
            <TabsContent value="assign" className="mt-4"><AssignPanel /></TabsContent>
          </Tabs>
        </div>
      </ModuleGate>
    </AppShell>
  );
}

function useCatalog() {
  const fetchCatalog = useServerFn(listShiftCatalog);
  return useQuery({ queryKey: ["shift-catalog"], queryFn: () => fetchCatalog() });
}

function ShiftsPanel() {
  const qc = useQueryClient();
  const q = useCatalog();
  const save = useServerFn(upsertShiftType);
  const del = useServerFn(deleteShiftType);
  const [editing, setEditing] = useState<Partial<Shift> & { segments?: Segment[] } | null>(null);

  const shifts = (q.data?.shifts ?? []) as Shift[];
  const segs = (q.data?.segments ?? []) as Segment[];

  const saveM = useMutation({
    mutationFn: (v: { id?: string; name: string; code?: string | null; color: string; is_off: boolean; total_paid_hours: number; segments: Omit<Segment, "id" | "shift_type_id" | "segment_order">[] }) =>
      save({ data: v }),
    onSuccess: () => { toast.success("Shift saved"); setEditing(null); qc.invalidateQueries({ queryKey: ["shift-catalog"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Shift removed"); qc.invalidateQueries({ queryKey: ["shift-catalog"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ name: "", color: "#3b82f6", is_off: false, total_paid_hours: 8, segments: [] })}>
          <Plus className="h-4 w-4 mr-1" /> New shift
        </Button>
      </div>
      <Card className="p-4">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground text-left">
            <tr><th className="py-2">Shift</th><th>Segments</th><th>Paid hours</th><th /></tr>
          </thead>
          <tbody>
            {shifts.map((s) => {
              const my = segs.filter((g) => g.shift_type_id === s.id);
              return (
                <tr key={s.id} className="border-t">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />
                      <span className="font-medium">{s.name}</span>
                      {s.code && <Badge variant="outline">{s.code}</Badge>}
                    </div>
                  </td>
                  <td className="text-muted-foreground">
                    {s.is_off ? "Off" : my.map((g) => `${g.start_time.slice(0,5)}–${g.end_time.slice(0,5)}${g.crosses_midnight ? " (+1d)" : ""}`).join(", ") || "—"}
                  </td>
                  <td>{Number(s.total_paid_hours).toFixed(2)}h</td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ ...s, segments: my })}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => delM.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit shift" : "New shift"}</DialogTitle></DialogHeader>
          {editing && (
            <ShiftForm
              value={editing as Shift & { segments: Segment[] }}
              onChange={setEditing}
              onSave={() => saveM.mutate({
                id: editing.id,
                name: editing.name ?? "",
                code: editing.code ?? null,
                color: editing.color ?? "#3b82f6",
                is_off: !!editing.is_off,
                total_paid_hours: Number(editing.total_paid_hours ?? 0),
                segments: (editing.segments ?? []).map((s) => ({
                  start_time: s.start_time, end_time: s.end_time,
                  crosses_midnight: !!s.crosses_midnight, paid: !!s.paid,
                  unpaid_meal_min: Number(s.unpaid_meal_min ?? 0),
                })),
              })}
              busy={saveM.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShiftForm({ value, onChange, onSave, busy }: {
  value: Shift & { segments: Segment[] };
  onChange: (v: typeof value) => void;
  onSave: () => void; busy: boolean;
}) {
  const updateSeg = (i: number, patch: Partial<Segment>) => {
    const next = [...(value.segments ?? [])];
    next[i] = { ...next[i], ...patch };
    onChange({ ...value, segments: next });
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Name</Label><Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></div>
        <div><Label>Code</Label><Input value={value.code ?? ""} onChange={(e) => onChange({ ...value, code: e.target.value })} placeholder="e.g. 24H" /></div>
        <div><Label>Color</Label><Input type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })} /></div>
        <div><Label>Paid hours</Label><Input type="number" step="0.25" value={value.total_paid_hours} onChange={(e) => onChange({ ...value, total_paid_hours: Number(e.target.value) })} /></div>
        <div className="flex items-center gap-2 col-span-2">
          <Switch id="is_off" checked={value.is_off} onCheckedChange={(v) => onChange({ ...value, is_off: v })} />
          <Label htmlFor="is_off">Off / non-working slot</Label>
        </div>
      </div>
      {!value.is_off && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Segments</Label>
            <Button type="button" size="sm" variant="outline"
              onClick={() => onChange({ ...value, segments: [...(value.segments ?? []), { id: "", shift_type_id: "", segment_order: (value.segments?.length ?? 0) + 1, start_time: "08:00", end_time: "17:00", crosses_midnight: false, paid: true, unpaid_meal_min: 0 }] })}>
              <Plus className="h-4 w-4 mr-1" /> Add segment
            </Button>
          </div>
          {(value.segments ?? []).map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center rounded border p-2">
              <Input className="col-span-3" type="time" value={s.start_time.slice(0,5)} onChange={(e) => updateSeg(i, { start_time: e.target.value })} />
              <Input className="col-span-3" type="time" value={s.end_time.slice(0,5)} onChange={(e) => updateSeg(i, { end_time: e.target.value })} />
              <label className="col-span-3 flex items-center gap-2 text-xs">
                <Switch checked={s.crosses_midnight} onCheckedChange={(v) => updateSeg(i, { crosses_midnight: v })} /> Crosses midnight
              </label>
              <Input className="col-span-2" type="number" min={0} max={240} value={s.unpaid_meal_min} onChange={(e) => updateSeg(i, { unpaid_meal_min: Number(e.target.value) })} placeholder="Meal (min)" />
              <Button className="col-span-1" type="button" size="icon" variant="ghost" onClick={() => onChange({ ...value, segments: (value.segments ?? []).filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      )}
      <DialogFooter><Button onClick={onSave} disabled={busy}><Save className="h-4 w-4 mr-1" /> Save</Button></DialogFooter>
    </div>
  );
}

function PatternsPanel() {
  const qc = useQueryClient();
  const q = useCatalog();
  const save = useServerFn(upsertSchedulePattern);
  const [editing, setEditing] = useState<(Partial<Pattern> & { days: PDay[] }) | null>(null);

  const patterns = (q.data?.patterns ?? []) as Pattern[];
  const allDays = (q.data?.days ?? []) as PDay[];
  const shifts = (q.data?.shifts ?? []) as Shift[];

  const saveM = useMutation({
    mutationFn: (v: { id?: string; name: string; description?: string | null; cycle_length_days: number; category?: string | null; days: { day_index: number; shift_type_id: string | null; is_off: boolean }[] }) => save({ data: v }),
    onSuccess: () => { toast.success("Pattern saved"); setEditing(null); qc.invalidateQueries({ queryKey: ["shift-catalog"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => setEditing({ name: "", description: "", cycle_length_days: 7, category: "custom", days: [] });
  const openEdit = (p: Pattern) => setEditing({ ...p, days: allDays.filter((d) => d.pattern_id === p.id) });

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New rotation</Button></div>
      <div className="grid gap-3 md:grid-cols-2">
        {patterns.map((p) => {
          const days = allDays.filter((d) => d.pattern_id === p.id);
          return (
            <Card key={p.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{p.name} {p.is_preset && <Badge variant="secondary" className="ml-1">preset</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                  <div className="text-xs text-muted-foreground mt-1">{p.cycle_length_days}-day cycle · {p.category}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>Edit</Button>
              </div>
              <CycleStrip days={days} shifts={shifts} length={p.cycle_length_days} />
              <CalendarPreview days={days} shifts={shifts} cycle={p.cycle_length_days} weeks={4} />
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit rotation" : "New rotation"}</DialogTitle></DialogHeader>
          {editing && (
            <PatternForm
              value={editing as Pattern & { days: PDay[] }}
              shifts={shifts}
              onChange={setEditing}
              onSave={() => saveM.mutate({
                id: editing.id,
                name: editing.name ?? "",
                description: editing.description ?? null,
                cycle_length_days: Number(editing.cycle_length_days ?? 7),
                category: editing.category ?? null,
                days: Array.from({ length: Number(editing.cycle_length_days ?? 7) }, (_, i) => {
                  const idx = i + 1;
                  const existing = (editing.days ?? []).find((d) => d.day_index === idx);
                  return { day_index: idx, shift_type_id: existing?.shift_type_id ?? null, is_off: existing?.is_off ?? !existing?.shift_type_id };
                }),
              })}
              busy={saveM.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PatternForm({ value, shifts, onChange, onSave, busy }: {
  value: Pattern & { days: PDay[] };
  shifts: Shift[];
  onChange: (v: typeof value) => void;
  onSave: () => void; busy: boolean;
}) {
  const cycle = Number(value.cycle_length_days ?? 7);
  const dayFor = (idx: number) => value.days.find((d) => d.day_index === idx);
  const setDay = (idx: number, shift_type_id: string | null) => {
    const next = value.days.filter((d) => d.day_index !== idx);
    next.push({ id: "", pattern_id: "", day_index: idx, shift_type_id, is_off: !shift_type_id });
    onChange({ ...value, days: next.sort((a, b) => a.day_index - b.day_index) });
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Name</Label><Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></div>
        <div><Label>Cycle length (days)</Label><Input type="number" min={1} max={56} value={cycle} onChange={(e) => onChange({ ...value, cycle_length_days: Number(e.target.value) })} /></div>
        <div>
          <Label>Category</Label>
          <Select value={value.category ?? "custom"} onValueChange={(v) => onChange({ ...value, category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fire">Fire</SelectItem>
              <SelectItem value="law">Law enforcement</SelectItem>
              <SelectItem value="ems">EMS</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-3"><Label>Description</Label><Textarea rows={2} value={value.description ?? ""} onChange={(e) => onChange({ ...value, description: e.target.value })} /></div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(cycle, 14)}, minmax(0, 1fr))` }}>
        {Array.from({ length: cycle }, (_, i) => {
          const idx = i + 1;
          const d = dayFor(idx);
          const shift = shifts.find((s) => s.id === d?.shift_type_id);
          return (
            <div key={idx} className="rounded border p-2">
              <div className="text-[10px] text-muted-foreground mb-1">Day {idx}</div>
              <Select value={d?.shift_type_id ?? "off"} onValueChange={(v) => setDay(idx, v === "off" ? null : v)}>
                <SelectTrigger className="h-8 text-xs">
                  <span className="inline-flex items-center gap-1">
                    {shift && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: shift.color }} />}
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  {shifts.filter((s) => !s.is_off).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
      <div>
        <Label className="text-xs">Preview (next 4 weeks)</Label>
        <CalendarPreview days={value.days} shifts={shifts} cycle={cycle} weeks={4} />
      </div>
      <DialogFooter><Button onClick={onSave} disabled={busy}><Save className="h-4 w-4 mr-1" /> Save rotation</Button></DialogFooter>
    </div>
  );
}

function CycleStrip({ days, shifts, length }: { days: PDay[]; shifts: Shift[]; length: number }) {
  return (
    <div className="flex gap-[2px]">
      {Array.from({ length }, (_, i) => {
        const d = days.find((x) => x.day_index === i + 1);
        const s = shifts.find((x) => x.id === d?.shift_type_id);
        return <div key={i} className="h-3 flex-1 rounded-sm" title={s?.name ?? "Off"} style={{ background: s?.color ?? "#e5e7eb" }} />;
      })}
    </div>
  );
}

function CalendarPreview({ days, shifts, cycle, weeks }: { days: PDay[]; shifts: Shift[]; cycle: number; weeks: number }) {
  const total = weeks * 7;
  const cells = useMemo(() => Array.from({ length: total }, (_, i) => {
    const idx = (i % cycle) + 1;
    const d = days.find((x) => x.day_index === idx);
    return shifts.find((x) => x.id === d?.shift_type_id) ?? null;
  }), [days, shifts, cycle, total]);
  return (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
      {cells.map((s, i) => (
        <div key={i} className="aspect-square rounded-sm text-[9px] text-white/90 flex items-center justify-center"
          title={s?.name ?? "Off"} style={{ background: s?.color ?? "#e5e7eb", color: s ? "#fff" : "#6b7280" }}>
          {s?.code ?? ""}
        </div>
      ))}
    </div>
  );
}

function AssignPanel() {
  const qc = useQueryClient();
  const cat = useCatalog();
  const assignFn = useServerFn(assignEmployeePattern);
  const wpFn = useServerFn(setEmployeeWorkPeriod);

  const { data: emps } = useQuery({
    queryKey: ["emps-for-shift"],
    queryFn: async () => {
      const { data } = await supabase.from("employees")
        .select("id, first_name, last_name, department").eq("status", "active").order("last_name");
      return data ?? [];
    },
  });

  const [empId, setEmpId] = useState("");
  const [patternId, setPatternId] = useState("");
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10));

  const [wpKind, setWpKind] = useState<"standard_40" | "207k_fire" | "207k_law" | "custom">("standard_40");
  const [wpDays, setWpDays] = useState(7);
  const [wpThreshold, setWpThreshold] = useState(40);
  const [wpAnchor, setWpAnchor] = useState(new Date().toISOString().slice(0, 10));

  const assignM = useMutation({
    mutationFn: () => assignFn({ data: { employee_id: empId, pattern_id: patternId, anchor_date: anchor } }),
    onSuccess: () => { toast.success("Pattern assigned"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const wpM = useMutation({
    mutationFn: () => wpFn({ data: { employee_id: empId, kind: wpKind, period_days: wpDays, period_anchor_date: wpAnchor, ot_threshold_hours: wpThreshold } }),
    onSuccess: () => { toast.success("Work period saved"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyPreset = (kind: typeof wpKind) => {
    setWpKind(kind);
    if (kind === "207k_fire") { setWpDays(7); setWpThreshold(53); }
    else if (kind === "207k_law") { setWpDays(7); setWpThreshold(43); }
    else if (kind === "standard_40") { setWpDays(7); setWpThreshold(40); }
  };

  const patterns = (cat.data?.patterns ?? []) as Pattern[];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2"><CalIcon className="h-4 w-4" /><h3 className="font-medium">Assign rotation</h3></div>
        <div>
          <Label>Employee</Label>
          <Select value={empId} onValueChange={setEmpId}>
            <SelectTrigger><SelectValue placeholder="Pick employee" /></SelectTrigger>
            <SelectContent>
              {(emps ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.last_name}, {e.first_name} — {e.department ?? "—"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Pattern</Label>
          <Select value={patternId} onValueChange={setPatternId}>
            <SelectTrigger><SelectValue placeholder="Pick rotation" /></SelectTrigger>
            <SelectContent>
              {patterns.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.cycle_length_days}d)</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Anchor date (day 1 of cycle)</Label>
          <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
        </div>
        <Button onClick={() => assignM.mutate()} disabled={!empId || !patternId || assignM.isPending}>
          <UserPlus2 className="h-4 w-4 mr-1" /> Assign
        </Button>
      </Card>

      <Card className="p-6 space-y-3">
        <h3 className="font-medium">FLSA 207(k) work period</h3>
        <p className="text-xs text-muted-foreground">
          Fire and law-enforcement employees can use a 7–28 day work period with a higher OT threshold than the standard 40h/week.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant={wpKind === "standard_40" ? "default" : "outline"} onClick={() => applyPreset("standard_40")}>Standard 40h</Button>
          <Button size="sm" variant={wpKind === "207k_fire" ? "default" : "outline"} onClick={() => applyPreset("207k_fire")}>Fire 53/7</Button>
          <Button size="sm" variant={wpKind === "207k_law" ? "default" : "outline"} onClick={() => applyPreset("207k_law")}>Law 43/7</Button>
          <Button size="sm" variant={wpKind === "custom" ? "default" : "outline"} onClick={() => setWpKind("custom")}>Custom</Button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Period (days)</Label><Input type="number" min={1} max={28} value={wpDays} onChange={(e) => setWpDays(Number(e.target.value))} /></div>
          <div><Label>OT threshold (hrs)</Label><Input type="number" step="0.5" value={wpThreshold} onChange={(e) => setWpThreshold(Number(e.target.value))} /></div>
          <div><Label>Anchor date</Label><Input type="date" value={wpAnchor} onChange={(e) => setWpAnchor(e.target.value)} /></div>
        </div>
        <Button onClick={() => wpM.mutate()} disabled={!empId || wpM.isPending}>Save work period</Button>
      </Card>
    </div>
  );
}