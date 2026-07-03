import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, CalendarPlus, Trash2, Check, X, KeyRound, FileText, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  listVolunteerJobs, upsertVolunteerJob, deleteVolunteerJob,
  listShiftsForJob, upsertShift, deleteShift,
  listAllSignups, decideSignup, listClockEvents,
  kioskSearchSignups, kioskClock, generateVolunteerTimesheet, type TimesheetEntry,
} from "@/lib/volunteer-jobs.functions";

export const Route = createFileRoute("/_authenticated/volunteer-jobs")({
  component: VolunteerJobsAdmin,
});

type Job = {
  id: string; title: string; description: string | null; location: string | null;
  skills_required: string[] | null; status: string; requires_background_check: boolean;
  requires_waiver: boolean; min_age: number | null; coordinator_email: string | null; slug: string;
};

function VolunteerJobsAdmin() {
  const qc = useQueryClient();
  const router = useRouter();
  const fetchJobs = useServerFn(listVolunteerJobs);
  const fetchSignups = useServerFn(listAllSignups);
  const fetchClock = useServerFn(listClockEvents);
  const upsertJob = useServerFn(upsertVolunteerJob);
  const delJob = useServerFn(deleteVolunteerJob);
  const decide = useServerFn(decideSignup);

  const { data: jobs } = useQuery({ queryKey: ["v-jobs"], queryFn: () => fetchJobs() });
  const { data: signups } = useQuery({ queryKey: ["v-signups"], queryFn: () => fetchSignups() });
  const { data: clock } = useQuery({ queryKey: ["v-clock"], queryFn: () => fetchClock() });

  const [editing, setEditing] = useState<Job | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shiftsFor, setShiftsFor] = useState<Job | null>(null);
  const [kioskOpen, setKioskOpen] = useState(false);

  const saveJob = useMutation({
    mutationFn: (form: Partial<Job>) => upsertJob({ data: {
      id: editing?.id ?? null,
      title: form.title!, description: form.description ?? null, location: form.location ?? null,
      skills_required: form.skills_required ?? [], min_age: form.min_age ?? null,
      requires_background_check: !!form.requires_background_check,
      requires_waiver: form.requires_waiver ?? true,
      status: (form.status ?? "open") as "open" | "closed" | "draft",
      coordinator_email: form.coordinator_email ?? null,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v-jobs"] }); router.invalidate(); toast.success("Saved"); setDialogOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const removeJob = useMutation({
    mutationFn: (id: string) => delJob({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v-jobs"] }); toast.success("Deleted"); },
  });

  const decideMut = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject" }) => decide({ data: v }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["v-signups"] });
      if (r.pin) toast.success(`Approved — PIN ${r.pin}`); else toast.success("Rejected");
    },
  });

  return (
    <AppShell title="Volunteer jobs">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Create volunteer job descriptions and shifts, approve signups, and run the coordinator kiosk.
          Public listing: <code>/serve/volunteer/jobs</code>. Clock portal: <code>/serve/volunteer/clock</code>.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setKioskOpen(true)}>Kiosk</Button>
          <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New job</Button></DialogTrigger>
            <JobDialog editing={editing} onSubmit={(f) => saveJob.mutate(f)} saving={saveJob.isPending} />
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(jobs as Job[] | undefined)?.map((j) => (
          <Card key={j.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{j.title}</h3>
                <p className="text-xs text-muted-foreground">{j.location ?? "—"}</p>
              </div>
              <Badge variant="outline">{j.status}</Badge>
            </div>
            {j.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{j.description}</p>}
            <div className="mt-4 flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => { setEditing(j); setDialogOpen(true); }}>Edit</Button>
              <Button size="sm" variant="secondary" onClick={() => setShiftsFor(j)}><CalendarPlus className="h-3 w-3 mr-1" /> Shifts</Button>
              <Button size="sm" variant="ghost" onClick={() => confirm("Delete this job?") && removeJob.mutate(j.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Signups</h2>
      <Card className="p-4">
        <div className="space-y-2">
          {((signups ?? []) as Array<{
            id: string; applicant_first_name: string; applicant_last_name: string; applicant_email: string | null;
            status: string; pin_code: string | null;
            shift: { starts_at: string; ends_at: string; volunteer_jobs: { title: string } | null } | null;
          }>).map((s) => (
            <div key={s.id} className="flex items-center justify-between border rounded-md p-3">
              <div className="text-sm">
                <div className="font-medium">{s.applicant_first_name} {s.applicant_last_name} <Badge variant="outline" className="ml-2">{s.status}</Badge></div>
                <div className="text-xs text-muted-foreground">
                  {s.shift?.volunteer_jobs?.title} · {s.shift ? new Date(s.shift.starts_at).toLocaleString() : "—"}
                  {s.applicant_email && <> · {s.applicant_email}</>}
                  {s.pin_code && <> · PIN <span className="font-mono">{s.pin_code}</span></>}
                </div>
              </div>
              {s.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => decideMut.mutate({ id: s.id, action: "approve" })}><Check className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => decideMut.mutate({ id: s.id, action: "reject" })}><X className="h-3 w-3" /></Button>
                </div>
              )}
            </div>
          ))}
          {(signups ?? []).length === 0 && <p className="text-sm text-muted-foreground">No signups yet.</p>}
        </div>
      </Card>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Clock activity</h2>
      <Card className="p-4">
        <div className="space-y-1 text-sm">
          {((clock ?? []) as Array<{ id: string; clock_in: string; clock_out: string | null; method: string; signup: { applicant_first_name: string; applicant_last_name: string; volunteer_shifts: { volunteer_jobs: { title: string } | null } | null } | null }>).map((c) => (
            <div key={c.id} className="flex justify-between border-b py-1 last:border-0">
              <span>{c.signup?.applicant_first_name} {c.signup?.applicant_last_name} — {c.signup?.volunteer_shifts?.volunteer_jobs?.title ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{new Date(c.clock_in).toLocaleString()} → {c.clock_out ? new Date(c.clock_out).toLocaleTimeString() : "in progress"} · {c.method}</span>
            </div>
          ))}
          {(clock ?? []).length === 0 && <p className="text-muted-foreground">No clock entries yet.</p>}
        </div>
      </Card>

      <TimesheetSection jobs={(jobs ?? []) as Array<{ id: string; title: string }>} />

      {shiftsFor && <ShiftsDialog job={shiftsFor} onClose={() => setShiftsFor(null)} />}
      {kioskOpen && <KioskDialog onClose={() => setKioskOpen(false)} />}
    </AppShell>
  );
}

function toIsoStart(d: string) { return new Date(d + "T00:00:00").toISOString(); }
function toIsoEnd(d: string) { return new Date(d + "T23:59:59.999").toISOString(); }
function fmtDT(iso: string | null) { return iso ? new Date(iso).toLocaleString() : "—"; }

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(entries: TimesheetEntry[], from: string, to: string) {
  const header = ["Volunteer", "Email", "Job", "Clock in", "Clock out", "Hours", "Method", "Notes"];
  const rows = entries.map((e) => [e.volunteer_name, e.applicant_email ?? "", e.job_title, fmtDT(e.clock_in), fmtDT(e.clock_out), e.hours.toFixed(2), e.method, e.notes ?? ""]);
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `volunteer-timesheet-${from}_to_${to}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function printPdf(entries: TimesheetEntry[], totals: { total_hours: number; total_sessions: number; unique_volunteers: number }, from: string, to: string, jobLabel: string) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { toast.error("Popup blocked — allow popups to export PDF"); return; }
  const html = `<!doctype html><html><head><title>Volunteer Timesheet ${from} to ${to}</title>
    <style>
      body{font-family:system-ui,-apple-system,sans-serif;color:#111;margin:32px;font-size:12px}
      h1{font-size:18px;margin:0 0 4px}
      .meta{color:#555;margin-bottom:16px}
      .totals{display:flex;gap:24px;margin:12px 0 20px;padding:12px;background:#f5f5f5;border-radius:6px}
      .totals div{font-size:11px;color:#555}
      .totals strong{display:block;font-size:16px;color:#111;margin-top:2px}
      table{width:100%;border-collapse:collapse}
      th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top}
      th{background:#f8f8f8;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#555}
      tr:nth-child(even) td{background:#fafafa}
      @media print{body{margin:16mm}}
    </style></head><body>
    <h1>Volunteer Timesheet</h1>
    <div class="meta">${from} → ${to} · ${jobLabel} · Generated ${new Date().toLocaleString()}</div>
    <div class="totals">
      <div>Total hours <strong>${totals.total_hours.toFixed(2)}</strong></div>
      <div>Sessions <strong>${totals.total_sessions}</strong></div>
      <div>Volunteers <strong>${totals.unique_volunteers}</strong></div>
    </div>
    <table><thead><tr><th>Volunteer</th><th>Job</th><th>Clock in</th><th>Clock out</th><th>Hours</th><th>Method</th></tr></thead><tbody>
    ${entries.map((e) => `<tr><td>${escapeHtml(e.volunteer_name)}${e.applicant_email ? `<div style="color:#888;font-size:10px">${escapeHtml(e.applicant_email)}</div>` : ""}</td><td>${escapeHtml(e.job_title)}</td><td>${escapeHtml(fmtDT(e.clock_in))}</td><td>${escapeHtml(fmtDT(e.clock_out))}</td><td>${e.hours.toFixed(2)}</td><td>${escapeHtml(e.method)}</td></tr>`).join("")}
    ${entries.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:#888;padding:20px">No clock entries in this range.</td></tr>' : ""}
    </tbody></table>
    <script>window.onload=()=>{window.focus();window.print();}</script>
    </body></html>`;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)); }

function TimesheetSection({ jobs }: { jobs: Array<{ id: string; title: string }> }) {
  const generate = useServerFn(generateVolunteerTimesheet);
  const today = new Date();
  const twoWeeksAgo = new Date(today.getTime() - 13 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [from, setFrom] = useState(iso(twoWeeksAgo));
  const [to, setTo] = useState(iso(today));
  const [jobId, setJobId] = useState<string>("");
  const [includeOpen, setIncludeOpen] = useState(false);
  const [result, setResult] = useState<{ entries: TimesheetEntry[]; totals: { total_hours: number; total_sessions: number; unique_volunteers: number } } | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const r = await generate({ data: { from: toIsoStart(from), to: toIsoEnd(to), job_id: jobId || null, include_open: includeOpen } });
      setResult(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally { setLoading(false); }
  }

  const jobLabel = jobId ? (jobs.find((j) => j.id === jobId)?.title ?? "Job") : "All jobs";

  return (
    <>
      <h2 className="mt-10 mb-3 text-lg font-semibold flex items-center gap-2"><FileText className="h-5 w-5" /> Timesheets</h2>
      <Card className="p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5 items-end">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Job (optional)</Label>
            <select className="w-full border rounded h-9 px-2 bg-background text-sm" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">All jobs</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <input type="checkbox" checked={includeOpen} onChange={(e) => setIncludeOpen(e.target.checked)} />
            Include open sessions
          </label>
          <Button onClick={run} disabled={loading}>{loading ? "Generating…" : "Generate timesheet"}</Button>
        </div>

        {result && (
          <>
            <div className="flex flex-wrap gap-4 items-center pt-2 border-t">
              <div className="text-sm"><span className="text-muted-foreground">Total hours: </span><span className="font-semibold">{result.totals.total_hours.toFixed(2)}</span></div>
              <div className="text-sm"><span className="text-muted-foreground">Sessions: </span><span className="font-semibold">{result.totals.total_sessions}</span></div>
              <div className="text-sm"><span className="text-muted-foreground">Volunteers: </span><span className="font-semibold">{result.totals.unique_volunteers}</span></div>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadCsv(result.entries, from, to)} disabled={result.entries.length === 0}>
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => printPdf(result.entries, result.totals, from, to, jobLabel)} disabled={result.entries.length === 0}>
                  <Printer className="h-4 w-4 mr-1" /> PDF
                </Button>
              </div>
            </div>
            <div className="max-h-96 overflow-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Volunteer</th>
                    <th className="text-left p-2">Job</th>
                    <th className="text-left p-2">Clock in</th>
                    <th className="text-left p-2">Clock out</th>
                    <th className="text-right p-2">Hours</th>
                    <th className="text-left p-2">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {result.entries.map((e, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{e.volunteer_name}{e.applicant_email && <div className="text-xs text-muted-foreground">{e.applicant_email}</div>}</td>
                      <td className="p-2">{e.job_title}</td>
                      <td className="p-2">{fmtDT(e.clock_in)}</td>
                      <td className="p-2">{e.clock_out ? fmtDT(e.clock_out) : <span className="text-amber-700">in progress</span>}</td>
                      <td className="p-2 text-right font-mono">{e.hours.toFixed(2)}</td>
                      <td className="p-2">{e.method}</td>
                    </tr>
                  ))}
                  {result.entries.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No entries in this range.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!result && <p className="text-xs text-muted-foreground">Pick a date range and click Generate. Only closed clock-out sessions count toward totals unless you include open ones.</p>}
      </Card>
    </>
  );
}

function JobDialog({ editing, onSubmit, saving }: { editing: Job | null; onSubmit: (f: Partial<Job>) => void; saving: boolean }) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [skills, setSkills] = useState((editing?.skills_required ?? []).join(", "));
  const [status, setStatus] = useState(editing?.status ?? "open");
  const [bg, setBg] = useState(!!editing?.requires_background_check);
  const [waiver, setWaiver] = useState(editing?.requires_waiver ?? true);
  const [email, setEmail] = useState(editing?.coordinator_email ?? "");
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Edit job" : "New volunteer job"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Description</Label><Textarea rows={4} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Location</Label><Input value={location ?? ""} onChange={(e) => setLocation(e.target.value)} /></div>
          <div><Label>Coordinator email</Label><Input type="email" value={email ?? ""} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div><Label>Skills (comma-separated)</Label><Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="first aid, spanish" /></div>
        <div className="grid grid-cols-3 gap-3 items-end">
          <div>
            <Label>Status</Label>
            <select className="w-full border rounded-md h-10 px-3 bg-background" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="open">Open</option><option value="closed">Closed</option><option value="draft">Draft</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bg} onChange={(e) => setBg(e.target.checked)} /> Background check</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} /> Waiver required</label>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={saving || !title} onClick={() => onSubmit({
          title, description: description || null, location: location || null,
          skills_required: skills.split(",").map((s) => s.trim()).filter(Boolean),
          status, requires_background_check: bg, requires_waiver: waiver, coordinator_email: email || null,
        })}>{saving ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ShiftsDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listShiftsForJob);
  const upsert = useServerFn(upsertShift);
  const del = useServerFn(deleteShift);
  const { data: shifts } = useQuery({ queryKey: ["shifts", job.id], queryFn: () => list({ data: { job_id: job.id } }) });
  const [starts, setStarts] = useState(""); const [ends, setEnds] = useState("");
  const [cap, setCap] = useState("1"); const [loc, setLoc] = useState("");

  const add = useMutation({
    mutationFn: () => upsert({ data: { id: null, job_id: job.id, starts_at: new Date(starts).toISOString(), ends_at: new Date(ends).toISOString(), capacity: Number(cap), location: loc || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shifts", job.id] }); setStarts(""); setEnds(""); toast.success("Shift added"); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts", job.id] }),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Shifts — {job.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <div><Label>Starts</Label><Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} /></div>
            <div><Label>Ends</Label><Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} /></div>
            <div><Label>Capacity</Label><Input type="number" min="1" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
            <div><Label>Location</Label><Input value={loc} onChange={(e) => setLoc(e.target.value)} /></div>
          </div>
          <Button size="sm" disabled={!starts || !ends || add.isPending} onClick={() => add.mutate()}>Add shift</Button>
          <div className="border-t pt-3 space-y-1 max-h-80 overflow-y-auto">
            {(shifts ?? []).map((s) => (
              <div key={s.id} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span>{new Date(s.starts_at).toLocaleString()} → {new Date(s.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-xs text-muted-foreground">cap {s.capacity} · {s.location ?? "—"}</span>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
            {(shifts ?? []).length === 0 && <p className="text-sm text-muted-foreground">No shifts yet.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KioskDialog({ onClose }: { onClose: () => void }) {
  const search = useServerFn(kioskSearchSignups);
  const clock = useServerFn(kioskClock);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; applicant_first_name: string; applicant_last_name: string; shift: { volunteer_jobs: { title: string } | null } | null }>>([]);

  async function run() {
    if (!q.trim()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await search({ data: { q } }); setResults(r as any);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle><KeyRound className="inline h-4 w-4 mr-1" /> Coordinator kiosk</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Search today's approved volunteers by name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
            <Button onClick={run}>Search</Button>
          </div>
          {results.map((r) => (
            <div key={r.id} className="flex justify-between items-center border rounded-md p-2">
              <div className="text-sm">
                <div className="font-medium">{r.applicant_first_name} {r.applicant_last_name}</div>
                <div className="text-xs text-muted-foreground">{r.shift?.volunteer_jobs?.title}</div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" onClick={() => clock({ data: { signup_id: r.id, action: "in" } }).then(() => toast.success("Clocked in")).catch((e) => toast.error(e.message))}>In</Button>
                <Button size="sm" variant="secondary" onClick={() => clock({ data: { signup_id: r.id, action: "out" } }).then(() => toast.success("Clocked out")).catch((e) => toast.error(e.message))}>Out</Button>
              </div>
            </div>
          ))}
          {results.length === 0 && q && <p className="text-sm text-muted-foreground">No matches for today.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}