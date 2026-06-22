import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { addGrievanceNote, updateGrievanceStatus } from "@/lib/grievances.functions";

export const Route = createFileRoute("/_authenticated/grievances/$id")({ component: GrievanceDetail });

const STATUSES = ["submitted", "triage", "investigating", "resolved", "closed", "withdrawn"] as const;

function GrievanceDetail() {
  const { id } = useParams({ from: "/_authenticated/grievances/$id" });
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isHR = hasRole(me?.roles, "hr_admin");
  const addNote = useServerFn(addGrievanceNote);
  const changeStatus = useServerFn(updateGrievanceStatus);

  const gQ = useQuery({
    queryKey: ["grievance", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("grievances").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const notesQ = useQuery({
    queryKey: ["grievance_notes", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("grievance_notes").select("*").eq("grievance_id", id).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const [note, setNote] = useState("");
  const [vis, setVis] = useState<"hr_only" | "shared_with_submitter">("hr_only");
  const [status, setStatus] = useState<string>("");
  const [resolution, setResolution] = useState<string>("");

  const postNote = useMutation({
    mutationFn: () => addNote({ data: { grievance_id: id, content: note, visibility: vis } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["grievance_notes", id] }); setNote(""); toast.success("Note added"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updStatus = useMutation({
    mutationFn: () => changeStatus({ data: { grievance_id: id, status: status as never, resolution_summary: resolution || undefined } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["grievance", id] }); toast.success("Status updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (gQ.isLoading) return <AppShell title="Grievance"><p>Loading…</p></AppShell>;
  const g = gQ.data;
  if (!g) return <AppShell title="Grievance"><p>Not found</p></AppShell>;

  return (
    <AppShell title={`Case ${g.case_number ?? ""}`}>
      <div className="grid gap-6 max-w-4xl">
        <Card className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">{g.summary}</h2>
              <p className="text-xs text-muted-foreground mt-1">{g.category} · {g.severity} · filed {new Date(g.created_at).toLocaleString()}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded bg-muted">{g.status}</span>
          </div>
          {g.details && <p className="text-sm whitespace-pre-wrap">{g.details}</p>}
          {g.resolution_summary && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium mb-1">Resolution</p>
              <p className="text-sm whitespace-pre-wrap">{g.resolution_summary}</p>
            </div>
          )}
        </Card>

        {isHR && (
          <Card className="p-5">
            <h3 className="font-medium mb-3">HR actions</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue placeholder="Change status…" /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Resolution summary (optional)</Label>
                <Textarea rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} />
              </div>
            </div>
            <Button className="mt-3" size="sm" disabled={!status || updStatus.isPending} onClick={() => updStatus.mutate()}>Update status</Button>
          </Card>
        )}

        <Card className="p-5">
          <h3 className="font-medium mb-3">Notes &amp; timeline</h3>
          <ul className="space-y-2 mb-4">
            {(notesQ.data ?? []).map((n) => (
              <li key={n.id} className="text-sm border-l-2 border-muted pl-3">
                <p className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()} · {n.visibility}</p>
                <p className="whitespace-pre-wrap">{n.content}</p>
              </li>
            ))}
            {(notesQ.data?.length ?? 0) === 0 && <li className="text-sm text-muted-foreground">No notes yet.</li>}
          </ul>
          {(isHR || g.submitted_by === me?.user.id) && (
            <div className="space-y-2 border-t pt-3">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
              <div className="flex items-center justify-between">
                {isHR ? (
                  <Select value={vis} onValueChange={(v) => setVis(v as never)}>
                    <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hr_only">HR only</SelectItem>
                      <SelectItem value="shared_with_submitter">Shared with submitter</SelectItem>
                    </SelectContent>
                  </Select>
                ) : <span className="text-xs text-muted-foreground">Submitter notes are visible to HR.</span>}
                <Button size="sm" disabled={!note || postNote.isPending} onClick={() => postNote.mutate()}>Add note</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}