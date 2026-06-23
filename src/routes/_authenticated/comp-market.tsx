import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { importMarketRanges } from "@/lib/comp.functions";

export const Route = createFileRoute("/_authenticated/comp-market")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const importFn = useServerFn(importMarketRanges);
  const { data } = useQuery({ queryKey: ["market-all"], queryFn: async () => (await supabase.from("market_ranges").select("*").order("job_family")).data ?? [] });
  const [csv, setCsv] = useState("");

  const mut = useMutation({
    mutationFn: () => {
      const lines = csv.trim().split(/\r?\n/);
      const [header, ...rest] = lines;
      const cols = header.split(",").map((c) => c.trim().toLowerCase());
      const idx = (n: string) => cols.indexOf(n);
      const rows = rest.map((l) => {
        const v = l.split(",");
        return {
          job_family: v[idx("job_family")]?.trim() ?? "",
          level: v[idx("level")]?.trim() ?? "",
          geo: v[idx("geo")]?.trim() || "US",
          currency: (v[idx("currency")]?.trim() || "USD").toUpperCase(),
          p25: Number(v[idx("p25")]),
          p50: Number(v[idx("p50")]),
          p75: Number(v[idx("p75")]),
          source: v[idx("source")]?.trim() || undefined,
        };
      }).filter((r) => r.job_family && r.level);
      return importFn({ data: { rows } });
    },
    onSuccess: (r) => { toast.success(`Imported ${r.inserted} rows`); setCsv(""); qc.invalidateQueries({ queryKey: ["market-all"] }); qc.invalidateQueries({ queryKey: ["market-summary"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Market ranges">
      <Card className="p-6 mb-4">
        <Label>Paste CSV (job_family,level,geo,currency,p25,p50,p75,source)</Label>
        <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} className="font-mono text-xs mt-2" placeholder="Engineering,Senior,US,USD,140000,160000,185000,Radford" />
        <div className="mt-3"><Button onClick={() => mut.mutate()} disabled={!csv.trim() || mut.isPending}>Import rows</Button></div>
      </Card>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b"><tr><th className="text-left p-3">Family</th><th className="text-left p-3">Level</th><th className="text-left p-3">Geo</th><th className="text-right p-3">p25</th><th className="text-right p-3">p50</th><th className="text-right p-3">p75</th><th className="text-left p-3">Source</th></tr></thead>
          <tbody>
            {(data ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.job_family}</td><td className="p-3">{r.level}</td><td className="p-3 text-muted-foreground">{r.geo}</td>
                <td className="p-3 text-right">{Number(r.p25).toLocaleString()}</td>
                <td className="p-3 text-right">{Number(r.p50).toLocaleString()}</td>
                <td className="p-3 text-right">{Number(r.p75).toLocaleString()}</td>
                <td className="p-3 text-xs text-muted-foreground">{r.source ?? "—"}</td>
              </tr>
            ))}
            {(data?.length ?? 0) === 0 && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">No market data yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}