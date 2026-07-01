import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Search, Plus, Save } from "lucide-react";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { searchProfiles } from "@/lib/org-admin.functions";
import {
  listPermissionKeys,
  listPermissionGroups,
  upsertPermissionGroup,
  deletePermissionGroup,
  listUserPermissionAssignments,
  assignUserToGroup,
  removeUserFromGroup,
  setUserPermissionOverride,
} from "@/lib/permissions.functions";

export const Route = createFileRoute("/_authenticated/admin-permissions")({
  component: PermissionsPage,
});

type Group = { id: string; name: string; description: string | null; is_system: boolean; keys: string[] };
type PermKey = { key: string; label: string; category: string; description: string | null };

function PermissionsPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = hasRole(me?.roles, "hr_admin");
  const qc = useQueryClient();

  const listKeysFn = useServerFn(listPermissionKeys);
  const listGroupsFn = useServerFn(listPermissionGroups);
  const upsertGroupFn = useServerFn(upsertPermissionGroup);
  const deleteGroupFn = useServerFn(deletePermissionGroup);
  const searchFn = useServerFn(searchProfiles);
  const listAssignsFn = useServerFn(listUserPermissionAssignments);
  const assignFn = useServerFn(assignUserToGroup);
  const unassignFn = useServerFn(removeUserFromGroup);
  const overrideFn = useServerFn(setUserPermissionOverride);

  const keys = useQuery({
    queryKey: ["perm-keys"],
    queryFn: () => listKeysFn({ data: undefined as never }) as Promise<PermKey[]>,
    enabled: isAdmin,
  });
  const groups = useQuery({
    queryKey: ["perm-groups"],
    queryFn: () => listGroupsFn({ data: undefined as never }) as Promise<Group[]>,
    enabled: isAdmin,
  });

  const [editing, setEditing] = useState<Group | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const upsert = useMutation({
    mutationFn: (v: { id?: string; name: string; description?: string; keys: string[] }) => upsertGroupFn({ data: v }),
    onSuccess: () => { toast.success("Group saved"); setEditing(null); qc.invalidateQueries({ queryKey: ["perm-groups"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteGroupFn({ data: { id } }),
    onSuccess: () => { toast.success("Group deleted"); qc.invalidateQueries({ queryKey: ["perm-groups"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // User assignments
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [pickedUser, setPickedUser] = useState<{ id: string; label: string } | null>(null);
  const search = useMutation({
    mutationFn: (q: string) => searchFn({ data: { q } }),
    onSuccess: (d) => setUserResults(d),
    onError: (e: Error) => toast.error(e.message),
  });
  const userData = useQuery({
    queryKey: ["user-perms", pickedUser?.id],
    queryFn: () => listAssignsFn({ data: { user_id: pickedUser!.id } }),
    enabled: !!pickedUser,
  });
  const assign = useMutation({
    mutationFn: (v: { user_id: string; group_id: string }) => assignFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-perms", pickedUser?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const unassign = useMutation({
    mutationFn: (v: { user_id: string; group_id: string }) => unassignFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-perms", pickedUser?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const override = useMutation({
    mutationFn: (v: { user_id: string; permission_key: string; mode: "grant" | "deny" | "clear" }) => overrideFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-perms", pickedUser?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const keysByCategory = useMemo(() => {
    const map: Record<string, PermKey[]> = {};
    for (const k of (keys.data ?? []) as PermKey[]) (map[k.category] ||= []).push(k);
    return map;
  }, [keys.data]);

  if (!isAdmin) {
    return (
      <AppShell title="Permissions">
        <Card><CardContent className="py-12 text-center text-muted-foreground">HR admin access required.</CardContent></Card>
      </AppShell>
    );
  }

  const startEdit = (g: Group | null) => {
    setEditing(g ?? { id: "", name: "", description: "", is_system: false, keys: [] } as unknown as Group);
    setSelectedKeys(new Set(g?.keys ?? []));
  };

  return (
    <AppShell title="Permissions">
      <div className="max-w-6xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Permission groups</CardTitle>
            <CardDescription>
              Bundle related permissions and assign them to users. HR admins implicitly hold every permission unless explicitly denied.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button size="sm" onClick={() => startEdit(null)}><Plus className="h-4 w-4 mr-1" /> New group</Button>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Permissions</TableHead><TableHead className="w-40 text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {(groups.data ?? []).map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        {g.name}
                        {g.is_system && <Badge variant="secondary" className="text-xs">system</Badge>}
                      </div>
                      {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {g.keys.map((k) => <Badge key={k} variant="outline" className="text-xs">{k}</Badge>)}
                        {!g.keys.length && <span className="text-xs text-muted-foreground">No keys</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(g)}>Edit</Button>
                      {!g.is_system && (
                        <Button size="sm" variant="ghost" onClick={() => confirm(`Delete "${g.name}"?`) && del.mutate(g.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!groups.data?.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No groups yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {editing && (
          <Card>
            <CardHeader>
              <CardTitle>{editing.id ? `Edit "${editing.name}"` : "New group"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                </div>
              </div>
              <div className="space-y-3">
                {Object.entries(keysByCategory).map(([cat, ks]) => (
                  <div key={cat}>
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">{cat}</div>
                    <div className="grid gap-1 md:grid-cols-2">
                      {ks.map((k) => (
                        <label key={k.key} className="flex items-start gap-2 text-sm border rounded p-2 cursor-pointer hover:bg-muted/50">
                          <Checkbox
                            checked={selectedKeys.has(k.key)}
                            onCheckedChange={(v) => {
                              const next = new Set(selectedKeys);
                              if (v) next.add(k.key); else next.delete(k.key);
                              setSelectedKeys(next);
                            }}
                          />
                          <div>
                            <div className="font-medium">{k.label}</div>
                            <div className="text-xs text-muted-foreground">{k.description ?? k.key}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => upsert.mutate({
                    id: editing.id || undefined,
                    name: editing.name,
                    description: editing.description ?? "",
                    keys: Array.from(selectedKeys),
                  })}
                  disabled={upsert.isPending || !editing.name.trim()}
                >
                  <Save className="h-4 w-4 mr-1" /> Save
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Assign permissions to a user</CardTitle>
            <CardDescription>Search a user, assign groups, or set per-key grant/deny overrides. Deny always wins.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="Name or email" value={userQuery} onChange={(e) => setUserQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && userQuery.trim()) search.mutate(userQuery.trim()); }} />
              <Button onClick={() => userQuery.trim() && search.mutate(userQuery.trim())}><Search className="h-4 w-4 mr-1" /> Search</Button>
            </div>
            {!!userResults.length && !pickedUser && (
              <div className="border rounded divide-y max-h-40 overflow-auto text-sm">
                {userResults.map((r) => (
                  <button key={r.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted"
                    onClick={() => { setPickedUser({ id: r.id, label: r.full_name ?? r.email ?? r.id }); setUserResults([]); }}>
                    <div className="font-medium">{r.full_name ?? "(no name)"}</div>
                    <div className="text-xs text-muted-foreground">{r.email ?? r.id}</div>
                  </button>
                ))}
              </div>
            )}
            {pickedUser && (
              <div className="space-y-4">
                <div className="text-sm">
                  Editing <strong>{pickedUser.label}</strong>{" "}
                  <button className="underline text-xs" onClick={() => setPickedUser(null)}>change</button>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Groups</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(groups.data ?? []).map((g) => {
                      const has = userData.data?.groups.some((x) => x.group_id === g.id);
                      return (
                        <label key={g.id} className="flex items-center gap-2 border rounded p-2 text-sm">
                          <Checkbox
                            checked={!!has}
                            onCheckedChange={(v) => {
                              if (v) assign.mutate({ user_id: pickedUser.id, group_id: g.id });
                              else unassign.mutate({ user_id: pickedUser.id, group_id: g.id });
                            }}
                          />
                          <div><div className="font-medium">{g.name}</div><div className="text-xs text-muted-foreground">{g.keys.length} keys</div></div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Per-key overrides</div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Permission</TableHead><TableHead className="w-48">Override</TableHead><TableHead className="w-32">Effective</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {((keys.data ?? []) as PermKey[]).map((k) => {
                        const ov = userData.data?.overrides.find((o) => o.permission_key === k.key);
                        const eff = userData.data?.effective.some((e) => e.permission_key === k.key);
                        return (
                          <TableRow key={k.key}>
                            <TableCell><div className="font-medium">{k.label}</div><div className="text-xs text-muted-foreground">{k.key}</div></TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {(["grant", "deny", "clear"] as const).map((m) => (
                                  <Button key={m} size="sm"
                                    variant={ov?.mode === m || (m === "clear" && !ov) ? "default" : "outline"}
                                    onClick={() => override.mutate({ user_id: pickedUser.id, permission_key: k.key, mode: m })}
                                  >{m}</Button>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>{eff ? <Badge className="bg-emerald-600">yes</Badge> : <Badge variant="outline">no</Badge>}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}