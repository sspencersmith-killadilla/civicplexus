import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { listPublicVolunteerJobs } from "@/lib/volunteer-jobs.functions";
import { getMyVolunteerProfile, listMySignups, registerForShift } from "@/lib/volunteer-portal.functions";

export const Route = createFileRoute("/_authenticated/volunteer/jobs")({
  component: BrowseJobs,
});

function BrowseJobs() {
  const qc = useQueryClient();
  const jobsFn = useServerFn(listPublicVolunteerJobs);
  const profileFn = useServerFn(getMyVolunteerProfile);
  const mySignupsFn = useServerFn(listMySignups);
  const registerFn = useServerFn(registerForShift);

  const jobs = useQuery({ queryKey: ["public-volunteer-jobs"], queryFn: () => jobsFn() });
  const profile = useQuery({ queryKey: ["my-volunteer-profile"], queryFn: () => profileFn() });
  const mine = useQuery({ queryKey: ["my-signups"], queryFn: () => mySignupsFn(), enabled: !!profile.data });

  const [openShift, setOpenShift] = useState<{ id: string; label: string } | null>(null);
  const [message, setMessage] = useState("");

  const register = useMutation({
    mutationFn: (v: { shift_id: string; message: string | null }) => registerFn({ data: v }),
    onSuccess: () => {
      toast.success("Sign-up submitted for coordinator approval");
      qc.invalidateQueries({ queryKey: ["my-signups"] });
      setOpenShift(null); setMessage("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (jobs.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (profile.data && profile.data.status !== "approved") {
    // Volunteer can still register (approval separate), but show hint.
  }

  if (!profile.data) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Set up your volunteer profile first so a coordinator knows who's applying.</p>
        <Button asChild><Link to="/volunteer/profile">Set up my volunteer profile</Link></Button>
      </Card>
    );
  }

  const signedShiftIds = new Set((mine.data ?? []).map((s) => s.shift?.id).filter(Boolean) as string[]);

  return (
    <div className="space-y-4">
      {(jobs.data ?? []).length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No open volunteer roles right now.</Card>
      )}
      {(jobs.data ?? []).map((j) => (
        <Card key={j.id} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{j.title}</h2>
              {j.location && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" /> {j.location}</p>}
            </div>
            <Badge variant="outline">{j.shifts.length} shift{j.shifts.length === 1 ? "" : "s"}</Badge>
          </div>
          {j.description && <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{j.description}</p>}
          {j.skills_required && j.skills_required.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {j.skills_required.map((s: string) => (
                <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{s}</span>
              ))}
            </div>
          )}
          <div className="mt-4 space-y-2">
            {j.shifts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No upcoming shifts scheduled.</p>
            ) : j.shifts.map((s) => {
              const full = s.taken >= s.capacity;
              const already = signedShiftIds.has(s.id);
              return (
                <div key={s.id} className="flex items-center justify-between border rounded-md p-3">
                  <div className="text-sm">
                    <div className="flex items-center gap-1 font-medium">
                      <Clock className="h-3 w-3" /> {new Date(s.starts_at).toLocaleString()} – {new Date(s.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="text-xs text-muted-foreground">{s.location ?? j.location ?? "—"} · {s.taken}/{s.capacity} filled</div>
                  </div>
                  <Button
                    size="sm"
                    disabled={full || already}
                    onClick={() => setOpenShift({ id: s.id, label: `${j.title} — ${new Date(s.starts_at).toLocaleString()}` })}
                  >
                    {already ? "Signed up" : full ? "Full" : "Register"}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <Dialog open={!!openShift} onOpenChange={(v) => !v && setOpenShift(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register for this shift</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{openShift?.label}</p>
          <p className="text-xs text-muted-foreground">A coordinator will review your request and approve or decline before your shift is confirmed.</p>
          <div className="space-y-2">
            <Label>Anything they should know? (optional)</Label>
            <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Availability, accessibility needs, questions…" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenShift(null)}>Cancel</Button>
            <Button
              disabled={register.isPending}
              onClick={() => openShift && register.mutate({ shift_id: openShift.id, message: message.trim() || null })}
            >
              {register.isPending ? "Submitting…" : "Request shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}