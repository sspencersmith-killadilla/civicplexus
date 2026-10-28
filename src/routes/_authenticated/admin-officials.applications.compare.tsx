import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, GitCompare, Star } from "lucide-react";
import { listBodies } from "@/lib/officials.functions";
import { compareApplicationsForBody } from "@/lib/board-applications.functions";

export const Route = createFileRoute("/_authenticated/admin-officials/applications/compare")({
  component: CompareApplicationsPage,
  errorComponent: ({ error, reset }) => (
    <AppShell>
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <h1 className="text-xl font-serif">Compare unavailable</h1>
        <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => reset()}>Retry</Button>
          <Link to="/admin-officials"><Button size="sm">Back</Button></Link>
        </div>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell><div className="p-6"><Link to="/admin-officials"><Button size="sm">Back</Button></Link></div></AppShell>
  ),
});

function CompareApplicationsPage() {
  const listBodiesFn = useServerFn(listBodies);
  const compareFn = useServerFn(compareApplicationsForBody);
  const [bodyId, setBodyId] = useState<string>("");

  const bodiesQ = useQuery({ queryKey: ["officials-bodies"], queryFn: () => listBodiesFn() });
  const bodies = (bodiesQ.data ?? []) as Array<{ id: string; name: string; kind: string }>;

  const cmpQ = useQuery({
    queryKey: ["compare-apps", bodyId],
    queryFn: () => compareFn({ data: { body_id: bodyId } }),
    enabled: !!bodyId,
  });

  const rows = useMemo(() => {
    const interests = (cmpQ.data?.interests ?? []) as any[];
    const scores = (cmpQ.data?.scores ?? []) as any[];
    return interests.map((row) => {
      const app = row.board_application_submissions ?? {};
      const mine = scores.filter((s) => s.submission_id === row.submission_id);
      const avg = mine.length ? mine.reduce((a, s) => a + s.score, 0) / mine.length : null;
      return { app, is_primary: row.is_primary, scores: mine, avg };
    }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  }, [cmpQ.data]);

  return (
    <AppShell>
      <div className="p-6 max-w-[1400px] mx-auto space-y-6">
        <div>
          <Link to="/admin-officials" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Back to officials
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-serif tracking-tight flex items-center gap-2">
              <GitCompare className="h-6 w-6" /> Compare applicants
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Side-by-side view of everyone who applied to a given board, ranked by average score.</p>
          </div>
          <div className="w-72">
            <Label className="text-xs">Board</Label>
            <Select value={bodyId} onValueChange={setBodyId}>
              <SelectTrigger><SelectValue placeholder="Choose a board…" /></SelectTrigger>
              <SelectContent>
                {bodies.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!bodyId && (
          <Card className="p-6 text-sm text-muted-foreground">Select a board above to compare applicants.</Card>
        )}

        {bodyId && cmpQ.isLoading && (
          <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
        )}

        {bodyId && !cmpQ.isLoading && rows.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground">No applicants have selected this board.</Card>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-2">
              {rows.map((r) => (
                <Card key={r.app.id} className="p-4 w-80 shrink-0 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{r.app.first_name} {r.app.last_name}</div>
                      <div className="text-xs text-muted-foreground">{r.app.email}</div>
                    </div>
                    {r.is_primary && <Badge className="text-[10px]">Primary</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Star className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">{r.avg != null ? r.avg.toFixed(2) : "—"}</span>
                    <span className="text-xs text-muted-foreground">({r.scores.length} score{r.scores.length === 1 ? "" : "s"})</span>
                    <Badge variant="outline" className="ml-auto capitalize text-[10px]">{String(r.app.status ?? "").replace("_", " ")}</Badge>
                  </div>
                  {(r.app.occupation || r.app.employer) && (
                    <div className="text-xs">
                      <div className="font-semibold text-muted-foreground">Occupation</div>
                      <div>{[r.app.occupation, r.app.employer].filter(Boolean).join(" · ")}</div>
                    </div>
                  )}
                  {r.app.qualifications && (
                    <div className="text-xs">
                      <div className="font-semibold text-muted-foreground">Qualifications</div>
                      <p className="whitespace-pre-wrap line-clamp-6">{r.app.qualifications}</p>
                    </div>
                  )}
                  {r.app.statement && (
                    <div className="text-xs">
                      <div className="font-semibold text-muted-foreground">Statement</div>
                      <p className="whitespace-pre-wrap line-clamp-6 border-l-2 border-primary/40 pl-2">{r.app.statement}</p>
                    </div>
                  )}
                  {r.app.conflicts_disclosure && (
                    <div className="text-xs">
                      <div className="font-semibold text-muted-foreground">Conflicts</div>
                      <p className="whitespace-pre-wrap line-clamp-4">{r.app.conflicts_disclosure}</p>
                    </div>
                  )}
                  <div className="pt-2 border-t">
                    <Link
                      to="/admin-officials/applications/$id"
                      params={{ id: r.app.id }}
                      className="text-xs text-primary hover:underline"
                    >
                      Open full detail →
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}