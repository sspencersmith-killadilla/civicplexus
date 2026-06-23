import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { upsertPayGroup, createPayPeriod } from "@/lib/payroll.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/payroll/")({ component: PayrollIndex });

function PayrollIndex() {
  const qc = useQueryClient();
  const groupsQ = useQuery({ queryKey: ["pay-groups"], queryFn: async () => (await supabase.from("pay_groups").select("*").order("name")).data ?? [] });
  const periodsQ = useQuery({ queryKey: ["pay-periods"], queryFn: async () => (await supabase.from("pay_periods").select("*, pay_groups(name)").order("period_start", { ascending: false }).limit(50)).data ?? [] });

  const newGroup = useMutation({
    mutationFn: useServerFn(upsertPayGroup),
    onSuccess: () => { toast.success("Pay group saved"); qc.invalidateQueries({ queryKey: ["pay-groups"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const newPeriod = useMutation({
    mutationFn: useServerFn(createPayPeriod),
    onSuccess: () => { toast.success("Pay period created"); qc.invalidateQueries({ queryKey: ["pay-periods"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [groupName, setGroupName] = useState("");
  const [period, setPeriod] = useState({ pay_group_id: "", period_start: "", period_end: "", check_date: "" });

  return (
    <AppShell title="Payroll">
      <p className="text-sm text-muted-foreground mb-6">Assemble pay periods from approved leave and comp records, then export a file your payroll bureau can import.</p>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card className="p-6 space-y-3">
          <h3 className="font-serif text-lg">New pay group</h3>
          <div><Label>Name</Label><Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="General / Public Safety" /></div>
          <Button disabled={!groupName || newGroup.isPending} onClick={() => newGroup.mutate({ data: { name: groupName } }, { onSuccess: () => setGroupName("") })}>Add group</Button>
        </Card>
        <Card className="p-6 space-y-3">
          <h3 className="font-serif text-lg">New pay period</h3>
          <div>
            <Label>Pay group</Label>
            <Select value={period.pay_group_id} onValueChange={(v) => setPeriod({ ...period, pay_group_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
              <SelectContent>{(groupsQ.data ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Start</Label><Input type="date" value={period.period_start} onChange={(e) => setPeriod({ ...period, period_start: e.target.value })} /></div>
            <div><Label>End</Label><Input type="date" value={period.period_end} onChange={(e) => setPeriod({ ...period, period_end: e.target.value })} /></div>
            <div><Label>Check date</Label><Input type="date" value={period.check_date} onChange={(e) => setPeriod({ ...period, check_date: e.target.value })} /></div>
          </div>
          <Button
            disabled={!period.pay_group_id || !period.period_start || !period.period_end || !period.check_date || newPeriod.isPending}
            onClick={() => newPeriod.mutate({ data: period }, { onSuccess: () => setPeriod({ pay_group_id: "", period_start: "", period_end: "", check_date: "" }) })}
          >Create period</Button>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-serif text-lg mb-3">Recent pay periods</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr><th className="text-left p-2">Group</th><th className="text-left p-2">Period</th><th className="text-left p-2">Check date</th><th className="text-left p-2">Status</th><th /></tr>
          </thead>
          <tbody>
            {(periodsQ.data ?? []).map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{(p as { pay_groups?: { name: string } | null }).pay_groups?.name ?? "—"}</td>
                <td className="p-2">{p.period_start} → {p.period_end}</td>
                <td className="p-2">{p.check_date}</td>
                <td className="p-2"><span className="text-xs px-2 py-0.5 rounded bg-secondary">{p.status}</span></td>
                <td className="p-2 text-right"><Link to="/payroll/$id" params={{ id: p.id }} className="text-primary hover:underline">Open →</Link></td>
              </tr>
            ))}
            {(periodsQ.data?.length ?? 0) === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No pay periods yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}