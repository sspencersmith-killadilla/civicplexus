import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listNewHireReports, generateNewHireBatch, downloadComplianceFile, markBatchSubmitted } from "@/lib/twc.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/compliance/new-hire")({ component: NewHirePage });

function NewHirePage() {
  const qc = useQueryClient();
  const list = useServerFn(listNewHireReports);
  const gen = useServerFn(generateNewHireBatch);
  const dl = useServerFn(downloadComplianceFile);
  const mark = useServerFn(markBatchSubmitted);
  const { data } = useQuery({ queryKey: ["nhr"], queryFn: () => list() });

  const genMut = useMutation({
    mutationFn: () => gen(),
    onSuccess: (r) => { toast.success(`Batched ${r.count} hires`); qc.invalidateQueries({ queryKey: ["nhr"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function download(path: string) {
    const { url } = await dl({ data: { path } });
    window.open(url, "_blank");
  }

  const queued = (data?.reports ?? []).filter((r) => r.status === "queued");

  return (
    <AppShell title="TWC new-hire reporting">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Texas employers must report new hires within 20 days. Generates a CSV the payroll clerk uploads to the Texas Attorney General portal.</p>
        <Button onClick={() => genMut.mutate()} disabled={!queued.length || genMut.isPending}>Generate batch ({queued.length})</Button>
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Pending hires</TabsTrigger>
          <TabsTrigger value="batches">Submitted batches</TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b"><tr><th className="text-left p-3">Employee</th><th className="text-left p-3">Department</th><th className="text-left p-3">Hire date</th><th className="text-left p-3">Status</th></tr></thead>
              <tbody>
                {(data?.reports ?? []).map((r) => {
                  const e = r.employees as { first_name?: string; last_name?: string; department?: string; job_title?: string } | null;
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-3 font-medium">{e?.first_name} {e?.last_name}<div className="text-xs text-muted-foreground">{e?.job_title}</div></td>
                      <td className="p-3 text-muted-foreground">{e?.department ?? "—"}</td>
                      <td className="p-3">{r.hire_date}</td>
                      <td className="p-3"><Badge variant={r.status === "queued" ? "outline" : r.status === "submitted" ? "default" : "secondary"}>{r.status}</Badge></td>
                    </tr>
                  );
                })}
                {(data?.reports?.length ?? 0) === 0 && <tr><td colSpan={4} className="p-10 text-center text-muted-foreground">No hires queued yet — triggers fire when an employee becomes active.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
        <TabsContent value="batches">
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b"><tr><th className="text-left p-3">Generated</th><th className="text-left p-3">Period</th><th className="text-left p-3">Count</th><th className="text-left p-3">Submitted</th><th></th></tr></thead>
              <tbody>
                {(data?.batches ?? []).map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="p-3">{new Date(b.generated_at).toLocaleString()}</td>
                    <td className="p-3 text-muted-foreground">{b.period_start} → {b.period_end}</td>
                    <td className="p-3">{b.employee_count}</td>
                    <td className="p-3">{b.submitted_at ? <Badge>Submitted {new Date(b.submitted_at).toLocaleDateString()}</Badge> : <Badge variant="outline">Pending</Badge>}</td>
                    <td className="p-3 text-right space-x-2">
                      {b.file_path && <Button size="sm" variant="outline" onClick={() => download(b.file_path!)}>Download</Button>}
                      {!b.submitted_at && <Button size="sm" onClick={async () => { await mark({ data: { batch_id: b.id } }); qc.invalidateQueries({ queryKey: ["nhr"] }); }}>Mark submitted</Button>}
                    </td>
                  </tr>
                ))}
                {(data?.batches?.length ?? 0) === 0 && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">No batches yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}