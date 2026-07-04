import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Target, TrendingUp, GitBranch, Users, ExternalLink, LogOut, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useServerFn } from "@tanstack/react-start";
import { addTeamMembers, cascadeTeamGoal, leaveTeam, updateTeamGoalProgress } from "@/lib/teams.functions";

export const Route = createFileRoute("/_authenticated/teams/$id")({
  component: TeamWorkspace,
});

const GOAL_STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  at_risk: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground line-through",
};

const DELIV_STATUS: Array<"todo" | "in_progress" | "blocked" | "done" | "cancelled"> = ["todo", "in_progress", "blocked", "done", "cancelled"];

function TeamWorkspace() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();

  const teamQ = useQuery({
    queryKey: ["team", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const membersQ = useQuery({
    queryKey: ["team_members", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_members")
        .select("id, role, allocation_pct, joined_at, left_at, employee_id, employees(first_name, last_name, department, user_id)")
        .eq("team_id", id).is("left_at", null).order("joined_at");
      if (error) throw error;
      return data;
    },
  });

  type Member = { id: string; role: string; employee_id: string; employees: { first_name: string; last_name: string; department: string | null; user_id: string | null } | null };
  const myMember = (membersQ.data as Member[] | undefined)?.find((m) => m.employees?.user_id === me?.user.id);
  const isLead = !!myMember && (myMember.role === "lead" || myMember.role === "sponsor");
  const isMember = !!myMember;
  const canManage = isLead || !!me?.is_hr_admin;
  const canEdit = isMember || !!me?.is_hr_admin;

  return (
    <AppShell title={teamQ.data?.name ?? "Team"}>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> {teamQ.data?.name}</h2>
          {teamQ.data?.purpose && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{teamQ.data.purpose}</p>}
        </div>
        <div className="flex gap-2">
          {isMember && !isLead && (
            <LeaveButton teamId={id} onLeft={() => navigate({ to: "/teams" })} />
          )}
        </div>
      </div>

      <Tabs defaultValue="charter">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="charter">Charter</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
          <TabsTrigger value="meetings">Meetings & decisions</TabsTrigger>
          <TabsTrigger value="updates">Updates</TabsTrigger>
          <TabsTrigger value="links">Links</TabsTrigger>
        </TabsList>

        <TabsContent value="charter" className="mt-4">
          <CharterTab teamId={id} canManage={canManage} />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <MembersTab teamId={id} members={(membersQ.data as Member[] | undefined) ?? []} canManage={canManage} onChange={() => qc.invalidateQueries({ queryKey: ["team_members", id] })} />
        </TabsContent>
        <TabsContent value="goals" className="mt-4">
          <GoalsTab teamId={id} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="deliverables" className="mt-4">
          <DeliverablesTab teamId={id} members={(membersQ.data as Member[] | undefined) ?? []} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="meetings" className="mt-4">
          <MeetingsTab teamId={id} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="updates" className="mt-4">
          <UpdatesTab teamId={id} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="links" className="mt-4">
          <LinksTab teamId={id} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function LeaveButton({ teamId, onLeft }: { teamId: string; onLeft: () => void }) {
  const leave = useServerFn(leaveTeam);
  const mut = useMutation({
    mutationFn: () => leave({ data: { team_id: teamId } }),
    onSuccess: () => { toast.success("Left team"); onLeft(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return <Button variant="outline" onClick={() => mut.mutate()}><LogOut className="h-4 w-4 mr-2" /> Leave team</Button>;
}

// ─────────── Charter ───────────
function CharterTab({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["team_charter", teamId],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").eq("id", teamId).single();
      if (error) throw error;
      return data;
    },
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async () => {
      const patch: Record<string, unknown> = {};
      for (const k of ["mission", "scope_in", "scope_out", "purpose"]) if (draft[k] !== undefined) patch[k] = draft[k] || null;
      if (draft.status) patch.status = draft.status;
      if (draft.target_end_date !== undefined) patch.target_end_date = draft.target_end_date || null;
      const { error } = await supabase.from("teams").update(patch as never).eq("id", teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team_charter", teamId] });
      qc.invalidateQueries({ queryKey: ["team", teamId] });
      setEditing(false);
      toast.success("Charter saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!q.data) return <Card className="p-6">Loading…</Card>;
  const t = q.data;

  if (!editing) {
    return (
      <Card className="p-6 space-y-4">
        <Section label="Mission" value={t.mission} />
        <Section label="In scope" value={t.scope_in} />
        <Section label="Out of scope" value={t.scope_out} />
        <div className="grid grid-cols-2 gap-4">
          <Section label="Status" value={t.status} />
          <Section label="Target end date" value={t.target_end_date} />
        </div>
        {canManage && <Button variant="outline" onClick={() => { setDraft({ mission: t.mission ?? "", scope_in: t.scope_in ?? "", scope_out: t.scope_out ?? "", purpose: t.purpose ?? "", status: t.status, target_end_date: t.target_end_date ?? "" }); setEditing(true); }}>Edit charter</Button>}
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-3">
      <div className="space-y-1.5"><Label>Purpose</Label><Textarea rows={2} value={draft.purpose ?? ""} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Mission</Label><Textarea rows={3} value={draft.mission ?? ""} onChange={(e) => setDraft({ ...draft, mission: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>In scope</Label><Textarea rows={3} value={draft.scope_in ?? ""} onChange={(e) => setDraft({ ...draft, scope_in: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Out of scope</Label><Textarea rows={3} value={draft.scope_out ?? ""} onChange={(e) => setDraft({ ...draft, scope_out: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["forming", "active", "paused", "complete", "archived"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Target end date</Label><Input type="date" value={draft.target_end_date ?? ""} onChange={(e) => setDraft({ ...draft, target_end_date: e.target.value })} /></div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </Card>
  );
}

function Section({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className="text-sm whitespace-pre-wrap">{value || <span className="text-muted-foreground italic">Not set</span>}</div>
    </div>
  );
}

// ─────────── Members ───────────
type MemberRow = { id: string; role: string; employee_id: string; employees: { first_name: string; last_name: string; department: string | null; user_id: string | null } | null };
function MembersTab({ teamId, members, canManage, onChange }: { teamId: string; members: MemberRow[]; canManage: boolean; onChange: () => void }) {
  const add = useServerFn(addTeamMembers);
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [role, setRole] = useState<"sponsor" | "lead" | "member">("member");

  const employeesQ = useQuery({
    queryKey: ["employees_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees")
        .select("id, first_name, last_name, department").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const currentIds = new Set(members.map((m) => m.employee_id));
  const candidates = (employeesQ.data ?? []).filter((e) => !currentIds.has(e.id));

  const mut = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error("Pick an employee");
      return await add({ data: { team_id: teamId, members: [{ employee_id: employeeId, role }] } });
    },
    onSuccess: () => { setOpen(false); setEmployeeId(""); setRole("member"); onChange(); toast.success("Member added"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("team_members").update({ left_at: new Date().toISOString() } as never).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => { onChange(); toast.success("Removed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add member</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add team member</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Employee</Label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger><SelectValue placeholder="Pick from any department…" /></SelectTrigger>
                    <SelectContent>
                      {candidates.map((e) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.department ? ` · ${e.department}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="sponsor">Sponsor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={() => mut.mutate()} disabled={mut.isPending}>Add</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {members.map((m) => (
          <Card key={m.id} className="p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{m.employees?.first_name} {m.employees?.last_name}</div>
              <div className="text-xs text-muted-foreground">{m.employees?.department ?? "—"} · <span className="capitalize">{m.role}</span></div>
            </div>
            {canManage && <Button size="sm" variant="ghost" onClick={() => remove.mutate(m.id)}>Remove</Button>}
          </Card>
        ))}
        {members.length === 0 && <Card className="p-4 text-sm text-muted-foreground">No active members.</Card>}
      </div>
    </div>
  );
}

// ─────────── Goals ───────────
function GoalsTab({ teamId, canEdit }: { teamId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const cascade = useServerFn(cascadeTeamGoal);
  const updateProg = useServerFn(updateTeamGoalProgress);

  const q = useQuery({
    queryKey: ["team_goals", teamId],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_goals")
        .select("id, title, description, status, progress, target_date, weight, parent_goal_id, owner_member_id, team_members(id, employees(first_name, last_name))")
        .eq("team_id", teamId).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const membersQ = useQuery({
    queryKey: ["team_members_for_goals", teamId],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_members")
        .select("id, employees(first_name, last_name)").eq("team_id", teamId).is("left_at", null);
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", target_date: "", owner_member_id: "" });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title required");
      const { error } = await supabase.from("team_goals").insert({
        team_id: teamId, title: form.title.trim(), description: form.description || null,
        target_date: form.target_date || null, owner_member_id: form.owner_member_id || null,
        created_by: (await supabase.auth.getUser()).data.user?.id, status: "active",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team_goals", teamId] }); setOpen(false); setForm({ title: "", description: "", target_date: "", owner_member_id: "" }); toast.success("Goal added"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [cascadeOpen, setCascadeOpen] = useState(false);
  const [cascadeParent, setCascadeParent] = useState("");
  const [cascadeRows, setCascadeRows] = useState<Array<{ owner_member_id: string; title: string; weight: number }>>([{ owner_member_id: "", title: "", weight: 1 }]);
  const doCascade = useMutation({
    mutationFn: async () => {
      if (!cascadeParent) throw new Error("Pick a parent goal");
      const children = cascadeRows.filter((r) => r.title.trim()).map((r) => ({ owner_member_id: r.owner_member_id || null, title: r.title.trim(), weight: r.weight }));
      if (!children.length) throw new Error("Add at least one subgoal");
      return await cascade({ data: { parent_goal_id: cascadeParent, children } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team_goals", teamId] }); setCascadeOpen(false); setCascadeRows([{ owner_member_id: "", title: "", weight: 1 }]); setCascadeParent(""); toast.success("Subgoals created"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  type Row = { id: string; title: string; description: string | null; status: string; progress: number; target_date: string | null; parent_goal_id: string | null; team_members: { employees: { first_name: string; last_name: string } | null } | null };
  const rows = ((q.data ?? []) as unknown as Row[]);
  const childrenOf = (pid: string | null) => rows.filter((g) => (g.parent_goal_id ?? null) === pid);
  const roots = childrenOf(null);

  const renderCard = (g: Row, depth: number) => (
    <div key={g.id} style={{ marginLeft: depth * 24 }} className={depth > 0 ? "border-l-2 border-primary/30 pl-3" : ""}>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h4 className="font-medium flex items-center gap-2"><Target className="h-4 w-4 text-primary shrink-0" /> {g.title}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {g.team_members?.employees ? `${g.team_members.employees.first_name} ${g.team_members.employees.last_name}` : "Team goal"}
              {g.target_date ? ` · target ${g.target_date}` : ""}
            </p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${GOAL_STATUS_COLORS[g.status] ?? ""}`}>{g.status}</span>
        </div>
        {g.description && <p className="text-sm text-muted-foreground mb-3">{g.description}</p>}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Progress</span><span className="font-medium">{g.progress}%</span></div>
          <input type="range" min={0} max={100} step={5} defaultValue={g.progress} disabled={!canEdit}
            onMouseUp={(e) => { const v = Number((e.target as HTMLInputElement).value); updateProg({ data: { goal_id: g.id, progress: v, status: v >= 100 ? "completed" : undefined } }).then(() => qc.invalidateQueries({ queryKey: ["team_goals", teamId] })); }}
            className="w-full" />
        </div>
        {canEdit && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="ghost" onClick={() => { setCascadeParent(g.id); setCascadeRows([{ owner_member_id: "", title: "", weight: 1 }]); setCascadeOpen(true); }}>
              <GitBranch className="h-3.5 w-3.5 mr-1" /> Subgoal
            </Button>
          </div>
        )}
      </Card>
      {childrenOf(g.id).map((c) => renderCard(c, depth + 1))}
    </div>
  );

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New team goal</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New team goal</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Owner (optional)</Label>
                    <Select value={form.owner_member_id} onValueChange={(v) => setForm({ ...form, owner_member_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Team-level" /></SelectTrigger>
                      <SelectContent>
                        {(membersQ.data ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.employees?.first_name} {m.employees?.last_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Target date</Label><Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
                </div>
              </div>
              <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No goals yet.</Card>
      ) : roots.map((g) => renderCard(g, 0))}

      <Dialog open={cascadeOpen} onOpenChange={setCascadeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add subgoals</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {cascadeRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <div className="col-span-4">
                  <Select value={row.owner_member_id} onValueChange={(v) => setCascadeRows(cascadeRows.map((r, i) => i === idx ? { ...r, owner_member_id: v } : r))}>
                    <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
                    <SelectContent>{(membersQ.data ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.employees?.first_name} {m.employees?.last_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-6"><Input placeholder="Subgoal title" value={row.title} onChange={(e) => setCascadeRows(cascadeRows.map((r, i) => i === idx ? { ...r, title: e.target.value } : r))} /></div>
                <div className="col-span-2"><Input type="number" min={0.1} step={0.1} value={row.weight} onChange={(e) => setCascadeRows(cascadeRows.map((r, i) => i === idx ? { ...r, weight: Number(e.target.value) } : r))} /></div>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setCascadeRows([...cascadeRows, { owner_member_id: "", title: "", weight: 1 }])}>+ Add row</Button>
          </div>
          <DialogFooter><Button onClick={() => doCascade.mutate()} disabled={doCascade.isPending}>Create subgoals</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────── Deliverables ───────────
function DeliverablesTab({ teamId, members, canEdit }: { teamId: string; members: MemberRow[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["team_deliverables", teamId],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_deliverables")
        .select("id, title, description, due_date, status, owner_member_id, team_members(employees(first_name, last_name))")
        .eq("team_id", teamId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", due_date: "", owner_member_id: "" });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title required");
      const { error } = await supabase.from("team_deliverables").insert({
        team_id: teamId, title: form.title.trim(), description: form.description || null,
        due_date: form.due_date || null, owner_member_id: form.owner_member_id || null,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team_deliverables", teamId] }); setOpen(false); setForm({ title: "", description: "", due_date: "", owner_member_id: "" }); toast.success("Deliverable added"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("team_deliverables").update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_deliverables", teamId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  type Row = { id: string; title: string; description: string | null; due_date: string | null; status: string; team_members: { employees: { first_name: string; last_name: string } | null } | null };
  const rows = (q.data ?? []) as unknown as Row[];

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New deliverable</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New deliverable</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Owner</Label>
                    <Select value={form.owner_member_id} onValueChange={(v) => setForm({ ...form, owner_member_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.employees?.first_name} {m.employees?.last_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                </div>
              </div>
              <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No deliverables yet.</Card>
      ) : (
        <div className="space-y-2">
          {rows.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium">{d.title}</h4>
                  {d.description && <p className="text-sm text-muted-foreground mt-1">{d.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {d.team_members?.employees ? `${d.team_members.employees.first_name} ${d.team_members.employees.last_name}` : "Unassigned"}
                    {d.due_date ? ` · due ${d.due_date}` : ""}
                  </p>
                </div>
                {canEdit ? (
                  <Select value={d.status} onValueChange={(v) => setStatus.mutate({ id: d.id, status: v })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{DELIV_STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded bg-muted">{d.status.replace("_", " ")}</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────── Meetings & decisions ───────────
function MeetingsTab({ teamId, canEdit }: { teamId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const meetingsQ = useQuery({
    queryKey: ["team_meetings", teamId],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_meetings").select("*").eq("team_id", teamId).order("meeting_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const decisionsQ = useQuery({
    queryKey: ["team_decisions", teamId],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_decisions").select("*").eq("team_id", teamId).order("decided_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [mOpen, setMOpen] = useState(false);
  const [mForm, setMForm] = useState({ title: "", meeting_date: new Date().toISOString().slice(0, 10), notes_md: "" });
  const createMeeting = useMutation({
    mutationFn: async () => {
      if (!mForm.title.trim()) throw new Error("Title required");
      const uid = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from("team_meetings").insert({ team_id: teamId, title: mForm.title.trim(), meeting_date: mForm.meeting_date, notes_md: mForm.notes_md || null, created_by: uid } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team_meetings", teamId] }); setMOpen(false); setMForm({ title: "", meeting_date: new Date().toISOString().slice(0, 10), notes_md: "" }); toast.success("Meeting logged"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [dOpen, setDOpen] = useState(false);
  const [dForm, setDForm] = useState({ title: "", rationale: "" });
  const createDecision = useMutation({
    mutationFn: async () => {
      if (!dForm.title.trim()) throw new Error("Title required");
      const uid = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from("team_decisions").insert({ team_id: teamId, title: dForm.title.trim(), rationale: dForm.rationale || null, decided_by: uid } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team_decisions", teamId] }); setDOpen(false); setDForm({ title: "", rationale: "" }); toast.success("Decision recorded"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium flex items-center gap-2"><MessagesSquare className="h-4 w-4" /> Meetings</h3>
          {canEdit && (
            <Dialog open={mOpen} onOpenChange={setMOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Log</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Log a meeting</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5"><Label>Title</Label><Input value={mForm.title} onChange={(e) => setMForm({ ...mForm, title: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={mForm.meeting_date} onChange={(e) => setMForm({ ...mForm, meeting_date: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={5} value={mForm.notes_md} onChange={(e) => setMForm({ ...mForm, notes_md: e.target.value })} /></div>
                </div>
                <DialogFooter><Button onClick={() => createMeeting.mutate()} disabled={createMeeting.isPending}>Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="space-y-2">
          {(meetingsQ.data ?? []).map((m) => (
            <Card key={m.id} className="p-3">
              <div className="text-sm font-medium">{m.title}</div>
              <div className="text-xs text-muted-foreground mb-2">{m.meeting_date}</div>
              {m.notes_md && <div className="text-sm whitespace-pre-wrap">{m.notes_md}</div>}
            </Card>
          ))}
          {(meetingsQ.data ?? []).length === 0 && <Card className="p-4 text-sm text-muted-foreground">No meetings logged.</Card>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Decisions</h3>
          {canEdit && (
            <Dialog open={dOpen} onOpenChange={setDOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Record</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Record a decision</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5"><Label>Title</Label><Input value={dForm.title} onChange={(e) => setDForm({ ...dForm, title: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Rationale</Label><Textarea rows={4} value={dForm.rationale} onChange={(e) => setDForm({ ...dForm, rationale: e.target.value })} /></div>
                </div>
                <DialogFooter><Button onClick={() => createDecision.mutate()} disabled={createDecision.isPending}>Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="space-y-2">
          {(decisionsQ.data ?? []).map((d) => (
            <Card key={d.id} className="p-3">
              <div className="text-sm font-medium">{d.title}</div>
              <div className="text-xs text-muted-foreground mb-2">{new Date(d.decided_at).toLocaleDateString()}</div>
              {d.rationale && <div className="text-sm whitespace-pre-wrap">{d.rationale}</div>}
            </Card>
          ))}
          {(decisionsQ.data ?? []).length === 0 && <Card className="p-4 text-sm text-muted-foreground">No decisions recorded.</Card>}
        </div>
      </div>
    </div>
  );
}

// ─────────── Updates feed ───────────
function UpdatesTab({ teamId, canEdit }: { teamId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["team_updates", teamId],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_updates").select("*").eq("team_id", teamId).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

  const [body, setBody] = useState("");
  const post = useMutation({
    mutationFn: async () => {
      if (!body.trim()) return;
      const uid = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from("team_updates").insert({ team_id: teamId, kind: "comment", author_id: uid, body_md: body.trim() } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team_updates", teamId] }); setBody(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-3 max-w-2xl">
      {canEdit && (
        <Card className="p-3 space-y-2">
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Post an update…" />
          <div className="flex justify-end"><Button size="sm" onClick={() => post.mutate()} disabled={post.isPending || !body.trim()}>Post</Button></div>
        </Card>
      )}
      {(q.data ?? []).map((u) => (
        <Card key={u.id} className="p-3">
          <div className="text-xs text-muted-foreground mb-1"><span className="capitalize">{u.kind.replace("_", " ")}</span> · {new Date(u.created_at).toLocaleString()}</div>
          {u.body_md && <div className="text-sm whitespace-pre-wrap">{u.body_md}</div>}
        </Card>
      ))}
      {(q.data ?? []).length === 0 && <Card className="p-6 text-sm text-muted-foreground text-center">No activity yet.</Card>}
    </div>
  );
}

// ─────────── Links ───────────
function LinksTab({ teamId, canEdit }: { teamId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["team_links", teamId],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_links").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState({ label: "", url: "" });
  const add = useMutation({
    mutationFn: async () => {
      if (!form.label.trim() || !form.url.trim()) throw new Error("Label and URL required");
      const uid = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from("team_links").insert({ team_id: teamId, label: form.label.trim(), url: form.url.trim(), added_by: uid } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team_links", teamId] }); setForm({ label: "", url: "" }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("team_links").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_links", teamId] }),
  });
  return (
    <div className="space-y-3 max-w-2xl">
      {canEdit && (
        <Card className="p-3 flex gap-2">
          <Input placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Input placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>Add</Button>
        </Card>
      )}
      <div className="space-y-2">
        {(q.data ?? []).map((l) => (
          <Card key={l.id} className="p-3 flex items-center justify-between">
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="h-3.5 w-3.5" /> {l.label}
            </a>
            {canEdit && <Button size="sm" variant="ghost" onClick={() => remove.mutate(l.id)}>Remove</Button>}
          </Card>
        ))}
        {(q.data ?? []).length === 0 && <Card className="p-4 text-sm text-muted-foreground">No links yet.</Card>}
      </div>
    </div>
  );
}