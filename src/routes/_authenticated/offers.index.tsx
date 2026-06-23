import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Send, Ban, Eye } from "lucide-react";
import { toast } from "sonner";
import { sendOffer, voidOffer } from "@/lib/offers.functions";
import DOMPurify from "isomorphic-dompurify";

export const Route = createFileRoute("/_authenticated/offers/")({ component: OffersIndex });

function OffersIndex() {
  const qc = useQueryClient();
  const send = useServerFn(sendOffer);
  const voidFn = useServerFn(voidOffer);
  const [previewing, setPreviewing] = useState<{ id: string; letter_html: string } | null>(null);

  const q = useQuery({
    queryKey: ["offers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers" as never)
        .select("id, status, salary, start_date, expires_at, sent_at, created_at, letter_html, application_id, job_applications:application_id(applicant_name, email, job_requisitions:requisition_id(title))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; status: string; salary: number | null; start_date: string | null;
        expires_at: string | null; sent_at: string | null; created_at: string; letter_html: string;
        application_id: string;
        job_applications: { applicant_name: string; email: string; job_requisitions: { title: string } | null } | null;
      }>;
    },
  });

  const doSend = useMutation({
    mutationFn: (id: string) => send({ data: { offer_id: id } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["offers-list"] }); toast.success(`Sent — ${r.offer_url}`); navigator.clipboard?.writeText(r.offer_url).catch(() => {}); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const doVoid = useMutation({
    mutationFn: (id: string) => voidFn({ data: { offer_id: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offers-list"] }); toast.success("Voided"); },
  });

  const statusColor: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-primary/15 text-primary",
    accepted: "bg-green-500/15 text-green-700 dark:text-green-400",
    declined: "bg-destructive/15 text-destructive",
    expired: "bg-amber-500/15 text-amber-700",
    void: "bg-secondary text-secondary-foreground",
  };

  return (
    <AppShell title="Offers">
      <p className="text-sm text-muted-foreground mb-4">Draft offers from a finalist application on the requisition page. Send releases the offer with a tokenized accept/decline link.</p>
      <div className="space-y-2">
        {(q.data ?? []).map((o) => (
          <Card key={o.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-medium">{o.job_applications?.applicant_name ?? "—"} <span className="text-xs text-muted-foreground">· {o.job_applications?.job_requisitions?.title ?? "—"}</span></div>
              <div className="text-xs text-muted-foreground mt-1">
                {o.start_date && `Start ${o.start_date}`} {o.salary != null && `· $${Number(o.salary).toLocaleString()}`} {o.expires_at && `· expires ${new Date(o.expires_at).toLocaleDateString()}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded ${statusColor[o.status] ?? "bg-muted"}`}>{o.status}</span>
              <Button size="sm" variant="outline" onClick={() => setPreviewing({ id: o.id, letter_html: o.letter_html })}><Eye className="h-3 w-3 mr-1" /> Preview</Button>
              {o.status === "draft" && <Button size="sm" disabled={doSend.isPending} onClick={() => doSend.mutate(o.id)}><Send className="h-3 w-3 mr-1" /> Send</Button>}
              {(o.status === "draft" || o.status === "sent") && <Button size="sm" variant="ghost" onClick={() => doVoid.mutate(o.id)}><Ban className="h-3 w-3 mr-1" /> Void</Button>}
              <Link to="/jobs/$id" params={{ id: o.application_id }} className="text-xs text-muted-foreground hover:underline ml-2">App</Link>
            </div>
          </Card>
        ))}
        {(q.data?.length ?? 0) === 0 && <Card className="p-10 text-center text-sm text-muted-foreground">No offers yet.</Card>}
      </div>

      <Dialog open={!!previewing} onOpenChange={(v) => !v && setPreviewing(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Offer letter preview</DialogTitle></DialogHeader>
          {previewing && <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewing.letter_html) }} />}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}