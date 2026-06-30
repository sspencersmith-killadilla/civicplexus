import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play } from "lucide-react";
import { getResponseSignedUrl } from "@/lib/interview-invitations.functions";
import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/interviews/async/$id")({ component: AsyncReview });

type Invitation = {
  id: string;
  status: string;
  expires_at: string;
  submitted_at: string | null;
  created_at: string;
  accommodation_request: unknown;
  accommodation_approved_at: string | null;
  kit: { name: string; questions: Array<{ id: string; prompt: string; think_seconds?: number; record_seconds?: number }> | null } | null;
  job_applications: { applicant_name: string; email: string | null; requisition_id: string | null } | null;
};

type Response = {
  id: string;
  question_id: string;
  take_number: number;
  is_final: boolean;
  duration_seconds: number | null;
  transcript: string | null;
  created_at: string;
};

function AsyncReview() {
  const { id } = Route.useParams();
  const [url, setUrl] = useState<string | null>(null);
  const sign = useServerFn(getResponseSignedUrl);

  const invQ = useQuery({
    queryKey: ["interview_invitation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_invitations" as never)
        .select("id, status, expires_at, submitted_at, created_at, accommodation_request, accommodation_approved_at, kit:kit_id(name, questions), job_applications:application_id(applicant_name, email, requisition_id)")
        .eq("id", id).single();
      if (error) throw error;
      return data as unknown as Invitation;
    },
  });

  const respQ = useQuery({
    queryKey: ["interview_responses", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_responses" as never)
        .select("id, question_id, take_number, is_final, duration_seconds, transcript, created_at")
        .eq("invitation_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Response[];
    },
  });

  const playMut = useMutation({
    mutationFn: (response_id: string) => sign({ data: { response_id } }),
    onSuccess: (r) => setUrl(r.url),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const inv = invQ.data;
  const questions = inv?.kit?.questions ?? [];
  const finals = (respQ.data ?? []).filter((r) => r.is_final);

  return (
    <AppShell title="Async interview review">
      <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/interviews"><ArrowLeft className="h-3 w-3 mr-1" />Back to interviews</Link></Button>
      {!inv ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-semibold">{inv.job_applications?.applicant_name ?? "Candidate"}</h2>
                <p className="text-xs text-muted-foreground">{inv.job_applications?.email}</p>
                <p className="text-xs text-muted-foreground mt-1">Kit: {inv.kit?.name ?? "—"} · Sent {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}</p>
              </div>
              <Badge variant={inv.submitted_at ? "default" : "outline"} className="capitalize">
                {inv.submitted_at ? `submitted ${formatDistanceToNow(new Date(inv.submitted_at), { addSuffix: true })}` : inv.status}
              </Badge>
            </div>
          </Card>

          {questions.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">Kit has no questions defined.</Card>
          ) : questions.map((q, idx) => {
            const final = finals.find((r) => r.question_id === q.id);
            return (
              <Card key={q.id} className="p-4">
                <h3 className="font-medium mb-1">Q{idx + 1}. {q.prompt}</h3>
                {final ? (
                  <div className="mt-2 space-y-2">
                    <div className="text-xs text-muted-foreground">Take {final.take_number} · {final.duration_seconds ?? 0}s</div>
                    <Button size="sm" variant="outline" onClick={() => playMut.mutate(final.id)} disabled={playMut.isPending}>
                      <Play className="h-3 w-3 mr-1" />Play recording
                    </Button>
                    {final.transcript && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-xs text-muted-foreground">Transcript</summary>
                        <p className="mt-2 whitespace-pre-wrap">{final.transcript}</p>
                      </details>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">No submitted recording for this question.</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {url && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setUrl(null)}>
          <div className="bg-background rounded-lg p-3 max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <video src={url} controls autoPlay className="w-full rounded" />
            <div className="flex justify-end mt-2"><Button size="sm" variant="outline" onClick={() => setUrl(null)}>Close</Button></div>
          </div>
        </div>
      )}
    </AppShell>
  );
}