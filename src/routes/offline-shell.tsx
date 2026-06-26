import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogIn, LogOut, CalendarPlus, CheckCircle2, XCircle, WifiOff, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { enqueue, syncQueue } from "@/lib/offline-queue";
import { QueueList } from "@/components/offline-shell";

export const Route = createFileRoute("/offline-shell")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Offline · CivicPlexus" },
      {
        name: "description",
        content:
          "Clock in, request leave, and decide approvals offline — actions queue and sync when you reconnect.",
      },
    ],
  }),
  component: OfflineShellPage,
});

function useOnline() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

function OfflineShellPage() {
  const online = useOnline();
  const [employeeId, setEmployeeId] = useState<string>("");
  const [planId, setPlanId] = useState<string>("");

  // Pull cached employee context from localStorage so the shell works offline.
  useEffect(() => {
    setEmployeeId(localStorage.getItem("cp.cached.employeeId") ?? "");
    setPlanId(localStorage.getItem("cp.cached.leavePlanId") ?? "");

    // Best-effort refresh when online — read the signed-in user's employee row.
    if (!navigator.onLine) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", uid)
        .maybeSingle();
      if (emp?.id) {
        localStorage.setItem("cp.cached.employeeId", emp.id);
        setEmployeeId(emp.id);
        const { data: plan } = await supabase
          .from("leave_plans")
          .select("id")
          .limit(1)
          .maybeSingle();
        if (plan?.id) {
          localStorage.setItem("cp.cached.leavePlanId", plan.id);
          setPlanId(plan.id);
        }
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Offline shell</h1>
          <p className="text-sm text-muted-foreground">
            Clock punches, leave requests, and approvals work without a connection.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
            online
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {online ? "Online" : "Offline"}
        </span>
      </header>

      <ClockCard />
      <LeaveCard employeeId={employeeId} planId={planId} />
      <ApprovalsCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sync queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <QueueList />
          <div className="flex items-center justify-between">
            <Link to="/dashboard" className="text-sm text-primary hover:underline">
              Back to dashboard
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const r = await syncQueue();
                toast.success(`Synced ${r.ok}, failed ${r.failed}`);
              }}
              disabled={!online}
            >
              Sync now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ClockCard() {
  const [busy, setBusy] = useState(false);
  const punch = async (kind: "clock_in" | "clock_out") => {
    setBusy(true);
    try {
      await enqueue(kind, { at: new Date().toISOString() });
      toast.success(
        navigator.onLine
          ? `${kind === "clock_in" ? "Clocked in" : "Clocked out"} — syncing`
          : `${kind === "clock_in" ? "Clock-in" : "Clock-out"} queued offline`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Time clock</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => punch("clock_in")} disabled={busy}>
          <LogIn className="mr-2 h-4 w-4" /> Clock in
        </Button>
        <Button onClick={() => punch("clock_out")} disabled={busy} variant="secondary">
          <LogOut className="mr-2 h-4 w-4" /> Clock out
        </Button>
      </CardContent>
    </Card>
  );
}

function LeaveCard({ employeeId, planId }: { employeeId: string; planId: string }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hours, setHours] = useState("8");
  const [reason, setReason] = useState("");

  const submit = async () => {
    if (!employeeId || !planId) {
      toast.error("Employee context not cached. Open this page once while online.");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Pick start and end dates");
      return;
    }
    await enqueue("submit_leave", {
      employee_id: employeeId,
      plan_id: planId,
      start_date: startDate,
      end_date: endDate,
      total_hours: Number(hours) || 0,
      reason: reason || undefined,
    });
    toast.success(navigator.onLine ? "Leave request submitted" : "Leave request queued offline");
    setReason("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Request leave</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ls">Start</Label>
          <Input id="ls" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="le">End</Label>
          <Input id="le" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lh">Total hours</Label>
          <Input id="lh" type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="lr">Reason</Label>
          <Textarea id="lr" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </div>
        <div className="sm:col-span-2">
          <Button onClick={submit}>
            <CalendarPlus className="mr-2 h-4 w-4" /> Submit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ApprovalsCard() {
  const [stepId, setStepId] = useState("");
  const [notes, setNotes] = useState("");

  const decide = async (decision: "approved" | "denied") => {
    if (!stepId) {
      toast.error("Paste the approval step ID");
      return;
    }
    await enqueue("decide_paf", { step_id: stepId, decision, notes: notes || undefined });
    toast.success(navigator.onLine ? `${decision} sent` : `${decision} queued offline`);
    setStepId("");
    setNotes("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick approval</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Use the approvals inbox while online to grab a step ID. Decisions made here queue and sync when you reconnect.
        </p>
        <div className="space-y-1">
          <Label htmlFor="sid">Approval step ID</Label>
          <Input id="sid" value={stepId} onChange={(e) => setStepId(e.target.value)} placeholder="uuid" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="an">Notes</Label>
          <Textarea id="an" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => decide("approved")}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
          </Button>
          <Button variant="destructive" onClick={() => decide("denied")}>
            <XCircle className="mr-2 h-4 w-4" /> Deny
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}