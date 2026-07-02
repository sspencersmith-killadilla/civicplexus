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
import { seedNextDemoPhoto } from "@/lib/employee-photos.functions";
import { seedNextOfficialPhoto } from "@/lib/official-photos.functions";
import { useState } from "react";

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
  const seedNext = useServerFn(seedNextDemoPhoto);
  const seedNextOfficial = useServerFn(seedNextOfficialPhoto);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string>("");
  const [seedingOfficials, setSeedingOfficials] = useState(false);
  const [seedOfficialsMsg, setSeedOfficialsMsg] = useState<string>("");

  async function runSeed(regenerate: boolean) {
    setSeeding(true);
    try {
      let count = 0;
      let cursor: string | undefined;
      // hard cap to avoid runaway loop
      for (let i = 0; i < 60; i++) {
        const r = (await seedNext({
          data: { regenerate, after_last_name: cursor },
        })) as {
          done: boolean;
          remaining: number;
          cursor: string | null;
          employee?: { name: string };
        };
        if (r.employee) {
          count += 1;
          setSeedMsg(`Generated ${count} • ${r.employee.name} (${r.remaining} left)`);
        }
        cursor = r.cursor ?? undefined;
        if (r.done || !r.employee) break;
        // small breather between calls
        await new Promise((res) => setTimeout(res, 250));
      }
      toast.success(`Seeded ${count} employee photo${count === 1 ? "" : "s"}`);
      setSeedMsg("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSeeding(false);
    }
  }

  async function runSeedOfficials(regenerate: boolean) {
    setSeedingOfficials(true);
    try {
      let count = 0;
      let cursor: string | undefined;
      for (let i = 0; i < 80; i++) {
        const r = (await seedNextOfficial({
          data: { regenerate, after_last_name: cursor },
        })) as {
          done: boolean;
          remaining: number;
          cursor: string | null;
          official?: { name: string };
        };
        if (r.official) {
          count += 1;
          setSeedOfficialsMsg(
            `Generated ${count} • ${r.official.name} (${r.remaining} left)`,
          );
        }
        cursor = r.cursor ?? undefined;
        if (r.done || !r.official) break;
        await new Promise((res) => setTimeout(res, 250));
      }
      toast.success(`Seeded ${count} official portrait${count === 1 ? "" : "s"}`);
      setSeedOfficialsMsg("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSeedingOfficials(false);
    }
  }

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

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Demo employee photos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Generate AI portrait headshots for every demo employee that is missing a photo. Photos
              are stored in the same private bucket as HR uploads and used by the org chart and ID
              badge generator. Synthetic likenesses only.
            </p>
            {seedMsg && <p className="font-mono text-xs">{seedMsg}</p>}
            <div className="flex gap-2">
              <Button onClick={() => runSeed(false)} disabled={seeding}>
                {seeding ? "Generating…" : "Seed missing photos"}
              </Button>
              <Button variant="outline" onClick={() => runSeed(true)} disabled={seeding}>
                {seeding ? "Working…" : "Regenerate all"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Official portraits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Generate photorealistic AI headshots for every elected and appointed
              official missing a photo. All officials in this instance are
              fictitious — portraits are synthetic likenesses, not real people.
              Photos publish to the officials roster automatically.
            </p>
            {seedOfficialsMsg && <p className="font-mono text-xs">{seedOfficialsMsg}</p>}
            <div className="flex gap-2">
              <Button onClick={() => runSeedOfficials(false)} disabled={seedingOfficials}>
                {seedingOfficials ? "Generating…" : "Seed missing portraits"}
              </Button>
              <Button
                variant="outline"
                onClick={() => runSeedOfficials(true)}
                disabled={seedingOfficials}
              >
                {seedingOfficials ? "Working…" : "Regenerate all"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}