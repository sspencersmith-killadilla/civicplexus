import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listBodiesAcceptingApplications } from "@/lib/board-applications.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Landmark, ArrowRight } from "lucide-react";

const q = queryOptions({
  queryKey: ["public-serve-bodies"],
  queryFn: () => listBodiesAcceptingApplications(),
});

export const Route = createFileRoute("/serve/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  head: () => ({
    meta: [
      { title: "Serve on a board or commission" },
      { name: "description", content: "Apply to serve on a municipal board, commission, or advisory committee." },
    ],
  }),
  component: ServeIndex,
});

function ServeIndex() {
  const { data: bodies } = useSuspenseQuery(q);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-10 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif text-3xl tracking-tight">Serve on a board or commission</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Residents are encouraged to serve on municipal boards, commissions, and advisory
              committees. Select the boards you're interested in, share why you'd like to serve,
              and our clerk's office will review your application.
            </p>
          </div>
          <Link to="/serve/apply"><Button>Apply now <ArrowRight className="h-4 w-4 ml-1" /></Button></Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <section>
          <h2 className="text-sm font-medium mb-4">Currently accepting applications</h2>
          {bodies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No boards are currently accepting applications. Please check back soon.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {bodies.map((b) => (
                <Card key={b.id} className="p-5">
                  <div className="flex items-start gap-3">
                    <Landmark className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-medium">{b.name}</h3>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{b.kind}</p>
                      {b.description && <p className="text-sm mt-2 text-muted-foreground line-clamp-4">{b.description}</p>}
                      {b.meeting_cadence && <p className="text-xs mt-2 text-muted-foreground">Meets: {b.meeting_cadence}</p>}
                      {b.application_instructions && (
                        <p className="text-xs mt-2 border-l-2 pl-2 border-primary/40">{b.application_instructions}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
        <section className="pt-6 border-t grid gap-3 sm:grid-cols-3">
          <Link to="/serve/volunteer/jobs" className="block"><Card className="p-4 hover:bg-accent/50"><h3 className="font-medium">Volunteer</h3><p className="text-xs text-muted-foreground mt-1">Browse volunteer roles and shifts.</p></Card></Link>
          <Link to="/serve/vendor" className="block"><Card className="p-4 hover:bg-accent/50"><h3 className="font-medium">Vendor / contractor</h3><p className="text-xs text-muted-foreground mt-1">Register your business.</p></Card></Link>
          <Link to="/serve/candidate-filing" className="block"><Card className="p-4 hover:bg-accent/50"><h3 className="font-medium">Candidate filing</h3><p className="text-xs text-muted-foreground mt-1">Run for elected office.</p></Card></Link>
        </section>
        <section className="pt-6 border-t hidden">
          <h2 className="text-sm font-medium mb-2">Running for elected office?</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Candidates for council or mayor can file the required paperwork with the City Clerk.
          </p>
          <Link to="/serve/candidate-filing"><Button variant="outline" size="sm">Candidate filing packet</Button></Link>
        </section>
      </main>
    </div>
  );
}