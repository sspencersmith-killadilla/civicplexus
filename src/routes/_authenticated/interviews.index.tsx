import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Video, MapPin, ArrowRight, Play, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/interviews/")({ component: InterviewsIndex });

type InterviewRow = {
  id: string;
  stage: string;
  scheduled_at: string;
  duration_minutes: number | null;
  location: string | null;
  status: string;
  kind: string | null;
  interviewer_ids: string[] | null;
  job_applications: { applicant_name: string; email: string | null; requisition_id: string | null } | null;
};

function InterviewsIndex() {
  const [tab, setTab] = useState<"live" | "async">("live");
  const [scope, setScope] = useState<"upcoming" | "past" | "all">("upcoming");
  const [q, setQ] = useState("");

  const ivQ = useQuery({
    queryKey: ["interviews", "index", scope],
    enabled: tab === "live",
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      let qb = supabase
        .from("interviews" as never)
        .select("id, stage, scheduled_at, duration_minutes, location, status, kind, interviewer_ids, job_applications:application_id(applicant_name, email, requisition_id)")
        .order("scheduled_at", { ascending: scope !== "past" });
      if (scope === "upcoming") qb = qb.gte("scheduled_at", nowIso);
      if (scope === "past") qb = qb.lt("scheduled_at", nowIso);
      const { data, error } = await qb.limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as InterviewRow[];
    },
  });

  const asyncQ = useQuery({
    queryKey: ["interview_invitations_index"],
    enabled: tab === "async",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_invitations" as never)
        .select("id, kind, status, expires_at, submitted_at, created_at, kit:kit_id(name), job_applications:application_id(applicant_name, email, requisition_id)")
        .eq("kind", "one_way")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; status: string; expires_at: string; submitted_at: string | null; created_at: string; kit: { name: string } | null; job_applications: { applicant_name: string; email: string | null; requisition_id: string | null } | null }>;
    },
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = ivQ.data ?? [];
    if (!needle) return all;
    return all.filter((r) =>
      [r.job_applications?.applicant_name, r.stage, r.location, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [ivQ.data, q]);

  return (
    <AppShell title="Interviews">
      <div className="flex gap-2 mb-3">
        <Button size="sm" variant={tab === "live" ? "default" : "outline"} onClick={() => setTab("live")}>Live / scheduled</Button>
        <Button size="sm" variant={tab === "async" ? "default" : "outline"} onClick={() => setTab("async")}>Async (one-way)</Button>
      </div>
      {tab === "live" ? (
      <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="past">Past</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Search candidate, stage…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/interview-kits">Interview kits</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/jobs">Requisitions</Link></Button>
        </div>
      </div>

      {ivQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No interviews {scope === "upcoming" ? "scheduled" : "found"}. Schedule one from an applicant in <Link to="/jobs" className="underline">Requisitions</Link>.
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((iv) => {
            const when = new Date(iv.scheduled_at);
            const isVirtual = (iv.kind ?? "").toLowerCase().includes("video") || (iv.location ?? "").toLowerCase().includes("livekit");
            return (
              <Card key={iv.id} className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-sm w-44">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{when.toLocaleDateString()}</div>
                    <div className="text-xs text-muted-foreground">{when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{iv.duration_minutes ? ` · ${iv.duration_minutes}m` : ""}</div>
                  </div>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium">{iv.job_applications?.applicant_name ?? "Candidate"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{iv.stage}</Badge>
                    <span className="capitalize">{iv.status}</span>
                    {iv.location && (
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{iv.location}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isVirtual && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/interviews/$id/room" params={{ id: iv.id }}><Video className="h-3 w-3 mr-1" />Join room</Link>
                    </Button>
                  )}
                  <Button asChild size="sm">
                    <Link to="/interviews/$id" params={{ id: iv.id }}>Open<ArrowRight className="h-3 w-3 ml-1" /></Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      </>
      ) : (
        <div className="space-y-2">
          {asyncQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (asyncQ.data ?? []).length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No async invitations yet. Send one from an applicant card in <Link to="/jobs" className="underline">Requisitions</Link>.
            </Card>
          ) : (asyncQ.data ?? []).map((inv) => {
            const submitted = !!inv.submitted_at;
            const expired = !submitted && new Date(inv.expires_at) < new Date();
            return (
              <Card key={inv.id} className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium">{inv.job_applications?.applicant_name ?? "Candidate"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{inv.kit?.name ?? "Kit"}</Badge>
                    <Badge variant={submitted ? "default" : expired ? "destructive" : "outline"} className="capitalize">{submitted ? "submitted" : expired ? "expired" : inv.status}</Badge>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Sent {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}</span>
                    {!submitted && !expired && <span>· expires {new Date(inv.expires_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild size="sm" variant={submitted ? "default" : "outline"}>
                    <Link to="/interviews/$id" params={{ id: inv.id }}>{submitted ? <><Play className="h-3 w-3 mr-1" />Review takes</> : <>Open<ArrowRight className="h-3 w-3 ml-1" /></>}</Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}