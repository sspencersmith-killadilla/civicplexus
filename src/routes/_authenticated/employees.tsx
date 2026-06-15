import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";

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
    queryFn: async () => (await supabase.from("worker_types").select("id,name").order("sort_order")).data,
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee created — pre-boarding started");
      setOpen(false);
      setForm({ first_name: "", last_name: "", personal_email: "", job_title: "", department: "", worker_type_id: "", start_date: "" });
      setTplId("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const filteredTpls = templates?.filter((t) => !form.worker_type_id || t.worker_type_id === form.worker_type_id) ?? [];

  return (
    <AppShell title="Employees">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-xl">Create an employee record to start pre-boarding. Picking a template will instantiate every task at once.</p>
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
                  <Select value={form.worker_type_id} onValueChange={(v) => { setForm({ ...form, worker_type_id: v }); setTplId(""); }}>
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
            </div>
            <DialogFooter>
              <Button disabled={!form.first_name || !form.last_name || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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