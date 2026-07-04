import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, LogIn, LogOut, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { getMyVolunteerProfile, listMySignups, volunteerClock, cancelSignup } from "@/lib/volunteer-portal.functions";

export const Route = createFileRoute("/_authenticated/volunteer/")({
  component: MyShifts,
});

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    declined: "bg-destructive/15 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };
  return <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

function MyShifts() {
  const qc = useQueryClient();
  const profileFn = useServerFn(getMyVolunteerProfile);
  const listFn = useServerFn(listMySignups);
  const clockFn = useServerFn(volunteerClock);
  const cancelFn = useServerFn(cancelSignup);

  const profile = useQuery({ queryKey: ["my-volunteer-profile"], queryFn: () => profileFn() });
  const signups = useQuery({ queryKey: ["my-signups"], queryFn: () => listFn(), enabled: !!profile.data });

  const clock = useMutation({
    mutationFn: (v: { signup_id: string; action: "in" | "out" }) => clockFn({ data: v }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["my-signups"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { signup_id: id } }),
    onSuccess: () => { toast.success("Sign-up cancelled"); qc.invalidateQueries({ queryKey: ["my-signups"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (profile.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!profile.data) {
    return (
      <Card className="p-8 text-center space-y-3">
        <h2 className="font-serif text-xl">Welcome!</h2>
        <p className="text-sm text-muted-foreground">Tell us a bit about yourself so a coordinator can approve you for shifts.</p>
        <Button asChild><Link to="/volunteer/profile">Set up my volunteer profile</Link></Button>
      </Card>
    );
  }

  const rows = signups.data ?? [];

  return (
    <div className="space-y-6">
      <Card className="p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm">
            <span className="font-medium">{profile.data.first_name} {profile.data.last_name}</span>{" "}
            <span className="text-muted-foreground">· volunteer profile</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Status: {statusBadge(profile.data.status)}</div>
        </div>
        <Button variant="outline" asChild size="sm"><Link to="/volunteer/jobs">Find a shift</Link></Button>
      </Card>

      <div>
        <h2 className="font-serif text-lg mb-3">My sign-ups</h2>
        {rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            You haven't registered for any shifts yet. <Link to="/volunteer/jobs" className="text-primary underline">Browse opportunities</Link>.
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((s) => {
              const shift = s.shift;
              const job = shift?.volunteer_jobs;
              const now = Date.now();
              const withinShift = shift ? now >= new Date(shift.starts_at).getTime() - 30 * 60 * 1000 && now <= new Date(shift.ends_at).getTime() + 60 * 60 * 1000 : false;
              return (
                <Card key={s.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{job?.title ?? "—"}</span>
                      {statusBadge(s.status)}
                    </div>
                    {shift && (
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(shift.starts_at).toLocaleString()} – {new Date(shift.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {(shift.location ?? job?.location) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {shift.location ?? job?.location}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.status === "approved" && (
                      s.open_event ? (
                        <Button size="sm" variant="secondary" disabled={clock.isPending} onClick={() => clock.mutate({ signup_id: s.id, action: "out" })}>
                          <LogOut className="h-3 w-3 mr-1" /> Clock out
                        </Button>
                      ) : (
                        <Button size="sm" disabled={clock.isPending || !withinShift} onClick={() => clock.mutate({ signup_id: s.id, action: "in" })}>
                          <LogIn className="h-3 w-3 mr-1" /> Clock in
                        </Button>
                      )
                    )}
                    {s.status === "pending" && (
                      <Button size="sm" variant="ghost" onClick={() => cancel.mutate(s.id)} disabled={cancel.isPending}>
                        <X className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}