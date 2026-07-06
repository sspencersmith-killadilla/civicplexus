import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { GraduationCap, Plus, RefreshCw, Play, Trash2, PlugZap } from "lucide-react";
import { toast } from "sonner";
import {
  listLmsConnections, upsertLmsConnection, deleteLmsConnection,
  testLmsConnection, runLmsSync,
} from "@/lib/lms-connections.functions";

export const Route = createFileRoute("/_authenticated/admin-lms")({ component: LmsAdmin });

type Conn = {
  id: string; provider: string; label: string; base_url: string; auth_kind: string;
  username: string | null; enabled: boolean; secret_name: string | null;
  last_sync_at: string | null; last_sync_status: string | null; last_error: string | null;
};

function LmsAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(listLmsConnections);
  const upsert = useServerFn(upsertLmsConnection);
  const del = useServerFn(deleteLmsConnection);
  const test = useServerFn(testLmsConnection);
  const sync = useServerFn(runLmsSync);
  const q = useQuery({ queryKey: ["lms-connections"], queryFn: () => list() });

  const [open, setOpen] = useState(false);
  const empty = { id: undefined as string | undefined, provider: "chamilo" as "chamilo"|"moodle"|"forma", label: "", base_url: "", auth_kind: "api_key" as "api_key"|"oauth2"|"basic", username: "", enabled: true };
  const [form, setForm] = useState(empty);

  const save = useMutation({
    mutationFn: () => upsert({ data: { ...form, username: form.username || null } }),
    onSuccess: (r) => {
      toast.success(`Saved. Store your API token in secret env ${(r as { secret_env: string }).secret_env}`);
      setOpen(false); setForm(empty);
      qc.invalidateQueries({ queryKey: ["lms-connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const rem = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["lms-connections"] }); },
  });
  const runTest = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: (r) => {
      const res = r as { ok: boolean; message?: string };
      res.ok ? toast.success(res.message ?? "Connected") : toast.error(res.message ?? "Failed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const runNow = useMutation({
    mutationFn: (id: string) => sync({ data: { id } }),
    onSuccess: () => { toast.success("Sync run started"); qc.invalidateQueries({ queryKey: ["lms-connections"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const conns = (q.data?.connections ?? []) as Conn[];
  const runs = q.data?.runs ?? [];

  return (
    <AppShell title="LMS Connections">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Connect a hosted learning management system to auto-import course completions into training records.
          After saving, store the API token in the shown secret env — no restart or code change required.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New connection</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit" : "New"} LMS connection</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Provider</Label>
                  <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v as typeof form.provider })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chamilo">Chamilo</SelectItem>
                      <SelectItem value="moodle">Moodle</SelectItem>
                      <SelectItem value="forma">Forma LMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Auth</Label>
                  <Select value={form.auth_kind} onValueChange={(v) => setForm({ ...form, auth_kind: v as typeof form.auth_kind })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api_key">API key / token</SelectItem>
                      <SelectItem value="oauth2">OAuth2 bearer</SelectItem>
                      <SelectItem value="basic">Basic auth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Main Chamilo" /></div>
              <div><Label>Base URL</Label><Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://lms.example.gov" /></div>
              {form.auth_kind === "basic" && (
                <div><Label>Username</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
              )}
              <div className="flex items-center gap-2"><Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} /><span className="text-sm">Enabled</span></div>
              <p className="text-xs text-muted-foreground">The API token is stored as a project secret. After save, you'll get the env name.</p>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate()} disabled={save.isPending || !form.label || !form.base_url}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {conns.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-40" /> No LMS connections yet.
          </Card>
        )}
        {conns.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.label}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted capitalize">{c.provider}</span>
                  {!c.enabled && <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">Disabled</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{c.base_url}</p>
                {c.secret_name && <p className="text-[11px] font-mono text-muted-foreground mt-1">Secret env: {c.secret_name}</p>}
                <p className="text-xs mt-2">
                  Last sync: {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : "never"}{" "}
                  {c.last_sync_status && <span className={c.last_sync_status === "success" ? "text-emerald-600" : "text-destructive"}>· {c.last_sync_status}</span>}
                </p>
                {c.last_error && <p className="text-xs text-destructive mt-1">{c.last_error}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => runTest.mutate(c.id)} disabled={runTest.isPending}><PlugZap className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => runNow.mutate(c.id)} disabled={runNow.isPending}><Play className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => { setForm({ id: c.id, provider: c.provider as typeof form.provider, label: c.label, base_url: c.base_url, auth_kind: c.auth_kind as typeof form.auth_kind, username: c.username ?? "", enabled: c.enabled }); setOpen(true); }}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete ${c.label}?`)) rem.mutate(c.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {runs.length > 0 && (
        <Card className="mt-6 p-4">
          <div className="flex items-center gap-2 mb-3"><RefreshCw className="h-4 w-4" /><h3 className="font-medium text-sm">Recent sync runs</h3></div>
          <div className="text-xs divide-y">
            {runs.slice(0, 20).map((r) => {
              const row = r as { id: string; status: string; started_at: string; rows_fetched: number | null; matched: number | null; applied: number | null };
              return (
                <div key={row.id} className="py-2 flex justify-between">
                  <span>{new Date(row.started_at).toLocaleString()}</span>
                  <span className="capitalize text-muted-foreground">{row.status} · {row.rows_fetched ?? 0} fetched · {row.matched ?? 0} matched · {row.applied ?? 0} applied</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </AppShell>
  );
}