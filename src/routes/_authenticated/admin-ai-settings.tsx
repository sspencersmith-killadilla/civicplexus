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
import { Save, Sparkles } from "lucide-react";
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
                <div><Label>Secret name</Label><Input value={byok.secret_name} onChange={(e) => setByok({ ...byok, secret_name: e.target.value })} placeholder="OPENAI_API_KEY" /></div>
              </div>
              <div><Label>Base URL (optional)</Label><Input value={byok.base_url} onChange={(e) => setByok({ ...byok, base_url: e.target.value })} placeholder="https://api.openai.com/v1" /></div>
              <p className="text-xs text-muted-foreground">Add the secret in your project settings before saving. Not all features will honor BYOK — this is a preview.</p>
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