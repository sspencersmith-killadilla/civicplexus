import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { recalibrateRating } from "@/lib/review-cycles.functions";

export const Route = createFileRoute("/_authenticated/review-cycles/$id/calibration")({ component: Calibration });

function Calibration() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const recal = useServerFn(recalibrateRating);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const dataQ = useQuery({
    queryKey: ["calibration", id],
    queryFn: async () => {
      const { data: parts, error } = await supabase
        .from("review_cycle_participants" as never)
        .select("review_id, employees:employee_id(id, first_name, last_name, department)")
        .eq("cycle_id", id);
      if (error) throw error;
      const ids = ((parts ?? []) as Array<{ review_id: string | null }>).map((p) => p.review_id).filter((v): v is string => !!v);
      if (!ids.length) return [];
      const { data: revs } = await supabase
        .from("performance_reviews")
        .select("id, employee_id, overall_rating, status")
        .in("id", ids);
      const rmap = new Map((revs ?? []).map((r) => [r.id, r]));
      return ((parts ?? []) as unknown as Array<{ review_id: string | null; employees: { id: string; first_name: string; last_name: string; department: string | null } | null }>)
        .filter((p) => p.review_id)
        .map((p) => ({
          review_id: p.review_id!,
          employee: p.employees,
          rating: rmap.get(p.review_id!)?.overall_rating ?? null,
          status: rmap.get(p.review_id!)?.status ?? "draft",
        }));
    },
  });

  const save = useMutation({
    mutationFn: ({ review_id, rating }: { review_id: string; rating: number }) =>
      recal({ data: { review_id, to_rating: rating, reason: reasons[review_id] } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calibration", id] }); toast.success("Rating updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = dataQ.data ?? [];
  const byDept = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.employee?.department ?? "—";
    if (!byDept.has(key)) byDept.set(key, []);
    byDept.get(key)!.push(r);
  }
  const dist = [1, 2, 3, 4, 5].map((b) => ({ b, n: rows.filter((r) => Math.round((r.rating ?? 0)) === b).length }));

  return (
    <AppShell title="Calibration">
      <Link to="/review-cycles/$id" params={{ id }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-3 w-3 mr-1" /> Back to cycle</Link>
      <Card className="p-5 mb-6">
        <h3 className="font-medium mb-3">Rating distribution</h3>
        <div className="grid grid-cols-5 gap-2">
          {dist.map((d) => (
            <div key={d.b} className="text-center">
              <div className="bg-primary/15 rounded p-3 font-medium text-lg">{d.n}</div>
              <p className="text-xs text-muted-foreground mt-1">Rating {d.b}</p>
            </div>
          ))}
        </div>
      </Card>
      {[...byDept.entries()].map(([dept, list]) => (
        <Card key={dept} className="p-5 mb-4">
          <h3 className="font-medium mb-3">{dept} ({list.length})</h3>
          <div className="space-y-2">
            {list.map((r) => (
              <div key={r.review_id} className="grid grid-cols-12 gap-2 items-center text-sm border-b last:border-0 py-2">
                <div className="col-span-3">{r.employee?.first_name} {r.employee?.last_name}</div>
                <div className="col-span-2"><Input type="number" min={1} max={5} step={0.5} defaultValue={r.rating ?? ""} onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 5) save.mutate({ review_id: r.review_id, rating: v }); }} /></div>
                <div className="col-span-5"><Input placeholder="Reason for change…" value={reasons[r.review_id] ?? ""} onChange={(e) => setReasons({ ...reasons, [r.review_id]: e.target.value })} /></div>
                <div className="col-span-2 text-right"><Link to="/reviews/$id" params={{ id: r.review_id }} className="text-xs text-primary hover:underline">Open <Save className="h-3 w-3 inline" /></Link></div>
              </div>
            ))}
          </div>
        </Card>
      ))}
      {rows.length === 0 && <Card className="p-10 text-center text-muted-foreground">No reviews to calibrate.</Card>}
    </AppShell>
  );
}