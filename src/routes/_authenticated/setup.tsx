import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import {
  getSetupStatus,
  saveSetupOrg,
  saveSetupFallbackAdmin,
  listSetupAdminCandidates,
  seedSetupTemplates,
  completeSetup,
} from "@/lib/setup.functions";

export const Route = createFileRoute("/_authenticated/setup")({
  component: SetupWizardPage,
});

const STEPS = ["Organization", "AI provider", "Fallback admin", "Onboarding templates", "Finish"] as const;

function SetupWizardPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = hasRole(me?.roles, "hr_admin");
  const navigate = useNavigate();

  const fetchStatus = useServerFn(getSetupStatus);
  const fetchAdmins = useServerFn(listSetupAdminCandidates);
  const saveOrg = useServerFn(saveSetupOrg);
  const saveAdmin = useServerFn(saveSetupFallbackAdmin);
  const seedTpl = useServerFn(seedSetupTemplates);
  const finish = useServerFn(completeSetup);

  const status = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => fetchStatus({ data: undefined as never }),
  });
  const admins = useQuery({
    queryKey: ["setup-admin-candidates"],
    queryFn: () => fetchAdmins({ data: undefined as never }),
    enabled: isAdmin,
  });

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Step 1: organization
  const [orgName, setOrgName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [primary, setPrimary] = useState("");
  const [accent, setAccent] = useState("");

  // Step 3: fallback admin
  const [fallbackAdminId, setFallbackAdminId] = useState<string>("");

  if (!isAdmin) {
    return (
      <AppShell title="First-run setup">
        <Card><CardContent className="py-12 text-center text-muted-foreground">HR admin access required.</CardContent></Card>
      </AppShell>
    );
  }

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  async function saveOrgStep() {
    if (!orgName.trim()) { toast.error("Organization name is required"); return; }
    setBusy(true);
    try {
      await saveOrg({ data: {
        org_name: orgName.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        primary_color: primary.trim() || undefined,
        accent_color: accent.trim() || undefined,
      }});
      toast.success("Organization saved");
      next();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function saveAdminStep() {
    if (!fallbackAdminId) { next(); return; }
    setBusy(true);
    try {
      await saveAdmin({ data: { user_id: fallbackAdminId } });
      toast.success("Fallback admin set");
      next();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function seedStep() {
    setBusy(true);
    try {
      const r = await seedTpl({ data: undefined as never }) as { created: number; skipped: number };
      toast.success(`Created ${r.created} template${r.created === 1 ? "" : "s"}, skipped ${r.skipped} that already exist`);
      next();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function finishStep() {
    setBusy(true);
    try {
      await finish({ data: undefined as never });
      toast.success("Setup complete — your tenant is ready");
      navigate({ to: "/dashboard" });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  const provider = status.data?.ai_provider ?? "lovable";
  const aiOk = status.data?.ai_configured ?? false;

  return (
    <AppShell title="First-run setup">
      <div className="max-w-3xl mx-auto space-y-6">
        {status.data?.complete && (
          <Card className="border-emerald-500/40 bg-emerald-500/5">
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div className="flex-1 text-sm">
                Setup was already completed for <strong>{status.data.org_name}</strong>. You can re-run any step below.
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
            <span>Step {step + 1} of {STEPS.length}</span>
            <span>{STEPS[step]}</span>
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} />
          <div className="mt-3 flex flex-wrap gap-2">
            {STEPS.map((s, i) => (
              <Badge key={s} variant={i === step ? "default" : i < step ? "secondary" : "outline"}>
                {i + 1}. {s}
              </Badge>
            ))}
          </div>
        </div>

        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Organization profile</CardTitle>
              <CardDescription>Used on offer letters, badges, careers page, and exported documents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Organization name *</Label><Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="City of McKinney" /></div>
              <div className="space-y-2"><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="222 N Tennessee St, McKinney, TX 75069" /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(972) 555-0100" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Primary color (hex)</Label><Input value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="#1f4fa1" /></div>
                <div className="space-y-2"><Label>Accent color (hex)</Label><Input value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#e8a33b" /></div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI provider</CardTitle>
              <CardDescription>The active provider is set by the <code>AI_PROVIDER</code> environment variable on the server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Active provider:</span>
                <Badge variant="secondary">{provider}</Badge>
                {aiOk
                  ? <Badge className="bg-emerald-600">Configured</Badge>
                  : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Missing credentials</Badge>}
              </div>
              <p className="text-muted-foreground">
                Supported values: <code>lovable</code> (default, hosted), <code>openai</code>, <code>azure</code>, or <code>none</code> to disable AI features.
                See <code>.env.example</code> for the full list of variables.
              </p>
              {!aiOk && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-amber-900 dark:text-amber-200">
                  AI is selected but not configured. Continue without AI, or set the relevant API key and restart the app to enable features like 1-on-1 summaries, screening, and cascades rollups.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Fallback admin</CardTitle>
              <CardDescription>If an employee has no supervisor, PAFs and approvals route to this person.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label>Choose an HR admin</Label>
              <Select value={fallbackAdminId} onValueChange={setFallbackAdminId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {(admins.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.full_name ?? a.email ?? a.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Skip to keep the current setting.</p>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Onboarding templates</CardTitle>
              <CardDescription>Seeds a default template for every worker type that doesn't already have one. You can edit tasks afterward at <strong>Templates</strong>.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Click <em>Seed templates</em> to create the baseline playbooks, then refine them per worker type.
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>You're ready</CardTitle>
              <CardDescription>Finalize setup to unlock the dashboard for everyone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>✓ Organization profile saved</p>
              <p>✓ AI provider: <Badge variant="secondary">{provider}</Badge> {aiOk ? "(configured)" : "(disabled — can enable later)"}</p>
              <p>✓ Fallback admin {fallbackAdminId ? "selected" : "left unchanged"}</p>
              <p>✓ Onboarding templates seeded</p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={back} disabled={step === 0 || busy}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          {step === 0 && <Button onClick={saveOrgStep} disabled={busy}>Save & continue <ArrowRight className="h-4 w-4 ml-2" /></Button>}
          {step === 1 && <Button onClick={next} disabled={busy}>Continue <ArrowRight className="h-4 w-4 ml-2" /></Button>}
          {step === 2 && <Button onClick={saveAdminStep} disabled={busy}>{fallbackAdminId ? "Save & continue" : "Skip"} <ArrowRight className="h-4 w-4 ml-2" /></Button>}
          {step === 3 && <Button onClick={seedStep} disabled={busy}>Seed templates <ArrowRight className="h-4 w-4 ml-2" /></Button>}
          {step === 4 && <Button onClick={finishStep} disabled={busy}>Finish setup</Button>}
        </div>
      </div>
    </AppShell>
  );
}