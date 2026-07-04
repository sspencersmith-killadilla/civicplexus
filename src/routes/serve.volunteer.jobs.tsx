import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import { listPublicVolunteerJobs } from "@/lib/volunteer-jobs.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin } from "lucide-react";
import { VolunteerPublicHeader } from "@/components/volunteer-public-header";

export const Route = createFileRoute("/serve/volunteer/jobs")({
  head: () => ({
    meta: [
      { title: "Volunteer opportunities" },
      { name: "description", content: "Browse open volunteer roles and shifts and sign up to serve." },
    ],
  }),
  loader: () => listPublicVolunteerJobs(),
  component: VolunteerJobsList,
  errorComponent: () => <p className="p-6">Unable to load jobs.</p>,
  notFoundComponent: () => <p className="p-6">Not found.</p>,
});

type Shift = { id: string; starts_at: string; ends_at: string; location: string | null; capacity: number; taken: number };
type Job = { id: string; title: string; slug: string; description: string | null; location: string | null; skills_required: string[] | null; shifts: Shift[] };

function VolunteerJobsList() {
  const jobs = useLoaderData({ from: "/serve/volunteer/jobs" }) as Job[];
  return (
    <div className="min-h-screen bg-background">
      <VolunteerPublicHeader
        title="Volunteer opportunities"
        subtitle="Browse open shifts. Sign in or create a volunteer account to register."
      />
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-4">
        {jobs.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">No open volunteer roles right now. Check back soon.</Card>
          ) : jobs.map((j: Job) => (
          <Card key={j.id} className="p-6">
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
                {j.skills_required.map((s: string) => <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{s}</span>)}
              </div>
            )}
            <div className="mt-4 space-y-2">
              {j.shifts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No upcoming shifts scheduled.</p>
              ) : j.shifts.map((s: Shift) => {
                const full = s.taken >= s.capacity;
                return (
                  <div key={s.id} className="flex items-center justify-between border rounded-md p-3">
                    <div className="text-sm">
                      <div className="flex items-center gap-1 font-medium"><Clock className="h-3 w-3" /> {new Date(s.starts_at).toLocaleString()} – {new Date(s.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="text-xs text-muted-foreground">{s.location ?? j.location ?? "—"} · {s.taken}/{s.capacity} filled</div>
                    </div>
                    <Button asChild size="sm" disabled={full}>
                      <Link to="/serve/volunteer/jobs/$slug" params={{ slug: j.slug }} search={{ shift: s.id }}>{full ? "Full" : "Sign up"}</Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </main>
    </div>
  );
}