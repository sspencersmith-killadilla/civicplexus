import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getPublicRequisition } from "@/lib/jobs.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Briefcase, MapPin } from "lucide-react";

const jobQuery = (slug: string) => queryOptions({
  queryKey: ["public-careers", slug],
  queryFn: () => getPublicRequisition({ data: { slug } }),
});

export const Route = createFileRoute("/careers/$slug")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(jobQuery(params.slug)),
  head: ({ loaderData }) => ({
    meta: loaderData ? [
      { title: `${loaderData.title} — Careers` },
      { name: "description", content: loaderData.summary ?? loaderData.title },
    ] : [],
  }),
  errorComponent: ({ error }) => <p className="p-8 text-sm">{error.message}</p>,
  notFoundComponent: () => <p className="p-8 text-sm">Position not found.</p>,
  component: JobDetail,
});

function JobDetail() {
  const { slug } = Route.useParams();
  const { data: j } = useSuspenseQuery(jobQuery(slug));
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link to="/careers" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3 w-3 mr-1" /> All positions
        </Link>
        <h1 className="font-serif text-3xl tracking-tight">{j.title}</h1>
        <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
          {j.department && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{j.department}</span>}
          {j.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{j.location}</span>}
          {j.employment_type && <span>{j.employment_type}</span>}
        </div>
        <Card className="p-6 mt-6 space-y-5">
          {j.summary && <p className="text-base">{j.summary}</p>}
          {j.description && <section><h2 className="font-medium mb-2">About the role</h2><div className="text-sm whitespace-pre-wrap">{j.description}</div></section>}
          {j.requirements && <section><h2 className="font-medium mb-2">Requirements</h2><div className="text-sm whitespace-pre-wrap">{j.requirements}</div></section>}
          {j.benefits && <section><h2 className="font-medium mb-2">Benefits</h2><div className="text-sm whitespace-pre-wrap">{j.benefits}</div></section>}
        </Card>
        <div className="mt-6 flex justify-end">
          <Link to="/careers/$slug/apply" params={{ slug }}><Button size="lg">Apply for this role</Button></Link>
        </div>
      </main>
    </div>
  );
}