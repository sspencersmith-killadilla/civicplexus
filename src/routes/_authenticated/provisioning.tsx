import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Server, CheckCircle2 } from "lucide-react";
import { PROVISIONING_KINDS as KINDS } from "@/lib/provisioning-kinds";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/provisioning")({
  component: ProvisioningPage,
});

const STATUSES = ["pending", "in_progress", "blocked", "complete"] as const;

function ProvisioningPage() {
  const qc = useQueryClient();

  const { data: employees } = useQuery({
    queryKey: ["prov-emps"],
    queryFn: async () => (await supabase.from("employees").select("id,first_name,last_name,worker_type_id").order("last_name")).data,
  });

  const { data: reqs } = useQuery({
    queryKey: ["provisioning"],
    queryFn: async () => (await supabase.from("provisioning_requests").select("*").order("created_at", { ascending: false })).data,
  });

  const [open, setOpen] = useState(false);
  const [emp, setEmp] = useState<string>("");
  const [kind, setKind] = useState<string>("email");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("provisioning_requests").insert({ employee_id: emp, kind, notes });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["provisioning"] }); toast.success("Request created"); setOpen(false); setEmp(""); setKind("email"); setNotes(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("provisioning_requests").update({
        status, completed_at: status === "complete" ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["provisioning"] }),
  });

  const grouped = (reqs ?? []).reduce<Record<string, typeof reqs>>((acc, r) => {
    (acc[r.status] ||= [] as never).push(r as never); return acc;
  }, {});

  function empName(id: string) {
    const e = employees?.find((x) => x.id === id);
    return e ? `${e.first_name} ${e.last_name}` : id.slice(0, 8);
  }

  return (
    <AppShell title="IT Provisioning Queue">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="text-muted-foreground max-w-xl">All identity, equipment, and access requests for new hires. Workflow connects to Entra/Okta, badge systems, and inventory in production.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New request</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New provisioning request</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Employee</Label>
                <Select value={emp} onValueChange={setEmp}>
                  <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                  <SelectContent>{employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Kind</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Make/model, group memberships, building, etc." /></div>
            </div>
            <DialogFooter><Button disabled={!emp || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATUSES.map((s) => (
          <Card key={s} className="p-4 min-h-[200px]">
            <h3 className="font-medium capitalize mb-3 flex items-center justify-between">
              {s.replace(/_/g," ")}
              <span className="text-xs text-muted-foreground">{grouped[s]?.length ?? 0}</span>
            </h3>
            <div className="space-y-2">
              {(grouped[s] ?? []).map((r) => {
                const k = KINDS.find((x) => x.key === r.kind);
                const Icon = k?.icon ?? Server;
                return (
                  <div key={r.id} className="border rounded-md p-3 bg-card">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 text-primary" /> {k?.label ?? r.kind}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{empName(r.employee_id)}</div>
                    {r.notes && <div className="text-xs mt-1 line-clamp-2">{r.notes}</div>}
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {STATUSES.filter((x) => x !== s).map((x) => (
                        <Button key={x} size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setStatus.mutate({ id: r.id, status: x })}>
                          {x === "complete" && <CheckCircle2 className="h-3 w-3 mr-1" />}→ {x.replace(/_/g," ")}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!(grouped[s]?.length) && <p className="text-xs text-muted-foreground">Nothing here.</p>}
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}