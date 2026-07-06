import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { submitPaf, repairPafChains, listPafs, listPafEmployees } from "@/lib/paf.functions";
import { addPafLine } from "@/lib/paf-lines.functions";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/paf/")({ component: PafIndex });

const ACTIONS = [
  "hire","rehire","transfer","promotion","demotion","reclassification",
  "pay_change","status_change","leave_start","leave_return","separation","position_change","other",
] as const;

function PafIndex() {
  const qc = useQueryClient();
  const submit = useServerFn(submitPaf);
  const repair = useServerFn(repairPafChains);
  const listPafsFn = useServerFn(listPafs);
  const listEmployeesFn = useServerFn(listPafEmployees);
  const addLine = useServerFn(addPafLine);
  const [open, setOpen] = useState(false);
  const { data: me } = useCurrentUser();
  const isHR = hasRole(me?.roles, "hr_admin");
  const canCreate =
    isHR ||
    hasRole(me?.roles, "supervisor") ||
    hasRole(me?.roles, "hiring_manager") ||
    hasRole(me?.roles, "department_admin");
  const repairM = useMutation({
    mutationFn: () => repair({}),
    onSuccess: (r: { scanned: number; repaired: number; alreadyOk: number; problems: Array<{ paf_id: string; reason: string }> }) => {
      qc.invalidateQueries({ queryKey: ["pafs"] });
      toast.success(`Scanned ${r.scanned} · repaired ${r.repaired} · ok ${r.alreadyOk}${r.problems.length ? ` · ${r.problems.length} skipped` : ""}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Repair failed"),
  });

  const listQ = useQuery({
    queryKey: ["pafs"],
    queryFn: () => listPafsFn({ data: undefined as never }),
  });

  const empsQ = useQuery({
    queryKey: ["emps-min"],
    queryFn: () => listEmployeesFn({ data: undefined as never }),
  });

  const [form, setForm] = useState({
    employee_id: "", action_type: "pay_change" as typeof ACTIONS[number], effective_date: "",
    reason: "", narrative: "",
    // structured fields
    new_job_title: "", new_department: "", new_manager_id: "",
    new_base_annual: "", separation_reason: "voluntary", rehire_eligible: true,
  });
  type ExtraLine = { action_type: typeof ACTIONS[number]; effective_date: string; after_values: Record<string, unknown> };
  const [extraLines, setExtraLines] = useState<ExtraLine[]>([]);
  const [extraDraft, setExtraDraft] = useState<{ action_type: typeof ACTIONS[number]; effective_date: string; new_job_title: string; new_department: string; new_base_annual: string }>({
    action_type: "pay_change", effective_date: "", new_job_title: "", new_department: "", new_base_annual: "",
  });
  const draftAfterValues = () => {
    const av: Record<string, unknown> = {};
    if (extraDraft.new_job_title) av.job_title = extraDraft.new_job_title;
    if (extraDraft.new_department) av.department = extraDraft.new_department;
    if (extraDraft.action_type === "pay_change" && extraDraft.new_base_annual) av.base_annual = Number(extraDraft.new_base_annual);
    return av;
  };

  const send = useMutation({
    mutationFn: async () => {
      const after: Record<string, unknown> = {};
      if (form.new_job_title) after.job_title = form.new_job_title;
      if (form.new_department) after.department = form.new_department;
      if (form.new_manager_id) after.manager_id = form.new_manager_id;
      if (form.action_type === "separation") {
        after.separation_date = form.effective_date;
        after.separation_reason = form.separation_reason;
        after.rehire_eligible = form.rehire_eligible;
      }
      if (form.action_type === "pay_change" && form.new_base_annual) {
        after.base_annual = Number(form.new_base_annual);
      }
      const created = await submit({ data: {
        employee_id: form.employee_id, action_type: form.action_type, effective_date: form.effective_date,
        reason: form.reason || undefined, narrative: form.narrative || undefined, after_values: after,
      }});
      for (const l of extraLines) {
        await addLine({ data: { paf_id: created.id, action_type: l.action_type, effective_date: l.effective_date, after_values: l.after_values } });
      }
      return created;
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["pafs"] }); setOpen(false); setExtraLines([]); toast.success(`Submitted ${r.paf_number}`); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <AppShell title="Personnel Action Forms">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground max-w-2xl">PAFs route through supervisor → HR approval, then HR applies the change to the employee record.</p>
        <div className="flex gap-2">
          {isHR && (
            <Button variant="outline" onClick={() => repairM.mutate()} disabled={repairM.isPending}>
              {repairM.isPending ? "Repairing…" : "Repair approval chains"}
            </Button>
          )}
          {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New PAF</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>New personnel action</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Employee</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(empsQ.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.last_name}, {e.first_name} · {e.job_title ?? "—"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Action type</Label>
                  <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v as typeof ACTIONS[number] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Effective date</Label><Input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} /></div>
              </div>
              <div><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. promotion to Sr. Engineer" /></div>
              <div><Label>Narrative</Label><Textarea rows={3} value={form.narrative} onChange={(e) => setForm({ ...form, narrative: e.target.value })} /></div>
              {(form.action_type === "promotion" || form.action_type === "demotion" || form.action_type === "transfer" || form.action_type === "position_change" || form.action_type === "reclassification") && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>New job title</Label><Input value={form.new_job_title} onChange={(e) => setForm({ ...form, new_job_title: e.target.value })} /></div>
                  <div><Label>New department</Label><Input value={form.new_department} onChange={(e) => setForm({ ...form, new_department: e.target.value })} /></div>
                  <div className="col-span-2"><Label>New manager</Label>
                    <Select value={form.new_manager_id} onValueChange={(v) => setForm({ ...form, new_manager_id: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {(empsQ.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.last_name}, {e.first_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {form.action_type === "pay_change" && (
                <div><Label>New annual base ($)</Label><Input type="number" value={form.new_base_annual} onChange={(e) => setForm({ ...form, new_base_annual: e.target.value })} /></div>
              )}
              {form.action_type === "separation" && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Reason</Label>
                    <Select value={form.separation_reason} onValueChange={(v) => setForm({ ...form, separation_reason: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["voluntary","involuntary","retirement","end_of_term","deceased"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={form.rehire_eligible} onChange={(e) => setForm({ ...form, rehire_eligible: e.target.checked })} /> Rehire eligible</label>
                </div>
              )}
              <div className="flex justify-end">
                <Button disabled={send.isPending || !form.employee_id || !form.effective_date} onClick={() => send.mutate()}>
                  {send.isPending ? "Submitting…" : "Submit for approval"}
                </Button>
              </div>
            </div>
            <div className="border-t pt-3 mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Additional action lines</p>
                <span className="text-xs text-muted-foreground">{extraLines.length} added</span>
              </div>
              <p className="text-xs text-muted-foreground">Combine multiple actions on one PAF. Each line will be reviewable individually by approvers.</p>
              {extraLines.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {extraLines.map((l, idx) => (
                    <li key={idx} className="flex items-center justify-between border rounded px-2 py-1.5">
                      <span>{l.action_type.replace(/_/g, " ")} · eff. {l.effective_date} · {Object.keys(l.after_values).length} field(s)</span>
                      <Button size="sm" variant="ghost" onClick={() => setExtraLines(extraLines.filter((_, i) => i !== idx))}>Remove</Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Action type</Label>
                  <Select value={extraDraft.action_type} onValueChange={(v) => setExtraDraft({ ...extraDraft, action_type: v as typeof ACTIONS[number] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Effective</Label><Input type="date" value={extraDraft.effective_date} onChange={(e) => setExtraDraft({ ...extraDraft, effective_date: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">New title</Label><Input value={extraDraft.new_job_title} onChange={(e) => setExtraDraft({ ...extraDraft, new_job_title: e.target.value })} /></div>
                <div><Label className="text-xs">New department</Label><Input value={extraDraft.new_department} onChange={(e) => setExtraDraft({ ...extraDraft, new_department: e.target.value })} /></div>
              </div>
              {extraDraft.action_type === "pay_change" && (
                <div><Label className="text-xs">New annual base ($)</Label><Input type="number" value={extraDraft.new_base_annual} onChange={(e) => setExtraDraft({ ...extraDraft, new_base_annual: e.target.value })} /></div>
              )}
              <div className="flex justify-end">
                <Button size="sm" variant="outline" disabled={!extraDraft.effective_date} onClick={() => {
                  setExtraLines([...extraLines, { action_type: extraDraft.action_type, effective_date: extraDraft.effective_date, after_values: draftAfterValues() }]);
                  setExtraDraft({ action_type: "pay_change", effective_date: "", new_job_title: "", new_department: "", new_base_annual: "" });
                }}><Plus className="h-3 w-3 mr-1" /> Add line</Button>
              </div>
            </div>
          </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <Card className="divide-y">
        {(listQ.data ?? []).map((p) => (
          <Link key={p.id} to="/paf/$id" params={{ id: p.id }} className="block p-3 hover:bg-muted/40 text-sm">
            <div className="flex justify-between">
              <div>
                <span className="font-mono text-xs text-muted-foreground mr-2">{p.paf_number}</span>
                <span className="font-medium">{p.employees?.first_name} {p.employees?.last_name}</span>
                <span className="text-muted-foreground ml-2">{p.action_type.replace(/_/g, " ")} · eff. {p.effective_date}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-muted">{p.status}</span>
            </div>
          </Link>
        ))}
        {(listQ.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">No PAFs yet.</p>}
      </Card>
    </AppShell>
  );
}