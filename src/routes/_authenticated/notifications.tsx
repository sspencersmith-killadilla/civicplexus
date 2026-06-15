import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, Check, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications-all"],
    queryFn: async () => (await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100)).data,
  });
  const markAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications-all"] }),
  });
  const markOne = useMutation({
    mutationFn: async (id: string) => { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications-all"] }),
  });

  return (
    <AppShell title="Notifications">
      <div className="flex justify-between mb-4">
        <p className="text-sm text-muted-foreground">Recent activity, reminders, and approvals.</p>
        <Button variant="outline" size="sm" onClick={() => markAll.mutate()}><CheckCheck className="h-4 w-4 mr-2" /> Mark all read</Button>
      </div>
      <Card className="divide-y">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && !data?.length && (
          <div className="p-10 text-center text-muted-foreground"><Bell className="h-8 w-8 mx-auto mb-2 opacity-40" /> Nothing yet.</div>
        )}
        {data?.map((n) => (
          <div key={n.id} className={`p-4 flex items-start gap-3 ${n.read_at ? "opacity-60" : ""}`}>
            <div className="h-2 w-2 mt-2 rounded-full bg-primary" />
            <div className="flex-1">
              <p className="font-medium">{n.title}</p>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
            </div>
            {!n.read_at && (
              <Button variant="ghost" size="sm" onClick={() => markOne.mutate(n.id)}><Check className="h-4 w-4" /></Button>
            )}
          </div>
        ))}
      </Card>
    </AppShell>
  );
}