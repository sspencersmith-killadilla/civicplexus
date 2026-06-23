import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { myCompCycleParticipants, allCompCycleParticipants, submitProposal, approveProposal, finalizeCompCycle } from "@/lib/comp-cycles.functions";

export const Route = createFileRoute("/_authenticated/comp-cycles/$id")({ component: Page });

type Participant = {
  id: string; employee_id: string; manager_id: string | null;
  proposed_merit_pct: number | null; proposed_promotion_grade_id: string | null;
  proposed_bonus_amount: number | null; manager_notes: string | null;
  recommended_merit_pct: number | null; latest_rating: string | null; status: string;
  employees: { first_name: string; last_name: string; department: string | null; job_title?: string | null } | null;
  current_comp: { base_annual: number | null; hourly_rate: number | null; currency: string; pay_grade_id?: string | null } | null;
  pay_grades: { code: string; mid_annual: number } | null;
};

function Page() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isHr = hasRole(me?.roles, "hr_admin");

  const myFn = useServerFn(myCompCycleParticipants);
  const allFn = useServerFn(allCompCycleParticipants);
  const submit = useServerFn(submitProposal);
  const approve = useServerFn(approveProposal);
  const finalize = useServerFn(finalizeCompCycle);

  const { data: cycle } = useQuery({ queryKey: ["comp-cycle", id], queryFn: async () => (await supabase.from("comp_cycles").select("*").eq("id", id).single()).data });
  const { data: parts } = useQuery({
    queryKey: ["comp-parts", id, isHr],
    queryFn: () => (isHr ? allFn({ data: { cycle_id: id } }) : myFn({ data: { cycle_id: id } })),
  });
  const { data: grades } = useQuery({ queryKey: ["pay-grades-all"], queryFn: async () => (await supabase.from("pay_grades").select("id,code,mid_annual").eq("is_active", true).order("code")).data ?? [] });

  const subMut = useMutation({ mutationFn: (d: { participant_id: string; proposed_merit_pct?: number | null; proposed_promotion_grade_id?: string | null; proposed_bonus_amount?: number | null; manager_notes?: string | null }) => submit({ data: d }), onSuccess: () => { toast.success("Submitted"); qc.invalidateQueries({ queryKey: ["comp-parts"] }); }, onError: (e: Error) => toast.error(e.message) });
  const apprMut = useMutation({ mutationFn: (pid: string) => approve({ data: { participant_id: pid } }), onSuccess: () => { toast.success("Approved"); qc.invalidateQueries({ queryKey: ["comp-parts"] }); }, onError: (e: Error) => toast.error(e.message) });
  const finMut = useMutation({ mutationFn: () => finalize({ data: { id } }), onSuccess: (r) => { toast.success(`Cycle finalized — ${r.applied} updates applied`); qc.invalidateQueries({ queryKey: ["comp-parts"] }); qc.invalidateQueries({ queryKey: ["comp-cycle", id] }); }, onError: (e: Error) => toast.error(e.message) });

  const list = (parts ?? []) as unknown as Participant[];
  const budget = (cycle?.budget_pct ?? 0) as number;
  const totalCurrent = list.reduce((s, p) => s + (p.current_comp?.base_annual ?? 0), 0);
  const totalSpend = list.reduce((s, p) => s + ((p.current_comp?.base_annual ?? 0) * ((p.proposed_merit_pct ?? 0) / 100)), 0);
  const spendPct = totalCurrent ? (totalSpend / totalCurrent) * 100 : 0;

  return (
    <AppShell title={cycle?.name ?? "Comp cycle"}>
      <Link to="/comp-cycles" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center mb-3"><ArrowLeft className="h-3 w-3 mr-1" /> Back to cycles</Link>

      {cycle && (
        <Card className="p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Status </span><Badge>{cycle.status}</Badge>
            <span className="ml-4 text-muted-foreground">Budget </span>{budget}%
            <span className="ml-4 text-muted-foreground">Effective </span>{cycle.effective_date}
            <span className="ml-4 text-muted-foreground">Proposed spend </span>
            <span className={spendPct > budget ? "text-destructive font-medium" : "font-medium"}>{spendPct.toFixed(2)}%</span>
          </div>
          {isHr && cycle.status === "review" && <Button onClick={() => finMut.mutate()} disabled={finMut.isPending}>Finalize & apply</Button>}
          {isHr && cycle.status === "open" && (
            <Button variant="outline" onClick={async () => { await supabase.from("comp_cycles").update({ status: "review" }).eq("id", id); qc.invalidateQueries({ queryKey: ["comp-cycle", id] }); }}>Move to review</Button>
          )}
        </Card>
      )}

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b">
            <tr>
              <th className="text-left p-3">Employee</th>
              <th className="text-left p-3">Rating</th>
              <th className="text-right p-3">Current base</th>
              <th className="text-right p-3">Compa-ratio</th>
              <th className="text-right p-3">Rec %</th>
              <th className="text-left p-3">Merit %</th>
              <th className="text-left p-3">Promo</th>
              <th className="text-right p-3">Bonus $</th>
              <th className="text-left p-3">Notes</th>
              <th className="text-left p-3">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => <Row key={p.id} p={p} grades={grades ?? []} onSubmit={(d) => subMut.mutate({ participant_id: p.id, ...d })} onApprove={() => apprMut.mutate(p.id)} canApprove={isHr && p.status === "submitted"} locked={p.status === "applied" || cycle?.status === "finalized"} />)}
            {list.length === 0 && <tr><td colSpan={11} className="p-10 text-center text-muted-foreground">No participants{cycle?.status === "draft" ? " — open the cycle to seed." : "."}</td></tr>}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}

