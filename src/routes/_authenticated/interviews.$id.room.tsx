import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Video, ShieldCheck, AlertTriangle } from "lucide-react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { joinLiveInterviewRoom, getLiveKitStatus } from "@/lib/interview-livekit.functions";
import { LiveKitSetupBanner } from "@/components/livekit-setup-banner";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/interviews/$id/room")({ component: InterviewRoom });

function InterviewRoom() {
  const { id } = Route.useParams();
  const [consent, setConsent] = useState(false);
  const [conn, setConn] = useState<{ token: string; url: string; watermark: string } | null>(null);

  const statusQ = useQuery({
    queryKey: ["livekit-status"],
    queryFn: () => getLiveKitStatus(),
  });

  const join = useMutation({
    mutationFn: () => joinLiveInterviewRoom({ data: { interview_id: id, consented: true } }),
    onSuccess: (r) => setConn({ token: r.token, url: r.url, watermark: r.watermark }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (conn) {
    return (
      <div className="h-[calc(100vh-4rem)] relative">
        <div className="absolute top-2 right-2 z-10 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">{conn.watermark}</div>
        <LiveKitRoom token={conn.token} serverUrl={conn.url} connect data-lk-theme="default" style={{ height: "100%" }}>
          <VideoConference />
        </LiveKitRoom>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      {statusQ.data && !statusQ.data.configured && (
        <LiveKitSetupBanner isHrAdmin={statusQ.data.is_hr_admin} />
      )}
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2"><Video className="h-5 w-5" /><h1 className="text-xl font-semibold">Live panel interview</h1></div>
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Recording notice (two-party consent)</AlertTitle>
          <AlertDescription>This session may be recorded for evaluation and audit. Recordings are stored privately, accessible only to HR and the hiring panel, and automatically deleted after the kit's retention period (default 90 days). Every playback is logged.</AlertDescription>
        </Alert>
        <label className="flex items-start gap-2 text-sm"><Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} /><span>I consent to the recording and acknowledge the disclosures above.</span></label>
        {join.error && <div className="text-sm text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{(join.error as Error).message}</div>}
        <Button onClick={() => join.mutate()} disabled={!consent || join.isPending || statusQ.data?.configured === false}>{join.isPending ? "Joining…" : "Join interview"}</Button>
      </Card>
    </div>
  );
}