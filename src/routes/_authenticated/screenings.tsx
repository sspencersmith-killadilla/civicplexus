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
import { Badge } from "@/components/ui/badge";
import { Plus, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/screenings")({ component: ScreeningsPage });

const TYPES = ["background", "fingerprint", "drug", "mvr", "credit"] as const;
const STATUS = ["requested", "scheduled", "in_progress", "passed", "failed", "cancelled"] as const;

function ScreeningsPage() {
  const qc = useQueryClient();
  const { data: emps } = useQuery({ queryKey: ["sc-emps"], queryFn: async () => (await supabase.from("employees").select("id,first_name,last_name").order("last_name")).data ?? [] });
  const { data: rows } = useQuery({ queryKey: ["screenings"], queryFn: async () => (await supabase.from("screenings").select("*, employees(first_name,last_name)").order("created_at", { ascending: false })).data ?? [] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", type: "background", vendor: "", scheduled_at: "" });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("screenings").insert({ employee_id: form.employee_id, type: form.type, vendor: form.vendor || null, scheduled_at: form.scheduled_at || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Screening created"); setOpen(false); qc.invalidateQueries({ queryKey: ["screenings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: { status: string; completed_at?: string } = { status };
      if (["passed", "failed"].includes(status)) patch.completed_at = new Date().toISOString();
      const { error } = await supabase.from("screenings").update(patch).eq("id", id); if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["screenings"] }),
  });

  const statusColor = (s: string) => s === "passed" ? "bg-emerald-500" : s === "failed" ? "bg-red-500" : s === "in_progress" ? "bg-blue-500" : "bg-muted";

  return (
    <AppShell title="Background Checks & Screenings">
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Screening</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule Screening</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Employee</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{emps?.map((e) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Vendor</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Checkr / Sterling / IdentoGo" /></div>
              <div><Label>Scheduled at</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.employee_id}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="divide-y">
        {!rows?.length && <div className="p-10 text-center text-muted-foreground"><ShieldQuestion className="h-8 w-8 mx-auto mb-2 opacity-40" /> No screenings yet.</div>}
        {rows?.map((r) => (
          <div key={r.id} className="p-4 flex justify-between items-center">
            <div>
              <p className="font-medium">{(r.employees as { first_name: string; last_name: string } | null)?.first_name} {(r.employees as { first_name: string; last_name: string } | null)?.last_name} · <span className="capitalize">{r.type}</span></p>
              <p className="text-xs text-muted-foreground">{r.vendor ?? "—"} · {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "unscheduled"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusColor(r.status)}>{r.status}</Badge>
              <Select value={r.status} onValueChange={(v) => setStatus.mutate({ id: r.id, status: v })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </Card>
    </AppShell>
  );
}