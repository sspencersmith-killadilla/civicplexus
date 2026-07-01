import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listPublicBodies } from "@/lib/officials-public.functions";
import { Card } from "@/components/ui/card";
import { Landmark } from "lucide-react";

const q = queryOptions({
  queryKey: ["public-officials"],
  queryFn: () => listPublicBodies(),
});

export const Route = createFileRoute("/officials/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  head: () => ({ meta: [{ title: "Elected officials & appointed boards" }] }),
  component: Roster,
});

function Roster() {
  const { data: bodies } = useSuspenseQuery(q);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h1 className="font-serif text-3xl tracking-tight">Elected officials & boards</h1>
          <p className="text-muted-foreground mt-1">Public roster of governing bodies, boards, and commissions.</p>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">
        {bodies.length === 0 ? (
          <p className="text-muted-foreground text-sm">No public bodies published yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {bodies.map((b) => (
              <Link key={b.id} to="/officials/$slug" params={{ slug: b.slug }}>
                <Card className="p-5 hover:border-primary/40 transition-colors h-full">
                  <div className="flex items-start gap-3">
                    <Landmark className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <h2 className="font-medium">{b.name}</h2>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{b.kind}</p>
                      {b.description && <p className="text-sm mt-2 text-muted-foreground line-clamp-3">{b.description}</p>}
                      {b.meeting_cadence && <p className="text-xs mt-2 text-muted-foreground">Meets: {b.meeting_cadence}</p>}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}