import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { submitInterviewFeedback } from "@/lib/jobs.functions";
import { generateInterviewQuestions, summarizeInterviewNotes, comparePanelFeedback } from "@/lib/interview-ai.functions";
import { decideSuggestion } from "@/lib/applicant-ai.functions";
import { Sparkles, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/interviews/$id")({ component: InterviewDetail });

function InterviewDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const submit = useServerFn(submitInterviewFeedback);
  const genQs = useServerFn(generateInterviewQuestions);
  const summarize = useServerFn(summarizeInterviewNotes);
  const compare = useServerFn(comparePanelFeedback);
  const decide = useServerFn(decideSuggestion);

  const ivQ = useQuery({
    queryKey: ["interview", id],
    queryFn: async () => {
      const { data } = await supabase.from("interviews" as never).select("*, job_applications:application_id(applicant_name, email)").eq("id", id).single();
      return data as unknown as { id: string; scheduled_at: string; stage: string; location: string | null; status: string; interviewer_ids: string[]; job_applications: { applicant_name: string; email: string } };
    },
  });

  const fbQ = useQuery({
    queryKey: ["interview_feedback", id],
    queryFn: async () => {
      const { data } = await supabase.from("interview_feedback" as never).select("*").eq("interview_id", id);
      return ((data ?? []) as Array<{ id: string; interviewer_id: string; rating: number; recommendation: string; notes: string | null }>);
    },
  });

  const [rating, setRating] = useState(3);
  const [rec, setRec] = useState<"strong_hire" | "hire" | "no_hire" | "strong_no_hire">("hire");
  const [notes, setNotes] = useState("");
  const [questions, setQuestions] = useState<Array<{ text: string; rubric_dimension: string; rationale: string }> | null>(null);
  const [questionsSuggestionId, setQuestionsSuggestionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<null | { rating_suggestion: number; recommendation_suggestion: typeof rec; strengths: string[]; concerns: string[]; evidence_quotes: string[]; open_questions: string[] }>(null);
  const [draftSuggestionId, setDraftSuggestionId] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | { consensus: string[]; divergences: Array<{ topic: string; positions: string[] }>; unresolved_questions: string[]; notes: string }>(null);

  const doGen = useMutation({
    mutationFn: () => genQs({ data: { interview_id: id } }),
    onSuccess: (r) => { setQuestions(r.questions); setQuestionsSuggestionId(r.suggestion_id); toast.success("Question bank generated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const doSummarize = useMutation({
    mutationFn: () => summarize({ data: { interview_id: id, notes } }),
    onSuccess: (r) => { setDraft(r.draft as never); setDraftSuggestionId(r.suggestion_id); toast.success("Draft scorecard generated — review before submitting"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const doCompare = useMutation({
    mutationFn: () => compare({ data: { interview_id: id } }),
    onSuccess: (r) => { setPanel(r.comparison as never); toast.success("Panel comparison ready"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const acceptDraft = () => {
    if (!draft) return;
    setRating(draft.rating_suggestion);
    setRec(draft.recommendation_suggestion);
    if (draftSuggestionId) decide({ data: { suggestion_id: draftSuggestionId, decision: "accepted" } });
    toast.success("Draft applied — edit and submit when ready");
  };

  const save = useMutation({
    mutationFn: () => submit({ data: { interview_id: id, rating, recommendation: rec, notes } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["interview_feedback", id] }); toast.success("Feedback saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (ivQ.isLoading || !ivQ.data) return <AppShell title="Interview"><p>Loading…</p></AppShell>;
  const iv = ivQ.data;
  const isInterviewer = iv.interviewer_ids?.includes(me?.user.id ?? "");

  return (
    <AppShell title={`Interview · ${iv.job_applications.applicant_name}`}>
      <Link to="/approvals" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3 w-3 mr-1" /> Back
      </Link>
      <Card className="p-4 mb-6">
        <p className="text-sm"><span className="text-muted-foreground">When:</span> {new Date(iv.scheduled_at).toLocaleString()}</p>
        <p className="text-sm"><span className="text-muted-foreground">Stage:</span> {iv.stage}</p>
        {iv.location && <p className="text-sm"><span className="text-muted-foreground">Location:</span> {iv.location}</p>}
        <p className="text-sm"><span className="text-muted-foreground">Status:</span> {iv.status}</p>
      </Card>

      {isInterviewer && (
        <Card className="p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-medium">Your scorecard</h3>
            <Button size="sm" variant="outline" onClick={() => doGen.mutate()} disabled={doGen.isPending}>
              <Sparkles className="h-3 w-3 mr-1" /> {doGen.isPending ? "Generating…" : "Generate question bank"}
            </Button>
          </div>
          {questions && (
            <div className="rounded border bg-muted/30 p-3 space-y-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> AI-assisted — review before using. Same question bank should be used for every candidate on this requisition.</p>
              <ol className="list-decimal pl-5 space-y-2 text-sm">
                {questions.map((q, i) => (
                  <li key={i}><span className="font-medium">{q.text}</span><div className="text-xs text-muted-foreground">Probes: {q.rubric_dimension} — {q.rationale}</div></li>
                ))}
              </ol>
              {questionsSuggestionId && (
                <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => { if (questionsSuggestionId) decide({ data: { suggestion_id: questionsSuggestionId, decision: "rejected", reason: "Manager discarded" } }); setQuestions(null); }}>Discard</Button></div>
              )}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Rating (1-5)</Label><Select value={String(rating)} onValueChange={(v)=>setRating(parseInt(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[1,2,3,4,5].map(n=><SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select></div>
            <div><Label>Recommendation</Label><Select value={rec} onValueChange={(v)=>setRec(v as typeof rec)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="strong_hire">Strong hire</SelectItem>
                <SelectItem value="hire">Hire</SelectItem>
                <SelectItem value="no_hire">No hire</SelectItem>
                <SelectItem value="strong_no_hire">Strong no hire</SelectItem>
              </SelectContent>
            </Select></div>
          </div>
          <div><Label>Notes</Label><Textarea rows={4} value={notes} onChange={(e)=>setNotes(e.target.value)} /></div>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={notes.trim().length < 20 || doSummarize.isPending} onClick={() => doSummarize.mutate()}>
              <Sparkles className="h-3 w-3 mr-1" /> {doSummarize.isPending ? "Drafting…" : "Draft scorecard from my notes"}
            </Button>
            <Button onClick={()=>save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Submit scorecard"}</Button>
          </div>
          {draft && (
            <div className="rounded border bg-muted/30 p-3 space-y-2 text-sm">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> AI-suggested draft — you are the decider. Accept to prefill rating/recommendation, then edit before submitting.</p>
              <p><span className="font-medium">Suggested:</span> {draft.recommendation_suggestion.replace("_", " ")} · {draft.rating_suggestion}/5</p>
              {!!draft.strengths.length && <div><span className="font-medium">Strengths:</span><ul className="list-disc pl-5">{draft.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
              {!!draft.concerns.length && <div><span className="font-medium">Concerns:</span><ul className="list-disc pl-5">{draft.concerns.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
              {!!draft.evidence_quotes.length && <div className="text-xs italic text-muted-foreground">Evidence: {draft.evidence_quotes.map((q, i) => <span key={i}>"{q}" </span>)}</div>}
              <div className="flex gap-2"><Button size="sm" onClick={acceptDraft}>Apply to form</Button><Button size="sm" variant="ghost" onClick={() => { if (draftSuggestionId) decide({ data: { suggestion_id: draftSuggestionId, decision: "rejected", reason: "Reviewer discarded" } }); setDraft(null); }}>Discard</Button></div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">All feedback</h3>
          {(fbQ.data?.length ?? 0) >= 2 && (
            <Button size="sm" variant="outline" onClick={() => doCompare.mutate()} disabled={doCompare.isPending}>
              <Sparkles className="h-3 w-3 mr-1" /> {doCompare.isPending ? "Comparing…" : "AI panel comparison"}
            </Button>
          )}
        </div>
        {panel && (
          <div className="rounded border bg-muted/30 p-3 mb-3 text-sm space-y-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> AI describes the panel's positions only — it does not recommend hire / no-hire.</p>
            {!!panel.consensus.length && <div><span className="font-medium">Consensus:</span><ul className="list-disc pl-5">{panel.consensus.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
            {!!panel.divergences.length && <div><span className="font-medium">Divergences:</span><ul className="list-disc pl-5">{panel.divergences.map((d,i)=><li key={i}><span className="font-medium">{d.topic}:</span> {d.positions.join(" / ")}</li>)}</ul></div>}
            {!!panel.unresolved_questions.length && <div><span className="font-medium">Unresolved:</span><ul className="list-disc pl-5">{panel.unresolved_questions.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
          </div>
        )}
        {(fbQ.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No feedback submitted yet.</p> :
          <ul className="space-y-3">
            {(fbQ.data ?? []).map((f) => (
              <li key={f.id} className="border-l-2 border-muted pl-3">
                <p className="text-sm font-medium">{f.recommendation.replace("_"," ")} · {f.rating}/5</p>
                {f.notes && <p className="text-sm whitespace-pre-wrap mt-1">{f.notes}</p>}
              </li>
            ))}
          </ul>}
      </Card>
    </AppShell>
  );
}