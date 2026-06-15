import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/audit")({ component: AuditPage });

function AuditPage() {
  const { data } = useQuery({ queryKey: ["audit"], queryFn: async () => (await supabase.from("audit_events").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [] });
  return (
    <AppShell title="Audit Log">
      <Card className="divide-y">
        {!data?.length && <div className="p-10 text-center text-muted-foreground">No events recorded.</div>}
        {data?.map((e) => (
          <div key={e.id} className="p-4 flex justify-between text-sm">
            <div>
              <p className="font-medium">{e.action} <Badge variant="outline" className="ml-2">{e.entity}</Badge></p>
              <p className="text-xs text-muted-foreground font-mono">{e.entity_id ?? "—"}</p>
            </div>
            <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</p>
          </div>
        ))}
      </Card>
    </AppShell>
  );
}