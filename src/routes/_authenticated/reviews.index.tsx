import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardCheck, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { createAnnualReview } from "@/lib/reviews.functions";

export const Route = createFileRoute("/_authenticated/reviews/")({ component: ReviewsIndex });

function ReviewsIndex() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const create = useServerFn(createAnnualReview);

  const reviewsQ = useQuery({
    queryKey: ["performance_reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_reviews")
        .select("id, employee_id, review_period_start, review_period_end, status, overall_rating, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const empQ = useQuery({
    queryKey: ["employees_select_min_reviews"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, first_name, last_name, department").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [empId, setEmpId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
  const [start, setStart] = useState(yearAgo);
  const [end, setEnd] = useState(today);

  const newReview = useMutation({
    mutationFn: async () => {
      if (!empId) throw new Error("Pick an employee");
      return create({ data: { employee_id: empId, period_start: start, period_end: end } });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["performance_reviews"] });
      toast.success("Review created");
      setOpen(false);
      window.location.assign(`/reviews/${r.id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const empMap = new Map((empQ.data ?? []).map((e) => [e.id, e]));

  return (
    <AppShell title="Performance Reviews">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-2xl">
          Annual performance reviews. AI compiles a draft from the employee's 1-on-1 history, action items, and goal progress over the review period.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New review</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Start an annual review</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Employee</Label>
                <Select value={empId} onValueChange={setEmpId}>
                  <SelectTrigger><SelectValue placeholder="Pick an employee" /></SelectTrigger>
                  <SelectContent>
                    {(empQ.data ?? []).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.department ? ` · ${e.department}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Period start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Period end</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
              </div>
            </div>
            <DialogFooter><Button disabled={newReview.isPending} onClick={() => newReview.mutate()}>{newReview.isPending ? "Creating…" : "Create"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" /> Reviews</h3>
        {reviewsQ.isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reviewsQ.data ?? []).map((r) => {
                const emp = empMap.get(r.employee_id);
                return (
                  <TableRow key={r.id}>
                    <TableCell>{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.review_period_start} → {r.review_period_end}</TableCell>
                    <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted">{r.status}</span></TableCell>
                    <TableCell>{r.overall_rating ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Link to="/reviews/$id" params={{ id: r.id }}>
                        <Button size="sm" variant="ghost"><ExternalLink className="h-3 w-3 mr-1" /> Open</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(reviewsQ.data?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No reviews yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
      {void me}
    </AppShell>
  );
}