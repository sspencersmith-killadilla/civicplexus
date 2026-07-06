import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Save, Sparkles, KeyRound, Copy, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getAiSettings, updateAiSettings, AI_FEATURES, AI_MODEL_CATALOG, type AiFeatureKey } from "@/lib/ai-settings.functions";

export const Route = createFileRoute("/_authenticated/admin-ai-settings")({ component: AiSettingsPage });

function AiSettingsPage() {
  const qc = useQueryClient();
  const get = useServerFn(getAiSettings);
  const upd = useServerFn(updateAiSettings);
  const q = useQuery({ queryKey: ["ai-settings"], queryFn: () => get() });

  const [defaultModel, setDefaultModel] = useState("openai/gpt-5.5");
  const [overrides, setOverrides] = useState<Partial<Record<AiFeatureKey, string>>>({});
  const [byokEnabled, setByokEnabled] = useState(false);
  const [byok, setByok] = useState<{ provider: "openai" | "anthropic" | "openrouter"; secret_name: string; base_url: string }>({
    provider: "openai", secret_name: "", base_url: "",
  });

  useEffect(() => {
    if (!q.data) return;
    setDefaultModel(q.data.default_model);
    setOverrides(q.data.feature_overrides ?? {});
    const b = q.data.byok as { provider?: "openai" | "anthropic" | "openrouter"; secret_name?: string; base_url?: string };
    if (b?.secret_name) {
      setByokEnabled(true);
      setByok({ provider: b.provider ?? "openai", secret_name: b.secret_name, base_url: b.base_url ?? "" });
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => upd({ data: {
      default_model: defaultModel,
      feature_overrides: overrides as Record<string, string>,
      byok: byokEnabled ? { provider: byok.provider, secret_name: byok.secret_name, ...(byok.base_url ? { base_url: byok.base_url } : {}) } : {},
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-settings"] }); toast.success("Saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <AppShell title="AI settings">
      <div className="max-w-3xl space-y-5">
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="font-medium">Default chat model</h2></div>
          <p className="text-sm text-muted-foreground">Used everywhere unless a feature-specific override below is set. Changes take effect on the next AI request — no restart needed.</p>
          <Select value={defaultModel} onValueChange={setDefaultModel}>
            <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AI_MODEL_CATALOG.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-medium">Per-feature overrides</h2>
          <p className="text-sm text-muted-foreground">Pick a different model for individual AI features. Leave blank to use the default.</p>
          <div className="space-y-2">
            {AI_FEATURES.map((f) => (
              <div key={f.key} className="grid grid-cols-[200px_1fr_auto] items-center gap-3">
                <Label className="text-sm">{f.label}</Label>
                <Select value={overrides[f.key] ?? "__default__"} onValueChange={(v) => setOverrides({ ...overrides, [f.key]: v === "__default__" ? undefined : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Use default</SelectItem>
                    {AI_MODEL_CATALOG.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                {overrides[f.key] && <Button variant="ghost" size="sm" onClick={() => setOverrides({ ...overrides, [f.key]: undefined })}>Clear</Button>}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Bring your own key (advanced)</h2>
              <p className="text-sm text-muted-foreground">Route AI calls to your own provider instead of Lovable AI Gateway. Store the API key as a secret first, then reference its name here.</p>
            </div>
            <Switch checked={byokEnabled} onCheckedChange={setByokEnabled} />
          </div>
          {byokEnabled && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Provider</Label>
                  <Select value={byok.provider} onValueChange={(v: "openai" | "anthropic" | "openrouter") => setByok({ ...byok, provider: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              <div>
                <Label>Secret name</Label>
                <div className="flex gap-2">
                  <Input value={byok.secret_name} onChange={(e) => setByok({ ...byok, secret_name: e.target.value })} placeholder="OPENAI_API_KEY" />
                  <AddSecretDialog secretName={byok.secret_name} />
                </div>
              </div>
              </div>
              <div><Label>Base URL (optional)</Label><Input value={byok.base_url} onChange={(e) => setByok({ ...byok, base_url: e.target.value })} placeholder="https://api.openai.com/v1" /></div>
            <p className="text-xs text-muted-foreground">Use "Add secret" above to store the API key before saving. Not all features will honor BYOK — this is a preview.</p>
            </div>
          )}
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1" /> Save settings</Button>
        </div>
      </div>
    </AppShell>
  );
}

function AddSecretDialog({ secretName }: { secretName: string }) {
  const [open, setOpen] = useState(false);
  const name = (secretName || "OPENAI_API_KEY").trim();
  const copy = async () => {
    try { await navigator.clipboard.writeText(name); toast.success(`Copied "${name}"`); }
    catch { toast.error("Copy failed"); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline"><KeyRound className="h-4 w-4 mr-1" />Add secret</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Store the API key as a backend secret</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p>API keys are stored in the Lovable Cloud backend so they never ship in the browser bundle. Add it in the editor, then come back here and save.</p>
          <ol className="list-decimal ml-5 space-y-1">
            <li>Open this project in the Lovable editor.</li>
            <li>Click the <span className="font-medium">Cloud</span> panel (top-right) → <span className="font-medium">Secrets</span>.</li>
            <li>Add a secret named <code className="bg-muted px-1 py-0.5 rounded">{name}</code> and paste your provider's API key.</li>
            <li>Return to this page and click <span className="font-medium">Save settings</span>.</li>
          </ol>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={copy}><Copy className="h-4 w-4 mr-1" />Copy secret name</Button>
            <Button asChild type="button" variant="outline" size="sm">
              <a href="https://docs.lovable.dev/features/cloud#secrets" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Docs</a>
            </Button>
          </div>
        </div>
        <DialogFooter><Button onClick={() => setOpen(false)}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}