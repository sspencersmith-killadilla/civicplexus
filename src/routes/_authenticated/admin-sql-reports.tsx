import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Download, Play, Save, Star, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/download-csv";
import {
  runReportSql, getReportSchema, listSavedReports, saveReport,
  deleteSavedReport, toggleFavoriteReport, listReportQueryLog,
  type ReportRunResult, type SavedReport,
} from "@/lib/reports-sql.functions";

export const Route = createFileRoute("/_authenticated/admin-sql-reports")({
  component: SqlReportsPage,
});

const STARTER_SQL = `-- Example: active employees per department
select department, count(*) as headcount
from employees
where status = 'active'
group by department
order by headcount desc;`;

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function SqlReportsPage() {
  const qc = useQueryClient();
  const runFn = useServerFn(runReportSql);
  const schemaFn = useServerFn(getReportSchema);
  const listFn = useServerFn(listSavedReports);
  const saveFn = useServerFn(saveReport);
  const delFn = useServerFn(deleteSavedReport);
  const favFn = useServerFn(toggleFavoriteReport);
  const logFn = useServerFn(listReportQueryLog);

  const [sql, setSql] = useState<string>(STARTER_SQL);
  const [limit, setLimit] = useState<number>(1000);
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({ name: "", description: "", is_shared: false });
  const [tab, setTab] = useState<string>("editor");

  const schemaQuery = useQuery({ queryKey: ["sql-reports", "schema"], queryFn: () => schemaFn(), staleTime: 300_000 });
  const savedQuery = useQuery({ queryKey: ["sql-reports", "saved"], queryFn: () => listFn(), staleTime: 30_000 });
  const logQuery = useQuery({ queryKey: ["sql-reports", "log"], queryFn: () => logFn(), staleTime: 30_000 });

  const runMut = useMutation({
    mutationFn: () => runFn({ data: { sql, limit } }),
    onSuccess: (r) => { setResult(r); setRunError(null); qc.invalidateQueries({ queryKey: ["sql-reports", "log"] }); },
    onError: (e: Error) => { setResult(null); setRunError(e.message); },
  });

  const saveMut = useMutation({
    mutationFn: (v: { id?: string; name: string; description?: string; is_shared: boolean }) =>
      saveFn({ data: { id: v.id, name: v.name, description: v.description, sql, is_shared: v.is_shared } }),
    onSuccess: (r) => {
      toast.success("Report saved");
      setSaveOpen(false);
      setActiveReportId(r.id);
      qc.invalidateQueries({ queryKey: ["sql-reports", "saved"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Report deleted");
      qc.invalidateQueries({ queryKey: ["sql-reports", "saved"] });
    },
  });

  const favMut = useMutation({
    mutationFn: (v: { id: string; on: boolean }) => favFn({ data: { report_id: v.id, on: v.on } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sql-reports", "saved"] }),
  });

  function loadReport(r: SavedReport) {
    setSql(r.sql);
    setActiveReportId(r.id);
    setResult(null);
    setRunError(null);
    setTab("editor");
  }

  function exportCsv() {
    if (!result?.rows.length) return;
    const name = savedQuery.data?.find((r) => r.id === activeReportId)?.name ?? "report";
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    downloadCsv(rowsToCsv(result.rows as Array<Record<string, unknown>>), `${slug}_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const columns = useMemo(() => {
    if (!result?.rows.length) return [];
    return Object.keys(result.rows[0]);
  }, [result]);

  return (
    <AppShell title="SQL Reports">
      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="saved">Saved reports</TabsTrigger>
          <TabsTrigger value="log">Query log</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-4">
          <div className="grid md:grid-cols-[280px_1fr] gap-4">
            <SchemaBrowser
              data={schemaQuery.data}
              loading={schemaQuery.isLoading}
              onPick={(t, c) => setSql((s) => `${s.replace(/\s+$/, "")}\n-- ${t}.${c}\n`)}
            />
            <div className="space-y-3">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm text-muted-foreground">
                    Read-only. Only <code>SELECT</code> / <code>WITH</code> queries are allowed. Timeout 15s. Max 10 000 rows.
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Limit</Label>
                    <Input
                      type="number" min={1} max={10_000}
                      value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(10_000, Number(e.target.value) || 1000)))}
                      className="w-24 h-8"
                    />
                  </div>
                </div>
                <Textarea
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  className="font-mono text-sm min-h-[240px]"
                  spellCheck={false}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
                    {runMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                    Run
                  </Button>
                  <Button variant="outline" onClick={() => {
                    const active = savedQuery.data?.find((r) => r.id === activeReportId);
                    setSaveForm({ name: active?.name ?? "", description: active?.description ?? "", is_shared: active?.is_shared ?? false });
                    setSaveOpen(true);
                  }}>
                    <Save className="h-4 w-4 mr-2" /> {activeReportId ? "Update" : "Save"}
                  </Button>
                  <Button variant="outline" onClick={exportCsv} disabled={!result?.rows.length}>
                    <Download className="h-4 w-4 mr-2" /> Export CSV
                  </Button>
                  {activeReportId && (
                    <Button variant="ghost" onClick={() => { setActiveReportId(null); setSql(STARTER_SQL); setResult(null); }}>
                      New query
                    </Button>
                  )}
                </div>
              </Card>

              {runError && (
                <Card className="p-4 border-destructive/40 bg-destructive/5">
                  <p className="text-sm font-medium text-destructive">Query error</p>
                  <pre className="text-xs mt-1 whitespace-pre-wrap">{runError}</pre>
                </Card>
              )}

              {result && (
                <Card className="p-4 space-y-3">
                  <div className="text-sm flex items-center gap-3 flex-wrap">
                    <Badge variant="secondary">{result.row_count} row{result.row_count === 1 ? "" : "s"}</Badge>
                    <Badge variant="outline">{result.duration_ms} ms</Badge>
                    {result.truncated && (
                      <Badge variant="destructive">Truncated at {result.limit_applied}</Badge>
                    )}
                  </div>
                  <div className="overflow-auto max-h-[500px] border rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>{columns.map((c) => <th key={c} className="text-left px-2 py-1.5 font-medium">{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {result.rows.map((r, i) => (
                          <tr key={i} className="border-t">
                            {columns.map((c) => {
                              const v = (r as Record<string, unknown>)[c];
                              return <td key={c} className="px-2 py-1 align-top">{v == null ? <span className="text-muted-foreground">—</span> : typeof v === "object" ? <code className="text-[10px]">{JSON.stringify(v)}</code> : String(v)}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!result.rows.length && <div className="p-6 text-center text-muted-foreground">No rows returned.</div>}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="saved">
          <Card className="divide-y">
            {!savedQuery.data?.length && (
              <div className="p-10 text-center text-muted-foreground">No saved reports yet. Save one from the editor.</div>
            )}
            {savedQuery.data?.map((r) => (
              <div key={r.id} className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button className="font-medium text-left hover:underline" onClick={() => loadReport(r)}>{r.name}</button>
                    {r.is_shared && <Badge variant="secondary">Shared</Badge>}
                    {r.tags?.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                  </div>
                  {r.description && <p className="text-sm text-muted-foreground mt-1">{r.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">Updated {new Date(r.updated_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => favMut.mutate({ id: r.id, on: !r.is_favorite })}>
                    <Star className={r.is_favorite ? "h-4 w-4 fill-current text-amber-500" : "h-4 w-4"} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => loadReport(r)}>Open</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${r.name}"?`)) delMut.mutate(r.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <Card className="divide-y">
            {!logQuery.data?.length && <div className="p-10 text-center text-muted-foreground">No queries yet.</div>}
            {logQuery.data?.map((e) => (
              <div key={e.id} className="p-4 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={e.error ? "destructive" : "outline"}>{e.error ? "error" : `${e.row_count ?? 0} rows`}</Badge>
                  <span className="text-muted-foreground">{e.duration_ms ?? "—"} ms</span>
                  <span className="text-muted-foreground ml-auto">{new Date(e.created_at).toLocaleString()}</span>
                </div>
                <pre className="whitespace-pre-wrap font-mono bg-muted/40 p-2 rounded overflow-x-auto">{e.sql}</pre>
                {e.error && <p className="mt-1 text-destructive">{e.error}</p>}
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{activeReportId ? "Update report" : "Save report"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={saveForm.name} onChange={(e) => setSaveForm({ ...saveForm, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={saveForm.description} onChange={(e) => setSaveForm({ ...saveForm, description: e.target.value })} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={saveForm.is_shared} onCheckedChange={(v) => setSaveForm({ ...saveForm, is_shared: v })} />
              <Label>Share with other HR admins</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMut.mutate({ id: activeReportId ?? undefined, name: saveForm.name, description: saveForm.description, is_shared: saveForm.is_shared })}
              disabled={!saveForm.name.trim() || saveMut.isPending}
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SchemaBrowser({
  data, loading, onPick,
}: {
  data?: { tables: Array<{ table_name: string; columns: Array<{ name: string; type: string; nullable: boolean }> }>; foreign_keys: Array<{ table: string; column: string; references_table: string; references_column: string }> };
  loading: boolean;
  onPick: (table: string, column: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const tables = useMemo(() => {
    const list = data?.tables ?? [];
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter((t) => t.table_name.toLowerCase().includes(needle) || t.columns.some((c) => c.name.toLowerCase().includes(needle)));
  }, [data, q]);

  return (
    <Card className="p-3 space-y-2 h-fit sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <h3 className="font-medium text-sm">Schema</h3>
      <Input placeholder="Search tables / columns…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-xs" />
      {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
      <div className="space-y-0.5">
        {tables.map((t) => {
          const isOpen = open.has(t.table_name) || !!q.trim();
          return (
            <div key={t.table_name}>
              <button
                className="w-full text-left text-xs font-mono flex items-center gap-1 hover:bg-muted rounded px-1 py-0.5"
                onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(t.table_name)) n.delete(t.table_name); else n.add(t.table_name); return n; })}
              >
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {t.table_name}
                <span className="text-muted-foreground ml-auto">{t.columns.length}</span>
              </button>
              {isOpen && (
                <div className="pl-5 space-y-0.5">
                  {t.columns.map((c) => (
                    <button
                      key={c.name}
                      className="w-full text-left text-[11px] font-mono hover:bg-muted rounded px-1 py-0.5 flex items-center gap-1"
                      onClick={() => onPick(t.table_name, c.name)}
                      title={`${c.type}${c.nullable ? " (nullable)" : ""}`}
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="text-muted-foreground text-[10px] ml-auto">{c.type}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}