import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Download, FileText, ArrowLeft } from "lucide-react";
import { officialOnboardingReport } from "@/lib/official-onboarding.functions";
import { downloadCsv } from "@/lib/download-csv";

export const Route = createFileRoute("/_authenticated/admin-officials/onboarding-report")({
  component: OnboardingReport,
});

type Row = Awaited<ReturnType<typeof officialOnboardingReport>>[number];

function OnboardingReport() {
  const fn = useServerFn(officialOnboardingReport);
  const q = useQuery({ queryKey: ["officials-onboarding-report"], queryFn: () => fn() });
  const rows = (q.data ?? []) as Row[];

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [bodyF, setBodyF] = useState<string>("all");
  const [apptF, setApptF] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [minPct, setMinPct] = useState<number>(0);
  const [maxPct, setMaxPct] = useState<number>(100);

  const bodies = useMemo(
    () => Array.from(new Set(rows.map((r) => r.body_name).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusF !== "all" && r.overall_status !== statusF) return false;
      if (bodyF !== "all" && r.body_name !== bodyF) return false;
      if (apptF !== "all" && r.appointment_type !== apptF) return false;
      if (overdueOnly && r.overdue_count === 0) return false;
      if (r.pct_complete < minPct || r.pct_complete > maxPct) return false;
      if (s) {
        const hay = `${r.official_name} ${r.email ?? ""} ${r.body_name ?? ""} ${r.seat_label ?? ""} ${r.template_name ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, statusF, bodyF, apptF, overdueOnly, minPct, maxPct]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const done = filtered.filter((r) => r.overall_status === "complete").length;
    const started = filtered.filter((r) => r.overall_status === "in_progress").length;
    const not = filtered.filter((r) => r.overall_status === "not_started").length;
    const overdue = filtered.reduce((s, r) => s + r.overdue_count, 0);
    const avg = total ? Math.round(filtered.reduce((s, r) => s + r.pct_complete, 0) / total) : 0;
    return { total, done, started, not, overdue, avg };
  }, [filtered]);

  function exportCsv() {
    const headers = [
      "official", "email", "body", "seat", "appointment_type", "term_status",
      "start_date", "end_date", "template", "overall_status", "pct_complete",
      "tasks_required", "tasks_required_done", "overdue_count", "docs_attached",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push([
        r.official_name, r.email, r.body_name, r.seat_label, r.appointment_type,
        r.term_status, r.start_date, r.end_date, r.template_name, r.overall_status,
        r.pct_complete, r.tasks_required, r.tasks_required_done, r.overdue_count, r.docs_attached,
      ].map(esc).join(","));
    }
    downloadCsv(lines.join("\n"), `officials-onboarding-${new Date().toISOString().slice(0,10)}.csv`);
  }

  function statusBadge(s: Row["overall_status"]) {
    if (s === "complete") return <Badge className="bg-emerald-600 hover:bg-emerald-700">complete</Badge>;
    if (s === "in_progress") return <Badge className="bg-amber-500 hover:bg-amber-600">in progress</Badge>;
    if (s === "not_started") return <Badge variant="outline">not started</Badge>;
    return <Badge variant="outline" className="border-dashed">no instance</Badge>;
  }

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link to="/admin-officials" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Back to officials</Link>
            <h1 className="text-2xl font-serif tracking-tight flex items-center gap-2 mt-1">
              <FileText className="h-6 w-6" /> Onboarding report
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Search and filter active and pending officials by onboarding progress and overdue tasks.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1" /> Export CSV ({filtered.length})
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat label="Terms" value={summary.total} />
          <Stat label="Complete" value={summary.done} tone="emerald" />
          <Stat label="In progress" value={summary.started} tone="amber" />
          <Stat label="Not started" value={summary.not} />
          <Stat label="Overdue tasks" value={summary.overdue} tone={summary.overdue ? "rose" : undefined} />
          <Stat label="Avg % complete" value={`${summary.avg}%`} />
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Search</Label>
              <Input placeholder="Name, email, body, seat…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={statusF} onValueChange={setStatusF}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="not_started">Not started</SelectItem>
                  <SelectItem value="no_instance">No instance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Body</Label>
              <Select value={bodyF} onValueChange={setBodyF}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All bodies</SelectItem>
                  {bodies.map((b) => <SelectItem key={b!} value={b!}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Appointment</Label>
              <Select value={apptF} onValueChange={setApptF}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="elected">Elected</SelectItem>
                  <SelectItem value="appointed">Appointed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-xs mt-auto">
                <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
                Overdue only
              </label>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">% complete range ({minPct}–{maxPct}%)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={100} value={minPct}
                  onChange={(e) => setMinPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="number" min={0} max={100} value={maxPct}
                  onChange={(e) => setMaxPct(Math.max(0, Math.min(100, Number(e.target.value) || 100)))} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Official</th>
                  <th className="text-left p-3">Body / seat</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3 w-48">Progress</th>
                  <th className="text-right p-3">Overdue</th>
                  <th className="text-right p-3">Docs</th>
                  <th className="text-left p-3">Term</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">Loading…</td></tr>
                )}
                {!q.isLoading && filtered.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">No terms match your filters.</td></tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.term_id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{r.official_name || "—"}</div>
                      {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
                    </td>
                    <td className="p-3">
                      <div>{r.body_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.seat_label ?? ""}</div>
                    </td>
                    <td className="p-3 capitalize text-xs">{r.appointment_type ?? "—"}</td>
                    <td className="p-3">{statusBadge(r.overall_status)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Progress value={r.pct_complete} className="h-2" />
                        <span className="text-xs text-muted-foreground w-10 text-right">{r.pct_complete}%</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {r.tasks_required_done}/{r.tasks_required} required
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      {r.overdue_count > 0
                        ? <Badge variant="outline" className="border-rose-400 text-rose-700">{r.overdue_count}</Badge>
                        : <span className="text-muted-foreground text-xs">0</span>}
                    </td>
                    <td className="p-3 text-right text-xs">{r.docs_attached}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {r.start_date}{r.end_date ? ` → ${r.end_date}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "emerald" | "amber" | "rose" }) {
  const cls =
    tone === "emerald" ? "text-emerald-700" :
    tone === "amber" ? "text-amber-700" :
    tone === "rose" ? "text-rose-700" : "";
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-serif ${cls}`}>{value}</div>
    </Card>
  );
}