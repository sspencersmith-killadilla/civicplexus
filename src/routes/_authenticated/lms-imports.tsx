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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle2, Plug, RefreshCw, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { previewLmsImport, commitLmsImport } from "@/lib/lms.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { listLmsConnections, upsertLmsConnection, deleteLmsConnection, testLmsConnection, runLmsSync } from "@/lib/lms-connections.functions";

export const Route = createFileRoute("/_authenticated/lms-imports")({ component: LmsImportsPage });

function LmsImportsPage() {
  const qc = useQueryClient();
  const preview = useServerFn(previewLmsImport);
  const commit = useServerFn(commitLmsImport);
  const [provider, setProvider] = useState("tcole");
  const [file, setFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<{ id: string; total: number; matched: number; unmatched: number; errors: { row: number; error: string }[] } | null>(null);

  const importsQ = useQuery({ queryKey: ["lms-imports"], queryFn: async () => {
    const { data, error } = await supabase.from("lms_credit_imports").select("*").order("created_at", { ascending: false }).limit(25);
    if (error) throw error; return data ?? [];
  }});

  const previewMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Pick a CSV file");
      const csv = await file.text();
      return preview({ data: { provider, filename: file.name, csv } });
    },
    onSuccess: (r) => { setPreviewResult(r); qc.invalidateQueries({ queryKey: ["lms-imports"] }); toast.success("Preview ready"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const commitMut = useMutation({
    mutationFn: async () => commit({ data: { id: previewResult!.id } }),
    onSuccess: (r) => { toast.success(`Applied ${r.applied} completions`); setPreviewResult(null); setFile(null); qc.invalidateQueries({ queryKey: ["lms-imports"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="LMS Integrations">
      <p className="text-sm text-muted-foreground mb-6">Connect Chamilo, Moodle, or Forma to auto-sync completion data, or upload rosters manually from any other learning system. Rows are matched to employees by email and to courses by external course ID or name; matched rows auto-complete training.</p>

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections"><Plug className="h-4 w-4 mr-1" />Connections</TabsTrigger>
          <TabsTrigger value="manual"><Upload className="h-4 w-4 mr-1" />Manual upload</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="mt-4">
          <ConnectionsPanel />
        </TabsContent>

        <TabsContent value="manual" className="mt-4">
      <Card className="p-4 mb-6">
        <h3 className="font-medium mb-3 flex items-center gap-2"><Upload className="h-4 w-4" /> Upload roster</h3>
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <div><Label>Provider</Label><Select value={provider} onValueChange={setProvider}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="tcole">TCOLE</SelectItem>
            <SelectItem value="target_solutions">Target Solutions</SelectItem>
            <SelectItem value="vector">Vector Solutions</SelectItem>
            <SelectItem value="chamilo">Chamilo</SelectItem>
            <SelectItem value="moodle">Moodle</SelectItem>
            <SelectItem value="forma">Forma LMS</SelectItem>
            <SelectItem value="manual">Manual / Other</SelectItem>
          </SelectContent></Select></div>
          <div className="sm:col-span-2"><Label>CSV file</Label><Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Expected columns: <code>email</code>, <code>course_id</code> (or <code>course</code>), <code>completed_at</code>, optional <code>score</code>.</p>
        <Button onClick={() => previewMut.mutate()} disabled={!file || previewMut.isPending}>{previewMut.isPending ? "Parsing…" : "Preview"}</Button>
      </Card>

      {previewResult && (
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Preview</h3>
            <Button onClick={() => commitMut.mutate()} disabled={previewResult.matched === 0 || commitMut.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-1" />{commitMut.isPending ? "Applying…" : `Commit ${previewResult.matched} completions`}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Stat label="Total rows" value={previewResult.total} />
            <Stat label="Matched" value={previewResult.matched} accent="good" />
            <Stat label="Unmatched" value={previewResult.unmatched} accent={previewResult.unmatched > 0 ? "warn" : undefined} />
          </div>
          {previewResult.errors.length > 0 && (
            <div className="text-xs">
              <h4 className="font-medium mb-1">First errors:</h4>
              <ul className="space-y-1">{previewResult.errors.map((e, i) => <li key={i} className="text-amber-700">Row {e.row}: {e.error}</li>)}</ul>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-medium mb-3">Recent imports</h3>
        <Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Provider</TableHead><TableHead>File</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Matched</TableHead><TableHead className="text-right">Applied</TableHead></TableRow></TableHeader><TableBody>
          {(importsQ.data ?? []).map((j: any) => (
            <TableRow key={j.id}><TableCell className="text-xs">{new Date(j.created_at).toLocaleString()}</TableCell><TableCell>{j.provider}</TableCell><TableCell>{j.filename}</TableCell><TableCell><Badge variant={j.status === "committed" ? "default" : "secondary"}>{j.status}</Badge></TableCell><TableCell className="text-right">{j.matched_rows}/{j.total_rows}</TableCell><TableCell className="text-right">{j.applied_rows}</TableCell></TableRow>
          ))}
          {(importsQ.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No imports yet.</TableCell></TableRow>}
        </TableBody></Table>
      </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "good" | "warn" }) {
  const color = accent === "good" ? "text-emerald-600" : accent === "warn" ? "text-amber-600" : "";
  return <div className="border rounded p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-2xl font-semibold ${color}`}>{value}</div></div>;
}

function ConnectionsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listLmsConnections);
  const upsert = useServerFn(upsertLmsConnection);
  const del = useServerFn(deleteLmsConnection);
  const test = useServerFn(testLmsConnection);
  const sync = useServerFn(runLmsSync);

  const q = useQuery({ queryKey: ["lms-connections"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; provider: "chamilo"|"moodle"|"forma"; label: string; base_url: string; auth_kind: "api_key"|"oauth2"|"basic"; username: string; enabled: boolean }>({
    provider: "moodle", label: "", base_url: "", auth_kind: "api_key", username: "", enabled: true,
  });

  const saveMut = useMutation({
    mutationFn: async () => upsert({ data: { ...form, username: form.username || null } }),
    onSuccess: (r) => {
      toast.success("Saved. Set project secret " + r.secret_env + " with your API token.");
      setOpen(false);
      setForm({ provider: "moodle", label: "", base_url: "", auth_kind: "api_key", username: "", enabled: true });
      qc.invalidateQueries({ queryKey: ["lms-connections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const testMut = useMutation({
    mutationFn: async (id: string) => test({ data: { id } }),
    onSuccess: (r) => r.ok ? toast.success(r.message) : toast.error(r.message),
    onError: (e: Error) => toast.error(e.message),
  });
  const syncMut = useMutation({
    mutationFn: async (id: string) => sync({ data: { id } }),
    onSuccess: (r: any) => { toast.success(`Synced: fetched ${r.fetched ?? 0}, applied ${r.applied ?? 0}`); qc.invalidateQueries({ queryKey: ["lms-connections"] }); qc.invalidateQueries({ queryKey: ["lms-imports"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["lms-connections"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const conns = (q.data?.connections ?? []) as any[];
  const runs = (q.data?.runs ?? []) as any[];

  return (
    <>
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium">LMS connections</h3>
            <p className="text-xs text-muted-foreground">Configure a service account in your LMS, then paste its API token into the project secret shown after saving. An hourly cron pulls new completions.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add connection</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New LMS connection</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Provider</Label>
                  <Select value={form.provider} onValueChange={(v: any) => setForm({ ...form, provider: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="moodle">Moodle</SelectItem>
                      <SelectItem value="chamilo">Chamilo</SelectItem>
                      <SelectItem value="forma">Forma LMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Prod Moodle" /></div>
                <div><Label>Base URL</Label><Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://lms.example.gov" /></div>
                <div><Label>Auth</Label>
                  <Select value={form.auth_kind} onValueChange={(v: any) => setForm({ ...form, auth_kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api_key">API key / token</SelectItem>
                      <SelectItem value="basic">HTTP basic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(form.provider === "chamilo" || form.auth_kind === "basic") && (
                  <div><Label>Username</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
                )}
                <div className="flex items-center gap-2"><Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} /><span className="text-sm">Enabled</span></div>
                <p className="text-xs text-muted-foreground">After saving, add the API token to your project secrets under the name shown in the success toast. The token is never stored in the database.</p>
              </div>
              <DialogFooter><Button onClick={() => saveMut.mutate()} disabled={!form.label || !form.base_url || saveMut.isPending}>{saveMut.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Provider</TableHead><TableHead>URL</TableHead><TableHead>Secret env</TableHead><TableHead>Last sync</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {conns.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.label}{!c.enabled && <Badge variant="secondary" className="ml-2">off</Badge>}</TableCell>
                <TableCell className="capitalize">{c.provider}</TableCell>
                <TableCell className="text-xs truncate max-w-[200px]">{c.base_url}</TableCell>
                <TableCell className="text-xs"><code>{c.secret_name}</code></TableCell>
                <TableCell className="text-xs">{c.last_sync_at ? <span className={c.last_sync_status === "error" ? "text-destructive" : ""}>{new Date(c.last_sync_at).toLocaleString()} · {c.last_sync_status}</span> : <span className="text-muted-foreground">never</span>}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="outline" onClick={() => testMut.mutate(c.id)}>Test</Button>
                  <Button size="sm" onClick={() => syncMut.mutate(c.id)} disabled={syncMut.isPending}><RefreshCw className="h-3 w-3 mr-1" />Sync</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remove connection?")) delMut.mutate(c.id); }}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {conns.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No LMS connections yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium mb-3">Recent sync runs</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Started</TableHead><TableHead>Trigger</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Fetched</TableHead><TableHead className="text-right">Matched</TableHead><TableHead className="text-right">Applied</TableHead></TableRow></TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs">{r.triggered_by}</TableCell>
                <TableCell><Badge variant={r.status === "success" ? "default" : r.status === "error" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">{r.rows_fetched}</TableCell>
                <TableCell className="text-right">{r.matched}</TableCell>
                <TableCell className="text-right">{r.applied}</TableCell>
              </TableRow>
            ))}
            {runs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No sync runs yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
