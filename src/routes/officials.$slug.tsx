import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getPublicBody } from "@/lib/officials-public.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User as UserIcon, Mail, Phone, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/officials/$slug")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      queryOptions({
        queryKey: ["public-body", params.slug],
        queryFn: () => getPublicBody({ data: { slug: params.slug } }),
      }),
    ),
  head: ({ params }) => ({ meta: [{ title: `Members — ${params.slug}` }] }),
  component: BodyPage,
});

function BodyPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["public-body", slug],
      queryFn: () => getPublicBody({ data: { slug } }),
    }),
  );
  if (!data.body) return <p className="p-8 text-sm">Body not found.</p>;
  const body = data.body;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <Link to="/officials" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> All bodies
          </Link>
          <h1 className="font-serif text-3xl tracking-tight mt-2">{body.name}</h1>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{body.kind}</p>
          {body.description && <p className="text-sm mt-3 max-w-3xl">{body.description}</p>}
          {body.meeting_cadence && <p className="text-xs mt-2 text-muted-foreground">Meets: {body.meeting_cadence}</p>}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-sm font-medium mb-4">Members</h2>
        {data.members.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active members published.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.members.map((m) => (
              <Card key={m.term_id} className="p-4">
                <div className="flex gap-4">
                  <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0 border">
                    {m.photo_url ? (
                      <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{m.name}</p>
                      {m.is_chair && <Badge variant="secondary" className="text-[10px]">Chair</Badge>}
                      <Badge variant="outline" className="text-[10px]">{m.appointment_type.replace("_", " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.seat_label}</p>
                    {m.bio && <p className="text-xs mt-2 text-muted-foreground line-clamp-4">{m.bio}</p>}
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      {m.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {m.email}</span>}
                      {m.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {m.phone}</span>}
                    </div>
                    {(m.start_date || m.end_date) && (
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Term: {m.start_date ?? "—"} → {m.end_date ?? "present"}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}