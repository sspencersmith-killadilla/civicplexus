import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Probe = { name: string; ok: boolean; detail: string };

export const runAccessSelfCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const probes: Probe[] = [];

    async function probe(name: string, fn: () => Promise<{ ok: boolean; detail: string }>) {
      try {
        const r = await fn();
        probes.push({ name, ...r });
      } catch (e) {
        probes.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
      }
    }

    // 1. Current user can read their own employee record
    await probe("Read own employee record", async () => {
      const { data, error } = await supabase.from("employees").select("id, first_name, last_name").eq("user_id", userId).maybeSingle();
      if (error) return { ok: false, detail: error.message };
      return { ok: !!data, detail: data ? `id=${data.id}` : "no employee row linked to this user" };
    });

    // 2. Can list 1-on-1s visible to me
    await probe("List visible 1-on-1s", async () => {
      const { data, error, count } = await supabase.from("one_on_ones").select("id", { count: "exact", head: false }).limit(5);
      if (error) return { ok: false, detail: error.message };
      return { ok: true, detail: `${count ?? data?.length ?? 0} session(s) visible` };
    });

    // 3. Can list review-cycle participation visible to me
    await probe("List review-cycle participation", async () => {
      const { data, error, count } = await supabase.from("review_cycle_participants").select("id", { count: "exact", head: false }).limit(5);
      if (error) return { ok: false, detail: error.message };
      return { ok: true, detail: `${count ?? data?.length ?? 0} participation row(s) visible` };
    });

    // 4. Can list performance reviews I own or manage
    await probe("List performance reviews", async () => {
      const { data, error, count } = await supabase.from("performance_reviews").select("id", { count: "exact", head: false }).limit(5);
      if (error) return { ok: false, detail: error.message };
      return { ok: true, detail: `${count ?? data?.length ?? 0} review(s) visible` };
    });

    // 5. As a supervisor: my direct reports resolve through employees.manager_id
    await probe("Supervisor: direct reports resolvable", async () => {
      const { data: me } = await supabase.from("employees").select("id").eq("user_id", userId).maybeSingle();
      if (!me) return { ok: true, detail: "not linked to an employee record (skipped)" };
      const { data, error, count } = await supabase.from("employees").select("id", { count: "exact", head: false }).eq("manager_id", me.id).limit(5);
      if (error) return { ok: false, detail: error.message };
      return { ok: true, detail: `${count ?? data?.length ?? 0} direct report(s)` };
    });

    // 6. HR-only: can see all employees
    await probe("HR admin: read all employees", async () => {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const isHr = (roles ?? []).some((r) => r.role === "hr_admin");
      if (!isHr) return { ok: true, detail: "not HR admin (skipped)" };
      const { count, error } = await supabase.from("employees").select("id", { count: "exact", head: true });
      if (error) return { ok: false, detail: error.message };
      return { ok: (count ?? 0) > 0, detail: `${count ?? 0} employees visible` };
    });

    return {
      user_id: userId,
      ran_at: new Date().toISOString(),
      probes,
      pass_count: probes.filter((p) => p.ok).length,
      total: probes.length,
    };
  });
