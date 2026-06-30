import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Briefcase, CalendarClock, Mail, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/candidate/$token")({ component: CandidatePortal });

type Status = {
  application: { id: string; applicant_name: string; email: string; status: string; created_at: string };
  requisition: { title: string; department: string | null; location: string | null; employment_type: string | null };
  interviews: Array<{ id: string; scheduled_at: string; duration_minutes: number; stage: string; location: string | null }>;
  offers: Array<{ id: string; status: string; salary: number | null; start_date: string | null; expires_at: string | null; sent_at: string | null }>;
  messages: Array<{ id: string; sender: string; body: string; created_at: string }>;
  expires_at: string;
};

function CandidatePortal() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const q = useQuery({
    queryKey: ["candidate-portal", token],
    queryFn: async (): Promise<Status> => {
      const res = await fetch(`/api/public/candidate/${token}/status`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const sendMsg = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/candidate/${token}/message`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) throw new Error("Failed to send");
    },
    onSuccess: () => { setDraft(""); qc.invalidateQueries({ queryKey: ["candidate-portal", token] }); toast.success("Sent"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (q.isError || !q.data) return (
    <div className="min-h-screen grid place-items-center px-6">
      <Card className="p-10 max-w-md text-center">
        <h1 className="font-serif text-2xl">Link expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">This portal link is no longer valid. Please contact the recruiter to request a new one.</p>
      </Card>
    </div>
  );

  const s = q.data;
  const stageOrder = ["new","screening","interview","offer","hired","rejected","withdrawn"];
  const idx = stageOrder.indexOf(s.application.status);

  return (
    <div className="min-h-screen bg-background py-10">
      <div className="max-w-3xl mx-auto px-6 space-y-6">
        <header>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Candidate Portal</p>
          <h1 className="font-serif text-3xl mt-1">{s.requisition.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <Briefcase className="h-3 w-3 inline mr-1" />
            {s.requisition.department ?? "—"} {s.requisition.location && `· ${s.requisition.location}`} {s.requisition.employment_type && `· ${s.requisition.employment_type}`}
          </p>
        </header>

        <Card className="p-6">
          <h2 className="font-medium mb-3">Where you are</h2>
          <ol className="flex flex-wrap gap-2 text-xs">
            {stageOrder.slice(0, 5).map((stage, i) => (
              <li key={stage} className={`px-3 py-1.5 rounded-full border ${i <= idx ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"}`}>
                {stage}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground mt-3">Submitted {new Date(s.application.created_at).toLocaleDateString()} · current status: <strong>{s.application.status}</strong></p>
        </Card>

        {s.interviews.length > 0 && (
          <Card className="p-6">
            <h2 className="font-medium mb-3"><CalendarClock className="h-4 w-4 inline mr-1" /> Upcoming interviews</h2>
            <ul className="space-y-2">
              {s.interviews.map((iv) => (
                <li key={iv.id} className="text-sm border rounded p-3">
                  <div className="font-medium">{new Date(iv.scheduled_at).toLocaleString()}</div>
                  <div className="text-muted-foreground text-xs mt-1">{iv.stage} · {iv.duration_minutes} min {iv.location && `· ${iv.location}`}</div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {s.offers.length > 0 && (
          <Card className="p-6">
            <h2 className="font-medium mb-3">Offers</h2>
            <ul className="space-y-2">
              {s.offers.map((o) => (
                <li key={o.id} className="text-sm border rounded p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium capitalize">{o.status}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.start_date && `Start ${o.start_date}`} {o.salary != null && `· $${Number(o.salary).toLocaleString()}`}
                    </div>
                  </div>
                  {o.status === "sent" && <span className="text-xs text-muted-foreground">Check your email for the offer link</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-6">
          <h2 className="font-medium mb-3"><Mail className="h-4 w-4 inline mr-1" /> Messages</h2>
          {s.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <ul className="space-y-3 mb-4 max-h-96 overflow-auto">
              {s.messages.map((m) => (
                <li key={m.id} className={`text-sm rounded p-3 ${m.sender === "candidate" ? "bg-primary/10 ml-12" : "bg-secondary mr-12"}`}>
                  <div className="text-xs text-muted-foreground mb-1">{m.sender === "candidate" ? "You" : "Recruiter"} · {new Date(m.created_at).toLocaleString()}</div>
                  <div className="whitespace-pre-wrap">{m.body}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Textarea rows={2} placeholder="Write a message…" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <Button onClick={() => sendMsg.mutate()} disabled={!draft.trim() || sendMsg.isPending}><Send className="h-4 w-4" /></Button>
          </div>
        </Card>

        <p className="text-xs text-muted-foreground text-center">This link expires {new Date(s.expires_at).toLocaleDateString()}.</p>
      </div>
    </div>
  );
}