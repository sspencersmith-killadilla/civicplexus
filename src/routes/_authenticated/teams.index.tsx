import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Users, Plus, Target } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/teams/")({
  component: TeamsIndex,
});

const STATUS_COLORS: Record<string, string> = {
  forming: "bg-muted text-muted-foreground",
  active: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  complete: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  archived: "bg-muted text-muted-foreground line-through",
};

function TeamsIndex() {
  const { data: me } = useCurrentUser();
  const [showAll, setShowAll] = useState(false);

  const q = useQuery({
    queryKey: ["teams_list", showAll],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, slug, purpose, status, target_end_date, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell title="Cross-Functional Teams">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-2xl">
          Cross-department teams with charters, members, goals, and deliverables. Anyone can start a team — you become its lead and invite people from across the org.
        </p>
        <div className="flex gap-2">
          {me?.is_hr_admin && (
            <Button variant="outline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "My teams" : "All teams (HR)"}
            </Button>
          )}
          <Link to="/teams/new"><Button><Plus className="h-4 w-4 mr-2" /> New team</Button></Link>
        </div>
      </div>

      {q.isLoading ? (
        <Card className="p-8 text-center text-muted-foreground">Loading…</Card>
      ) : !q.data || q.data.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          You're not on any teams yet. Create one to get started.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((t) => (
            <Link key={t.id} to="/teams/$id" params={{ id: t.id }}>
              <Card className="p-4 hover:border-primary transition-colors h-full">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-medium flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> {t.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[t.status] ?? ""}`}>{t.status}</span>
                </div>
                {t.purpose && <p className="text-sm text-muted-foreground line-clamp-2">{t.purpose}</p>}
                {t.target_end_date && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Target className="h-3 w-3" /> target {t.target_end_date}
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}