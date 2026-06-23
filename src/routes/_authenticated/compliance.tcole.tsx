import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { tcoleDashboard, upsertTcoleLicense, recordTcoleCompletion } from "@/lib/tcole.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/compliance/tcole")({ component: TcolePage });

const TOPICS = ["legislative_update","cultural_diversity","de_escalation","crisis_intervention","use_of_force","arrest_search_seizure","firearms","racial_profiling","human_trafficking","other"] as const;

function TcolePage() {
  const qc = useQueryClient();
  const list = useServerFn(tcoleDashboard);
  const upsertLic = useServerFn(upsertTcoleLicense);
  const record = useServerFn(recordTcoleCompletion);
  const { data } = useQuery({ queryKey: ["tcole"], queryFn: () => list() });

  const [licOpen, setLicOpen] = useState<string | null>(null);
  const [lic, setLic] = useState({ license_number: "", license_level: "basic" as const, issued_on: "", cycle_start: "", cycle_end: "", required_hours: 40 });

  const [classOpen, setClassOpen] = useState(false);
  const [cls, setCls] = useState<{ topic: typeof TOPICS[number]; course_title: string; hours: number; completed_on: string; selected: Set<string> }>({
    topic: "legislative_update", course_title: "", hours: 4, completed_on: new Date().toISOString().slice(0,10), selected: new Set(),
  });

  const licMut = useMutation({
    mutationFn: () => upsertLic({ data: { employee_id: licOpen!, ...lic } }),
    onSuccess: () => { toast.success("License saved"); setLicOpen(null); qc.invalidateQueries({ queryKey: ["tcole"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const classMut = useMutation({
    mutationFn: () => record({ data: { employee_ids: [...cls.selected], topic: cls.topic, course_title: cls.course_title, hours: cls.hours, completed_on: cls.completed_on } }),
    onSuccess: (r) => { toast.success(`Recorded for ${r.count} officers`); setClassOpen(false); qc.invalidateQueries({ queryKey: ["tcole"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="TCOLE — peace officer training">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Continuing-ed hours by license cycle. Set a worker type to "peace officer" to roster officers here.</p>
        <Button onClick={() => setClassOpen(true)}>Record class roster</Button>
      </div>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b">
            <tr>
              <th className="text-left p-3 w-8"></th>
              <th className="text-left p-3">Officer</th>
              <th className="text-left p-3">License</th>
              <th className="text-left p-3">Cycle</th>
              <th className="text-left p-3">Hours</th>
              <th className="text-left p-3">Expires in</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r) => {
              const emp = r.employee as { id: string; first_name: string; last_name: string; department?: string; job_title?: string };
              const pct = Math.min(100, Math.round((r.hours_in_cycle / r.required_hours) * 100));
              const checked = cls.selected.has(emp.id);
              return (
                <tr key={emp.id} className="border-t">
                  <td className="p-3"><input type="checkbox" checked={checked} onChange={(e) => {
                    const s = new Set(cls.selected);
                    if (e.target.checked) s.add(emp.id); else s.delete(emp.id);
                    setCls({ ...cls, selected: s });
                  }} /></td>
                  <td className="p-3 font-medium">{emp.first_name} {emp.last_name}<div className="text-xs text-muted-foreground">{emp.department} · {emp.job_title}</div></td>
                  <td className="p-3">{r.license ? <><div>{r.license.license_number}</div><div className="text-xs text-muted-foreground">{r.license.license_level}</div></> : <Badge variant="destructive">No license</Badge>}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.license ? `${r.license.cycle_start} → ${r.license.cycle_end}` : "—"}</td>
                  <td className="p-3 w-44"><div className="flex items-center gap-2"><Progress value={pct} className="h-1.5 flex-1" /><span className="text-xs whitespace-nowrap">{r.hours_in_cycle}/{r.required_hours}</span></div></td>
                  <td className="p-3">{r.days_to_expire == null ? "—" : <Badge variant={r.days_to_expire < 30 ? "destructive" : r.days_to_expire < 90 ? "secondary" : "outline"}>{r.days_to_expire}d</Badge>}</td>
                  <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => { setLicOpen(emp.id); setLic({ license_number: r.license?.license_number ?? "", license_level: (r.license?.license_level ?? "basic") as "basic", issued_on: r.license?.issued_on ?? "", cycle_start: r.license?.cycle_start ?? "", cycle_end: r.license?.cycle_end ?? "", required_hours: r.license?.required_hours ?? 40 }); }}>License</Button></td>
                </tr>
              );
            })}
            {(data?.length ?? 0) === 0 && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">No peace officers yet. Mark a worker type as a peace officer in Worker Types.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!licOpen} onOpenChange={(v) => !v && setLicOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>TCOLE license</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>License number</Label><Input value={lic.license_number} onChange={(e) => setLic({ ...lic, license_number: e.target.value })} /></div>
            <div><Label>Level</Label>
              <Select value={lic.license_level} onValueChange={(v) => setLic({ ...lic, license_level: v as "basic" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["basic","intermediate","advanced","master"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Issued</Label><Input type="date" value={lic.issued_on} onChange={(e) => setLic({ ...lic, issued_on: e.target.value })} /></div>
              <div><Label>Required hours</Label><Input type="number" value={lic.required_hours} onChange={(e) => setLic({ ...lic, required_hours: Number(e.target.value) })} /></div>
              <div><Label>Cycle start</Label><Input type="date" value={lic.cycle_start} onChange={(e) => setLic({ ...lic, cycle_start: e.target.value })} /></div>
              <div><Label>Cycle end</Label><Input type="date" value={lic.cycle_end} onChange={(e) => setLic({ ...lic, cycle_end: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={() => licMut.mutate()} disabled={licMut.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={classOpen} onOpenChange={setClassOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record class roster — {cls.selected.size} officers</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Course title</Label><Input value={cls.course_title} onChange={(e) => setCls({ ...cls, course_title: e.target.value })} /></div>
            <div><Label>Topic</Label>
              <Select value={cls.topic} onValueChange={(v) => setCls({ ...cls, topic: v as typeof TOPICS[number] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TOPICS.map((t) => <SelectItem key={t} value={t}>{t.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Hours</Label><Input type="number" step="0.25" value={cls.hours} onChange={(e) => setCls({ ...cls, hours: Number(e.target.value) })} /></div>
              <div><Label>Completed</Label><Input type="date" value={cls.completed_on} onChange={(e) => setCls({ ...cls, completed_on: e.target.value })} /></div>
            </div>
            {cls.selected.size === 0 && <p className="text-xs text-muted-foreground">Tick officers on the dashboard, then reopen this dialog.</p>}
          </div>
          <DialogFooter><Button onClick={() => classMut.mutate()} disabled={!cls.selected.size || !cls.course_title || classMut.isPending}>Record</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}