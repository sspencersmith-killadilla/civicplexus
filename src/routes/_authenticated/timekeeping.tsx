import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Play, Square, CheckCircle2, AlertCircle, Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ModuleGate } from "@/components/module-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import {
  getMyTimeStatus, clockIn, clockOut, getMyTimesheets, submitTimesheet,
  getPendingTimesheets, decideTimesheet, getTimeAdmin, updateTimePolicy,
} from "@/lib/timekeeping.functions";

export const Route = createFileRoute("/_authenticated/timekeeping")({ component: Page });

function fmtMin(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function Page() {
  const { data: me } = useCurrentUser();
  const isHr = hasRole(me?.roles, "hr_admin");
  const isMgr = isHr || hasRole(me?.roles, "supervisor") || hasRole(me?.roles, "hiring_manager");
  return (
    <AppShell>
      <ModuleGate>
        <div className="space-y-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="font-serif text-3xl">Timekeeping</h1>
              <p className="text-sm text-muted-foreground">Clock in, track hours, manage comp time.</p>
            </div>
          </header>
          <Tabs defaultValue="me">
            <TabsList>
              <TabsTrigger value="me">My Time</TabsTrigger>
              {isMgr && <TabsTrigger value="approve">Approvals</TabsTrigger>}
              {isHr && <TabsTrigger value="admin">Admin</TabsTrigger>}
            </TabsList>
            <TabsContent value="me" className="mt-4"><MyTimePanel /></TabsContent>
            {isMgr && <TabsContent value="approve" className="mt-4"><ApprovalsPanel /></TabsContent>}
            {isHr && <TabsContent value="admin" className="mt-4"><AdminPanel /></TabsContent>}
          </Tabs>
        </div>
      </ModuleGate>
    </AppShell>
  );
}

function MyTimePanel() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getMyTimeStatus);
  const fetchSheets = useServerFn(getMyTimesheets);
  const cIn = useServerFn(clockIn);
  const cOut = useServerFn(clockOut);
  const submit = useServerFn(submitTimesheet);
  const [note, setNote] = useState("");

  const statusQ = useQuery({ queryKey: ["tk-status"], queryFn: () => fetchStatus() });
  const sheetsQ = useQuery({ queryKey: ["tk-mysheets"], queryFn: () => fetchSheets() });

  // tick every second when open
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!statusQ.data?.open_entry) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [statusQ.data?.open_entry]);

  const inM = useMutation({
    mutationFn: () => cIn({ data: { note } }),
    onSuccess: () => { setNote(""); toast.success("Clocked in"); qc.invalidateQueries({ queryKey: ["tk-status"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const outM = useMutation({
    mutationFn: () => cOut({ data: { note } }),
    onSuccess: () => { setNote(""); toast.success("Clocked out"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const subM = useMutation({
    mutationFn: (week_start: string) => submit({ data: { week_start } }),
    onSuccess: () => { toast.success("Timesheet submitted"); qc.invalidateQueries({ queryKey: ["tk-mysheets"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (statusQ.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!statusQ.data?.employee) {
    return <Card className="p-6 text-sm text-muted-foreground">No employee record linked to your account.</Card>;
  }

  const s = statusQ.data;
  const open = s.open_entry as { id: string; clock_in: string } | null;
  const elapsedMin = open ? (now - new Date(open.clock_in).getTime()) / 60000 : 0;
  const wt = s.worker_type as { name: string; flsa_class: string } | null;
  const exempt = wt?.flsa_class === "exempt";
  const bal = (s.comp_balance as { balance_hours: number } | null)?.balance_hours ?? 0;

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card className="p-6 md:col-span-2 space-y-4">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <div>
            <div className="font-medium">{open ? "On the clock" : "Off the clock"}</div>
            <div className="text-xs text-muted-foreground">{wt?.name ?? "—"} · {exempt ? "Exempt (salaried)" : "Non-exempt (hourly)"}</div>
          </div>
        </div>
        {open && (
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-mono tabular-nums">{fmtMin(elapsedMin)}</div>
            <div className="text-xs text-muted-foreground mt-1">Since {new Date(open.clock_in).toLocaleTimeString()}</div>
          </div>
        )}
        <div>
          <Label htmlFor="note" className="text-xs">Note (optional)</Label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you work on?" />
        </div>
        <div className="flex gap-2">
          {open
            ? <Button onClick={() => outM.mutate()} disabled={outM.isPending} variant="destructive"><Square className="h-4 w-4 mr-1" /> Clock out</Button>
            : <Button onClick={() => inM.mutate()} disabled={inM.isPending}><Play className="h-4 w-4 mr-1" /> Clock in</Button>}
        </div>
      </Card>
      <div className="space-y-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">This week</div>
          <div className="text-2xl font-semibold mt-1">{fmtMin(s.week_minutes ?? 0)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Expected {(s.schedule as { expected_weekly_hours: number } | null)?.expected_weekly_hours ?? 40}h
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Comp-time balance</div>
          <div className="text-2xl font-semibold mt-1">{Number(bal).toFixed(2)}h</div>
          <div className="text-xs text-muted-foreground mt-1">Request via Leave → Comp Time</div>
        </Card>
      </div>

      <Card className="md:col-span-3 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">My timesheets</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground text-left">
            <tr><th className="py-2">Week</th><th>Regular</th><th>OT</th><th>Comp earned</th><th>Leave</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {(sheetsQ.data?.rows ?? []).map((r) => (
              <tr key={r.id as string} className="border-t">
                <td className="py-2">{r.week_start as string}</td>
                <td>{Number(r.regular_hours).toFixed(2)}</td>
                <td>{Number(r.overtime_hours).toFixed(2)}</td>
                <td>{Number(r.comp_time_earned).toFixed(2)}</td>
                <td>{Number(r.leave_hours).toFixed(2)}</td>
                <td><Badge variant={r.status === "approved" ? "default" : r.status === "submitted" ? "secondary" : "outline"}>{r.status as string}</Badge></td>
                <td>
                  {(r.status === "open" || r.status === "denied") && (
                    <Button size="sm" variant="outline" onClick={() => subM.mutate(r.week_start as string)}>Submit</Button>
                  )}
                </td>
              </tr>
            ))}
            {(sheetsQ.data?.rows ?? []).length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No timesheets yet. Clock in to start.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="md:col-span-3 p-4">
        <h3 className="font-medium mb-3">Recent entries</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground text-left">
            <tr><th className="py-2">Day</th><th>In</th><th>Out</th><th>Hours</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {(sheetsQ.data?.entries ?? []).slice(0, 20).map((e) => {
              const inT = new Date(e.clock_in as string);
              const outT = e.clock_out ? new Date(e.clock_out as string) : null;
              const mins = outT ? (outT.getTime() - inT.getTime()) / 60000 : 0;
              return (
                <tr key={e.id as string} className="border-t">
                  <td className="py-2">{inT.toLocaleDateString()}</td>
                  <td>{inT.toLocaleTimeString()}</td>
                  <td>{outT ? outT.toLocaleTimeString() : <span className="text-primary">Open</span>}</td>
                  <td>{outT ? fmtMin(mins) : "—"}</td>
                  <td className="text-muted-foreground">{(e.notes as string) ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ApprovalsPanel() {
  const qc = useQueryClient();
  const fetchPending = useServerFn(getPendingTimesheets);
  const decide = useServerFn(decideTimesheet);
  const q = useQuery({ queryKey: ["tk-pending"], queryFn: () => fetchPending() });
  const m = useMutation({
    mutationFn: (v: { timesheet_id: string; decision: "approved" | "denied"; notes?: string }) =>
      decide({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["tk-pending"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const rows = q.data?.rows ?? [];
  if (rows.length === 0) return <Card className="p-6 text-sm text-muted-foreground">No pending timesheets.</Card>;
  return (
    <Card className="p-4">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground text-left">
          <tr><th className="py-2">Employee</th><th>Week</th><th>Regular</th><th>OT</th><th>Comp</th><th>Leave</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const e = r.employee as { first_name: string; last_name: string; department: string | null };
            return (
              <tr key={r.id as string} className="border-t">
                <td className="py-2">{e.first_name} {e.last_name}<div className="text-xs text-muted-foreground">{e.department}</div></td>
                <td>{r.week_start as string}</td>
                <td>{Number(r.regular_hours).toFixed(2)}</td>
                <td>{Number(r.overtime_hours).toFixed(2)}</td>
                <td>{Number(r.comp_time_earned).toFixed(2)}</td>
                <td>{Number(r.leave_hours).toFixed(2)}</td>
                <td className="flex gap-2 py-2">
                  <Button size="sm" onClick={() => m.mutate({ timesheet_id: r.id as string, decision: "approved" })}><CheckCircle2 className="h-4 w-4 mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => m.mutate({ timesheet_id: r.id as string, decision: "denied" })}><AlertCircle className="h-4 w-4 mr-1" />Deny</Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function AdminPanel() {
  const qc = useQueryClient();
  const fetchAdmin = useServerFn(getTimeAdmin);
  const updatePol = useServerFn(updateTimePolicy);
  const q = useQuery({ queryKey: ["tk-admin"], queryFn: () => fetchAdmin() });
  const polM = useMutation({
    mutationFn: (v: Parameters<typeof updateTimePolicy>[0]["data"]) => updatePol({ data: v }),
    onSuccess: () => { toast.success("Policy saved"); qc.invalidateQueries({ queryKey: ["tk-admin"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading || !q.data?.policy) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const p = q.data.policy as Record<string, unknown>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><Settings className="h-4 w-4" /><h3 className="font-medium">Time policy</h3></div>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            polM.mutate({
              id: p.id as string,
              daily_ot_threshold: Number(fd.get("daily_ot_threshold")),
              weekly_ot_threshold: Number(fd.get("weekly_ot_threshold")),
              ot_multiplier: Number(fd.get("ot_multiplier")),
              comp_time_multiplier: Number(fd.get("comp_time_multiplier")),
              exempt_comp_multiplier: Number(fd.get("exempt_comp_multiplier")),
              rounding_minutes: Number(fd.get("rounding_minutes")),
              allow_comp_in_lieu: fd.get("allow_comp_in_lieu") === "on",
              max_comp_bank_hours: fd.get("max_comp_bank_hours") ? Number(fd.get("max_comp_bank_hours")) : null,
            });
          }}
        >
          <div><Label>Daily OT (hrs)</Label><Input name="daily_ot_threshold" type="number" step="0.25" defaultValue={String(p.daily_ot_threshold)} /></div>
          <div><Label>Weekly OT (hrs)</Label><Input name="weekly_ot_threshold" type="number" step="0.25" defaultValue={String(p.weekly_ot_threshold)} /></div>
          <div><Label>OT multiplier</Label><Input name="ot_multiplier" type="number" step="0.1" defaultValue={String(p.ot_multiplier)} /></div>
          <div><Label>Comp-time multiplier</Label><Input name="comp_time_multiplier" type="number" step="0.1" defaultValue={String(p.comp_time_multiplier)} /></div>
          <div><Label>Exempt comp multiplier</Label><Input name="exempt_comp_multiplier" type="number" step="0.1" defaultValue={String(p.exempt_comp_multiplier)} /></div>
          <div><Label>Rounding (min)</Label><Input name="rounding_minutes" type="number" step="1" defaultValue={String(p.rounding_minutes)} /></div>
          <div><Label>Max comp bank (hrs)</Label><Input name="max_comp_bank_hours" type="number" step="1" defaultValue={p.max_comp_bank_hours ? String(p.max_comp_bank_hours) : ""} placeholder="No cap" /></div>
          <div className="flex items-center gap-2 pt-6">
            <Switch id="allow" name="allow_comp_in_lieu" defaultChecked={Boolean(p.allow_comp_in_lieu)} />
            <Label htmlFor="allow" className="text-sm">Convert OT → comp time</Label>
          </div>
          <div className="col-span-2"><Button type="submit" disabled={polM.isPending}>Save policy</Button></div>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="font-medium mb-3">Comp-time ledger</h3>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground text-left"><tr><th className="py-1">Date</th><th>Employee</th><th>Hours</th><th>Reason</th></tr></thead>
            <tbody>
              {(q.data.ledger ?? []).map((r) => {
                const e = r.employee as { first_name: string; last_name: string } | null;
                return (
                  <tr key={r.id as string} className="border-t">
                    <td className="py-1">{new Date(r.created_at as string).toLocaleDateString()}</td>
                    <td>{e ? `${e.first_name} ${e.last_name}` : "—"}</td>
                    <td className={Number(r.delta_hours) < 0 ? "text-destructive" : "text-emerald-600"}>{Number(r.delta_hours).toFixed(2)}</td>
                    <td>{r.reason as string}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6 lg:col-span-2">
        <h3 className="font-medium mb-3">All timesheets</h3>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground text-left"><tr><th className="py-1">Employee</th><th>Week</th><th>Regular</th><th>OT</th><th>Comp</th><th>Status</th></tr></thead>
            <tbody>
              {(q.data.timesheets ?? []).map((r) => {
                const e = r.employee as { first_name: string; last_name: string; department: string | null } | null;
                return (
                  <tr key={r.id as string} className="border-t">
                    <td className="py-1">{e ? `${e.first_name} ${e.last_name}` : "—"}<div className="text-xs text-muted-foreground">{e?.department}</div></td>
                    <td>{r.week_start as string}</td>
                    <td>{Number(r.regular_hours).toFixed(2)}</td>
                    <td>{Number(r.overtime_hours).toFixed(2)}</td>
                    <td>{Number(r.comp_time_earned).toFixed(2)}</td>
                    <td><Badge variant="outline">{r.status as string}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}