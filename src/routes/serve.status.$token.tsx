import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const getStatus = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ token: z.string().min(10) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashToken } = await import("@/lib/candidate-tokens.server");
    const tokenHash = hashToken(data.token);
    const { data: sub } = await supabaseAdmin
      .from("board_application_submissions")
      .select("first_name,last_name,status,created_at,decided_at,decision_notes, board_application_interests(is_primary, official_bodies(name))")
      .eq("status_token", tokenHash)
      .maybeSingle();
    return sub;
  });

export const Route = createFileRoute("/serve/status/$token")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(
      queryOptions({ queryKey: ["board-app-status", params.token], queryFn: () => getStatus({ data: { token: params.token } }) }),
    ),
  component: StatusPage,
});

function StatusPage() {
  const { token } = Route.useParams();
  const q = useSuspenseQuery(queryOptions({ queryKey: ["board-app-status", token], queryFn: () => getStatus({ data: { token } }) }));
  const s = q.data as any;
  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-6">
      <Card className="p-6 max-w-lg w-full mt-16">
        <h1 className="font-serif text-2xl">Application status</h1>
        {!s ? (
          <p className="text-sm text-muted-foreground mt-3">We couldn't find that application link.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm">{s.first_name} {s.last_name}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Status:</span>
              <Badge variant="outline">{s.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Submitted {new Date(s.created_at).toLocaleDateString()}</p>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Boards:</p>
              <ul className="text-sm list-disc pl-5">
                {(s.board_application_interests ?? []).map((i: any, idx: number) => (
                  <li key={idx}>{i.official_bodies?.name}{i.is_primary ? " (primary)" : ""}</li>
                ))}
              </ul>
            </div>
            {s.decision_notes && <p className="text-xs border-l-2 border-primary/40 pl-2">{s.decision_notes}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}