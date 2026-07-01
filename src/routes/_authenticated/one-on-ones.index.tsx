import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listOneOnOneCandidates } from "@/lib/one-on-ones.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, MessagesSquare, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/one-on-ones/")({
  component: OneOnOnesIndex,
});

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function OneOnOnesIndex() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const uid = me?.user.id;

  const sessionsQ = useQuery({
    queryKey: ["one_on_ones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("one_on_ones")
        .select("id,title,short_code,status,scheduled_at,manager_user_id,employee_id,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const employeesQ = useQuery({
    queryKey: ["one_on_one_candidates"],
    queryFn: () => listCandidatesFn({ data: undefined as never }),
  });

  const templatesQ = useQuery({
    queryKey: ["1on1_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("one_on_one_templates")
        .select("id,title,is_default")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [empId, setEmpId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [tplId, setTplId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");

  const create = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("Not signed in");
      const code = makeCode();
      const { data, error } = await supabase
        .from("one_on_ones")
        .insert({
          manager_user_id: uid,
          employee_id: empId || null,
          template_id: tplId || null,
          short_code: code,
          title: title || null,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          created_by: uid,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["one_on_ones"] });
      toast.success("1-on-1 created");
      setOpen(false);
      setEmpId(""); setTitle(""); setTplId(""); setScheduledAt("");
      window.location.assign(`/one-on-ones/${s.id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Create failed"),
  });

  const empMap = new Map((employeesQ.data ?? []).map((e) => [e.id, e]));

  return (
    <AppShell title="1-on-1s">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-2xl">
          Recurring manager + direct-report meetings with shared notes, AI summaries, and tracked action items. Each session has a join code your report can use.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New 1-on-1</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule a 1-on-1</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Employee</Label>
                <Select value={empId} onValueChange={setEmpId}>
                  <SelectTrigger><SelectValue placeholder="Pick a direct report" /></SelectTrigger>
                  <SelectContent>
                    {(employeesQ.data ?? []).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.department ? ` · ${e.department}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Title (optional)</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly check-in" />
              </div>
              <div className="space-y-1.5">
                <Label>Agenda template</Label>
                <Select value={tplId} onValueChange={setTplId}>
                  <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
                  <SelectContent>
                    {(templatesQ.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.title}{t.is_default ? " (default)" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Scheduled at (optional)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2"><MessagesSquare className="h-4 w-4 text-primary" /> Your sessions</h3>
        {sessionsQ.isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sessionsQ.data ?? []).map((s) => {
                const emp = s.employee_id ? empMap.get(s.employee_id) : null;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.title ?? "1-on-1"}</TableCell>
                    <TableCell>{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{s.short_code}</code></TableCell>
                    <TableCell className="text-muted-foreground">{s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : "—"}</TableCell>
                    <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted">{s.status}</span></TableCell>
                    <TableCell className="text-right">
                      <Link to="/one-on-ones/$id" params={{ id: s.id }}>
                        <Button size="sm" variant="ghost"><ExternalLink className="h-3 w-3 mr-1" /> Open</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(sessionsQ.data?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No 1-on-1s yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </AppShell>
  );
}