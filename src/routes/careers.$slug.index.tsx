import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getPublicRequisition } from "@/lib/jobs.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Briefcase, MapPin, FileDown } from "lucide-react";

const jobQuery = (slug: string) => queryOptions({
  queryKey: ["public-careers", slug],
  queryFn: () => getPublicRequisition({ data: { slug } }),
});

export const Route = createFileRoute("/careers/$slug/")({
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
  const sections = (j as unknown as { posting_sections?: Record<string, string | null> | null }).posting_sections ?? {};
  const has = (k: string) => Boolean(sections?.[k]);
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
        <Card className="p-6 mt-6 space-y-6">
          {j.summary && <p className="text-base leading-relaxed">{j.summary}</p>}
          {has("essential_functions") ? (
            <Section title="Essential Functions">{sections.essential_functions!}</Section>
          ) : (
            j.description && <Section title="About the role">{j.description}</Section>
          )}
          {has("ksa") && <Section title="Knowledge, Skills, Abilities & Behaviors">{sections.ksa!}</Section>}
          {has("qualifications") ? (
            <Section title="Required Qualifications">{sections.qualifications!}</Section>
          ) : (
            j.requirements && <Section title="Requirements">{j.requirements}</Section>
          )}
          {has("physical_demands") && <Section title="Physical Demands">{sections.physical_demands!}</Section>}
          {has("supplemental") && <Section title="Supplemental">{sections.supplemental!}</Section>}
          {j.benefits && <Section title="Benefits">{j.benefits}</Section>}
        </Card>
        <div className="mt-6 flex justify-end">
          <Button asChild size="lg">
            <Link to="/careers/$slug/apply" params={{ slug }}>Apply for this role</Link>
          </Button>
        </div>
        {(j as unknown as { brochure_signed_url?: string | null }).brochure_signed_url && (
          <div className="mt-4">
            <a
              href={(j as unknown as { brochure_signed_url: string }).brochure_signed_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <FileDown className="h-4 w-4" /> Download position brochure (PDF)
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <section className="border-t pt-5 first:border-t-0 first:pt-0">
      <h2 className="font-medium mb-2 text-base">{title}</h2>
      <div className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}