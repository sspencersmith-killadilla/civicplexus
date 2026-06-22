import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Megaphone, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/cascades/")({
  component: CascadesIndex,
});

function CascadesIndex() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isHR = hasRole(me?.roles, "hr_admin");

  const cascadesQ = useQuery({
    queryKey: ["cascades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cascades")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [deadline, setDeadline] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!title || !message) throw new Error("Title and message required");
      const { data, error } = await supabase.from("cascades").insert({
        title, broadcast_message: message, deadline: deadline || null, created_by: me?.user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["cascades"] });
      setOpen(false); setTitle(""); setMessage(""); setDeadline("");
      toast.success("Cascade launched");
      window.location.assign(`/cascades/${c.id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Launch failed"),
  });

  return (
    <AppShell title="Cascades">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-2xl">
          Top-down broadcasts. HR posts a directive or question; supervisors respond with feedback from their teams; AI rolls up themes by department.
        </p>
        {isHR && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New cascade</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Launch a cascade</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Message</Label><Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} /></div>
                <div className="space-y-1.5"><Label>Response deadline</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
              </div>
              <DialogFooter><Button disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Launching…" : "Launch"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(cascadesQ.data ?? []).map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h4 className="font-medium flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary shrink-0" /> {c.title}</h4>
              {c.deadline && <span className="text-xs text-muted-foreground">Due {c.deadline}</span>}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{c.broadcast_message}</p>
            <Link to="/cascades/$id" params={{ id: c.id }}>
              <Button size="sm" variant="outline"><ExternalLink className="h-3 w-3 mr-1" /> Open</Button>
            </Link>
          </Card>
        ))}
        {(cascadesQ.data?.length ?? 0) === 0 && <Card className="md:col-span-2 p-8 text-center text-muted-foreground">No cascades yet.</Card>}
      </div>
    </AppShell>
  );
}