import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * RLS / Authz regression suite.
 *
 * Locks in the hardening fixes from prior security passes so they cannot be
 * silently reverted by a future migration. Every assertion here corresponds to
 * a finding we explicitly remediated (audit_events_open_insert,
 * employees_self_update_no_column_restriction, paf_audit_open_insert,
 * application_self_id_*, job_applications_resume_url_no_anon_read,
 * approval_chains/steps_anon_read, employee_photos_broad_read,
 * employee_training_self_completion, interview_kits_public_authenticated_read,
 * submit_paf_no_authz, reminders_no_auth, comp/payroll/positions broad read,
 * etc.).
 *
 * The tests run as the anonymous (publishable) role. Any sensitive write or
 * privileged read MUST be rejected. If an assertion here flips green for an
 * operation that used to fail, RLS or a GRANT regressed.
 */

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

const enabled = !!URL && !!KEY;
const d = enabled ? describe : describe.skip;

let anon: SupabaseClient;

beforeAll(() => {
  if (!enabled) return;
  anon = createClient(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

// Helper: assert a Supabase response failed (either an error or zero rows
// returned, which for SELECTs on locked tables is the RLS-shaped success).
function expectBlocked(res: { data: unknown; error: { message: string } | null }, kind: "write" | "read") {
  if (kind === "write") {
    // INSERT/UPDATE/DELETE must surface an error (RLS violation or 401/403).
    expect(res.error, "expected write to be rejected").not.toBeNull();
  } else {
    // SELECT on a locked table: either explicit error OR empty result.
    if (res.error) return;
    const data = res.data as unknown[] | null;
    expect(data ?? [], "expected zero rows for anonymous read of locked table").toHaveLength(0);
  }
}

d("RLS: anonymous writes are blocked on sensitive tables", () => {
  it("audit_events: anon cannot INSERT (audit_events_open_insert)", async () => {
    const res = await anon.from("audit_events").insert({
      action: "test", entity: "employee",
      entity_id: "00000000-0000-0000-0000-000000000000",
    } as never);
    expectBlocked(res, "write");
  });

  it("paf_audit: anon cannot INSERT (paf_audit_open_insert)", async () => {
    const res = await anon.from("paf_audit").insert({
      paf_id: "00000000-0000-0000-0000-000000000000",
      event_type: "step_approved",
    } as never);
    expectBlocked(res, "write");
  });

  it("employees: anon cannot UPDATE (self_update_no_column_restriction)", async () => {
    const res = await anon.from("employees").update({ job_title: "CEO" } as never).eq("id", "00000000-0000-0000-0000-000000000000");
    expectBlocked(res, "write");
  });

  it("employee_training: anon cannot mark complete (self_completion)", async () => {
    const { data, error } = await anon
      .from("employee_training")
      .update({ status: "complete" } as never)
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id");
    // Either RLS errors, or zero rows update (no row visible/updatable to anon).
    if (!error) expect((data ?? []).length).toBe(0);
  });

  it("application_self_id: anon cannot INSERT (self_id_anon_insert_no_ownership)", async () => {
    const res = await anon.from("application_self_id").insert({
      application_id: "00000000-0000-0000-0000-000000000000",
    } as never);
    expectBlocked(res, "write");
  });

  it("job_applications: anon cannot set internal-only flags via INSERT", async () => {
    // Anonymous applies are allowed for the candidate path, but only via the
    // server route which sanitizes payloads. A direct insert that tries to
    // smuggle a resume_url or recruiter notes must fail.
    const res = await anon.from("job_applications").insert({
      requisition_id: "00000000-0000-0000-0000-000000000000",
      first_name: "x", last_name: "y", email: "x@example.com",
      resume_url: "https://attacker.example/leak.pdf",
    } as never);
    expectBlocked(res, "write");
  });
});

d("RLS: anonymous reads are blocked on private tables", () => {
  const lockedSelects: { table: string; finding: string }[] = [
    { table: "approval_chains", finding: "approval_chains_anon_read" },
    { table: "approval_steps", finding: "approval_steps_anon_read" },
    { table: "paf_audit", finding: "paf_audit private" },
    { table: "employees", finding: "employees private to authenticated" },
    { table: "employee_comp", finding: "compensation locked down" },
    { table: "performance_reviews", finding: "reviews locked down" },
    { table: "interview_kits", finding: "interview_kits_public_authenticated_read" },
    { table: "interview_responses", finding: "interview media private" },
    { table: "payroll_runs", finding: "payroll locked" },
    { table: "payroll_run_lines", finding: "payroll locked" },
    { table: "payroll_export_templates", finding: "payroll templates locked" },
    { table: "market_ranges", finding: "comp market ranges locked" },
    { table: "positions", finding: "positions locked" },
    { table: "comp_cycles", finding: "comp cycles locked" },
    { table: "user_roles", finding: "user_roles not anon-readable" },
    { table: "module_settings", finding: "module settings hr-only" },
    { table: "org_settings", finding: "org settings hr-only" },
  ];

  for (const { table, finding } of lockedSelects) {
    it(`${table}: anon SELECT returns no rows (${finding})`, async () => {
      const res = await anon.from(table).select("*").limit(1);
      expectBlocked(res, "read");
    });
  }
});

d("RLS: privileged RPCs reject anonymous callers", () => {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [
    { fn: "decide_paf_step", args: { _step_id: "00000000-0000-0000-0000-000000000000", _decision: "approved", _notes: null } },
    { fn: "record_audit_event", args: { _action: "review_finalized", _entity: "performance_review", _entity_id: "00000000-0000-0000-0000-000000000000", _diff: null } },
    { fn: "record_paf_audit", args: { _paf_id: "00000000-0000-0000-0000-000000000000", _event_type: "step_approved" } },
    { fn: "hr_set_employee_status", args: { _employee_id: "00000000-0000-0000-0000-000000000000", _new_status: "active", _note: null } },
    { fn: "clock_in", args: { _note: null } },
    { fn: "clock_out", args: { _note: null } },
    { fn: "create_hire_request", args: { _first_name: "x", _last_name: "y", _email: "x@x", _job_title: "t", _department: "d", _worker_type_id: null, _start_date: "2026-01-01", _reason: "r", _notes: "n" } },
    { fn: "decide_hire_request", args: { _request_id: "00000000-0000-0000-0000-000000000000", _action: "activate", _hr_notes: null } },
    { fn: "approve_timesheet", args: { _ts_id: "00000000-0000-0000-0000-000000000000", _decision: "approved", _notes: null } },
    { fn: "restore_demo_changes", args: {} },
    { fn: "mark_my_training_started", args: { _training_id: "00000000-0000-0000-0000-000000000000" } },
    { fn: "update_my_employee_contact", args: { _personal_email: "x@x", _phone: "1" } },
  ];

  for (const { fn, args } of rpcs) {
    it(`${fn}: anon call is rejected`, async () => {
      const { error } = await anon.rpc(fn as never, args as never);
      // Either the function rejects with "Not authenticated"/permission denied,
      // or PostgREST blocks the call entirely. Both are acceptable; success is not.
      expect(error, `${fn} unexpectedly succeeded for anon`).not.toBeNull();
    });
  }
});

d("RLS: storage buckets keep private objects private", () => {
  const privateBuckets = [
    "employee-photos",
    "interview-media-oneway",
    "career-brochures",
    "documents",
  ];
  for (const bucket of privateBuckets) {
    it(`storage/${bucket}: anon cannot list objects`, async () => {
      const { data, error } = await anon.storage.from(bucket).list("", { limit: 1 });
      // Either the listing fails outright, or it returns no leaked objects.
      if (error) {
        expect(error.message).toBeTruthy();
      } else {
        expect(Array.isArray(data) ? data.length : 0).toBe(0);
      }
    });
  }
});

d("RLS: public-readable tables still expose only safe columns", () => {
  it("job_requisitions: anon may read posted listings, but the row shape is bounded", async () => {
    const { data, error } = await anon
      .from("job_requisitions")
      .select("id, title, department, status, posting_sections")
      .eq("status", "posted")
      .limit(5);
    // Either anon access is denied entirely (acceptable) or we get a bounded shape.
    if (error) return;
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      // Sensitive fields must not slip into the public projection.
      expect(row).not.toHaveProperty("internal_notes");
      expect(row).not.toHaveProperty("budget_amount");
      expect(row).not.toHaveProperty("approval_chain_id");
    }
  });
});

/**
 * Targeted regression suite for the three tables whose policies have
 * historically drifted: employees, interview_kits, job_requisitions.
 * These lock in the current hardened state so a future migration cannot
 * silently widen access to anon or authenticated-but-unrelated users.
 */
d("RLS regressions: employees table", () => {
  it("anon cannot SELECT employees (directory read is authenticated-only)", async () => {
    const res = await anon.from("employees").select("id, first_name, last_name").limit(1);
    expectBlocked(res, "read");
  });

  it("anon cannot INSERT employees", async () => {
    const res = await anon.from("employees").insert({
      first_name: "Anon", last_name: "Attacker", status: "active",
    } as never);
    expectBlocked(res, "write");
  });

  it("anon cannot UPDATE sensitive columns on employees", async () => {
    for (const patch of [
      { manager_id: "00000000-0000-0000-0000-000000000000" },
      { department: "Executive" },
      { job_title: "City Manager" },
      { status: "active" },
      { user_id: "00000000-0000-0000-0000-000000000000" },
    ]) {
      const res = await anon.from("employees").update(patch as never)
        .neq("id", "00000000-0000-0000-0000-000000000000");
      expectBlocked(res, "write");
    }
  });

  it("anon cannot DELETE employees", async () => {
    const res = await anon.from("employees").delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    expectBlocked(res, "write");
  });
});

d("RLS regressions: interview_kits table", () => {
  it("anon cannot SELECT interview_kits (rubrics are not public)", async () => {
    const res = await anon.from("interview_kits").select("id, title, rubric").limit(1);
    expectBlocked(res, "read");
  });

  it("anon cannot INSERT interview_kits", async () => {
    const res = await anon.from("interview_kits").insert({
      title: "Anon kit", rubric: { competencies: [] },
    } as never);
    expectBlocked(res, "write");
  });

  it("anon cannot UPDATE interview_kits", async () => {
    const res = await anon.from("interview_kits").update({ title: "Hacked" } as never)
      .neq("id", "00000000-0000-0000-0000-000000000000");
    expectBlocked(res, "write");
  });

  it("anon cannot DELETE interview_kits", async () => {
    const res = await anon.from("interview_kits").delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    expectBlocked(res, "write");
  });
});

d("RLS regressions: job_requisitions table", () => {
  it("anon cannot INSERT job_requisitions", async () => {
    const res = await anon.from("job_requisitions").insert({
      title: "Ghost Req", status: "draft",
    } as never);
    expectBlocked(res, "write");
  });

  it("anon cannot UPDATE job_requisitions", async () => {
    const res = await anon.from("job_requisitions")
      .update({ status: "posted" } as never)
      .neq("id", "00000000-0000-0000-0000-000000000000");
    expectBlocked(res, "write");
  });

  it("anon cannot DELETE job_requisitions", async () => {
    const res = await anon.from("job_requisitions").delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    expectBlocked(res, "write");
  });

  it("anon cannot read non-posted (draft/pending) requisitions", async () => {
    for (const status of ["draft", "pending_approval", "approved", "closed"]) {
      const { data, error } = await anon
        .from("job_requisitions")
        .select("id, status")
        .eq("status", status)
        .limit(5);
      if (error) continue;
      expect((data ?? []).length, `anon leaked ${status} requisitions`).toBe(0);
    }
  });

  it("anon cannot read internal columns on job_requisitions via select-*", async () => {
    // Ask PostgREST for columns that anon must not have column-level grants on.
    // Either the request errors ("permission denied for column") or returns no rows.
    const forbidden = [
      "ai_rubric",
      "hiring_manager_id",
      "internal_notes",
      "budget_amount",
      "approval_chain_id",
    ];
    for (const col of forbidden) {
      const { data, error } = await anon
        .from("job_requisitions")
        .select(`id, ${col}`)
        .eq("status", "posted")
        .limit(1);
      if (error) {
        expect(error.message.toLowerCase()).toMatch(/permission|denied|does not exist|not allowed|column/);
      } else {
        // If PostgREST did not error, the column must not have leaked a value.
        for (const row of (data ?? []) as Array<Record<string, unknown>>) {
          expect(row[col]).toBeUndefined();
        }
      }
    }
  });
});