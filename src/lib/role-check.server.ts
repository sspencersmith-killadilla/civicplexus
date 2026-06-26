import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function requireHrAdmin(supabase: SupabaseClient<Database>, userId: string): Promise<void> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin").maybeSingle();
  if (error || !data) throw new Error("HR admin only");
}
