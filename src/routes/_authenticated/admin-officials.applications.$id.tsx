import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, FileText, Star, UserPlus } from "lucide-react";
import {
  getBoardApplicationDetail, scoreBoardApplication, decideBoardApplication,
  getCoverLetterUrl, listVacantSeats, appointApplicantToSeat,
} from "@/lib/board-applications.functions";

export const Route = createFileRoute("/_authenticated/admin-officials/applications/$id")({
  component: ApplicationDetailPage,
  errorComponent: ({ error, reset }) => (
    <AppShell>
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <h1 className="text-xl font-serif">Application unavailable</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => reset()}>Retry</Button>
          <Link to="/admin-officials"><Button size="sm">Back to officials</Button></Link>
        </div>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <h1 className="text-xl font-serif">Application not found</h1>
        <Link to="/admin-officials"><Button size="sm">Back</Button></Link>
      </div>
    </AppShell>
  ),
});

function ApplicationDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const getFn = useServerFn(getBoardApplicationDetail);
  const scoreFn = useServerFn(scoreBoardApplication);
  const decideFn = useServerFn(decideBoardApplication);
  const coverFn = useServerFn(getCoverLetterUrl);

  const q = useQuery({
    queryKey: ["board-app", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const app = q.data?.application as any;
  const scores = (q.data?.scores ?? []) as any[];
  const audit = (q.data?.audit ?? []) as any[];

  const [scoreDrafts, setScoreDrafts] = useState<Record<string, { score: number; comments: string }>>({});

  const saveScore = useMutation({
    mutationFn: (v: { body_id: string; score: number; comments: string }) =>
      scoreFn({ data: { submission_id: id, body_id: v.body_id, score: v.score, comments: v.comments || null } }),
    onSuccess: () => { toast.success("Score saved"); qc.invalidateQueries({ queryKey: ["board-app", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => decideFn({ data: { id, status: status as any } }),
    onSuccess: (_r, status) => {
      toast.success(`Marked ${status}`);
      qc.invalidateQueries({ queryKey: ["board-app", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return <AppShell><div className="p-6"><p className="text-sm text-muted-foreground">Loading…</p></div></AppShell>;
  }
  if (!app) {
    return <AppShell><div className="p-6"><p className="text-sm text-muted-foreground">Not found.</p></div></AppShell>;
  }

  const interests = (app.board_application_interests ?? []) as any[];
  const primary = interests.find((i) => i.is_primary);

  // Aggregate scores per body
  const scoresByBody: Record<string, any[]> = {};
  for (const s of scores) {
    scoresByBody[s.body_id] = scoresByBody[s.body_id] ?? [];
    scoresByBody[s.body_id].push(s);
  }

  return (
    <AppShell>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <Link to="/admin-officials" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Back to officials
          </Link>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-serif tracking-tight">{app.first_name} {app.last_name}</h1>
            <p className="text-sm text-muted-foreground">{app.email} {app.phone && `· ${app.phone}`}</p>
            <p className="text-xs text-muted-foreground mt-1">Submitted {new Date(app.created_at).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">{app.status.replace("_", " ")}</Badge>
            {primary?.body_id && (
              <AppointDialog
                submissionId={id}
                bodyId={primary.body_id}
                bodyName={primary.official_bodies?.name}
                onDone={() => nav({ to: "/admin-officials" })}
              />
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4 md:col-span-2 space-y-4">
            <section>
              <h2 className="text-sm font-semibold mb-1">Interests</h2>
              <ul className="text-sm space-y-1">
                {interests.map((i) => (
                  <li key={i.id} className="flex items-center gap-2">
                    {i.is_primary && <Badge className="text-[10px]">Primary</Badge>}
                    <span>{i.official_bodies?.name}</span>
                  </li>
                ))}
                {interests.length === 0 && <li className="text-muted-foreground text-xs">No bodies selected.</li>}
              </ul>
            </section>

            {(app.occupation || app.employer) && (
              <section>
                <h2 className="text-sm font-semibold mb-1">Occupation</h2>
                <p className="text-sm">{[app.occupation, app.employer].filter(Boolean).join(" · ")}</p>
              </section>
            )}

            {app.qualifications && (
              <section>
                <h2 className="text-sm font-semibold mb-1">Qualifications</h2>
                <p className="text-sm whitespace-pre-wrap">{app.qualifications}</p>
              </section>
            )}

            {app.statement && (
              <section>
                <h2 className="text-sm font-semibold mb-1">Statement of interest</h2>
                <p className="text-sm whitespace-pre-wrap border-l-2 border-primary/40 pl-3">{app.statement}</p>
              </section>
            )}

            {app.conflicts_disclosure && (
              <section>
                <h2 className="text-sm font-semibold mb-1">Conflicts disclosure</h2>
                <p className="text-sm whitespace-pre-wrap">{app.conflicts_disclosure}</p>
              </section>
            )}

            {app.cover_letter_path && (
              <section>
                <Button size="sm" variant="outline" onClick={async () => {
                  const { url } = await coverFn({ data: { path: app.cover_letter_path } });
                  window.open(url, "_blank");
                }}><FileText className="h-4 w-4 mr-1" /> Open cover letter</Button>
              </section>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Status</h2>
            <div className="flex flex-col gap-1.5">
              {["under_review","shortlisted","approved","declined","withdrawn"].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === app.status ? "default" : "outline"}
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate(s)}
                >
                  {s.replace("_", " ")}
                </Button>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Scoring (per board of interest)</h2>
          </div>
          <p className="text-xs text-muted-foreground">Each council or board member scores 1–5. Your own score is editable; averages roll up automatically.</p>
          {interests.map((i) => {
            const bodyScores = scoresByBody[i.body_id] ?? [];
            const avg = bodyScores.length
              ? (bodyScores.reduce((a, s) => a + s.score, 0) / bodyScores.length).toFixed(2)
              : "—";
            const draft = scoreDrafts[i.body_id] ?? { score: 3, comments: "" };
            return (
              <div key={i.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{i.official_bodies?.name}{i.is_primary && <span className="text-xs text-muted-foreground"> · primary</span>}</div>
                  <div className="text-xs text-muted-foreground">Avg: <span className="font-medium text-foreground">{avg}</span> ({bodyScores.length} score{bodyScores.length === 1 ? "" : "s"})</div>
                </div>
                <div className="grid grid-cols-[100px_1fr_auto] gap-2 items-end">
                  <div>
                    <Label className="text-xs">Score</Label>
                    <Select
                      value={String(draft.score)}
                      onValueChange={(v) => setScoreDrafts((d) => ({ ...d, [i.body_id]: { ...draft, score: Number(v) } }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Comments (optional)</Label>
                    <Input
                      value={draft.comments}
                      onChange={(e) => setScoreDrafts((d) => ({ ...d, [i.body_id]: { ...draft, comments: e.target.value } }))}
                    />
                  </div>
                  <Button size="sm" onClick={() => saveScore.mutate({ body_id: i.body_id, score: draft.score, comments: draft.comments })}>
                    Save my score
                  </Button>
                </div>
                {bodyScores.length > 0 && (
                  <ul className="text-xs text-muted-foreground pt-1 space-y-0.5 border-t">
                    {bodyScores.map((s) => (
                      <li key={s.id} className="pt-1">
                        <span className="font-medium text-foreground">{s.score}/5</span>
                        {s.comments && <span> — {s.comments}</span>}
                        <span className="ml-2 text-[10px]">{new Date(s.updated_at ?? s.created_at).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </Card>

        {audit.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-2">Audit trail</h2>
            <ul className="text-xs text-muted-foreground space-y-1">
              {audit.map((a) => (
                <li key={a.id}>
                  <span className="font-mono text-foreground">{a.action}</span>
                  <span className="ml-2">{new Date(a.created_at).toLocaleString()}</span>
                  {a.details && <pre className="mt-0.5 inline text-[10px]">{JSON.stringify(a.details)}</pre>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function AppointDialog({ submissionId, bodyId, bodyName, onDone }: {
  submissionId: string; bodyId: string; bodyName?: string; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [seatId, setSeatId] = useState<string>("");
  const [start, setStart] = useState<string>(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const listSeatsFn = useServerFn(listVacantSeats);
  const appointFn = useServerFn(appointApplicantToSeat);

  const seatsQ = useQuery({
    queryKey: ["vacant-seats", bodyId],
    queryFn: () => listSeatsFn({ data: { body_id: bodyId } }),
    enabled: open,
  });
  const seats = (seatsQ.data ?? []) as any[];

  const m = useMutation({
    mutationFn: () => appointFn({ data: {
      submission_id: submissionId,
      seat_id: seatId,
      start_date: start,
      end_date: end || null,
      appointment_type: "appointed",
      notes: notes || null,
    } }),
    onSuccess: () => { toast.success("Appointed to seat"); setOpen(false); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Appoint to seat</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Appoint to {bodyName ?? "board"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Vacant seat</Label>
            {seatsQ.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading seats…</p>
            ) : seats.length === 0 ? (
              <p className="text-xs text-muted-foreground">No vacant seats on this body. End an existing term first.</p>
            ) : (
              <Select value={seatId} onValueChange={setSeatId}>
                <SelectTrigger><SelectValue placeholder="Choose a seat…" /></SelectTrigger>
                <SelectContent>
                  {seats.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.seat_label}{s.is_chair ? " (chair)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>End date (optional)</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <p className="text-xs text-muted-foreground">
            This creates the official record, seats them (status = pending until oath), marks the application approved, and logs it to the audit trail.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!seatId || !start || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Appointing…" : "Confirm appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}