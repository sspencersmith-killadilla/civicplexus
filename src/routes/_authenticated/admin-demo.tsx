import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import {
  provisionDemoAccount,
  resetDemoAccount,
  getDemoStatus,
} from "@/lib/demo-account.functions";

export const Route = createFileRoute("/_authenticated/admin-demo")({
  component: AdminDemoPage,
});

function AdminDemoPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = hasRole(me?.roles, "hr_admin");

  const qc = useQueryClient();
  const fetchStatus = useServerFn(getDemoStatus);
  const provision = useServerFn(provisionDemoAccount);
  const reset = useServerFn(resetDemoAccount);

  const status = useQuery({
    queryKey: ["demo-account-status"],
    queryFn: () => fetchStatus({ data: undefined as never }),
    enabled: isAdmin,
  });

  const provisionMut = useMutation({
    mutationFn: () => provision({ data: undefined as never }),
    onSuccess: () => {
      toast.success("Demo account ready");
      qc.invalidateQueries({ queryKey: ["demo-account-status"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed"),
  });

  const resetMut = useMutation({
    mutationFn: () => reset({ data: undefined as never }),
    onSuccess: (r) => {
      const result = (r as { result?: { reverted?: number; errors?: number } }).result;
      toast.success(
        `Reverted ${result?.reverted ?? 0} changes${result?.errors ? ` (${result.errors} errors)` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["demo-account-status"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed"),
  });

  if (!isAdmin) {
    return (
      <AppShell title="Demo account">
        <p className="text-muted-foreground">Only HR admins can manage the demo account.</p>
      </AppShell>
    );
  }

  const s = status.data;

  return (
    <AppShell title="Demo account">
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Demo HR Admin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-[140px,1fr] gap-y-2">
              <span className="text-muted-foreground">Email</span>
              <span className="font-mono">{s?.email ?? "demo.purpose@testingaccount.test"}</span>
              <span className="text-muted-foreground">Password</span>
              <span className="font-mono">Demo1234</span>
              <span className="text-muted-foreground">Status</span>
              <span>{s?.provisioned ? "Provisioned" : "Not yet created"}</span>
              <span className="text-muted-foreground">Pending changes</span>
              <span>{s?.pendingChanges ?? 0} row(s) recorded for revert</span>
              <span className="text-muted-foreground">Last reset</span>
              <span>{s?.lastResetAt ? new Date(s.lastResetAt).toLocaleString() : "—"}</span>
            </div>
            <p className="text-muted-foreground">
              Every insert, update, and delete this account makes is captured. A daily reset reverts
              every recorded change and resets the password back to <span className="font-mono">Demo1234</span>.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => provisionMut.mutate()}
                disabled={provisionMut.isPending}
              >
                {provisionMut.isPending
                  ? "Working…"
                  : s?.provisioned
                    ? "Re-arm account"
                    : "Create demo account"}
              </Button>
              <Button
                variant="outline"
                onClick={() => resetMut.mutate()}
                disabled={resetMut.isPending || !s?.provisioned}
              >
                {resetMut.isPending ? "Reverting…" : "Revert changes now"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}