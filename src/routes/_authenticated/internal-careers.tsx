import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Briefcase, MapPin, Lock } from "lucide-react";
import { toast } from "sonner";
import { applyInternally } from "@/lib/jobs.functions";

export const Route = createFileRoute("/_authenticated/internal-careers")({ component: InternalCareers });

function InternalCareers() {
  const qc = useQueryClient();
  const apply = useServerFn(applyInternally);

  const q = useQuery({
    queryKey: ["internal_careers"],
    queryFn: async () => {
      const { data } = await supabase.from("job_requisitions" as never)
        .select("id, title, department, location, employment_type, summary, internal_only, slug")
        .eq("status", "posted").order("posted_at", { ascending: false });
      return (data ?? []) as Array<{ id: string; title: string; department: string | null; location: string | null; employment_type: string | null; summary: string | null; internal_only: boolean; slug: string | null }>;
    },
  });

  return (
    <AppShell title="Internal Careers">
      <p className="text-sm text-muted-foreground mb-6">Browse open roles and apply to grow within the organization.</p>
      <div className="grid gap-3">
        {(q.data ?? []).map((r) => <InternalRow key={r.id} req={r} onApply={(cover, notify) => apply({ data: { requisition_id: r.id, cover_letter: cover, notify_current_manager: notify } })
          .then(() => { qc.invalidateQueries(); toast.success("Application submitted"); })
          .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"))} />)}
        {(q.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No open roles right now.</p>}
      </div>
    </AppShell>
  );
}

function InternalRow({ req, onApply }: { req: { id: string; title: string; department: string | null; location: string | null; summary: string | null; internal_only: boolean; slug: string | null }; onApply: (cover: string, notify: boolean) => void }) {
  const [cover, setCover] = useState("");
  const [notify, setNotify] = useState(true);
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            {req.title}
            {req.internal_only && <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 flex items-center gap-1"><Lock className="h-3 w-3" />Internal only</span>}
          </h3>
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
            {req.department && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{req.department}</span>}
            {req.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{req.location}</span>}
          </div>
          {req.summary && <p className="text-sm mt-2">{req.summary}</p>}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm">Apply internally</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Apply to {req.title}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Textarea rows={5} placeholder="Why are you interested in this role?" value={cover} onChange={(e)=>setCover(e.target.value)} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={notify} onChange={(e)=>setNotify(e.target.checked)} />
                Notify my current manager
              </label>
              <div className="flex justify-end"><Button onClick={() => { onApply(cover, notify); setOpen(false); }}>Submit</Button></div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}