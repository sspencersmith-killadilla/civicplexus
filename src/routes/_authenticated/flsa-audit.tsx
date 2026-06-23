import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listFlsaAudit, recordFlsaReview } from "@/lib/compliance.functions";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/flsa-audit")({ component: FlsaPage });

function FlsaPage() {
  const qc = useQueryClient();
  const list = useServerFn(listFlsaAudit);
  const record = useServerFn(recordFlsaReview);
  const { data } = useQuery({ queryKey: ["flsa-audit"], queryFn: () => list() });
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ decision: "exempt" as "exempt" | "non_exempt" | "needs_review", exempt_basis: "", duties_test_notes: "", next_review_date: "" });

  const mut = useMutation({
    mutationFn: () => record({ data: { position_id: open!, ...form } }),
    onSuccess: () => { toast.success("FLSA review recorded"); setOpen(null); qc.invalidateQueries({ queryKey: ["flsa-audit"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="FLSA classification audit">
      <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center mb-3"><ArrowLeft className="h-3 w-3 mr-1" /> Back to reports</Link>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b">
            <tr><th className="text-left p-3">Position</th><th className="text-left p-3">Department</th><th className="text-left p-3">FLSA</th><th className="text-left p-3">Last review</th><th></th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3 font-medium">{p.title}</td>
                <td className="p-3 text-muted-foreground">{p.department ?? "—"}</td>
                <td className="p-3"><Badge variant={p.flsa_class === "exempt" ? "default" : p.flsa_class === "non_exempt" ? "secondary" : "outline"}>{p.flsa_class ?? "unset"}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground">{p.last_review ? new Date(p.last_review.reviewed_at).toLocaleDateString() : "Never"}{p.needs_review && <Badge variant="destructive" className="ml-2">Review</Badge>}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => setOpen(p.id)}>Record</Button>
                </td>
              </tr>
            ))}
            {(data?.length ?? 0) === 0 && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">No positions yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record FLSA review</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Decision</Label>
              <Select value={form.decision} onValueChange={(v: "exempt" | "non_exempt" | "needs_review") => setForm({ ...form, decision: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exempt">Exempt</SelectItem>
                  <SelectItem value="non_exempt">Non-exempt</SelectItem>
                  <SelectItem value="needs_review">Needs further review</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Exemption basis</Label><Input value={form.exempt_basis} onChange={(e) => setForm({ ...form, exempt_basis: e.target.value })} placeholder="Executive / Administrative / Professional / Outside sales / Computer" /></div>
            <div><Label>Duties-test notes</Label><Textarea value={form.duties_test_notes} onChange={(e) => setForm({ ...form, duties_test_notes: e.target.value })} rows={4} /></div>
            <div><Label>Next review by</Label><Input type="date" value={form.next_review_date} onChange={(e) => setForm({ ...form, next_review_date: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}