import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createRequisition } from "@/lib/jobs.functions";

export const Route = createFileRoute("/_authenticated/jobs/")({ component: JobsIndex });

function JobsIndex() {
  const qc = useQueryClient();
  const create = useServerFn(createRequisition);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", department: "", location: "", employment_type: "full_time", summary: "", description: "", internal_only: false });

  const reqsQ = useQuery({
    queryKey: ["job_requisitions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_requisitions" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; title: string; department: string | null; status: string; slug: string | null; posted_at: string | null; internal_only: boolean }>;
    },
  });

  const submit = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job_requisitions"] }); setOpen(false); toast.success("Requisition drafted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <AppShell title="Job Requisitions">
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New requisition</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>New job requisition</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input value={form.title} onChange={(e)=>setForm({...form, title: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Department</Label><Input value={form.department} onChange={(e)=>setForm({...form, department: e.target.value})} /></div>
                <div><Label>Location</Label><Input value={form.location} onChange={(e)=>setForm({...form, location: e.target.value})} /></div>
              </div>
              <div><Label>Summary (1-2 sentences)</Label><Textarea rows={2} value={form.summary} onChange={(e)=>setForm({...form, summary: e.target.value})} /></div>
              <div><Label>Description (markdown ok)</Label><Textarea rows={6} value={form.description} onChange={(e)=>setForm({...form, description: e.target.value})} /></div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.internal_only} onChange={(e)=>setForm({...form, internal_only: e.target.checked})} />
                Internal mobility only (hidden from public board)
              </label>
              <div className="flex justify-end pt-2">
                <Button disabled={submit.isPending || !form.title.trim()} onClick={()=>submit.mutate()}>{submit.isPending ? "Creating…" : "Create draft"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-3">
        {(reqsQ.data ?? []).map((r) => (
          <Link key={r.id} to="/jobs/$id" params={{ id: r.id }}>
            <Card className="p-4 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{r.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.department ?? "—"} · {r.internal_only ? "Internal only" : "Public"}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-muted">{r.status}</span>
              </div>
            </Card>
          </Link>
        ))}
        {(reqsQ.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No requisitions yet.</p>}
      </div>
    </AppShell>
  );
}