function Row({ p, grades, onSubmit, onApprove, canApprove, locked }: {
  p: Participant;
  grades: { id: string; code: string; mid_annual: number }[];
  onSubmit: (d: { proposed_merit_pct: number | null; proposed_promotion_grade_id: string | null; proposed_bonus_amount: number | null; manager_notes: string | null }) => void;
  onApprove: () => void;
  canApprove: boolean;
  locked: boolean;
}) {
  const [merit, setMerit] = useState(p.proposed_merit_pct?.toString() ?? "");
  const [promo, setPromo] = useState(p.proposed_promotion_grade_id ?? "");
  const [bonus, setBonus] = useState(p.proposed_bonus_amount?.toString() ?? "");
  const [notes, setNotes] = useState(p.manager_notes ?? "");
  const cur = p.current_comp?.base_annual ?? 0;
  const compa = p.pay_grades?.mid_annual ? cur / Number(p.pay_grades.mid_annual) : null;
  return (
    <tr className="border-t align-top">
      <td className="p-3">
        <p className="font-medium">{p.employees?.first_name} {p.employees?.last_name}</p>
        <p className="text-xs text-muted-foreground">{p.employees?.department ?? "—"}</p>
      </td>
      <td className="p-3 text-xs">{p.latest_rating ?? "—"}</td>
      <td className="p-3 text-right">{cur ? `$${Number(cur).toLocaleString()}` : "—"}</td>
      <td className="p-3 text-right">{compa ? <span className={compa < 0.8 || compa > 1.2 ? "text-destructive" : ""}>{compa.toFixed(2)}</span> : "—"}</td>
      <td className="p-3 text-right text-muted-foreground">{p.recommended_merit_pct ?? "—"}</td>
      <td className="p-3"><Input type="number" step="0.1" disabled={locked} value={merit} onChange={(e) => setMerit(e.target.value)} className="w-20" /></td>
      <td className="p-3">
        <Select value={promo || "_none"} onValueChange={(v) => setPromo(v === "_none" ? "" : v)} disabled={locked}>
          <SelectTrigger className="w-24"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">—</SelectItem>
            {grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.code}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="p-3"><Input type="number" step="100" disabled={locked} value={bonus} onChange={(e) => setBonus(e.target.value)} className="w-24" /></td>
      <td className="p-3"><Textarea disabled={locked} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-48 text-xs" /></td>
      <td className="p-3"><Badge variant="outline">{p.status}</Badge></td>
      <td className="p-3 text-right space-y-1">
        {!locked && <Button size="sm" variant="outline" onClick={() => onSubmit({ proposed_merit_pct: merit ? Number(merit) : null, proposed_promotion_grade_id: promo || null, proposed_bonus_amount: bonus ? Number(bonus) : null, manager_notes: notes || null })}>Save</Button>}
        {canApprove && <Button size="sm" onClick={onApprove}>Approve</Button>}
      </td>
    </tr>
  );
}