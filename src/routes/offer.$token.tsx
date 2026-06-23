import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/offer/$token")({ component: OfferView });

type OfferResponse = {
  offer: {
    id: string; status: string; salary: number | null; pay_grade: string | null;
    start_date: string | null; expires_at: string | null; letter_html: string;
    job_applications: { applicant_name: string; email: string; job_requisitions: { title: string } | null } | null;
  };
};

function OfferView() {
  const { token } = Route.useParams();
  const [signed, setSigned] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  const q = useQuery({
    queryKey: ["offer-view", token],
    queryFn: async (): Promise<OfferResponse> => {
      const res = await fetch(`/api/public/offers/${token}/view`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return res.json();
    },
  });

  const respond = useMutation({
    mutationFn: async (vars: { decision: "accept" | "decline" }) => {
      const body = vars.decision === "accept"
        ? { decision: "accept", signature_name: signed }
        : { decision: "decline", decline_reason: declineReason };
      const res = await fetch(`/api/public/offers/${token}/respond`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return vars.decision;
    },
    onSuccess: (d) => { setDone(d === "accept" ? "accepted" : "declined"); toast.success(d === "accept" ? "Offer accepted!" : "Response recorded"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (q.isError || !q.data) return (
    <div className="min-h-screen grid place-items-center px-6">
      <Card className="p-10 max-w-md text-center">
        <h1 className="font-serif text-2xl">Offer unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">This offer link is no longer valid. Please contact HR for assistance.</p>
      </Card>
    </div>
  );

  const o = q.data.offer;

  if (done) return (
    <div className="min-h-screen grid place-items-center px-6">
      <Card className="p-10 max-w-md text-center">
        {done === "accepted" ? <CheckCircle2 className="h-12 w-12 mx-auto text-primary" /> : <XCircle className="h-12 w-12 mx-auto text-muted-foreground" />}
        <h1 className="font-serif text-2xl mt-3">{done === "accepted" ? "Welcome aboard!" : "Response recorded"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {done === "accepted"
            ? "Your acceptance has been recorded. HR will be in touch with onboarding next steps."
            : "Thank you for letting us know. We wish you the best."}
        </p>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-background py-10">
      <div className="max-w-3xl mx-auto px-6 space-y-6">
        <header>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Offer of Employment</p>
          <h1 className="font-serif text-3xl mt-1">{o.job_applications?.job_requisitions?.title ?? "Position"}</h1>
          {o.expires_at && <p className="text-xs text-muted-foreground mt-2">Please respond by {new Date(o.expires_at).toLocaleDateString()}</p>}
        </header>

        <Card className="p-6 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(o.letter_html) }} />

        <Card className="p-6">
          <h2 className="font-medium mb-3">Accept this offer</h2>
          <p className="text-sm text-muted-foreground mb-3">Type your full legal name to e-sign. This has the same legal effect as a handwritten signature.</p>
          <div className="flex gap-2">
            <Input placeholder="Full legal name" value={signed} onChange={(e) => setSigned(e.target.value)} />
            <Button disabled={signed.trim().length < 2 || respond.isPending} onClick={() => respond.mutate({ decision: "accept" })}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Sign & accept
            </Button>
          </div>
        </Card>

        <Card className="p-6 border-destructive/30">
          <h2 className="font-medium mb-3">Decline</h2>
          <Label className="text-xs">Optional reason</Label>
          <Textarea rows={2} className="my-2" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Help us understand (optional)" />
          <Button variant="outline" disabled={respond.isPending} onClick={() => respond.mutate({ decision: "decline" })}>
            <XCircle className="h-4 w-4 mr-1" /> Decline offer
          </Button>
        </Card>
      </div>
    </div>
  );
}