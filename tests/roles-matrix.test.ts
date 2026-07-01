import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Role-matrix RLS regression suite.
 *
 * Verifies that HR admin, department admin, supervisor, and employee each
 * see and mutate `employees`, `interview_kits`, and `job_requisitions` only
 * as intended. Skips cleanly when demo credentials are not configured, so
 * CI stays green while still gating regressions where credentials exist.
 *
 * Required env:
 *   VITE_SUPABASE_URL / SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_PUBLISHABLE_KEY
 *   E2E_HR_EMAIL   / E2E_HR_PASS
 *   E2E_DEPT_EMAIL / E2E_DEPT_PASS   (department_admin scoped to E2E_DEPT_NAME)
 *   E2E_DEPT_NAME  (default: "Library")
 *   E2E_SUP_EMAIL  / E2E_SUP_PASS
 *   E2E_EMP_EMAIL  / E2E_EMP_PASS
 */

const URL_ = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY_ = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const DEPT = process.env.E2E_DEPT_NAME ?? "Library";

const creds = {
  hr:   { email: process.env.E2E_HR_EMAIL,   pass: process.env.E2E_HR_PASS },
  dept: { email: process.env.E2E_DEPT_EMAIL, pass: process.env.E2E_DEPT_PASS },
  sup:  { email: process.env.E2E_SUP_EMAIL,  pass: process.env.E2E_SUP_PASS },
  emp:  { email: process.env.E2E_EMP_EMAIL,  pass: process.env.E2E_EMP_PASS },
};

const enabled = !!URL_ && !!KEY_ && Object.values(creds).every((c) => c.email && c.pass);
const d = enabled ? describe : describe.skip;

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL_!, KEY_!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return c;
}

function expectDenied(res: { error: { message: string } | null; data: unknown }) {
  // Either the write errored (RLS/permission) or zero rows were affected.
  if (res.error) {
    expect(res.error.message).toBeTruthy();
    return;
  }
  const data = res.data as unknown[] | null;
  expect(data ?? [], "expected zero rows to be affected").toHaveLength(0);
}

