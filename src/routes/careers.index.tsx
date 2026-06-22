import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listPublicRequisitions } from "@/lib/jobs.functions";
import { Card } from "@/components/ui/card";
import { Briefcase, MapPin } from "lucide-react";

const careersQuery = queryOptions({
  queryKey: ["public-careers"],
  queryFn: () => listPublicRequisitions(),
});

export const Route = createFileRoute("/careers/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(careersQuery),
  head: () => ({
    meta: [
      { title: "Careers — open positions" },
      { name: "description", content: "Browse current open positions and apply online." },
    ],
  }),
  errorComponent: ({ error }) => <p className="p-8 text-sm">Could not load jobs: {error.message}</p>,
  notFoundComponent: () => <p className="p-8 text-sm">Page not found.</p>,
  component: CareersIndex,
});

function CareersIndex() {
  const { data } = useSuspenseQuery(careersQuery);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h1 className="font-serif text-3xl tracking-tight">Careers</h1>
          <p className="text-muted-foreground mt-1">Build a meaningful career with us.</p>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">
        {data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No open positions right now. Check back soon.</p>
        ) : (
          <div className="grid gap-4">
            {data.map((r) => (
              <Link key={r.id} to="/careers/$slug" params={{ slug: r.slug! }}>
                <Card className="p-5 hover:border-primary/40 transition-colors">
                  <h2 className="font-medium text-lg">{r.title}</h2>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                    {r.department && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{r.department}</span>}
                    {r.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{r.location}</span>}
                    {r.employment_type && <span>{r.employment_type}</span>}
                  </div>
                  {r.summary && <p className="text-sm mt-3 text-muted-foreground line-clamp-2">{r.summary}</p>}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}