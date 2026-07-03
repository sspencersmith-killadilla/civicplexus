import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, Check, CheckCheck, Archive, ArchiveRestore } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const { data, isLoading } = useQuery({
    queryKey: ["notifications-all", tab],
    queryFn: async () => {
      const q = supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(200);
      const filtered = tab === "archived" ? q.not("archived_at", "is", null) : q.is("archived_at", null);
      return (await filtered).data;
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications-all"] });
  const markAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).is("archived_at", null);
    },
    onSuccess: invalidate,
  });
  const archiveAll = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const { data: rows, error } = await supabase
        .from("notifications")
        .update({ read_at: now, archived_at: now })
        .is("archived_at", null)
        .select("id");
      if (error) throw error;
      return rows?.length ?? 0;
    },
    onSuccess: (count) => {
      invalidate();
      toast.success(
        count ? `Archived ${count} notification${count === 1 ? "" : "s"}` : "Nothing to archive",
        count ? { description: "Find them under the Archived tab to restore." } : undefined,
      );
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Archive failed"),
  });
  const markOne = useMutation({
    mutationFn: async (id: string) => { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id); },
    onSuccess: invalidate,
  });
  const archiveOne = useMutation({
    mutationFn: async (id: string) => {
      const now = new Date().toISOString();
      await supabase.from("notifications").update({ read_at: now, archived_at: now }).eq("id", id);
    },
    onSuccess: invalidate,
  });
  const unarchiveOne = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ archived_at: null }).eq("id", id);
    },
    onSuccess: invalidate,
  });

  return (
    <AppShell title="Notifications">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">Recent activity, reminders, and approvals.</p>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")}>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {tab === "active" && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => markAll.mutate()}><CheckCheck className="h-4 w-4 mr-2" /> Mark all read</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm"><Archive className="h-4 w-4 mr-2" /> Archive all</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive all notifications?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This marks every notification as read and moves it to the Archived tab. You can restore any of them later from there.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => archiveAll.mutate()}>Archive all</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
      <Card className="divide-y">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && !data?.length && (
          <div className="p-10 text-center text-muted-foreground"><Bell className="h-8 w-8 mx-auto mb-2 opacity-40" /> {tab === "archived" ? "No archived notifications." : "Nothing yet."}</div>
        )}
        {data?.map((n) => (
          <div key={n.id} className={`p-4 flex items-start gap-3 ${n.read_at ? "opacity-60" : ""}`}>
            <div className="h-2 w-2 mt-2 rounded-full bg-primary" />
            <div className="flex-1">
              <p className="font-medium">{n.title}</p>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
            </div>
            <div className="flex gap-1">
              {!n.read_at && !n.archived_at && (
                <Button variant="ghost" size="sm" onClick={() => markOne.mutate(n.id)} title="Mark read"><Check className="h-4 w-4" /></Button>
              )}
              {!n.archived_at && (
                <Button variant="ghost" size="sm" onClick={() => archiveOne.mutate(n.id)} title="Archive"><Archive className="h-4 w-4" /></Button>
              )}
              {n.archived_at && (
                <Button variant="ghost" size="sm" onClick={() => unarchiveOne.mutate(n.id)} title="Restore"><ArchiveRestore className="h-4 w-4" /></Button>
              )}
            </div>
          </div>
        ))}
      </Card>
    </AppShell>
  );
}