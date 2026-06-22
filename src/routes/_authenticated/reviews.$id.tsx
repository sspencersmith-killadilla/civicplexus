import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Save, PenLine } from "lucide-react";
import { toast } from "sonner";
import { compileReviewContext, generateReviewDraft, updateReview, signReview } from "@/lib/reviews.functions";

export const Route = createFileRoute("/_authenticated/reviews/$id")({ component: ReviewDetail });

function ReviewDetail() {
  const { id } = useParams({ from: "/_authenticated/reviews/$id" });
  const qc = useQueryClient();
  const compile = useServerFn(compileReviewContext);
  const generate = useServerFn(generateReviewDraft);
  const update = useServerFn(updateReview);
  const sign = useServerFn(signReview);

  const reviewQ = useQuery({
    queryKey: ["performance_review", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("performance_reviews").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const ctxQ = useQuery({
    queryKey: ["review_context", id],
    queryFn: () => compile({ data: { review_id: id } }),
  });

  const sigsQ = useQuery({
    queryKey: ["review_signatures", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("performance_review_signatures").select("*").eq("review_id", id);
      if (error) throw error;
      return data;
    },
  });

  const [narrative, setNarrative] = useState("");
  const [self, setSelf] = useState("");
  const [rating, setRating] = useState<string>("");
  const [status, setStatus] = useState<string>("draft");

  useEffect(() => {
    if (reviewQ.data) {
      setNarrative(reviewQ.data.manager_narrative ?? "");
      setSelf(reviewQ.data.employee_self_assessment ?? "");
      setRating(reviewQ.data.overall_rating?.toString() ?? "");
      setStatus(reviewQ.data.status ?? "draft");
    }
  }, [reviewQ.data]);

  const save = useMutation({
    mutationFn: () =>
      update({
        data: {
          review_id: id,
          patch: {
            manager_narrative: narrative,
            employee_self_assessment: self,
            overall_rating: rating ? Number(rating) : undefined,
            status: status as never,
          },
        },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["performance_review", id] }); toast.success("Saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const genDraft = useMutation({
    mutationFn: () => generate({ data: { review_id: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["performance_review", id] }); toast.success("AI draft generated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "AI failed"),
  });

  const doSign = useMutation({
    mutationFn: (role: "manager" | "employee") => sign({ data: { review_id: id, signer_role: role } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review_signatures", id] }); toast.success("Signed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sign failed"),
  });

  if (reviewQ.isLoading) return <AppShell title="Review"><p>Loading…</p></AppShell>;
  const r = reviewQ.data;
  if (!r) return <AppShell title="Review"><p>Not found</p></AppShell>;

  return (
    <AppShell title="Annual Review">
      <div className="grid gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Period</p>
              <p className="font-medium">{r.review_period_start} → {r.review_period_end}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => genDraft.mutate()} disabled={genDraft.isPending}>
                <Sparkles className="h-4 w-4 mr-1" /> {genDraft.isPending ? "Generating…" : "AI draft"}
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1" /> Save</Button>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="context">
          <TabsList>
            <TabsTrigger value="context">Context</TabsTrigger>
            <TabsTrigger value="draft">AI Draft</TabsTrigger>
            <TabsTrigger value="manager">Manager Narrative</TabsTrigger>
            <TabsTrigger value="self">Self-Assessment</TabsTrigger>
            <TabsTrigger value="finalize">Rating &amp; Sign</TabsTrigger>
          </TabsList>

          <TabsContent value="context" className="mt-4">
            <Card className="p-5 space-y-4 text-sm">
              <div>
                <p className="font-medium mb-1">1-on-1 sessions ({ctxQ.data?.sessions.length ?? 0})</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {(ctxQ.data?.sessions ?? []).map((s) => (<li key={s.id}>{s.scheduled_at ?? s.id} — {s.title ?? "1-on-1"}</li>))}
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Action items ({ctxQ.data?.action_items.length ?? 0})</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {(ctxQ.data?.action_items ?? []).slice(0, 25).map((a, i) => (<li key={i}>[{a.status}] {a.text}</li>))}
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Goals ({ctxQ.data?.goals.length ?? 0})</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {(ctxQ.data?.goals ?? []).map((g) => (<li key={g.id}>{g.title} — {g.status} · {g.progress ?? 0}%</li>))}
                </ul>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="draft" className="mt-4">
            <Card className="p-5">
              {r.ai_draft ? <pre className="whitespace-pre-wrap text-sm">{r.ai_draft}</pre> : <p className="text-muted-foreground">No AI draft yet. Click "AI draft".</p>}
              {r.ai_draft && <Button size="sm" className="mt-3" variant="outline" onClick={() => setNarrative(r.ai_draft ?? "")}>Copy into Manager Narrative</Button>}
            </Card>
          </TabsContent>

          <TabsContent value="manager" className="mt-4">
            <Card className="p-5"><Textarea rows={18} value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder="Manager narrative…" /></Card>
          </TabsContent>

          <TabsContent value="self" className="mt-4">
            <Card className="p-5"><Textarea rows={18} value={self} onChange={(e) => setSelf(e.target.value)} placeholder="Employee self-assessment…" /></Card>
          </TabsContent>

          <TabsContent value="finalize" className="mt-4">
            <Card className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div className="space-y-1.5"><Label>Overall rating (1-5)</Label><Input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["draft", "manager_complete", "employee_acknowledged", "finalized"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Signatures</p>
                <ul className="text-sm text-muted-foreground mb-3">
                  {(sigsQ.data ?? []).map((s) => <li key={s.id}>{s.signer_role} — {new Date(s.signed_at).toLocaleString()}</li>)}
                  {(sigsQ.data?.length ?? 0) === 0 && <li>No signatures yet.</li>}
                </ul>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => doSign.mutate("manager")} disabled={doSign.isPending}><PenLine className="h-4 w-4 mr-1" /> Sign as manager</Button>
                  <Button size="sm" variant="outline" onClick={() => doSign.mutate("employee")} disabled={doSign.isPending}><PenLine className="h-4 w-4 mr-1" /> Sign as employee</Button>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}