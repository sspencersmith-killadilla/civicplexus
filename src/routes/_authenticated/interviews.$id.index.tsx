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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/interviews/$id/")({ component: InterviewDetail });

function InterviewDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const submit = useServerFn(submitInterviewFeedback);

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
          <h3 className="font-medium">Your scorecard</h3>
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
          <div className="flex justify-end"><Button onClick={()=>save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Submit scorecard"}</Button></div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-medium mb-3">All feedback</h3>
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