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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/goals")({
  component: GoalsPage,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  at_risk: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function GoalsPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const uid = me?.user.id;

  const goalsQ = useQuery({
    queryKey: ["goals_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("*, employees(first_name,last_name,department)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const employeesQ = useQuery({
    queryKey: ["employees_for_goals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, user_id, manager_id, department")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    owner_employee_id: "",
    title: "",
    description: "",
    category: "performance",
    target_date: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.owner_employee_id || !form.title.trim()) throw new Error("Owner and title required");
      const { error } = await supabase.from("goals").insert({
        owner_employee_id: form.owner_employee_id,
        title: form.title.trim(),
        description: form.description || null,
        category: form.category,
        target_date: form.target_date || null,
        created_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals_all"] });
      setOpen(false);
      setForm({ owner_employee_id: "", title: "", description: "", category: "performance", target_date: "" });
      toast.success("Goal added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const updateProgress = useMutation({
    mutationFn: async ({ gid, progress, status }: { gid: string; progress: number; status?: string }) => {
      const upd = status ? { progress, status } : { progress };
      const { error } = await supabase.from("goals").update(upd).eq("id", gid);
      if (error) throw error;
      await supabase.from("goal_updates").insert({ goal_id: gid, author_id: uid, progress, status: status ?? null });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals_all"] }),
  });

  return (
    <AppShell title="Goals">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-2xl">
          Performance and development goals owned by each employee. Discuss progress in 1-on-1s and update the progress bar to keep an audit trail.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New goal</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New goal</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Select value={form.owner_employee_id} onValueChange={(v) => setForm({ ...form, owner_employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pick an employee" /></SelectTrigger>
                  <SelectContent>
                    {(employeesQ.data ?? []).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.department ? ` · ${e.department}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="performance">Performance</SelectItem>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="team">Team</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Target date</Label><Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Saving…" : "Create"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(goalsQ.data ?? []).map((g) => {
          const owner = g.employees as { first_name: string; last_name: string; department: string | null } | null;
          return (
            <Card key={g.id} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <h4 className="font-medium flex items-center gap-2"><Target className="h-4 w-4 text-primary shrink-0" /> {g.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {owner ? `${owner.first_name} ${owner.last_name}` : "Owner unknown"}
                    {g.target_date ? ` · target ${g.target_date}` : ""}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[g.status] ?? ""}`}>{g.status}</span>
              </div>
              {g.description && <p className="text-sm text-muted-foreground mb-3">{g.description}</p>}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Progress</span><span className="font-medium">{g.progress}%</span></div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  defaultValue={g.progress}
                  onMouseUp={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    updateProgress.mutate({ gid: g.id, progress: v, status: v >= 100 ? "completed" : g.status === "draft" ? "active" : undefined });
                  }}
                  onTouchEnd={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    updateProgress.mutate({ gid: g.id, progress: v, status: v >= 100 ? "completed" : undefined });
                  }}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => updateProgress.mutate({ gid: g.id, progress: g.progress, status: "at_risk" })}>Flag at risk</Button>
                <Button size="sm" variant="outline" onClick={() => updateProgress.mutate({ gid: g.id, progress: 100, status: "completed" })}>Mark complete</Button>
              </div>
            </Card>
          );
        })}
        {(goalsQ.data?.length ?? 0) === 0 && (
          <Card className="p-8 text-center text-muted-foreground md:col-span-2">No goals yet. Add one above.</Card>
        )}
      </div>
    </AppShell>
  );
}