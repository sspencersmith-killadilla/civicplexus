import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";

export const Route = createFileRoute("/_authenticated/volunteers")({
  component: VolunteersPage,
});

type Volunteer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  skills: string[] | null;
  interests: string[] | null;
  background_check_date: string | null;
  waiver_signed_at: string | null;
  notes: string | null;
  created_at: string;
  archived_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function VolunteersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Volunteer | null>(null);
  const [hoursFor, setHoursFor] = useState<Volunteer | null>(null);
  const [skillFilter, setSkillFilter] = useState<Set<string>>(new Set());
  const [interestFilter, setInterestFilter] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["volunteers"],
    queryFn: async () => {
      const { data, error } = await sb.from("volunteers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Volunteer[];
    },
  });

  const save = useMutation({
    mutationFn: async (form: Partial<Volunteer>) => {
      if (editing) {
        const { error } = await sb.from("volunteers").update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("volunteers").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["volunteers"] });
      toast.success(editing ? "Updated" : "Added");
      setOpen(false); setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const archive = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const { error } = await sb.from("volunteers").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["volunteers"] }); toast.success("Updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const allSkills = Array.from(new Set((items ?? []).flatMap((v) => v.skills ?? []))).sort();
  const allInterests = Array.from(new Set((items ?? []).flatMap((v) => v.interests ?? []))).sort();
  const toggle = (set: Set<string>, s: (v: Set<string>) => void, tag: string) => {
    const next = new Set(set);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    s(next);
  };
  const filtered = (items ?? []).filter((v) => {
    if (!showArchived && v.archived_at) return false;
    if (showArchived && !v.archived_at) return false;
    if (skillFilter.size && !(v.skills ?? []).some((s) => skillFilter.has(s))) return false;
    if (interestFilter.size && !(v.interests ?? []).some((s) => interestFilter.has(s))) return false;
    return true;
  });

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      active: "bg-emerald-500/10 text-emerald-700",
      pending: "bg-amber-500/10 text-amber-700",
      inactive: "bg-muted text-muted-foreground",
    };
    return <Badge className={map[s] ?? ""} variant="outline">{s}</Badge>;
  };

  const now = Date.now();
  const flags = (v: Volunteer) => {
    const out: string[] = [];
    if (!v.waiver_signed_at) out.push("waiver missing");
    if (v.background_check_date) {
      const age = (now - new Date(v.background_check_date).getTime()) / (1000 * 60 * 60 * 24 * 365);
      if (age > 2) out.push("bg check expired");
    } else {
      out.push("no bg check");
    }
    return out;
  };

  return (
    <AppShell title="Volunteers">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Volunteer directory with skills, waiver + background-check tracking, and logged service hours.
          Public intake at <code>/serve/volunteer</code>.
        </p>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New volunteer</Button></DialogTrigger>
          <VolunteerDialog key={editing?.id ?? "new"} editing={editing} onSubmit={(f) => save.mutate(f)} saving={save.isPending} />
        </Dialog>
      </div>

      <Card className="p-3 mb-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground w-16">Skills:</span>
          {allSkills.length === 0 && <span className="text-xs text-muted-foreground">none yet</span>}
          {allSkills.map((s) => (
            <button key={s} onClick={() => toggle(skillFilter, setSkillFilter, s)}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${skillFilter.has(s) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground w-16">Interests:</span>
          {allInterests.length === 0 && <span className="text-xs text-muted-foreground">none yet</span>}
          {allInterests.map((s) => (
            <button key={s} onClick={() => toggle(interestFilter, setInterestFilter, s)}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${interestFilter.has(s) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          {(skillFilter.size || interestFilter.size) > 0 && (
            <button className="text-primary hover:underline" onClick={() => { setSkillFilter(new Set()); setInterestFilter(new Set()); }}>Clear filters</button>
          )}
          <span className="text-muted-foreground ml-auto">{filtered.length} volunteer{filtered.length === 1 ? "" : "s"}</span>
        </div>
      </Card>

      {isLoading ? <p className="text-muted-foreground">Loading…</p> : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No volunteers yet.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((v) => {
            const flg = flags(v);
            return (
              <Card key={v.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{v.first_name} {v.last_name}</h3>
                    <p className="text-xs text-muted-foreground">{v.email ?? "—"} · {v.phone ?? "—"}</p>
                  </div>
                  {statusBadge(v.status)}
                </div>
                {v.skills && v.skills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {v.skills.map((s) => <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{s}</span>)}
                  </div>
                )}
                {v.interests && v.interests.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {v.interests.map((s) => <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{s}</span>)}
                  </div>
                )}
                {flg.length > 0 && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> {flg.join(" · ")}
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(v); setOpen(true); }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setHoursFor(v)}>Log hours</Button>
                  {v.archived_at ? (
                    <Button size="sm" variant="ghost" onClick={() => archive.mutate({ id: v.id, archive: false })}><ArchiveRestore className="h-3 w-3 mr-1" /> Restore</Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => archive.mutate({ id: v.id, archive: true })}><Archive className="h-3 w-3 mr-1" /> Archive</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <HoursDialog volunteer={hoursFor} onClose={() => setHoursFor(null)} />
    </AppShell>
  );
}

function VolunteerDialog({
  editing, onSubmit, saving,
}: { editing: Volunteer | null; onSubmit: (f: Partial<Volunteer>) => void; saving: boolean }) {
  const [first, setFirst] = useState(editing?.first_name ?? "");
  const [last, setLast] = useState(editing?.last_name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [status, setStatus] = useState(editing?.status ?? "active");
  const [skills, setSkills] = useState((editing?.skills ?? []).join(", "));
  const [bg, setBg] = useState(editing?.background_check_date ?? "");
  const [waiver, setWaiver] = useState(!!editing?.waiver_signed_at);
  const [notes, setNotes] = useState(editing?.notes ?? "");

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edit volunteer" : "New volunteer"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First name</Label><Input value={first} onChange={(e) => setFirst(e.target.value)} /></div>
          <div><Label>Last name</Label><Input value={last} onChange={(e) => setLast(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Email</Label><Input value={email ?? ""} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Background check date</Label><Input type="date" value={bg ?? ""} onChange={(e) => setBg(e.target.value)} /></div>
        </div>
        <div><Label>Skills (comma-separated)</Label><Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="first aid, spanish, tech" /></div>
        <div className="flex items-center gap-2">
          <input id="waiver" type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} />
          <Label htmlFor="waiver" className="text-sm">Waiver signed</Label>
        </div>
        <div><Label>Notes</Label><Textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
      </div>
      <DialogFooter>
        <Button
          disabled={saving || !first || !last}
          onClick={() => onSubmit({
            first_name: first,
            last_name: last,
            email: email || null,
            phone: phone || null,
            status,
            skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
            background_check_date: bg || null,
            waiver_signed_at: waiver ? (editing?.waiver_signed_at ?? new Date().toISOString()) : null,
            notes: notes || null,
          })}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function HoursDialog({ volunteer, onClose }: { volunteer: Volunteer | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("1");
  const [activity, setActivity] = useState("");

  const { data: log } = useQuery({
    queryKey: ["volunteer_hours", volunteer?.id],
    enabled: !!volunteer,
    queryFn: async () => {
      const { data, error } = await sb.from("volunteer_hours").select("*")
        .eq("volunteer_id", volunteer!.id).order("service_date", { ascending: false });
      if (error) throw error;
      return data as Array<{ id: string; service_date: string; hours: number; activity: string | null }>;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("volunteer_hours").insert({
        volunteer_id: volunteer!.id, service_date: date, hours: Number(hours), activity: activity || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["volunteer_hours", volunteer?.id] });
      setActivity(""); setHours("1");
      toast.success("Hours logged");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const total = (log ?? []).reduce((sum, r) => sum + Number(r.hours), 0);

  return (
    <Dialog open={!!volunteer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hours — {volunteer?.first_name} {volunteer?.last_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Hours</Label><Input type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
            <div className="col-span-3"><Label>Activity</Label><Input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Park cleanup" /></div>
          </div>
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>Log</Button>
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">Total: <b>{total.toFixed(2)}</b> hours</p>
            <div className="max-h-56 overflow-y-auto text-sm">
              {(log ?? []).map((r) => (
                <div key={r.id} className="flex justify-between py-1 border-b last:border-0">
                  <span>{r.service_date} · {r.activity ?? "—"}</span>
                  <span className="font-medium">{r.hours}h</span>
                </div>
              ))}
              {(log ?? []).length === 0 && <p className="text-muted-foreground text-xs">No entries yet.</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}