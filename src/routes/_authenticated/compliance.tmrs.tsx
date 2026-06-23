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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listTmrsFiles, composeTmrsFile, signOffTmrsFile, upsertTmrsEnrollment } from "@/lib/tmrs.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/compliance/tmrs")({ component: TmrsPage });

function TmrsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listTmrsFiles);
  const compose = useServerFn(composeTmrsFile);
  const sign = useServerFn(signOffTmrsFile);
  const enroll = useServerFn(upsertTmrsEnrollment);
  const { data } = useQuery({ queryKey: ["tmrs"], queryFn: () => list() });
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [enr, setEnr] = useState({ employee_id: "", member_rate_pct: 7, enrolled_on: today.toISOString().slice(0, 10) });

  const composeMut = useMutation({
    mutationFn: () => compose({ data: { year, month } }),
    onSuccess: (r) => { toast.success(`Composed: ${r.totals.count} employees, $${r.totals.totalGross.toFixed(2)} gross`); qc.invalidateQueries({ queryKey: ["tmrs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const signMut = useMutation({
    mutationFn: (id: string) => sign({ data: { file_id: id } }),
    onSuccess: () => { toast.success("Signed off & exported"); qc.invalidateQueries({ queryKey: ["tmrs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const enrollMut = useMutation({
    mutationFn: () => enroll({ data: enr }),
    onSuccess: () => { toast.success("Enrollment added"); setEnr({ ...enr, employee_id: "" }); qc.invalidateQueries({ queryKey: ["tmrs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="TMRS monthly reporting">
      <p className="text-sm text-muted-foreground mb-4">Composes the monthly contribution file from finalized payroll runs. Two-person sign-off required.</p>
      <Tabs defaultValue="files">
        <TabsList>
          <TabsTrigger value="files">Monthly files</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
        </TabsList>
        <TabsContent value="files">
          <Card className="p-4 mb-4 flex items-end gap-3">
            <div><Label className="text-xs">Year</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" /></div>
            <div><Label className="text-xs">Month</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-20" /></div>
            <Button onClick={() => composeMut.mutate()} disabled={composeMut.isPending}>Compose file</Button>
          </Card>
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b"><tr><th className="text-left p-3">Period</th><th className="text-left p-3">Employees</th><th className="text-left p-3">Gross</th><th className="text-left p-3">Member</th><th className="text-left p-3">Employer</th><th className="text-left p-3">Variance</th><th className="text-left p-3">Status</th><th></th></tr></thead>
              <tbody>
                {(data?.files ?? []).map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="p-3 font-medium">{f.period_year}-{String(f.period_month).padStart(2, "0")}</td>
                    <td className="p-3">{f.employee_count}</td>
                    <td className="p-3">${Number(f.total_gross).toLocaleString()}</td>
                    <td className="p-3">${Number(f.total_member_contrib).toLocaleString()}</td>
                    <td className="p-3">${Number(f.total_employer_contrib).toLocaleString()}</td>
                    <td className="p-3">{f.variance_pct != null ? <Badge variant={Math.abs(Number(f.variance_pct)) > 10 ? "destructive" : "outline"}>{f.variance_pct}%</Badge> : "—"}</td>
                    <td className="p-3"><Badge variant={f.status === "signed_off" ? "default" : "secondary"}>{f.status}</Badge></td>
                    <td className="p-3 text-right">{f.status === "prepared" && <Button size="sm" onClick={() => signMut.mutate(f.id)}>Sign off</Button>}</td>
                  </tr>
                ))}
                {(data?.files?.length ?? 0) === 0 && <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">No files composed yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
        <TabsContent value="enrollments">
          <Card className="p-4 mb-4 grid grid-cols-4 gap-3 items-end">
            <div className="col-span-2"><Label className="text-xs">Employee ID</Label><Input value={enr.employee_id} onChange={(e) => setEnr({ ...enr, employee_id: e.target.value })} placeholder="uuid" /></div>
            <div><Label className="text-xs">Member rate %</Label><Input type="number" step="0.01" value={enr.member_rate_pct} onChange={(e) => setEnr({ ...enr, member_rate_pct: Number(e.target.value) })} /></div>
            <div><Label className="text-xs">Enrolled on</Label><Input type="date" value={enr.enrolled_on} onChange={(e) => setEnr({ ...enr, enrolled_on: e.target.value })} /></div>
            <Button className="col-span-4 md:col-span-1" onClick={() => enrollMut.mutate()} disabled={!enr.employee_id || enrollMut.isPending}>Add enrollment</Button>
          </Card>
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b"><tr><th className="text-left p-3">Employee</th><th className="text-left p-3">Rate</th><th className="text-left p-3">Enrolled</th><th className="text-left p-3">Exited</th></tr></thead>
              <tbody>
                {(data?.enrollments ?? []).map((e) => {
                  const emp = e.employees as { first_name?: string; last_name?: string; department?: string } | null;
                  return (
                    <tr key={e.id} className="border-t">
                      <td className="p-3 font-medium">{emp?.first_name} {emp?.last_name}<div className="text-xs text-muted-foreground">{emp?.department}</div></td>
                      <td className="p-3">{e.member_rate_pct}%</td>
                      <td className="p-3">{e.enrolled_on}</td>
                      <td className="p-3">{e.exited_on ?? "—"}</td>
                    </tr>
                  );
                })}
                {(data?.enrollments?.length ?? 0) === 0 && <tr><td colSpan={4} className="p-10 text-center text-muted-foreground">No enrollments yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}