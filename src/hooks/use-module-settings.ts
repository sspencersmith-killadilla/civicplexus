import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parentModuleKey } from "@/lib/modules";

export type ModuleSettingRow = {
  key: string;
  kind: "module" | "feature";
  parent_key: string | null;
  label: string;
  enabled: boolean;
};

export function useModuleSettings() {
  const query = useQuery({
    queryKey: ["module-settings"],
    queryFn: async (): Promise<ModuleSettingRow[]> => {
      const { data, error } = await supabase
        .from("module_settings")
        .select("key, kind, parent_key, label, enabled");
      if (error) throw error;
      return (data ?? []) as ModuleSettingRow[];
    },
    staleTime: 60_000,
  });

  const map = new Map<string, ModuleSettingRow>();
  for (const r of query.data ?? []) map.set(r.key, r);

  const isEnabled = (key: string | null | undefined): boolean => {
    if (!key) return true;
    const row = map.get(key);
    if (row && !row.enabled) return false;
    if (row?.kind === "feature") {
      const parent = row.parent_key ?? parentModuleKey(key);
      if (parent) {
        const p = map.get(parent);
        if (p && !p.enabled) return false;
      }
    }
    return true;
  };

  const isModuleEnabled = (moduleKey: string): boolean => {
    const row = map.get(moduleKey);
    return row ? row.enabled : true;
  };

  return { ...query, settings: map, isEnabled, isModuleEnabled };
}