import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Archive, ArrowLeft, Search } from "lucide-react";
import { listBodies, listExpiredTerms } from "@/lib/officials.functions";

export const Route = createFileRoute("/_authenticated/admin-officials/archive")({
  component: ArchivePage,
});

function ArchivePage() {
  const listBodiesFn = useServerFn(listBodies);
  const listExpiredFn = useServerFn(listExpiredTerms);
  const [search, setSearch] = useState("");
  const [bodyId, setBodyId] = useState<string>("all");
  const [status, setStatus] = useState<"any" | "expired" | "resigned" | "removed" | "active_past_end">("any");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const bodiesQ = useQuery({ queryKey: ["officials-bodies"], queryFn: () => listBodiesFn() });
  const bodies = (bodiesQ.data ?? []) as any[];

  const q = useQuery({
    queryKey: ["expired-terms", search, bodyId, status, from, to],
    queryFn: () => listExpiredFn({ data: {
      search,
      body_id: bodyId === "all" ? null : bodyId,
      status,
      from: from || null,
      to: to || null,
    } }),
  });
  const rows = (q.data ?? []) as any[];

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of rows) {
      const yr = (r.end_date ?? "").slice(0, 4) || "Unknown";
      if (!map.has(yr)) map.set(yr, []);
      map.get(yr)!.push(r);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-serif tracking-tight flex items-center gap-2">
              <Archive className="h-6 w-6" /> Term expiration archive
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Past term expirations across every governing body, with search and filters.
            </p>
          </div>
          <Link to="/admin-officials">
            <Button size="sm" variant="outline"><ArrowLeft className="h-4 w-4 mr-1" /> Back to officials</Button>
          </Link>
        </div>

        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Name, body, or seat…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Body</Label>
              <Select value={bodyId} onValueChange={setBodyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All bodies</SelectItem>
                  {bodies.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="resigned">Resigned</SelectItem>
                  <SelectItem value="removed">Removed</SelectItem>
                  <SelectItem value="active_past_end">Still active past end date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {q.isLoading ? "Loading…" : `${rows.length} record${rows.length === 1 ? "" : "s"}`}
          </div>
        </Card>

        {grouped.length === 0 && !q.isLoading && (
          <Card className="p-6 text-sm text-muted-foreground">No expired terms match these filters.</Card>
        )}
        {grouped.map(([year, list]) => (
          <Card key={year} className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{year}</div>
            <ul className="divide-y">
              {list.map((r) => (
                <li key={r.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {r.officials?.first_name} {r.officials?.last_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.official_seats?.official_bodies?.name} · {r.official_seats?.seat_label}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {r.start_date} → {r.end_date}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}