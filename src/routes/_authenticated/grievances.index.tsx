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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { fileGrievance } from "@/lib/grievances.functions";

export const Route = createFileRoute("/_authenticated/grievances/")({ component: GrievancesIndex });

const CATEGORIES = ["harassment", "discrimination", "retaliation", "policy", "pay", "safety", "other"] as const;
const SEVERITIES = ["low", "medium", "high", "critical"] as const;

function GrievancesIndex() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isHR = hasRole(me?.roles, "hr_admin");
  const file = useServerFn(fileGrievance);

  const q = useQuery({
    queryKey: ["grievances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grievances")
        .select("id, case_number, category, severity, summary, status, created_at, submitted_by")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("policy");
  const [severity, setSeverity] = useState<string>("medium");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [anon, setAnon] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      file({
        data: {
          category: category as never,
          severity: severity as never,
          summary,
          details,
          is_anonymous: anon,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grievances"] });
      setOpen(false); setSummary(""); setDetails(""); setAnon(false); setCategory("policy"); setSeverity("medium");
      toast.success("Grievance filed. HR will follow up.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <AppShell title="Grievances">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground max-w-2xl">
          Confidential complaint workflow. Filings route to HR; submitters see their own case and any notes HR chooses to share. {isHR ? "You are HR — you see the full queue." : "Only your own filings appear here."}
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> File a grievance</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>File a grievance</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Severity</Label>
                  <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Summary</Label><Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line summary" /></div>
              <div className="space-y-1.5"><Label>Details</Label><Textarea rows={6} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What happened, when, who was involved, evidence" /></div>
              <div className="flex items-center gap-2"><Switch checked={anon} onCheckedChange={setAnon} id="anon" /><Label htmlFor="anon" className="text-sm">Request anonymity (HR still sees your identity for follow-up but it is masked elsewhere)</Label></div>
            </div>
            <DialogFooter><Button disabled={submit.isPending || !summary} onClick={() => submit.mutate()}>{submit.isPending ? "Filing…" : "File"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /> Cases</h3>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Case #</TableHead><TableHead>Category</TableHead><TableHead>Severity</TableHead><TableHead>Summary</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-mono text-xs">{g.case_number}</TableCell>
                <TableCell>{g.category}</TableCell>
                <TableCell>{g.severity}</TableCell>
                <TableCell className="max-w-md truncate">{g.summary}</TableCell>
                <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted">{g.status}</span></TableCell>
                <TableCell className="text-right">
                  <Link to="/grievances/$id" params={{ id: g.id }}><Button size="sm" variant="ghost"><ExternalLink className="h-3 w-3 mr-1" /> Open</Button></Link>
                </TableCell>
              </TableRow>
            ))}
            {(q.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No grievances.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}