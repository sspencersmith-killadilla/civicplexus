import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, RefreshCw, Search, Sparkles, Trash2, UserPlus } from "lucide-react";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import {
  APP_ROLES,
  type AppRole,
  getOrgAdminStatus,
  grantRole,
  listRoleAssignments,
  revokeRole,
  searchProfiles,
} from "@/lib/org-admin.functions";
import { reopenSetup } from "@/lib/setup.functions";

export const Route = createFileRoute("/_authenticated/admin-org-settings")({
  component: OrgSettingsPage,
});

function OrgSettingsPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = hasRole(me?.roles, "hr_admin");
  const qc = useQueryClient();

  const statusFn = useServerFn(getOrgAdminStatus);
  const listFn = useServerFn(listRoleAssignments);
  const searchFn = useServerFn(searchProfiles);
  const grantFn = useServerFn(grantRole);
  const revokeFn = useServerFn(revokeRole);
  const reopenFn = useServerFn(reopenSetup);

  const status = useQuery({
    queryKey: ["org-admin-status"],
    queryFn: () => statusFn({ data: undefined as never }),
    enabled: isAdmin,
  });
  const roles = useQuery({
    queryKey: ["org-admin-roles"],
    queryFn: () => listFn({ data: undefined as never }),
    enabled: isAdmin,
  });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [picked, setPicked] = useState<{ id: string; label: string } | null>(null);
  const [roleToGrant, setRoleToGrant] = useState<AppRole>("employee");

  const search = useMutation({
    mutationFn: (q: string) => searchFn({ data: { q } }),
    onSuccess: (data) => setResults(data),
    onError: (e: Error) => toast.error(e.message),
  });
  const grant = useMutation({
    mutationFn: (vars: { user_id: string; role: AppRole }) => grantFn({ data: vars }),
    onSuccess: () => {
      toast.success("Role granted");
      qc.invalidateQueries({ queryKey: ["org-admin-roles"] });
      setPicked(null); setQuery(""); setResults([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (vars: { user_id: string; role: AppRole }) => revokeFn({ data: vars }),
    onSuccess: () => {
      toast.success("Role revoked");
      qc.invalidateQueries({ queryKey: ["org-admin-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reopen = useMutation({
    mutationFn: () => reopenFn({ data: undefined as never }),
    onSuccess: () => { toast.success("Setup wizard reopened"); qc.invalidateQueries({ queryKey: ["org-admin-status"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <AppShell title="Organization settings">
        <Card><CardContent className="py-12 text-center text-muted-foreground">HR admin access required.</CardContent></Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Organization settings">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI provider</CardTitle>
            <CardDescription>The active provider is set by server environment variables. Update them on the host and restart to switch providers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Active:</span>
              <Badge variant="secondary">{status.data?.provider ?? "—"}</Badge>
              <span className="text-muted-foreground">Model:</span>
              <Badge variant="outline">{status.data?.model ?? "—"}</Badge>
              {status.data?.configured
                ? <Badge className="bg-emerald-600 gap-1"><CheckCircle2 className="h-3 w-3" /> Configured</Badge>
                : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Missing credentials</Badge>}
            </div>
            <p className="text-muted-foreground">
              Supported <code>AI_PROVIDER</code> values: <code>lovable</code> (default), <code>openai</code>, <code>azure</code>, or <code>none</code>.
              See <code>.env.example</code> for the matching API key, base URL, and model variables.
            </p>
            {!status.data?.configured && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-amber-900 dark:text-amber-200">
                AI features (1-on-1 summaries, screening, cascades rollups) are unavailable until the required credentials are set.
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => status.refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wizard & fallback admin</CardTitle>
            <CardDescription>Re-run the first-run wizard at any time to update org details, templates, or the fallback admin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>Organization: <strong>{status.data?.org_name || "—"}</strong></div>
            <div>
              Fallback admin:{" "}
              <strong>{status.data?.fallback_admin?.full_name ?? status.data?.fallback_admin?.email ?? "Not set"}</strong>
            </div>
            <div>
              First-run setup:{" "}
              {status.data?.first_run_complete
                ? <Badge className="bg-emerald-600">Complete</Badge>
                : <Badge variant="destructive">Not finished</Badge>}
            </div>
            <div className="flex gap-2 pt-2">
              <Button asChild variant="outline"><Link to="/setup">Open setup wizard</Link></Button>
              {status.data?.first_run_complete && (
                <Button variant="ghost" onClick={() => reopen.mutate()} disabled={reopen.isPending}>Reopen wizard</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Grant a role</CardTitle>
            <CardDescription>Search for an existing user by name or email, then assign one of the application roles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="sr-only">Search</Label>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or email"
                  onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) search.mutate(query.trim()); }}
                />
              </div>
              <Button onClick={() => query.trim() && search.mutate(query.trim())} disabled={search.isPending}>
                <Search className="h-4 w-4 mr-2" /> Search
              </Button>
            </div>
            {results.length > 0 && (
              <div className="rounded border divide-y">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setPicked({ id: r.id, label: r.full_name ?? r.email ?? r.id })}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${picked?.id === r.id ? "bg-muted" : ""}`}
                  >
                    <div className="font-medium">{r.full_name ?? "(no name)"}</div>
                    <div className="text-xs text-muted-foreground">{r.email ?? r.id}</div>
                  </button>
                ))}
              </div>
            )}
            {picked && (
              <div className="flex flex-wrap items-end gap-2 pt-2">
                <div className="text-sm">Granting to <strong>{picked.label}</strong></div>
                <div className="w-48">
                  <Label className="text-xs">Role</Label>
                  <Select value={roleToGrant} onValueChange={(v) => setRoleToGrant(v as AppRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => grant.mutate({ user_id: picked.id, role: roleToGrant })}
                  disabled={grant.isPending}
                >Grant role</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role assignments</CardTitle>
            <CardDescription>Every user that currently holds at least one role. Click the chip to revoke.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(roles.data ?? []).map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.full_name ?? "(no name)"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="secondary" className="gap-1">
                            {r}
                            <button
                              type="button"
                              aria-label={`Revoke ${r}`}
                              onClick={() => {
                                if (confirm(`Revoke "${r}" from ${u.full_name ?? u.email ?? "this user"}?`)) {
                                  revoke.mutate({ user_id: u.user_id, role: r as AppRole });
                                }
                              }}
                              className="hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!roles.data?.length && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No role assignments yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}