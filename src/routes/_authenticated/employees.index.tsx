import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Users, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PROVISIONING_KINDS, DEFAULT_PROVISIONING_KINDS } from "@/lib/provisioning-kinds";

export const Route = createFileRoute("/_authenticated/employees")({
  component: EmployeesPage,
});

type Emp = {
  id: string; first_name: string; last_name: string; personal_email: string | null; work_email: string | null;
  department: string | null; job_title: string | null; status: string; worker_type_id: string | null; start_date: string | null;
};

function EmployeesPage() {
  const qc = useQueryClient();
  const { data: workerTypes } = useQuery({
    queryKey: ["wt-min"],
    queryFn: async () => (await supabase.from("worker_types").select("id,name,default_provisioning").order("sort_order")).data,
  });
  const { data: templates } = useQuery({
    queryKey: ["templates-min"],
    queryFn: async () => (await supabase.from("onboarding_templates").select("id,name,worker_type_id")).data,
  });
  const { data: employees, isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => (await supabase.from("employees").select("*").order("created_at", { ascending: false })).data as Emp[] | null,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", personal_email: "", job_title: "", department: "", worker_type_id: "", start_date: "" });
  const [tplId, setTplId] = useState<string>("");
  const [provKinds, setProvKinds] = useState<string[]>(DEFAULT_PROVISIONING_KINDS);
  const [provNotes, setProvNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: emp, error } = await supabase.from("employees").insert({
        first_name: form.first_name, last_name: form.last_name, personal_email: form.personal_email || null,
        job_title: form.job_title || null, department: form.department || null,
        worker_type_id: form.worker_type_id || null, start_date: form.start_date || null,
        status: "preboarding",
      }).select().single();
      if (error) throw error;

      if (tplId) {
        const { data: tpl } = await supabase.from("template_tasks").select("*").eq("template_id", tplId).order("sort_order");
        const { data: inst, error: ie } = await supabase.from("onboarding_instances").insert({ employee_id: emp.id, template_id: tplId }).select().single();
        if (ie) throw ie;
        if (tpl?.length) {
          const rows = tpl.map((t) => ({
            onboarding_instance_id: inst.id, template_task_id: t.id, title: t.title, description: t.description,
            category: t.category, assignee: t.assignee, is_required: t.is_required, sort_order: t.sort_order,
          }));
          const { error: te } = await supabase.from("task_instances").insert(rows);
          if (te) throw te;
        }
      }

      if (provKinds.length) {
        const { error: pe } = await supabase.from("provisioning_requests").insert(
          provKinds.map((k) => ({ employee_id: emp.id, kind: k, status: "pending", notes: provNotes || null })),
        );
        if (pe) throw pe;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["provisioning"] });
      toast.success("Employee created — pre-boarding & IT queue started");
      setOpen(false);
      setForm({ first_name: "", last_name: "", personal_email: "", job_title: "", department: "", worker_type_id: "", start_date: "" });
      setTplId("");
      setProvKinds(DEFAULT_PROVISIONING_KINDS);
      setProvNotes("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const filteredTpls = templates?.filter((t) => !form.worker_type_id || t.worker_type_id === form.worker_type_id) ?? [];

  function pickWorkerType(v: string) {
    setForm({ ...form, worker_type_id: v });
    setTplId("");
    const wt = workerTypes?.find((w) => w.id === v);
    const defaults = (wt?.default_provisioning as unknown as string[] | null) ?? null;
    setProvKinds(defaults && defaults.length ? defaults : DEFAULT_PROVISIONING_KINDS);
  }

  function toggleKind(key: string, on: boolean) {
    setProvKinds((prev) => (on ? Array.from(new Set([...prev, key])) : prev.filter((k) => k !== key)));
  }

  return (
    <AppShell title="Employees">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-xl">Create an employee record to start pre-boarding. Picking a template will instantiate every task at once.</p>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline"><Link to="/hire-requests"><UserPlus className="h-4 w-4 mr-2" /> Hire requests</Link></Button>
          <Button asChild variant="outline"><Link to="/employees/import"><Upload className="h-4 w-4 mr-2" /> Bulk import</Link></Button>
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New employee</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add employee</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>First name</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Last name</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Personal email</Label><Input type="email" value={form.personal_email} onChange={(e) => setForm({ ...form, personal_email: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Job title</Label><Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></div>
                <div className="space-y-2"><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Worker type</Label>
                  <Select value={form.worker_type_id} onValueChange={pickWorkerType}>
                    <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                    <SelectContent>{workerTypes?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <Label>Onboarding template (optional)</Label>
                <Select value={tplId} onValueChange={setTplId}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>{filteredTpls.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label>IT provisioning to queue</Label>
                  <div className="text-xs flex gap-3">
                    <button type="button" className="text-primary hover:underline" onClick={() => setProvKinds(PROVISIONING_KINDS.map((k) => k.key))}>Select all</button>
                    <button type="button" className="text-muted-foreground hover:underline" onClick={() => setProvKinds([])}>Clear</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {PROVISIONING_KINDS.map((k) => {
                    const Icon = k.icon;
                    const checked = provKinds.includes(k.key);
                    return (
                      <label key={k.key} className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-accent">
                        <Checkbox checked={checked} onCheckedChange={(v) => toggleKind(k.key, v === true)} />
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="text-sm">{k.label}</span>
                      </label>
                    );
                  })}
                </div>
                <Textarea
                  value={provNotes}
                  onChange={(e) => setProvNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes for IT (laptop model, group memberships, building, etc.)"
                />
                <p className="text-xs text-muted-foreground">These land on the IT Provisioning board as pending requests.</p>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!form.first_name || !form.last_name || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !employees?.length ? (
        <Card className="p-10 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground" />
          <h3 className="mt-3 font-medium">No employees yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Add your first hire to kick off pre-boarding.</p>
        </Card>
      ) : (
        <Card className="divide-y">
          {employees.map((e) => {
            const w = workerTypes?.find((x) => x.id === e.worker_type_id);
            return (
              <div key={e.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium">{e.first_name} {e.last_name}</div>
                  <div className="text-sm text-muted-foreground">{e.job_title || "—"} · {e.department || "—"} · {w?.name || "—"}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{e.status}</span>
                  <span className="text-xs text-muted-foreground">{e.start_date ?? ""}</span>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </AppShell>
  );
}