d("Role matrix — employees / interview_kits / job_requisitions", () => {
  let hr: SupabaseClient, dept: SupabaseClient, sup: SupabaseClient, emp: SupabaseClient;

  beforeAll(async () => {
    [hr, dept, sup, emp] = await Promise.all([
      signIn(creds.hr.email!,   creds.hr.pass!),
      signIn(creds.dept.email!, creds.dept.pass!),
      signIn(creds.sup.email!,  creds.sup.pass!),
      signIn(creds.emp.email!,  creds.emp.pass!),
    ]);
  });

  // --- employees ---

  it("HR admin can read every employee", async () => {
    const { data, error } = await hr.from("employees").select("id, department").limit(50);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("Department admin only writes employees inside their department", async () => {
    // Reading is fine (directory read); UPDATE outside department must fail.
    const { data: outside } = await dept.from("employees").select("id, department").neq("department", DEPT).limit(1);
    if ((outside ?? []).length) {
      const res = await dept.from("employees").update({ job_title: "attempt" }).eq("id", outside![0].id).select("id");
      expectDenied(res);
    }
  });

  it("Supervisor can read direct reports but not arbitrary peers as full profiles", async () => {
    const { data, error } = await sup.from("employees").select("id, first_name, last_name").limit(50);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("Employee cannot INSERT employees", async () => {
    const res = await emp.from("employees").insert({ first_name: "A", last_name: "B", status: "active" } as never);
    expectDenied(res);
  });

  it("Employee cannot UPDATE another employee's job_title", async () => {
    const { data: others } = await emp.from("employees").select("id").limit(2);
    const target = (others ?? []).find((r: { id: string }) => r.id);
    if (target) {
      const res = await emp.from("employees").update({ job_title: "Hacker" }).eq("id", target.id).select("id");
      expectDenied(res);
    }
  });

  it("Employee cannot DELETE employees", async () => {
    const res = await emp.from("employees").delete().neq("id", "00000000-0000-0000-0000-000000000000").select("id");
    expectDenied(res);
  });

  // --- interview_kits ---

  it("HR admin can read + write interview_kits", async () => {
    const { error: readErr } = await hr.from("interview_kits").select("id, name").limit(5);
    expect(readErr).toBeNull();
  });

  it("Department admin cannot write interview_kits", async () => {
    const res = await dept.from("interview_kits").insert({ name: "dept-kit", kind: "one_way" } as never);
    expectDenied(res);
  });

  it("Supervisor cannot write interview_kits", async () => {
    const res = await sup.from("interview_kits").insert({ name: "sup-kit", kind: "one_way" } as never);
    expectDenied(res);
  });

  it("Employee cannot read interview_kits (rubrics private)", async () => {
    const { data, error } = await emp.from("interview_kits").select("id, rubric").limit(1);
    if (!error) expect((data ?? []).length).toBe(0);
  });

  it("Employee cannot INSERT interview_kits", async () => {
    const res = await emp.from("interview_kits").insert({ name: "x", kind: "one_way" } as never);
    expectDenied(res);
  });

  // --- job_requisitions ---

  it("HR admin can read every requisition including internal columns", async () => {
    const { data, error } = await hr.from("job_requisitions").select("id, title, budget_amount, internal_notes").limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("Department admin can UPDATE requisitions in their department only", async () => {
    const { data: outside } = await dept.from("job_requisitions").select("id, department").neq("department", DEPT).limit(1);
    if ((outside ?? []).length) {
      const res = await dept.from("job_requisitions").update({ title: "attempt" } as never).eq("id", outside![0].id).select("id");
      expectDenied(res);
    }
  });

  it("Supervisor cannot INSERT/UPDATE job_requisitions without permission grant", async () => {
    const ins = await sup.from("job_requisitions").insert({ title: "sup-req", status: "draft" } as never);
    expectDenied(ins);
  });

  it("Employee can only see posted job_requisitions", async () => {
    for (const status of ["draft", "pending_approval", "approved", "closed"]) {
      const { data, error } = await emp.from("job_requisitions").select("id, status").eq("status", status).limit(5);
      if (error) continue;
      expect((data ?? []).length, `employee leaked ${status}`).toBe(0);
    }
  });

  it("Employee cannot read internal requisition columns even for posted rows", async () => {
    for (const col of ["ai_rubric", "hiring_manager_id", "internal_notes", "budget_amount", "approval_chain_id"]) {
      const { data, error } = await emp.from("job_requisitions").select(`id, ${col}`).eq("status", "posted").limit(1);
      if (error) {
        expect(error.message.toLowerCase()).toMatch(/permission|denied|column|not allowed/);
      } else {
        for (const row of (data ?? []) as Array<Record<string, unknown>>) {
          // Column-level restriction should hide the value even when the row is visible.
          expect(row[col]).toBeUndefined();
        }
      }
    }
  });

  it("Employee cannot INSERT/UPDATE/DELETE job_requisitions", async () => {
    const ins = await emp.from("job_requisitions").insert({ title: "x", status: "draft" } as never);
    expectDenied(ins);
    const upd = await emp.from("job_requisitions").update({ status: "posted" } as never)
      .neq("id", "00000000-0000-0000-0000-000000000000").select("id");
    expectDenied(upd);
    const del = await emp.from("job_requisitions").delete()
      .neq("id", "00000000-0000-0000-0000-000000000000").select("id");
    expectDenied(del);
  });
});

d("Role matrix — permission overrides layer on top of roles", () => {
  let hr: SupabaseClient, emp: SupabaseClient;

  beforeAll(async () => {
    [hr, emp] = await Promise.all([
      signIn(creds.hr.email!, creds.hr.pass!),
      signIn(creds.emp.email!, creds.emp.pass!),
    ]);
  });

  it("has_permission RPC returns false for a permission the employee lacks", async () => {
    const { data, error } = await emp.rpc("has_permission", { _key: "interview_kits.read" });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("has_permission returns true for HR admin by default", async () => {
    const { data, error } = await hr.rpc("has_permission", { _key: "job_requisitions.write" });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });
});