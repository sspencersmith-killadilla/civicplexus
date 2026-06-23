import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Sparkles, ListChecks, Lock, MessageSquare, Trash2, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useServerFn } from "@tanstack/react-start";
import { summarizeOneOnOne, extractOneOnOneActionItems } from "@/lib/coaching-ai.functions";

export const Route = createFileRoute("/_authenticated/one-on-ones/$id")({
  component: OneOnOneDetail,
});

type AgendaPrompt = string;

function AgendaItem({ prompt, initial, onSave, onExtract }: {
  prompt: string;
  initial: string;
  onSave: (content: string) => void;
  onExtract: () => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <div className="rounded border p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{prompt}</p>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onExtract}>
          <ListChecks className="h-3 w-3 mr-1" /> Extract actions
        </Button>
      </div>
      <Textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { if (val !== initial) onSave(val); }}
        rows={3}
        placeholder="Notes for this agenda item…"
      />
    </div>
  );
}

function OneOnOneDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const uid = me?.user.id;
  const summarize = useServerFn(summarizeOneOnOne);
  const extract = useServerFn(extractOneOnOneActionItems);

  const sessionQ = useQuery({
    queryKey: ["one_on_one", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("one_on_ones")
        .select("*, one_on_one_templates(title, agenda_prompts, manager_prompts, employee_prompts), employees(first_name,last_name,department,job_title)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const notesQ = useQuery({
    queryKey: ["one_on_one_notes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("one_on_one_notes")
        .select("*")
        .eq("session_id", id)
        .eq("visibility", "manager_private")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const agendaNotesQ = useQuery({
    queryKey: ["one_on_one_agenda_notes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("one_on_one_agenda_notes")
        .select("*")
        .eq("session_id", id)
        .order("agenda_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const actionsQ = useQuery({
    queryKey: ["one_on_one_actions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("one_on_one_action_items")
        .select("*")
        .eq("session_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const [noteContent, setNoteContent] = useState("");
  const isManager = sessionQ.data?.manager_user_id === uid;

  const addNote = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("Not signed in");
      if (!noteContent.trim()) throw new Error("Note is empty");
      const { error } = await supabase.from("one_on_one_notes").insert({
        session_id: id,
        author_id: uid,
        visibility: "manager_private",
        content: noteContent.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteContent("");
      qc.invalidateQueries({ queryKey: ["one_on_one_notes", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const saveAgendaNote = useMutation({
    mutationFn: async ({ idx, prompt, content }: { idx: number; prompt: string; content: string }) => {
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase.from("one_on_one_agenda_notes").upsert({
        session_id: id, agenda_index: idx, agenda_prompt: prompt,
        content, author_id: uid,
      }, { onConflict: "session_id,agenda_index" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["one_on_one_agenda_notes", id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const delNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from("one_on_one_notes").delete().eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["one_on_one_notes", id] }),
  });

  const [actionText, setActionText] = useState("");
  const [actionDue, setActionDue] = useState("");
  const addAction = useMutation({
    mutationFn: async () => {
      if (!actionText.trim()) throw new Error("Action text required");
      const { error } = await supabase.from("one_on_one_action_items").insert({
        session_id: id,
        text: actionText.trim(),
        due_date: actionDue || null,
        created_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setActionText(""); setActionDue("");
      qc.invalidateQueries({ queryKey: ["one_on_one_actions", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const toggleAction = useMutation({
    mutationFn: async ({ aid, done }: { aid: string; done: boolean }) => {
      const { error } = await supabase
        .from("one_on_one_action_items")
        .update({ status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null })
        .eq("id", aid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["one_on_one_actions", id] }),
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("one_on_ones").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["one_on_one", id] }),
  });

  const doSummarize = useMutation({
    mutationFn: async () => summarize({ data: { session_id: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["one_on_one", id] }); toast.success("AI summary generated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Summarize failed"),
  });

  const doExtract = useMutation({
    mutationFn: async (idx?: number) => extract({ data: { session_id: id, agenda_index: idx } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["one_on_one_actions", id] });
      toast.success(`Extracted ${r.inserted} action item(s)`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Extract failed"),
  });

  const s = sessionQ.data;
  const tpl = s?.one_on_one_templates as {
    agenda_prompts?: AgendaPrompt[];
    manager_prompts?: AgendaPrompt[];
    employee_prompts?: AgendaPrompt[];
  } | null;
  const rolePrompts = isManager ? tpl?.manager_prompts : tpl?.employee_prompts;
  const agenda = (rolePrompts && rolePrompts.length > 0)
    ? rolePrompts
    : (tpl?.agenda_prompts ?? []);

  return (
    <AppShell title={s?.title ?? "1-on-1"}>
      <Link to="/one-on-ones" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3 w-3 mr-1" /> Back to 1-on-1s
      </Link>

      {sessionQ.isLoading || !s ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                <div>
                  <h3 className="font-medium">
                    {s.employees ? `${s.employees.first_name} ${s.employees.last_name}` : "Unassigned"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {s.employees?.job_title ?? ""}{s.employees?.department ? ` · ${s.employees.department}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Join code: <code className="bg-muted px-1.5 py-0.5 rounded">{s.short_code}</code></p>
                </div>
                <Select value={s.status} onValueChange={(v) => setStatus.mutate(v)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {agenda.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">Agenda &amp; notes</h3>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={doSummarize.isPending} onClick={() => doSummarize.mutate()}>
                      <Sparkles className="h-3 w-3 mr-1" /> {doSummarize.isPending ? "Summarizing…" : "AI summary"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={doExtract.isPending} onClick={() => doExtract.mutate(undefined)}>
                      <ListChecks className="h-3 w-3 mr-1" /> {doExtract.isPending ? "Extracting…" : "Extract all actions"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-4">
                  {agenda.map((prompt, idx) => {
                    const existing = (agendaNotesQ.data ?? []).find((n) => n.agenda_index === idx);
                    return (
                      <AgendaItem
                        key={idx}
                        prompt={prompt}
                        initial={existing?.content ?? ""}
                        onSave={(content) => saveAgendaNote.mutate({ idx, prompt, content })}
                        onExtract={() => doExtract.mutate(idx)}
                      />
                    );
                  })}
                </div>
              </Card>
            )}

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium flex items-center gap-2"><Lock className="h-4 w-4 text-amber-600" /> Private notes</h3>
                <span className="text-xs text-muted-foreground">Manager only</span>
              </div>

              <div className="space-y-3 mb-4">
                {(notesQ.data ?? []).map((n) => (
                  <div key={n.id} className={`p-3 rounded border ${n.visibility === "manager_private" ? "bg-amber-500/5 border-amber-500/20" : "bg-card"}`}>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span className="flex items-center gap-1">
                        {n.visibility === "manager_private" && <Lock className="h-3 w-3" />}
                        {n.visibility === "manager_private" ? "Manager-private" : "Shared"} · {new Date(n.created_at).toLocaleString()}
                      </span>
                      {n.author_id === uid && (
                        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => delNote.mutate(n.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                  </div>
                ))}
                {(notesQ.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No private notes yet. Only you can see these.</p>}
              </div>

              {isManager && (
                <div className="space-y-2 border-t pt-3">
                  <Textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="Private thoughts, follow-ups, observations…" rows={3} />
                  <div className="flex justify-end">
                    <Button disabled={addNote.isPending} onClick={() => addNote.mutate()}>{addNote.isPending ? "Saving…" : "Save private note"}</Button>
                  </div>
                </div>
              )}
            </Card>

            {s.ai_summary && (
              <Card className="p-4 border-primary/20 bg-primary/5">
                <h3 className="font-medium mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI summary</h3>
                <p className="text-xs text-muted-foreground mb-2">Generated {s.ai_generated_at ? new Date(s.ai_generated_at).toLocaleString() : ""}</p>
                <pre className="text-sm whitespace-pre-wrap font-sans">{s.ai_summary}</pre>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="p-4">
              <h3 className="font-medium mb-3 flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /> Action items</h3>
              <div className="space-y-2 mb-3">
                {(actionsQ.data ?? []).map((a) => {
                  const done = a.status === "done";
                  return (
                    <button
                      key={a.id}
                      className="w-full text-left flex items-start gap-2 p-2 rounded hover:bg-muted"
                      onClick={() => toggleAction.mutate({ aid: a.id, done: !done })}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${done ? "line-through text-muted-foreground" : ""}`}>{a.text}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.assignee_label ? `${a.assignee_label} · ` : ""}{a.due_date ?? ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
                {(actionsQ.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No action items yet.</p>}
              </div>
              <div className="border-t pt-3 space-y-2">
                <Input value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder="New action…" />
                <div className="flex gap-2">
                  <Input type="date" value={actionDue} onChange={(e) => setActionDue(e.target.value)} />
                  <Button size="sm" disabled={addAction.isPending} onClick={() => addAction.mutate()}>Add</Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}