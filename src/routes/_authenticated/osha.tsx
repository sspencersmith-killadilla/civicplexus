import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { buildOsha300Summary } from "@/lib/reports.functions";

export const Route = createFileRoute("/_authenticated/osha")({ component: OshaPage });

function OshaPage() {
  const qc = useQueryClient();
  const summary = useServerFn(buildOsha300Summary);
  const [year, setYear] = useState(new Date().getFullYear());
  const [summaryData, setSummaryData] = useState<any>(null);

  const incidentsQ = useQuery({ queryKey: ["osha-incidents", year], queryFn: async () => {
    const { data, error } = await supabase.from("osha_incidents").select("*").gte("incident_date", `${year}-01-01`).lte("incident_date", `${year}-12-31`).order("incident_date", { ascending: false });
    if (error) throw error; return data ?? [];
  }});
  const employeesQ = useQuery({ queryKey: ["emps-osha"], queryFn: async () => {
    const { data } = await supabase.from("employees").select("id,first_name,last_name,job_title,department").order("last_name");
    return data ?? [];
  }});

  const [form, setForm] = useState({
    employee_id: "", incident_date: new Date().toISOString().slice(0, 10),
    job_title_at_incident: "", department: "", where_occurred: "", description: "",
    injury_illness_type: "", body_part_affected: "", outcome: "first_aid",
    days_away: "0", days_restricted: "0", recordable: true, privacy_case: false,
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = { ...form, days_away: Number(form.days_away), days_restricted: Number(form.days_restricted), employee_id: form.employee_id || null };
      const { error } = await supabase.from("osha_incidents").insert(payload as never); if (error) throw error;
    },
    onSuccess: () => { toast.success("Incident logged"); qc.invalidateQueries({ queryKey: ["osha-incidents", year] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="OSHA Recordkeeping (300/300A/301)">
      <p className="text-sm text-muted-foreground mb-4">Log workplace injuries and illnesses, then generate the 300 Log, 300A Annual Summary, and 301 Incident Reports required by federal OSHA recordkeeping rules.</p>

      <div className="flex items-end gap-3 mb-4">
        <div><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-32" /></div>
        <Button variant="outline" onClick={async () => { const r = await summary({ data: { year } }); setSummaryData(r); }}><FileText className="h-4 w-4 mr-1" /> Generate 300A summary</Button>
        <Dialog>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Log incident</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>OSHA 301 — Incident report</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Employee</Label><Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}><SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger><SelectContent>{(employeesQ.data ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Incident date</Label><Input type="date" value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} /></div>
                <div><Label>Job title</Label><Input value={form.job_title_at_incident} onChange={(e) => setForm({ ...form, job_title_at_incident: e.target.value })} /></div>
                <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
              </div>
              <div><Label>Where it occurred</Label><Input value={form.where_occurred} onChange={(e) => setForm({ ...form, where_occurred: e.target.value })} placeholder="Loading dock, Bay 3" /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Injury/Illness type</Label><Input value={form.injury_illness_type} onChange={(e) => setForm({ ...form, injury_illness_type: e.target.value })} placeholder="Sprain" /></div>
                <div><Label>Body part</Label><Input value={form.body_part_affected} onChange={(e) => setForm({ ...form, body_part_affected: e.target.value })} placeholder="Lower back" /></div>
                <div><Label>Outcome</Label><Select value={form.outcome} onValueChange={(v) => setForm({ ...form, outcome: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="death">Death</SelectItem>
                  <SelectItem value="days_away">Days away from work</SelectItem>
                  <SelectItem value="restricted_transfer">Job transfer/restriction</SelectItem>
                  <SelectItem value="medical_treatment">Medical treatment beyond first aid</SelectItem>
                  <SelectItem value="first_aid">First aid only</SelectItem>
                  <SelectItem value="other">Other recordable</SelectItem>
                </SelectContent></Select></div>
                <div><Label>Days away</Label><Input type="number" value={form.days_away} onChange={(e) => setForm({ ...form, days_away: e.target.value })} /></div>
                <div><Label>Days restricted</Label><Input type="number" value={form.days_restricted} onChange={(e) => setForm({ ...form, days_restricted: e.target.value })} /></div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.recordable} onChange={(e) => setForm({ ...form, recordable: e.target.checked })} /> Recordable on 300 Log</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.privacy_case} onChange={(e) => setForm({ ...form, privacy_case: e.target.checked })} /> Privacy case (omit name)</label>
              </div>
            </div>
            <DialogFooter><Button disabled={!form.description || !form.incident_date || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {summaryData && (
        <Card className="p-4 mb-4">
          <h3 className="font-medium mb-3">300A Annual Summary — {summaryData.year}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <KV label="Total cases" v={summaryData.totals.total_cases} />
            <KV label="Deaths" v={summaryData.totals.deaths} />
            <KV label="Days away" v={summaryData.totals.days_away_cases} />
            <KV label="Restricted/transfer" v={summaryData.totals.restricted_cases} />
            <KV label="Other recordable" v={summaryData.totals.other_recordable} />
            <KV label="Total days away" v={summaryData.totals.total_days_away} />
            <KV label="Total days restricted" v={summaryData.totals.total_days_restricted} />
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-medium mb-3">300 Log — {year}</h3>
        <Table><TableHeader><TableRow><TableHead>Case #</TableHead><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Outcome</TableHead><TableHead className="text-right">Away</TableHead><TableHead className="text-right">Restr.</TableHead></TableRow></TableHeader><TableBody>
          {(incidentsQ.data ?? []).map((i: any) => (
            <TableRow key={i.id}><TableCell className="font-mono text-xs">{i.case_number}</TableCell><TableCell>{i.incident_date}</TableCell><TableCell className="max-w-md truncate">{i.description}</TableCell><TableCell className="text-xs">{i.outcome}</TableCell><TableCell className="text-right">{i.days_away}</TableCell><TableCell className="text-right">{i.days_restricted}</TableCell></TableRow>
          ))}
          {(incidentsQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No incidents logged for {year}.</TableCell></TableRow>}
        </TableBody></Table>
      </Card>
    </AppShell>
  );
}

function KV({ label, v }: { label: string; v: number }) {
  return <div className="border rounded p-2"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold">{v}</div></div>;
}
