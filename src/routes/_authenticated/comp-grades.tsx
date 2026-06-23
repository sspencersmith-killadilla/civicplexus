import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { upsertPayGrade } from "@/lib/comp.functions";

export const Route = createFileRoute("/_authenticated/comp-grades")({ component: Page });

type GradeForm = { id?: string; code: string; name: string; currency: string; min_annual: string; mid_annual: string; max_annual: string; flsa_default: "" | "exempt" | "non_exempt"; is_active: boolean; notes: string };
const blank: GradeForm = { code: "", name: "", currency: "USD", min_annual: "", mid_annual: "", max_annual: "", flsa_default: "", is_active: true, notes: "" };

function Page() {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertPayGrade);
  const { data: grades } = useQuery({ queryKey: ["pay-grades"], queryFn: async () => (await supabase.from("pay_grades").select("*").order("code")).data ?? [] });
  const { data: market } = useQuery({ queryKey: ["market-summary"], queryFn: async () => (await supabase.from("market_ranges").select("job_family,level,p50,currency").order("effective_date", { ascending: false })).data ?? [] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<GradeForm>(blank);
  const mut = useMutation({
    mutationFn: () => upsert({ data: {
      id: form.id, code: form.code, name: form.name, currency: form.currency,
      min_annual: Number(form.min_annual), mid_annual: Number(form.mid_annual), max_annual: Number(form.max_annual),
      flsa_default: form.flsa_default || undefined, is_active: form.is_active, notes: form.notes || null,
    } }),
    onSuccess: () => { toast.success("Saved"); setOpen(false); setForm(blank); qc.invalidateQueries({ queryKey: ["pay-grades"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Pay grades & bands">
      <div className="flex justify-between mb-4">
        <p className="text-sm text-muted-foreground">Define salary bands; compa-ratios use the midpoint.</p>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(blank); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New grade</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit" : "New"} pay grade</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="P3" /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Senior Professional" /></div>
              <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} /></div>
              <div><Label>FLSA default</Label>
                <Select value={form.flsa_default} onValueChange={(v: "" | "exempt" | "non_exempt") => setForm({ ...form, flsa_default: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exempt">Exempt</SelectItem>
                    <SelectItem value="non_exempt">Non-exempt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Min</Label><Input type="number" value={form.min_annual} onChange={(e) => setForm({ ...form, min_annual: e.target.value })} /></div>
              <div><Label>Mid</Label><Input type="number" value={form.mid_annual} onChange={(e) => setForm({ ...form, mid_annual: e.target.value })} /></div>
              <div className="col-span-2"><Label>Max</Label><Input type="number" value={form.max_annual} onChange={(e) => setForm({ ...form, max_annual: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.code || !form.name}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b"><tr>
            <th className="text-left p-3">Code</th><th className="text-left p-3">Name</th>
            <th className="text-right p-3">Min</th><th className="text-right p-3">Mid</th><th className="text-right p-3">Max</th>
            <th className="text-left p-3">FLSA</th><th></th>
          </tr></thead>
          <tbody>
            {(grades ?? []).map((g) => (
              <tr key={g.id} className="border-t">
                <td className="p-3 font-mono">{g.code}</td>
                <td className="p-3">{g.name} {!g.is_active && <Badge variant="outline" className="ml-1">inactive</Badge>}</td>
                <td className="p-3 text-right">{Number(g.min_annual).toLocaleString()}</td>
                <td className="p-3 text-right">{Number(g.mid_annual).toLocaleString()}</td>
                <td className="p-3 text-right">{Number(g.max_annual).toLocaleString()}</td>
                <td className="p-3 text-xs text-muted-foreground">{g.flsa_default ?? "—"}</td>
                <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => { setForm({ id: g.id, code: g.code, name: g.name, currency: g.currency, min_annual: String(g.min_annual), mid_annual: String(g.mid_annual), max_annual: String(g.max_annual), flsa_default: (g.flsa_default ?? "") as GradeForm["flsa_default"], is_active: g.is_active, notes: g.notes ?? "" }); setOpen(true); }}>Edit</Button></td>
              </tr>
            ))}
            {(grades?.length ?? 0) === 0 && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">No grades yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      {(market?.length ?? 0) > 0 && (
        <Card className="p-4 mt-4">
          <h3 className="font-serif text-lg mb-2">Market p50 references</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="text-left p-2">Job family</th><th className="text-left p-2">Level</th><th className="text-right p-2">p50</th></tr></thead>
            <tbody>{(market ?? []).map((m, i) => <tr key={i} className="border-t"><td className="p-2">{m.job_family}</td><td className="p-2">{m.level}</td><td className="p-2 text-right">{m.currency} {Number(m.p50).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}