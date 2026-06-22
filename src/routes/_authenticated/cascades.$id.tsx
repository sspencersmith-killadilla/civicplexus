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
import { ArrowLeft, Sparkles, Send } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { useServerFn } from "@tanstack/react-start";
import { summarizeCascade } from "@/lib/coaching-ai.functions";

export const Route = createFileRoute("/_authenticated/cascades/$id")({
  component: CascadeDetail,
});

function CascadeDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isHR = hasRole(me?.roles, "hr_admin");
  const summarize = useServerFn(summarizeCascade);

  const cQ = useQuery({
    queryKey: ["cascade", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cascades").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const rQ = useQuery({
    queryKey: ["cascade_responses", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cascade_responses")
        .select("*")
        .eq("cascade_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isHR,
  });

  const [name, setName] = useState(me?.profile?.full_name ?? "");
  const [dept, setDept] = useState("");
  const [feedback, setFeedback] = useState("");

  const respond = useMutation({
    mutationFn: async () => {
      if (!feedback.trim()) throw new Error("Feedback required");
      const { error } = await supabase.from("cascade_responses").insert({
        cascade_id: id,
        responder_id: me?.user.id,
        manager_name: name || me?.profile?.full_name || me?.user.email,
        department: dept || null,
        team_feedback: feedback.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setFeedback("");
      qc.invalidateQueries({ queryKey: ["cascade_responses", id] });
      toast.success("Response submitted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Submit failed"),
  });

  const doSummary = useMutation({
    mutationFn: async () => summarize({ data: { cascade_id: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cascade", id] }); toast.success("AI rollup generated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Summary failed"),
  });

  const c = cQ.data;

  return (
    <AppShell title={c?.title ?? "Cascade"}>
      <Link to="/cascades" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3 w-3 mr-1" /> Back to cascades
      </Link>
      {!c ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-4">
              <h3 className="font-medium mb-2">{c.title}</h3>
              {c.deadline && <p className="text-xs text-muted-foreground mb-2">Response deadline: {c.deadline}</p>}
              <p className="text-sm whitespace-pre-wrap">{c.broadcast_message}</p>
            </Card>

            <Card className="p-4">
              <h3 className="font-medium mb-3">Your team's feedback</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Your name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Department</Label><Input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Public Works" /></div>
                </div>
                <div className="space-y-1.5"><Label>Feedback from your team</Label><Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={5} /></div>
                <Button disabled={respond.isPending} onClick={() => respond.mutate()}>
                  <Send className="h-3 w-3 mr-1" /> {respond.isPending ? "Submitting…" : "Submit response"}
                </Button>
              </div>
            </Card>

            {c.ai_summary && (
              <Card className="p-4 border-primary/20 bg-primary/5">
                <h3 className="font-medium mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI rollup</h3>
                <p className="text-xs text-muted-foreground mb-2">{c.ai_generated_at ? `Generated ${new Date(c.ai_generated_at).toLocaleString()}` : ""}</p>
                <pre className="text-sm whitespace-pre-wrap font-sans">{c.ai_summary}</pre>
              </Card>
            )}
          </div>

          {isHR && (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">Responses ({rQ.data?.length ?? 0})</h3>
                  <Button size="sm" variant="outline" disabled={doSummary.isPending || !rQ.data?.length} onClick={() => doSummary.mutate()}>
                    <Sparkles className="h-3 w-3 mr-1" /> {doSummary.isPending ? "…" : "AI rollup"}
                  </Button>
                </div>
                <div className="space-y-2 max-h-[60vh] overflow-auto">
                  {(rQ.data ?? []).map((r) => (
                    <div key={r.id} className="border rounded p-2 text-sm">
                      <p className="text-xs text-muted-foreground mb-1">{r.manager_name ?? "—"}{r.department ? ` · ${r.department}` : ""}</p>
                      <p className="whitespace-pre-wrap">{r.team_feedback}</p>
                    </div>
                  ))}
                  {(rQ.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No responses yet.</p>}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}