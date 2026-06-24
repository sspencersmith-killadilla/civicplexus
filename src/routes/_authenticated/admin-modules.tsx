import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { useModuleSettings } from "@/hooks/use-module-settings";
import { MODULE_REGISTRY } from "@/lib/modules";
import { updateModuleSettings } from "@/lib/module-settings.functions";
import { setFallbackAdmin } from "@/lib/paf.functions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin-modules")({
  component: AdminModulesPage,
});

function AdminModulesPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = hasRole(me?.roles, "hr_admin");
  const { settings, isLoading } = useModuleSettings();
  const qc = useQueryClient();
  const save = useServerFn(updateModuleSettings);

  // Local pending state: key -> enabled override
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  const initial = useMemo(() => {
    const m: Record<string, boolean> = {};
    settings.forEach((row, key) => { m[key] = row.enabled; });
    return m;
  }, [settings]);

  const current = (key: string) =>
    key in draft ? draft[key] : (initial[key] ?? true);

  const dirty = Object.entries(draft).filter(([k, v]) => initial[k] !== v);

  const mutation = useMutation({
    mutationFn: (changes: { key: string; enabled: boolean }[]) =>
      save({ data: { changes } }),
    onSuccess: () => {
      toast.success("Modules updated");
      setDraft({});
      qc.invalidateQueries({ queryKey: ["module-settings"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to save"),
  });

  function toggle(key: string, value: boolean) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleModule(moduleKey: string, value: boolean) {
    setDraft((d) => {
      const next = { ...d, [moduleKey]: value };
      // Optional: cascade to features when turning module off/on
      const mod = MODULE_REGISTRY.find((m) => m.key === moduleKey);
      if (mod) for (const f of mod.items) next[f.key] = value;
      return next;
    });
  }

  if (!isAdmin) {
    return (
      <AppShell title="Modules & Features">
        <p className="text-muted-foreground">Only HR admins can manage modules.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Modules & Features">
      <div className="max-w-4xl space-y-6">
        <FallbackAdminCard />
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Toggle entire modules or individual features. Disabled items disappear
            from the sidebar and their pages show a "module turned off" notice.
          </p>
          <Button
            onClick={() => mutation.mutate(dirty.map(([key, enabled]) => ({ key, enabled })))}
            disabled={dirty.length === 0 || mutation.isPending || isLoading}
          >
            {mutation.isPending ? "Saving…" : `Save${dirty.length ? ` (${dirty.length})` : ""}`}
          </Button>
        </div>

        {MODULE_REGISTRY.map((mod) => {
          const moduleEnabled = current(mod.key);
          return (
            <Card key={mod.key}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif text-lg">{mod.label}</CardTitle>
                <label className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {moduleEnabled ? "On" : "Off"}
                  </span>
                  <Switch
                    checked={moduleEnabled}
                    onCheckedChange={(v) => toggleModule(mod.key, v)}
                  />
                </label>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {mod.items.map((f) => {
                    const enabled = current(f.key);
                    return (
                      <li key={f.key} className="flex items-center justify-between py-3">
                        <div className="min-w-0">
                          <p className={`text-sm ${moduleEnabled ? "" : "text-muted-foreground"}`}>
                            {f.label}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{f.to}</p>
                        </div>
                        <Switch
                          checked={enabled && moduleEnabled}
                          disabled={!moduleEnabled}
                          onCheckedChange={(v) => toggle(f.key, v)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}

function FallbackAdminCard() {
  const qc = useQueryClient();
  const setFb = useServerFn(setFallbackAdmin);
  const { data: org } = useQuery({
    queryKey: ["org-fb"],
    queryFn: async () => (await supabase.from("org_settings").select("fallback_admin_user_id").maybeSingle()).data as { fallback_admin_user_id: string | null } | null,
  });
  const { data: admins } = useQuery({
    queryKey: ["hr-admins"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "hr_admin");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [] as Array<{ id: string; full_name: string | null; email: string | null }>;
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });
  const m = useMutation({
    mutationFn: (uid: string | null) => setFb({ data: { user_id: uid } }),
    onSuccess: () => { toast.success("Fallback admin saved"); qc.invalidateQueries({ queryKey: ["org-fb"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="font-serif text-lg">Fallback admin</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">When an employee has no supervisor, approvals and notifications route here instead of dead-ending.</p>
        <Select value={org?.fallback_admin_user_id ?? ""} onValueChange={(v) => m.mutate(v || null)}>
          <SelectTrigger className="max-w-md"><SelectValue placeholder="Select HR admin…" /></SelectTrigger>
          <SelectContent>
            {(admins ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name ?? a.email ?? a.id.slice(0,8)}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}